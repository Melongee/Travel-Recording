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
class RelocationIntegrationTest {
    static final Path DATA=LibraryIntegrationTest.temporary();
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r){r.add("app.data-dir",()->DATA.toString());}
    @Autowired RelocationService relocation;@Autowired ScanService scans;@Autowired LibraryService library;
    @Autowired JdbcTemplate jdbc;@Autowired BackupService backups;@Autowired LibraryMaintenance maintenance;
    @TempDir(factory=ProjectTempDirFactory.class) Path fixtures;
    void scan(){scans.start();assertTimeoutPreemptively(Duration.ofSeconds(20),()->{while(scans.current().state().equals("running"))Thread.sleep(20);});}
    @Test void singleRelocationValidatesIdentityPreservesRelationsAndScopesAccess() throws Exception {
        Path oldDir=Files.createDirectories(fixtures.resolve("旧目录")),newDir=Files.createDirectories(fixtures.resolve("新位置 中文 & $name"));
        Path original=oldDir.resolve("photo.png"),other=oldDir.resolve("occupied.png"),moved=newDir.resolve("重命名.png");
        var image=new BufferedImage(40,30,BufferedImage.TYPE_INT_RGB);image.setRGB(2,3,0xff0000);
        ImageIO.write(image,"png",original.toFile());Files.copy(original,other);
        var root=scans.addRoot(oldDir.toString());scan();
        var photo=library.query(null,null,false,"photo.png","name",0,100).items().getFirst();
        var place=library.savePlace(null,new LibraryService.PlaceInput("保留地点","陕西","610000",34.2,108.9,""));
        var category=library.saveCategory(null,new LibraryService.CategoryInput(place.id,"保留类别"));
        library.classify(new LibraryService.Classification(List.of(photo.id()),place.id,List.of(category.id)));
        library.setExcluded(new LibraryService.Exclusion(List.of(photo.id()),true));
        assertThrows(IllegalArgumentException.class,()->relocation.preview(photo.id(),other.toString()));
        Files.move(original,moved);String hash=BackupService.sha256(moved);var time=Files.getLastModifiedTime(moved);
        assertThrows(IllegalArgumentException.class,()->relocation.preview(photo.id(),other.toString())); // Registered target conflict.
        var preview=relocation.preview(photo.id(),moved.toString());assertTrue(preview.verified());
        assertEquals(original.toString(),library.detail(photo.id()).path());relocation.discard(preview.token());
        String discarded=preview.token();assertThrows(NoSuchElementException.class,()->relocation.confirm(discarded,false));
        preview=relocation.preview(photo.id(),moved.toString());
        Files.setLastModifiedTime(moved,java.nio.file.attribute.FileTime.fromMillis(time.toMillis()+1000));
        String changed=preview.token();assertThrows(LibraryMaintenance.Busy.class,()->relocation.confirm(changed,false));
        assertEquals(original.toString(),library.detail(photo.id()).path());Files.setLastModifiedTime(moved,time);
        preview=relocation.preview(photo.id(),moved.toString());String pending=preview.token();
        jdbc.execute("CREATE TRIGGER fail_relocation BEFORE UPDATE ON photos BEGIN SELECT RAISE(ABORT,'intentional relocation failure'); END");
        try{assertThrows(DataAccessException.class,()->relocation.confirm(pending,false));}finally{jdbc.execute("DROP TRIGGER fail_relocation");}
        assertEquals(1,library.allRoots().size());assertEquals(original.toString(),library.detail(photo.id()).path());
        var result=relocation.confirm(pending,false);
        assertEquals(photo.id(),result.id());assertEquals(moved.toRealPath().toString(),result.path());assertEquals(photo.sortAt(),result.sortAt());
        assertEquals(place.id,result.placeId());assertEquals(List.of(category.id),result.categoryIds());assertTrue(result.available());
        assertEquals(1,library.query(null,null,false,"","name",0,100,true).total());
        var scoped=library.allRoots().stream().filter(r->r.id.equals(result.rootId())).findFirst().orElseThrow();
        assertEquals("single_file",scoped.status);assertFalse(scoped.enabled);assertTrue(scoped.fileOnly);assertEquals(moved.toRealPath().toString(),scoped.path);
        Files.copy(moved,newDir.resolve("不应扫描.png"));scan();assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM photos",Integer.class));
        assertEquals(hash,BackupService.sha256(moved));assertEquals(time,Files.getLastModifiedTime(moved));
        assertThrows(IllegalArgumentException.class,()->relocation.preview(photo.id(),moved.toString()));
        try(var input=Files.newInputStream(backups.export())){var inspection=backups.inspect(input);assertEquals(2,inspection.manifest().counts().photos());}
        // A restored file scope can only reauthorize the exact file, never its parent folder.
        jdbc.update("UPDATE photo_roots SET enabled=0,status='needs_confirmation' WHERE id=?",scoped.id);
        Files.delete(library.thumbnail(library.requirePhoto(photo.id())));
        assertFalse(library.detail(photo.id()).available());scans.confirmRoot(scoped.id);
        assertTrue(Files.isRegularFile(library.thumbnail(library.requirePhoto(photo.id()))));
        assertTrue(library.detail(photo.id()).available());assertEquals(0,jdbc.queryForObject("SELECT enabled FROM photo_roots WHERE id=?",Integer.class,scoped.id));
        // Missing cache uses explicit manual confirmation rather than silently trusting metadata.
        Path again=newDir.resolve("再次移动.png");Files.move(moved,again);Files.delete(library.thumbnail(library.requirePhoto(photo.id())));
        var manual=relocation.preview(photo.id(),again.toString());assertFalse(manual.verified());
        assertThrows(IllegalArgumentException.class,()->relocation.confirm(manual.token(),false));
        var confirmed=relocation.confirm(manual.token(),true);assertEquals(photo.id(),confirmed.id());assertEquals(List.of(category.id),confirmed.categoryIds());
        assertEquals(2,library.allRoots().size()); // Prior empty single-file grant was removed.
        // Original bytes, file timestamps and all classification links survive relocation.
        assertEquals(hash,BackupService.sha256(again));assertEquals(time,Files.getLastModifiedTime(again));
        assertTrue(jdbc.queryForList("PRAGMA foreign_key_check").isEmpty());
    }
}
