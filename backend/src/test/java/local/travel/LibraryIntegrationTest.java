package local.travel;

import static org.junit.jupiter.api.Assertions.*;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.file.*;
import java.security.*;
import java.time.Duration;
import java.util.*;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest
class LibraryIntegrationTest {
    static final Path DATABASE=temporary();
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r) { r.add("app.data-dir",()->DATABASE.toString()); }
    static Path temporary() { try { return Files.createTempDirectory("travel-db-"); } catch(IOException e) { throw new UncheckedIOException(e); } }
    @Autowired LibraryService library;
    @Autowired ScanService scans;
    @Autowired ImageService images;
    @TempDir Path fixture;
    void scan() {
        scans.start();
        assertTimeoutPreemptively(Duration.ofSeconds(25),()->{while(scans.current().state().equals("running"))Thread.sleep(25);});
        assertNotEquals("failed",scans.current().state(),scans.current().toString());
    }
    byte[] hash(Path file) throws Exception { return MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(file)); }
    @Test void realImagesIncrementalScanClassificationMissingAndCorruption() throws Exception {
        Path nested=Files.createDirectories(fixture.resolve("中文 空格"));
        BufferedImage image=new BufferedImage(36,24,BufferedImage.TYPE_INT_RGB);
        image.setRGB(0,0,0xFF0000);
        Path jpg=nested.resolve("横图.JPG"),png=nested.resolve("透明.png"),webp=nested.resolve("样本.webp"),broken=nested.resolve("损坏.jpg");
        ImageIO.write(image,"jpeg",jpg.toFile());
        var transparent=new BufferedImage(12,30,BufferedImage.TYPE_INT_ARGB);transparent.setRGB(0,0,0x80FF0000);
        ImageIO.write(transparent,"png",png.toFile());
        try(var input=getClass().getResourceAsStream("/tiny.webp")){assertNotNull(input);Files.copy(input,webp);}
        Files.writeString(broken,"this is not an image");Files.writeString(nested.resolve("skip.txt"),"ignored");
        byte[] before=hash(jpg);
        scans.addRoot(fixture.toString()); scans.addRoot(nested.toString()); scan();
        assertEquals(4,library.query(null,null,false,"","name",0,100).total());
        var page=library.query(null,null,false,"","name",0,100);
        assertEquals(3,page.items().stream().filter(LibraryService.PhotoView::available).count());
        assertEquals(1,page.items().stream().filter(p->p.availability().equals("corrupt")).count());
        var photo=page.items().stream().filter(p->p.fileName().equals("横图.JPG")).findFirst().orElseThrow();
        var webpPhoto=page.items().stream().filter(p->p.fileName().endsWith("webp")).findFirst().orElseThrow();
        assertTrue(Files.size(images.preview(library.requirePhoto(webpPhoto.id()),webp))>0);
        var pngPhoto=page.items().stream().filter(p->p.fileName().endsWith("png")).findFirst().orElseThrow();
        BufferedImage thumb=ImageIO.read(library.thumbnail(library.requirePhoto(pngPhoto.id())).toFile());
        assertTrue(thumb.getColorModel().hasAlpha()); assertEquals(0,(thumb.getRGB(8,15)>>>24));
        Path thumbnail=library.thumbnail(library.requirePhoto(photo.id())); var cachedTime=Files.getLastModifiedTime(thumbnail);
        scan();assertEquals(4,library.query(null,null,false,"","name",0,100).total());assertEquals(cachedTime,Files.getLastModifiedTime(thumbnail));assertEquals(0,scans.current().added());
        var a=library.savePlace(null,new LibraryService.PlaceInput("地点一","青海","630000",36.9,100.18,""));
        var b=library.savePlace(null,new LibraryService.PlaceInput("地点二","四川","510000",30.5,104.1,""));
        var c1=library.saveCategory(null,new LibraryService.CategoryInput(a.id,"风景"));
        var c2=library.saveCategory(null,new LibraryService.CategoryInput(a.id,"人物"));
        var other=library.saveCategory(null,new LibraryService.CategoryInput(b.id,"B类"));
        library.classify(new LibraryService.Classification(List.of(photo.id()),a.id,List.of(c1.id,c2.id)));
        assertEquals(1,library.query(a.id,null,false,"","date-desc",0,100).total());
        assertEquals(1,library.query(a.id,c1.id,false,"","date-desc",0,100).total());
        assertEquals(1,library.query(a.id,c2.id,false,"","date-desc",0,100).total());
        assertThrows(IllegalArgumentException.class,()->library.classify(new LibraryService.Classification(List.of(photo.id()),b.id,List.of(c1.id))));
        assertEquals(a.id,library.detail(photo.id()).placeId()); assertEquals(2,library.detail(photo.id()).categoryIds().size());
        assertThrows(NoSuchElementException.class,()->library.classify(new LibraryService.Classification(List.of(photo.id(),"missing-id"),b.id,List.of(other.id))));
        assertEquals(a.id,library.detail(photo.id()).placeId());
        // Only generated fixture files are moved during missing-file validation.
        Path parked=fixture.resolve("parked.bin");Files.move(jpg,parked); scan();
        assertEquals("missing",library.detail(photo.id()).availability());assertEquals(a.id,library.detail(photo.id()).placeId());assertEquals(2,library.detail(photo.id()).categoryIds().size());
        Files.move(parked,jpg);scan();assertTrue(library.detail(photo.id()).available());assertEquals(4,library.query(null,null,false,"","name",0,100).total());
        library.classify(new LibraryService.Classification(List.of(photo.id()),b.id,List.of(other.id)));
        assertEquals(List.of(other.id),library.detail(photo.id()).categoryIds());
        library.deleteCategory(other.id);assertEquals(b.id,library.detail(photo.id()).placeId());assertTrue(library.detail(photo.id()).categoryIds().isEmpty());
        library.deletePlace(b.id);assertNull(library.detail(photo.id()).placeId());assertTrue(Files.exists(jpg));
        assertArrayEquals(before,hash(jpg));assertTrue(Files.isRegularFile(jpg));
    }
}
