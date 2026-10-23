package local.travel;

import static org.junit.jupiter.api.Assertions.*;
import java.awt.image.BufferedImage;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest
class RootRemovalIntegrationTest {
    static final Path DATA=LibraryIntegrationTest.temporary();
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r){r.add("app.data-dir",()->DATA.toString());}
    @Autowired RootRemovalService removal;
    @Autowired ScanService scans;
    @Autowired LibraryService library;
    @Autowired LibraryMaintenance maintenance;
    @Autowired JdbcTemplate jdbc;
    @TempDir(factory=ProjectTempDirFactory.class) Path fixture;
    void scan() {
        scans.start();
        assertTimeoutPreemptively(Duration.ofSeconds(20),()->{while(scans.current().state().equals("running"))Thread.sleep(20);});
        assertEquals("completed",scans.current().state());
    }
    @Test void removesOnlyUncoveredIndexesAtomicallyAndPreservesOriginals() throws Exception {
        Path parent=Files.createDirectories(fixture.resolve("照片 中文 & $name")),child=Files.createDirectories(parent.resolve("保留")),sibling=Files.createDirectories(fixture.resolve("照片 中文 & $name-other"));
        Map<Path,String> hashes=new HashMap<>();Map<Path,java.nio.file.attribute.FileTime> times=new HashMap<>();
        for(Path file:List.of(parent.resolve("a.png"),parent.resolve("b.png"),parent.resolve("c.png"),child.resolve("d.png"),child.resolve("e.png"),sibling.resolve("f.png"))) {
            ImageIO.write(new BufferedImage(32,24,BufferedImage.TYPE_INT_RGB),"png",file.toFile());
            hashes.put(file,BackupService.sha256(file));times.put(file,Files.getLastModifiedTime(file));
        }
        var root=scans.addRoot(parent.toString());scan();
        var keptRoot=scans.addRoot(child.toString());var unrelated=scans.addRoot(sibling.toString());scan();
        Map<String,LibraryService.PhotoView> photos=new HashMap<>();for(var p:library.query(null,null,false,"","name",0,100).items())photos.put(p.fileName(),p);
        var place=library.savePlace(null,new LibraryService.PlaceInput("地点","陕西","610000",34.2,108.9,""));
        var category=library.saveCategory(null,new LibraryService.CategoryInput(place.id,"类别"));
        library.classify(new LibraryService.Classification(List.of(photos.get("b.png").id(),photos.get("d.png").id()),place.id,List.of(category.id)));
        library.setExcluded(new LibraryService.Exclusion(List.of(photos.get("c.png").id(),photos.get("e.png").id()),true));
        var preview=removal.preview(root.id);
        assertEquals(3,preview.deleteCount());assertEquals(1,preview.unclassifiedCount());assertEquals(1,preview.classifiedCount());assertEquals(1,preview.excludedCount());assertEquals(2,preview.retainedCount());
        assertEquals(6,jdbc.queryForObject("SELECT count(*) FROM photos",Integer.class)); // Preview never writes.
        assertThrows(LibraryMaintenance.Busy.class,()->removal.remove(root.id,"stale"));
        jdbc.execute("CREATE TRIGGER fail_root_removal BEFORE DELETE ON photo_roots BEGIN SELECT RAISE(ABORT,'intentional root removal failure'); END");
        try{assertThrows(DataAccessException.class,()->removal.remove(root.id,preview.token()));}
        finally{jdbc.execute("DROP TRIGGER fail_root_removal");}
        assertEquals(6,jdbc.queryForObject("SELECT count(*) FROM photos",Integer.class));
        assertEquals(root.id,library.detail(photos.get("d.png").id()).rootId());
        assertEquals(List.of(category.id),library.detail(photos.get("b.png").id()).categoryIds());
        // A classification change after preview invalidates the confirmation.
        library.classify(new LibraryService.Classification(List.of(photos.get("a.png").id()),place.id,List.of(category.id)));
        assertThrows(LibraryMaintenance.Busy.class,()->removal.remove(root.id,preview.token()));
        library.classify(new LibraryService.Classification(List.of(photos.get("a.png").id()),null,List.of()));
        removal.remove(root.id,removal.preview(root.id).token());
        assertEquals(2,library.allRoots().size());assertEquals(3,jdbc.queryForObject("SELECT count(*) FROM photos",Integer.class));
        for(String name:List.of("a.png","b.png","c.png"))assertThrows(NoSuchElementException.class,()->library.detail(photos.get(name).id()));
        assertEquals(keptRoot.id,library.detail(photos.get("d.png").id()).rootId());
        assertEquals(List.of(category.id),library.detail(photos.get("d.png").id()).categoryIds());
        assertEquals(1,library.query(null,null,false,"","name",0,100,true).total());
        assertEquals(unrelated.id,library.detail(photos.get("f.png").id()).rootId()); // Similar prefix is not a child.
        assertEquals(1,library.allPlaces().getFirst().photoCount());assertEquals(1,library.allCategories().getFirst().photoCount());
        assertTrue(Files.isRegularFile(library.source(library.requirePhoto(photos.get("d.png").id()))));
        assertThrows(NoSuchElementException.class,()->removal.preview(root.id));scan();
        assertEquals(3,jdbc.queryForObject("SELECT count(*) FROM photos",Integer.class)); // Removed directory stays out on rescan.
        // Re-mounting builds new indexes; removing the child now retains its IDs through the parent.
        var remounted=scans.addRoot(parent.toString());scan();
        assertNotEquals(photos.get("a.png").id(),library.query(null,null,false,"a.png","name",0,100).items().getFirst().id());
        var childImpact=removal.preview(keptRoot.id);assertEquals(0,childImpact.deleteCount());assertEquals(2,childImpact.retainedCount());
        removal.remove(keptRoot.id,childImpact.token());assertEquals(remounted.id,library.detail(photos.get("d.png").id()).rootId());
        assertEquals(List.of(category.id),library.detail(photos.get("d.png").id()).categoryIds());
        // An unconfirmed/disabled overlap must not grant continued access.
        var restoredChild=scans.addRoot(child.toString());
        jdbc.update("UPDATE photo_roots SET enabled=0,status='needs_confirmation' WHERE id=?",remounted.id);
        var inactiveOverlap=removal.preview(restoredChild.id);assertEquals(2,inactiveOverlap.deleteCount());assertEquals(0,inactiveOverlap.retainedCount());
        removal.remove(restoredChild.id,inactiveOverlap.token());
        assertEquals(0,library.allPlaces().getFirst().photoCount());assertNull(library.allPlaces().getFirst().coverSrc());
        assertEquals(0,library.allCategories().getFirst().photoCount());
        // Queued/running scans block preview and removal until the worker has finished.
        try(var lease=maintenance.exclusive()) {
            scans.start();
            assertThrows(LibraryMaintenance.Busy.class,()->removal.preview(unrelated.id));
            assertThrows(LibraryMaintenance.Busy.class,()->removal.remove(unrelated.id,"stale"));
        }
        assertTimeoutPreemptively(Duration.ofSeconds(20),()->{while(scans.current().state().equals("running"))Thread.sleep(20);});
        // Removing an unavailable directory works from registered index paths without reading it.
        Path parked=fixture.resolve("parked");Files.move(sibling,parked);
        removal.remove(unrelated.id,removal.preview(unrelated.id).token());Files.move(parked,sibling);
        var last=removal.preview(remounted.id);removal.remove(remounted.id,last.token());
        assertTrue(library.allRoots().isEmpty());assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM photos",Integer.class));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM photo_categories",Integer.class));
        assertEquals(1,library.allPlaces().size());assertEquals(1,library.allCategories().size());scan();assertEquals(0,library.query(null,null,false,"","name",0,100).total());
        assertTrue(jdbc.queryForList("PRAGMA foreign_key_check").isEmpty());
        for(Path file:hashes.keySet()){assertEquals(hashes.get(file),BackupService.sha256(file));assertEquals(times.get(file),Files.getLastModifiedTime(file));}
    }
}
