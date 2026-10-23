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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest
class PhotoExclusionIntegrationTest {
    static final Path DATA=LibraryIntegrationTest.temporary();
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r){r.add("app.data-dir",()->DATA.toString());}
    @Autowired LibraryService library;
    @Autowired ScanService scans;
    @Autowired BackupService backups;
    @Autowired JdbcTemplate jdbc;
    @TempDir(factory=ProjectTempDirFactory.class) Path fixtures;
    void scan(){scans.start();assertTimeoutPreemptively(Duration.ofSeconds(20),()->{while(scans.current().state().equals("running"))Thread.sleep(20);});assertNotEquals("failed",scans.current().state());}
    @Test void exclusionSurvivesScanMissingAndBackupAndRestoresClassification() throws Exception {
        Path nested=Files.createDirectories(fixtures.resolve("中文 空格"));
        Path a=nested.resolve("A.png"),b=nested.resolve("B.png"),c=nested.resolve("C.png");
        for(Path file:List.of(a,b,c))ImageIO.write(new BufferedImage(36,24,BufferedImage.TYPE_INT_RGB),"png",file.toFile());
        Map<Path,String> hashes=new HashMap<>();Map<Path,java.nio.file.attribute.FileTime> times=new HashMap<>();
        for(Path file:List.of(a,b,c)){hashes.put(file,BackupService.sha256(file));times.put(file,Files.getLastModifiedTime(file));}
        scans.addRoot(fixtures.toString());scans.addRoot(nested.toString());scan();
        var photos=library.query(null,null,false,"","name",0,100).items();
        String first=photos.get(0).id(),second=photos.get(1).id();
        var place=library.savePlace(null,new LibraryService.PlaceInput("排除测试","青海","630000",36.9,100.18,""));
        var category=library.saveCategory(null,new LibraryService.CategoryInput(place.id,"风景"));
        library.classify(new LibraryService.Classification(List.of(first),place.id,List.of(category.id)));
        assertThrows(NoSuchElementException.class,()->library.setExcluded(new LibraryService.Exclusion(List.of(first,"missing-id"),true)));
        assertEquals(3,library.query(null,null,false,"","name",0,100).total());
        library.setExcluded(new LibraryService.Exclusion(List.of(first,second,first),true));
        assertEquals(1,library.query(null,null,false,"","name",0,100).total());
        assertEquals(1,library.query(null,null,true,"","name",0,100).total());
        assertEquals(0,library.query(place.id,category.id,false,"","name",0,100).total());
        assertEquals(0,library.allPlaces().getFirst().photoCount());assertNull(library.allPlaces().getFirst().coverSrc());
        assertEquals(1,library.allPlaces().getFirst().excludedPhotoCount());
        assertEquals(0,library.allCategories().getFirst().photoCount());assertEquals(2L,library.overview().get("excludedCount"));
        assertEquals(2,library.query(null,null,false,"","name",0,100,true).total());
        assertThrows(IllegalArgumentException.class,()->library.classify(new LibraryService.Classification(List.of(first),null,List.of())));
        scan();assertEquals(1,library.query(null,null,false,"","name",0,100).total());assertEquals(0,scans.current().added());
        Path parked=nested.resolve("parked.bin");Files.move(a,parked);scan();
        assertEquals("missing",library.detail(first).availability());assertEquals(List.of(category.id),library.detail(first).categoryIds());
        Files.move(parked,a);scan();
        Path archive=backups.export();BackupService.Inspection inspection;
        try(var input=Files.newInputStream(archive)){inspection=backups.inspect(input);}
        assertEquals(2,inspection.manifest().schemaVersion());
        for(String table:List.of("photo_categories","photos","categories","places","photo_roots"))jdbc.update("DELETE FROM "+table);
        backups.restore(inspection.token(),true);
        assertEquals(2L,library.overview().get("excludedCount"));assertEquals(1,library.query(null,null,false,"","name",0,100).total());
        assertEquals("unverified",library.detail(first).availability());
        for(var root:library.allRoots())scans.confirmRoot(root.id);
        scan();assertEquals(2L,library.overview().get("excludedCount"));
        library.setExcluded(new LibraryService.Exclusion(List.of(first,second),false));
        assertEquals(3,library.query(null,null,false,"","name",0,100).total());
        assertEquals(place.id,library.detail(first).placeId());assertEquals(List.of(category.id),library.detail(first).categoryIds());
        assertEquals(1,library.allPlaces().getFirst().photoCount());assertNotNull(library.allPlaces().getFirst().coverSrc());
        library.setExcluded(new LibraryService.Exclusion(List.of(first),true));library.deletePlace(place.id);
        assertEquals(1L,library.overview().get("excludedCount"));assertNull(library.detail(first).placeId());assertTrue(library.detail(first).categoryIds().isEmpty());
        library.setExcluded(new LibraryService.Exclusion(List.of(first),false));assertEquals(3,library.query(null,null,true,"","name",0,100).total());
        for(Path file:List.of(a,b,c)){assertEquals(hashes.get(file),BackupService.sha256(file));assertEquals(times.get(file),Files.getLastModifiedTime(file));}
    }
}
