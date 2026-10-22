package local.travel;

import static org.junit.jupiter.api.Assertions.*;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.file.*;
import java.sql.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.zip.*;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest
class BackupIntegrationTest {
    static final Path DATA=LibraryIntegrationTest.temporary();
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r){r.add("app.data-dir",()->DATA.toString());}
    @Autowired BackupService backups;
    @Autowired LibraryService library;
    @Autowired ScanService scans;
    @Autowired JdbcTemplate jdbc;
    @Autowired LibraryMaintenance maintenance;
    @TempDir(factory=ProjectTempDirFactory.class) Path fixtures;
    BackupService.Inspection inspect(Path zip) throws Exception {try(var input=Files.newInputStream(zip)){return backups.inspect(input);}}
    void clearTestLibrary(){for(String table:List.of("photo_categories","photos","categories","places","photo_roots"))jdbc.update("DELETE FROM "+table);}
    @Test void walSnapshotRestoresClassificationAndRequiresExplicitRootAccess() throws Exception {
        var image=new BufferedImage(30,20,BufferedImage.TYPE_INT_RGB);
        Path file=fixtures.resolve("独立 样本.png");ImageIO.write(image,"png",file.toFile());
        String originalHash=BackupService.sha256(file);
        scans.addRoot(fixtures.toString());scans.start();
        assertTimeoutPreemptively(Duration.ofSeconds(20),()->{while(scans.current().state().equals("running"))Thread.sleep(20);});
        var photo=library.query(null,null,false,"","name",0,100).items().getFirst();
        var place=library.savePlace(null,new LibraryService.PlaceInput("备份地点","青海","630000",36.9,100.18,"分类保留"));
        var a=library.saveCategory(null,new LibraryService.CategoryInput(place.id,"A"));
        var b=library.saveCategory(null,new LibraryService.CategoryInput(place.id,"B"));
        library.classify(new LibraryService.Classification(List.of(photo.id()),place.id,List.of(a.id,b.id)));
        Path archive=backups.export();
        try(ZipFile zip=new ZipFile(archive.toFile())){assertEquals(Set.of("manifest.json","library.db"),new HashSet<>(zip.stream().map(ZipEntry::getName).toList()));}
        var inspection=inspect(archive);
        assertEquals(new BackupService.Counts(1,1,1,2,2),inspection.manifest().counts());
        assertThrows(LibraryMaintenance.Busy.class,()->backups.restore(inspection.token(),true));
        assertEquals(place.id,library.detail(photo.id()).placeId());
        clearTestLibrary();
        assertThrows(IllegalArgumentException.class,()->backups.restore(inspection.token(),false));
        backups.restore(inspection.token(),true);
        var restored=library.detail(photo.id());
        assertEquals(place.id,restored.placeId());assertEquals(Set.of(a.id,b.id),new HashSet<>(restored.categoryIds()));
        assertFalse(restored.available());assertEquals("unverified",restored.availability());
        assertThrows(IOException.class,()->library.source(library.requirePhoto(photo.id())));
        assertFalse(library.allRoots().getFirst().enabled);
        assertEquals("needs_confirmation",library.allRoots().getFirst().status);
        scans.confirmRoot(library.allRoots().getFirst().id);
        assertTrue(library.detail(photo.id()).available());
        assertEquals(originalHash,BackupService.sha256(file));
        assertThrows(LibraryMaintenance.Busy.class,()->backups.restore(inspection.token(),true));
        // A hostile extra ZIP path is rejected without touching either the library or the target path.
        Path traversal=fixtures.resolve("traversal.zip");
        try(ZipOutputStream out=new ZipOutputStream(Files.newOutputStream(traversal))){out.putNextEntry(new ZipEntry("../outside.txt"));out.write(1);out.closeEntry();}
        assertThrows(IllegalArgumentException.class,()->inspect(traversal));
        Path corrupt=fixtures.resolve("corrupt.zip");
        try(ZipFile in=new ZipFile(archive.toFile());ZipOutputStream out=new ZipOutputStream(Files.newOutputStream(corrupt))) {
            out.putNextEntry(new ZipEntry("manifest.json"));out.write(in.getInputStream(in.getEntry("manifest.json")).readAllBytes());out.closeEntry();
            out.putNextEntry(new ZipEntry("library.db"));out.write("broken".getBytes());out.closeEntry();
        }
        assertThrows(IllegalArgumentException.class,()->inspect(corrupt));
        Path unknownSchema=fixtures.resolve("unknown-schema.db");
        try(ZipFile in=new ZipFile(archive.toFile())){Files.copy(in.getInputStream(in.getEntry("library.db")),unknownSchema);}
        try(Connection c=DriverManager.getConnection("jdbc:sqlite:"+unknownSchema);Statement s=c.createStatement()){s.execute("CREATE VIEW hostile AS SELECT 1");}
        var old=inspection.manifest();
        var changed=new BackupService.Manifest(old.format(),1,old.appVersion(),1,old.exportedAt(),BackupService.sha256(unknownSchema),old.counts());
        Path hostile=fixtures.resolve("unknown-schema.zip");
        try(ZipOutputStream out=new ZipOutputStream(Files.newOutputStream(hostile))){
            out.putNextEntry(new ZipEntry("manifest.json"));out.write(JsonMapper.builder().build().writeValueAsBytes(changed));out.closeEntry();
            out.putNextEntry(new ZipEntry("library.db"));Files.copy(unknownSchema,out);out.closeEntry();
        }
        assertThrows(IllegalArgumentException.class,()->inspect(hostile));
        assertEquals(2,library.detail(photo.id()).categoryIds().size());
    }
    @Test void restoreCannotRunWhileAnotherThreadHoldsLibraryAccess() throws Exception {
        CountDownLatch entered=new CountDownLatch(1),release=new CountDownLatch(1);
        try(var worker=Executors.newSingleThreadExecutor()){
            var task=worker.submit(()->{try(var lease=maintenance.read()){entered.countDown();release.await();}catch(InterruptedException e){Thread.currentThread().interrupt();}});
            assertTrue(entered.await(3,TimeUnit.SECONDS));
            try{assertThrows(LibraryMaintenance.Busy.class,()->backups.restore("invalid-token",true));}finally{release.countDown();}
            task.get(3,TimeUnit.SECONDS);
        }
    }
    @Test void failedDatabaseSwitchRollsBackAndKeepsRecoverySnapshot() throws Exception {
        AppPaths testPaths=new AppPaths(fixtures.resolve("switch-data").toString());
        try(LibraryDatabase db=new LibraryDatabase(testPaths)){
            try(Connection c=db.getConnection();Statement s=c.createStatement()){s.execute("CREATE TABLE canary(value TEXT)");s.execute("INSERT INTO canary VALUES('original')");}
            Path candidate=fixtures.resolve("candidate.db");db.snapshot(candidate);
            try(Connection c=DriverManager.getConnection("jdbc:sqlite:"+candidate);Statement s=c.createStatement()){s.execute("UPDATE canary SET value='new'");}
            assertThrows(IOException.class,()->db.replace(candidate,c->{throw new SQLException("intentional verification failure");}));
            try(Connection c=db.getConnection();Statement s=c.createStatement();ResultSet r=s.executeQuery("SELECT value FROM canary")){assertTrue(r.next());assertEquals("original",r.getString(1));}
            try(var files=Files.list(testPaths.data.resolve("backups"))){assertTrue(files.anyMatch(p->p.getFileName().toString().startsWith("before-restore-")));}
            assertThrows(IllegalStateException.class,()->new LibraryDatabase(testPaths));
        }
    }
}
