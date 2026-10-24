package local.travel;

import static org.junit.jupiter.api.Assertions.*;
import java.awt.image.BufferedImage;
import java.nio.file.*;
import java.nio.file.attribute.FileTime;
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
class ClassificationIntegrationTest {
    static final Path DATA=LibraryIntegrationTest.temporary();
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r){r.add("app.data-dir",()->DATA.toString());}
    @Autowired LibraryService library;
    @Autowired ScanService scans;
    @Autowired JdbcTemplate jdbc;
    @TempDir(factory=ProjectTempDirFactory.class) Path fixtures;

    @Test void replacesCategoriesAndCreatesNewOnesInTheSameTransaction() throws Exception {
        Map<Path,String> hashes=new HashMap<>();Map<Path,FileTime> times=new HashMap<>();
        for(String name:List.of("a.png","b.png","excluded.png")) {
            Path file=fixtures.resolve(name);
            ImageIO.write(new BufferedImage(36,24,BufferedImage.TYPE_INT_RGB),"png",file.toFile());
            hashes.put(file,BackupService.sha256(file));times.put(file,Files.getLastModifiedTime(file));
        }
        scans.addRoot(fixtures.toString());scans.start();
        assertTimeoutPreemptively(Duration.ofSeconds(20),()->{while(scans.current().state().equals("running"))Thread.sleep(20);});
        assertEquals("completed",scans.current().state());
        var photos=library.query(null,null,false,"","name",0,100).items();
        String a=photos.get(0).id(),b=photos.get(1).id(),hidden=photos.get(2).id();
        var source=library.savePlace(null,new LibraryService.PlaceInput("当前地点","陕西","610000",34.2,108.9,""));
        var target=library.savePlace(null,new LibraryService.PlaceInput("其他地点","青海","630000",36.9,100.18,""));
        var old=library.saveCategory(null,new LibraryService.CategoryInput(source.id,"旧类别"));
        var keep=library.saveCategory(null,new LibraryService.CategoryInput(source.id,"保留类别"));
        library.classify(new LibraryService.Classification(List.of(a,b,hidden),source.id,List.of(old.id,keep.id)));
        library.setExcluded(new LibraryService.Exclusion(List.of(hidden),true));

        library.classify(new LibraryService.Classification(List.of(a,b),source.id,List.of(keep.id),List.of(" 人像 ","夜景"),source.id));
        var newIds=jdbc.queryForList("SELECT id FROM categories WHERE place_id=? AND name IN ('人像','夜景')",String.class,source.id);
        assertEquals(2,newIds.size());
        Set<String> expected=new HashSet<>(newIds);expected.add(keep.id);
        assertEquals(expected,new HashSet<>(library.detail(a).categoryIds()));
        assertEquals(expected,new HashSet<>(library.detail(b).categoryIds()));
        assertEquals(source.id,library.detail(a).placeId());
        assertEquals(0,library.query(source.id,old.id,false,"","name",0,100).total());
        library.classify(new LibraryService.Classification(List.of(a),source.id,List.of(),List.of(),source.id));
        assertTrue(library.detail(a).categoryIds().isEmpty());assertEquals(source.id,library.detail(a).placeId());

        var before=library.detail(b);
        int categoryCount=jdbc.queryForObject("SELECT count(*) FROM categories",Integer.class);
        assertThrows(IllegalArgumentException.class,()->library.classify(new LibraryService.Classification(List.of(b),source.id,List.of(),List.of("人像"),source.id)));
        assertThrows(IllegalArgumentException.class,()->library.classify(new LibraryService.Classification(List.of(b),source.id,List.of(),List.of("重复"," 重复 "),source.id)));
        assertThrows(IllegalArgumentException.class,()->library.classify(new LibraryService.Classification(List.of(b),source.id,List.of(),List.of(" "),source.id)));
        assertThrows(IllegalArgumentException.class,()->library.classify(new LibraryService.Classification(List.of(b),source.id,List.of(),List.of("长".repeat(25)),source.id)));
        assertThrows(IllegalArgumentException.class,()->library.classify(new LibraryService.Classification(List.of(b),target.id,List.of(),List.of("不能换地点"),source.id)));
        assertThrows(IllegalArgumentException.class,()->library.classify(new LibraryService.Classification(List.of(hidden),source.id,List.of(),List.of("排除失败"),source.id)));
        assertThrows(NoSuchElementException.class,()->library.classify(new LibraryService.Classification(List.of(b,"missing"),source.id,List.of(),List.of("无效照片"),source.id)));
        assertThrows(IllegalArgumentException.class,()->library.classify(new LibraryService.Classification(List.of(b),target.id,List.of(keep.id),List.of("外地类别"),null)));
        assertEquals(categoryCount,jdbc.queryForObject("SELECT count(*) FROM categories",Integer.class));
        assertEquals(before,library.detail(b));

        // Fail after creating a category and changing the first photo. Everything must roll back.
        jdbc.execute("CREATE TRIGGER test_classification_failure BEFORE UPDATE ON photos WHEN NEW.id='"+b+"' BEGIN SELECT RAISE(ABORT,'intentional classification failure'); END");
        try{assertThrows(DataAccessException.class,()->library.classify(new LibraryService.Classification(List.of(a,b),target.id,List.of(),List.of("事务回滚"),null)));}
        finally{jdbc.execute("DROP TRIGGER test_classification_failure");}
        assertEquals(source.id,library.detail(a).placeId());assertTrue(library.detail(a).categoryIds().isEmpty());
        assertEquals(before,library.detail(b));
        assertEquals(categoryCount,jdbc.queryForObject("SELECT count(*) FROM categories",Integer.class));

        library.classify(new LibraryService.Classification(List.of(a,b),target.id,List.of(),List.of("目标新类别"),null));
        String targetCategory=jdbc.queryForObject("SELECT id FROM categories WHERE place_id=?",String.class,target.id);
        for(String id:List.of(a,b)){assertEquals(target.id,library.detail(id).placeId());assertEquals(List.of(targetCategory),library.detail(id).categoryIds());}
        assertThrows(IllegalArgumentException.class,()->library.classify(new LibraryService.Classification(List.of(b),source.id,List.of(),List.of("过期地点"),source.id)));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM categories WHERE name='过期地点'",Integer.class));
        assertEquals(List.of(old.id,keep.id).stream().sorted().toList(),library.detail(hidden).categoryIds().stream().sorted().toList());
        assertEquals(1L,library.overview().get("excludedCount"));
        for(var original:photos){var now=library.detail(original.id());assertEquals(original.path(),now.path());assertEquals(original.sortAt(),now.sortAt());assertEquals(original.version(),now.version());}
        assertTrue(jdbc.queryForList("PRAGMA foreign_key_check").isEmpty());
        assertEquals("ok",jdbc.queryForObject("PRAGMA integrity_check",String.class));
        for(Path file:hashes.keySet()){assertEquals(hashes.get(file),BackupService.sha256(file));assertEquals(times.get(file),Files.getLastModifiedTime(file));}
    }
}
