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
class PlacePhotosIntegrationTest {
    static final Path DATA=LibraryIntegrationTest.temporary();
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r){r.add("app.data-dir",()->DATA.toString());}
    @Autowired LibraryService library;
    @Autowired ScanService scans;
    @Autowired JdbcTemplate jdbc;
    @TempDir(factory=ProjectTempDirFactory.class) Path fixtures;
    @Test void placeAdditionPreservesSamePlaceCategoriesAndMovesOthersAtomically() throws Exception {
        Map<Path,String> hashes=new HashMap<>();Map<Path,java.nio.file.attribute.FileTime> times=new HashMap<>();
        for(String name:List.of("a.png","b.png","c.png","excluded.png")) {
            Path file=fixtures.resolve(name);ImageIO.write(new BufferedImage(36,24,BufferedImage.TYPE_INT_RGB),"png",file.toFile());
            hashes.put(file,BackupService.sha256(file));times.put(file,Files.getLastModifiedTime(file));
        }
        scans.addRoot(fixtures.toString());scans.start();
        assertTimeoutPreemptively(Duration.ofSeconds(20),()->{while(scans.current().state().equals("running"))Thread.sleep(20);});
        assertEquals("completed",scans.current().state());
        var photos=library.query(null,null,false,"","name",0,100).items();
        String a=photos.get(0).id(),b=photos.get(1).id(),c=photos.get(2).id(),hidden=photos.get(3).id();
        var target=library.savePlace(null,new LibraryService.PlaceInput("目标地点","青海","630000",36.9,100.18,""));
        var other=library.savePlace(null,new LibraryService.PlaceInput("原地点","陕西","610000",34.2,108.9,""));
        var oldCategory=library.saveCategory(null,new LibraryService.CategoryInput(target.id,"已有类别"));
        var addedCategory=library.saveCategory(null,new LibraryService.CategoryInput(target.id,"新选类别"));
        var otherCategory=library.saveCategory(null,new LibraryService.CategoryInput(other.id,"旧地点类别"));
        library.classify(new LibraryService.Classification(List.of(a),target.id,List.of(oldCategory.id)));
        library.classify(new LibraryService.Classification(List.of(b),other.id,List.of(otherCategory.id)));
        library.setExcluded(new LibraryService.Exclusion(List.of(hidden),true));
        assertThrows(IllegalArgumentException.class,()->library.addPhotosToPlace("unknown",new LibraryService.PlacePhotos(List.of(c),List.of())));
        assertThrows(IllegalArgumentException.class,()->library.addPhotosToPlace(target.id,new LibraryService.PlacePhotos(List.of(c),List.of(otherCategory.id))));
        assertThrows(NoSuchElementException.class,()->library.addPhotosToPlace(target.id,new LibraryService.PlacePhotos(List.of(c,"unknown"),List.of())));
        assertThrows(IllegalArgumentException.class,()->library.addPhotosToPlace(target.id,new LibraryService.PlacePhotos(List.of(c,hidden),List.of())));
        assertNull(library.detail(c).placeId());assertEquals(other.id,library.detail(b).placeId());
        library.addPhotosToPlace(target.id,new LibraryService.PlacePhotos(List.of(a,b,c,a),List.of(addedCategory.id)));
        assertEquals(Set.of(oldCategory.id,addedCategory.id),new HashSet<>(library.detail(a).categoryIds()));
        assertEquals(List.of(addedCategory.id),library.detail(b).categoryIds());assertEquals(target.id,library.detail(b).placeId());
        assertEquals(target.id,library.detail(c).placeId());assertEquals(3,library.query(target.id,null,false,"","name",0,100).total());
        library.addPhotosToPlace(target.id,new LibraryService.PlacePhotos(List.of(a,b,c),List.of(addedCategory.id)));
        library.addPhotosToPlace(target.id,new LibraryService.PlacePhotos(List.of(a),List.of()));
        assertEquals(2,library.detail(a).categoryIds().size());assertEquals(3,library.query(target.id,addedCategory.id,false,"","name",0,100).total());
        assertEquals(1L,library.overview().get("excludedCount"));assertEquals(0,library.query(null,null,true,"","name",0,100).total());
        library.classify(new LibraryService.Classification(List.of(b),other.id,List.of(otherCategory.id)));
        // Force a failure after the first photo's links changed; the entire batch must roll back.
        jdbc.execute("CREATE TRIGGER test_add_failure BEFORE UPDATE ON photos WHEN NEW.id='"+c+"' BEGIN SELECT RAISE(ABORT,'intentional batch failure'); END");
        try{assertThrows(DataAccessException.class,()->library.addPhotosToPlace(target.id,new LibraryService.PlacePhotos(List.of(b,c),List.of(oldCategory.id))));}
        finally{jdbc.execute("DROP TRIGGER test_add_failure");}
        assertEquals(other.id,library.detail(b).placeId());assertEquals(List.of(otherCategory.id),library.detail(b).categoryIds());
        assertEquals(List.of(addedCategory.id),library.detail(c).categoryIds());
        for(Path file:hashes.keySet()){assertEquals(hashes.get(file),BackupService.sha256(file));assertEquals(times.get(file),Files.getLastModifiedTime(file));}
    }
}
