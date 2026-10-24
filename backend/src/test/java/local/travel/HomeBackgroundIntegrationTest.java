package local.travel;

import static org.junit.jupiter.api.Assertions.*;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.FileTime;
import java.time.Duration;
import java.util.*;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest
class HomeBackgroundIntegrationTest {
    static final Path DATA=LibraryIntegrationTest.temporary();
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r){r.add("app.data-dir",()->DATA.toString());}
    @Autowired HomeBackgroundService backgrounds;
    @Autowired LibraryService library;
    @Autowired ScanService scans;
    @Autowired JdbcTemplate jdbc;
    @TempDir(factory=ProjectTempDirFactory.class) Path originals;

    @Test void persistsAcrossReadersWithoutChangingPhotosAndRetainsOldSettingsOnFailure() throws Exception {
        assertEquals(HomeBackgroundService.DEFAULT,backgrounds.read().settings());
        Map<Path,String> hashes=new HashMap<>();Map<Path,FileTime> times=new HashMap<>();
        for(String name:List.of("landscape.png","portrait.png")) {
            var photo=new BufferedImage(name.startsWith("landscape")?60:30,name.startsWith("landscape")?30:60,BufferedImage.TYPE_INT_RGB);
            var file=originals.resolve(name);ImageIO.write(photo,"png",file.toFile());hashes.put(file,BackupService.sha256(file));times.put(file,Files.getLastModifiedTime(file));
        }
        scans.addRoot(originals.toString());scans.start();
        assertTimeoutPreemptively(Duration.ofSeconds(20),()->{while(scans.current().state().equals("running"))Thread.sleep(20);});
        assertEquals("completed",scans.current().state());
        var photos=library.query(null,null,false,"","name",0,100).items();
        String visible=photos.get(0).id(),excluded=photos.get(1).id();
        var place=library.savePlace(null,new LibraryService.PlaceInput("背景保护地点","陕西","610000",34.2,108.9,""));
        var category=library.saveCategory(null,new LibraryService.CategoryInput(place.id,"既有类别"));
        library.classify(new LibraryService.Classification(List.of(visible,excluded),place.id,List.of(category.id)));
        library.setExcluded(new LibraryService.Exclusion(List.of(excluded),true));
        var json=tools.jackson.databind.json.JsonMapper.builder().build();
        var overview=json.writeValueAsString(library.overview());var beforeVisible=library.detail(visible);var beforeExcluded=library.detail(excluded);
        var input=new HomeBackgroundService.Input("photo",visible,.73,2.25,.18,.84);
        var saved=backgrounds.save(input);
        assertEquals(visible,saved.settings().photoId());assertNotNull(saved.src());assertNull(saved.warning());
        assertEquals(saved,new HomeBackgroundService(jdbc,library).read());
        assertEquals(saved,backgrounds.read()); // Both readers use the same persisted data, not an in-memory/browser value.
        jdbc.execute("CREATE TRIGGER fail_background AFTER UPDATE ON home_background BEGIN SELECT RAISE(ABORT,'simulated failed write'); END");
        try{assertThrows(org.springframework.dao.DataAccessException.class,()->backgrounds.save(new HomeBackgroundService.Input("photo",visible,.4,3.,.5,.5)));}
        finally{jdbc.execute("DROP TRIGGER fail_background");}
        assertEquals(saved,backgrounds.read());
        for(var invalid:List.of(new HomeBackgroundService.Input("photo","../elsewhere",1.,1.,.5,.5),new HomeBackgroundService.Input("photo",excluded,1.,1.,.5,.5),new HomeBackgroundService.Input("photo",visible,Double.NaN,1.,.5,.5),new HomeBackgroundService.Input("photo",visible,1.,4.1,.5,.5),new HomeBackgroundService.Input("photo",visible,1.,1.,-.1,.5),new HomeBackgroundService.Input("other",null,1.,1.,.5,.5))) {
            assertThrows(IllegalArgumentException.class,()->backgrounds.save(invalid));assertEquals(saved,backgrounds.read());
        }
        assertThrows(NoSuchElementException.class,()->backgrounds.save(new HomeBackgroundService.Input("photo",UUID.randomUUID().toString(),1.,1.,.5,.5)));
        jdbc.update("UPDATE photo_roots SET status='needs_confirmation'");
        assertNull(backgrounds.read().src());assertNotNull(backgrounds.read().warning());
        assertThrows(IOException.class,()->backgrounds.save(input));assertEquals(saved.settings(),backgrounds.read().settings());
        jdbc.update("UPDATE photo_roots SET status='ready'");
        jdbc.update("UPDATE photos SET availability='missing' WHERE id=?",visible);
        assertNull(backgrounds.read().src());assertEquals(saved.settings(),backgrounds.read().settings());
        jdbc.update("UPDATE photos SET availability='available' WHERE id=?",visible);
        assertEquals("none",backgrounds.save(new HomeBackgroundService.Input("none",null,1.,1.,.5,.4)).settings().mode());
        assertEquals("default",backgrounds.save(new HomeBackgroundService.Input("default",null,1.,1.,.5,.4)).settings().mode());
        assertEquals(overview,json.writeValueAsString(library.overview()));assertEquals(beforeVisible,library.detail(visible));assertEquals(beforeExcluded,library.detail(excluded));
        assertTrue(jdbc.queryForList("PRAGMA foreign_key_check").isEmpty());assertEquals("ok",jdbc.queryForObject("PRAGMA integrity_check",String.class));
        for(var file:hashes.keySet()){assertEquals(hashes.get(file),BackupService.sha256(file));assertEquals(times.get(file),Files.getLastModifiedTime(file));}
        backgrounds.save(input);
        jdbc.update("DELETE FROM photo_categories WHERE photo_id=?",visible);
        jdbc.update("DELETE FROM photos WHERE id=?",visible);
        assertNull(backgrounds.read().settings().photoId());assertNotNull(backgrounds.read().warning());
    }
}
