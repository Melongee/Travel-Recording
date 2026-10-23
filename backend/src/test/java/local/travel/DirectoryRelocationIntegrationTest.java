package local.travel;

import static org.junit.jupiter.api.Assertions.*;
import java.awt.image.BufferedImage;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest
class DirectoryRelocationIntegrationTest {
    static final Path DATA=LibraryIntegrationTest.temporary();
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r){r.add("app.data-dir",()->DATA.toString());}
    @Autowired DirectoryRelocationService directory;@Autowired RelocationService single;
    @Autowired LibraryService library;@Autowired ScanService scans;@Autowired JdbcTemplate jdbc;
    @Autowired BackupService backups;@Autowired LibraryMaintenance maintenance;
    @TempDir(factory=ProjectTempDirFactory.class) Path fixtures;
    @BeforeEach void reset(){for(String table:List.of("photo_categories","photos","categories","places","photo_roots"))jdbc.update("DELETE FROM "+table);}
    void scan(){scans.start();assertTimeoutPreemptively(Duration.ofSeconds(25),()->{while(scans.current().state().equals("running"))Thread.sleep(20);});}
    void image(Path file,int color) throws Exception {
        Files.createDirectories(file.getParent());var image=new BufferedImage(40,30,BufferedImage.TYPE_INT_RGB);
        for(int y=0;y<30;y++)for(int x=0;x<40;x++)image.setRGB(x,y,color);
        ImageIO.write(image,"png",file.toFile());
    }
    Path move(Path from,Path to) throws Exception {Files.createDirectories(to.getParent());return Files.move(from,to);}
    DirectoryRelocationService.Choice pick(DirectoryRelocationService.Preview preview,String id,int index,boolean manual) {
        var row=preview.rows().stream().filter(r->r.photoId().equals(id)).findFirst().orElseThrow();
        return new DirectoryRelocationService.Choice(id,row.candidates().get(index).token(),manual);
    }
    @Test void previewsAmbiguityRejectsConflictsAndRollsBackTheEntireSelection() throws Exception {
        Path old=fixtures.resolve("旧目录 中文 & $name"),next=Files.createDirectories(fixtures.resolve("新目录"));
        String[] names={"a.png","nested/b.png","c.png","d.png","e.png","left/f.png","right/f.png","g.png","h.png"};
        int[] colors={0xff0000,0x0000ff,0x00ff00,0xffff00,0x555555,0xff00ff,0xff00ff,0xffffff,0};
        for(int i=0;i<names.length;i++)image(old.resolve(names[i]),colors[i]);
        var root=scans.addRoot(old.toString());scan();
        Map<String,LibraryService.PhotoView> photos=new HashMap<>();
        for(var p:library.query(null,null,false,"","name",0,100).items())photos.put(old.relativize(Path.of(p.path())).toString().replace('\\','/'),p);
        var place=library.savePlace(null,new LibraryService.PlaceInput("原地点","陕西","610000",34.2,108.9,""));
        var category=library.saveCategory(null,new LibraryService.CategoryInput(place.id,"原类别"));
        library.classify(new LibraryService.Classification(photos.values().stream().map(LibraryService.PhotoView::id).toList(),place.id,List.of(category.id)));
        library.setExcluded(new LibraryService.Exclusion(List.of(photos.get("nested/b.png").id()),true));
        move(old.resolve("a.png"),next.resolve("a.png"));move(old.resolve("nested/b.png"),next.resolve("changed/b.png"));
        move(old.resolve("c.png"),next.resolve("x/c.png"));Files.createDirectories(next.resolve("y"));Files.copy(next.resolve("x/c.png"),next.resolve("y/c.png"));
        move(old.resolve("d.png"),fixtures.resolve("未找到/d.png"));move(old.resolve("e.png"),next.resolve("e.png"));
        move(old.resolve("left/f.png"),next.resolve("flat/f.png"));move(old.resolve("right/f.png"),fixtures.resolve("未找到/f.png"));
        move(old.resolve("h.png"),next.resolve("already/h.png"));scans.addRoot(next.resolve("already").toString());scan();
        Files.delete(library.thumbnail(library.requirePhoto(photos.get("e.png").id())));
        Map<Path,String> hashes=new HashMap<>();Map<Path,java.nio.file.attribute.FileTime> times=new HashMap<>();
        try(var files=Files.walk(fixtures)){for(Path file:files.filter(Files::isRegularFile).toList()){hashes.put(file,BackupService.sha256(file));times.put(file,Files.getLastModifiedTime(file));}}
        var first=directory.preview(root.id,next.toString());assertEquals(9,first.total());assertEquals(2,first.matchedCount());assertEquals(4,first.ambiguousCount());assertEquals(2,first.unmatchedCount());assertEquals(1,first.availableCount());
        assertEquals(2,library.allRoots().size());directory.discard(first.token());assertEquals(old.resolve("a.png").toString(),library.detail(photos.get("a.png").id()).path());
        var preview=directory.preview(root.id,next.toString());
        var a=pick(preview,photos.get("a.png").id(),0,false);
        var b=pick(preview,photos.get("nested/b.png").id(),0,false);
        var e=pick(preview,photos.get("e.png").id(),0,true);
        assertThrows(IllegalArgumentException.class,()->directory.confirm(preview.token(),List.of(pick(preview,photos.get("left/f.png").id(),0,false),pick(preview,photos.get("right/f.png").id(),0,false))));
        assertThrows(IllegalArgumentException.class,()->directory.confirm(preview.token(),List.of(a,b,pick(preview,photos.get("e.png").id(),0,false))));
        Path changed=next.resolve("a.png");byte[] bytes=Files.readAllBytes(changed),altered=bytes.clone();altered[altered.length-1]^=1;
        Files.write(changed,altered);Files.setLastModifiedTime(changed,times.get(changed));
        assertThrows(LibraryMaintenance.Busy.class,()->directory.confirm(preview.token(),List.of(a,b,e)));
        Files.write(changed,bytes);Files.setLastModifiedTime(changed,times.get(changed));
        String bId=photos.get("nested/b.png").id();
        jdbc.execute("CREATE TRIGGER fail_directory_relocation BEFORE UPDATE ON photos WHEN NEW.id='"+bId+"' BEGIN SELECT RAISE(ABORT,'intentional directory recovery failure'); END");
        try{assertThrows(DataAccessException.class,()->directory.confirm(preview.token(),List.of(a,b,e)));}finally{jdbc.execute("DROP TRIGGER fail_directory_relocation");}
        assertEquals(2,library.allRoots().size());assertEquals(old.resolve("a.png").toString(),library.detail(photos.get("a.png").id()).path());
        var c=pick(preview,photos.get("c.png").id(),0,false);
        var saved=directory.confirm(preview.token(),List.of(a,b,c,e));assertEquals(4,saved.restored());assertEquals(5,saved.retained());
        for(String name:List.of("a.png","nested/b.png","c.png","e.png")) {
            var recovered=library.detail(photos.get(name).id());assertTrue(recovered.available());assertEquals(place.id,recovered.placeId());assertEquals(List.of(category.id),recovered.categoryIds());assertEquals(photos.get(name).sortAt(),recovered.sortAt());
        }
        assertEquals(1,library.query(null,null,false,"","name",0,100,true).total());
        assertEquals(old.resolve("d.png").toString(),library.detail(photos.get("d.png").id()).path());assertFalse(library.detail(photos.get("d.png").id()).available());
        assertEquals(10,jdbc.queryForObject("SELECT count(*) FROM photos",Integer.class));
        try(var input=Files.newInputStream(backups.export())){assertEquals(10,backups.inspect(input).manifest().counts().photos());}
        assertTrue(jdbc.queryForList("PRAGMA foreign_key_check").isEmpty());
        for(Path file:hashes.keySet()){assertEquals(hashes.get(file),BackupService.sha256(file));assertEquals(times.get(file),Files.getLastModifiedTime(file));}
    }
    @Test void fullMoveReplacesOldMountPreservesIdAndCoordinatesWithScanning() throws Exception {
        Path old=fixtures.resolve("before"),next=fixtures.resolve("after");image(old.resolve("photo.png"),0x224477);
        var root=scans.addRoot(old.toString());scan();var photo=library.query(null,null,false,"","name",0,100).items().getFirst();
        Files.move(old,next);var preview=directory.preview(root.id,next.toString());assertEquals(1,preview.matchedCount());
        try(var lease=maintenance.exclusive()) {
            scans.start();assertThrows(LibraryMaintenance.Busy.class,()->directory.confirm(preview.token(),List.of(pick(preview,photo.id(),0,false))));
        }
        assertTimeoutPreemptively(Duration.ofSeconds(20),()->{while(scans.current().state().equals("running"))Thread.sleep(20);});
        // Scan may update the root status, requiring an honest fresh preview.
        var fresh=directory.preview(root.id,next.toString());var result=directory.confirm(fresh.token(),List.of(pick(fresh,photo.id(),0,false)));
        assertEquals(1,library.allRoots().size());assertNotEquals(root.id,result.newRootId());assertTrue(library.detail(photo.id()).available());
        scan();assertEquals(1,library.query(null,null,false,"","name",0,100).total());assertEquals(photo.id(),library.query(null,null,false,"","name",0,100).items().getFirst().id());
        assertThrows(NoSuchElementException.class,()->directory.confirm(fresh.token(),List.of()));
    }
}
