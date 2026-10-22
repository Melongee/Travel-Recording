package local.travel;

import static org.junit.jupiter.api.Assertions.*;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.*;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.*;

@SpringBootTest
class FileRevealServiceTest {
    static final Path DATA=LibraryIntegrationTest.temporary();
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r){r.add("app.data-dir",()->DATA.toString());}
    @Autowired LibraryService library;
    @Autowired ScanService scans;
    @Autowired JdbcTemplate jdbc;
    @TempDir(factory=ProjectTempDirFactory.class) Path fixture;
    @Test void onlyRegisteredAvailableConfirmedPhotoCanReachDesktopLauncher() throws Exception {
        Path file=fixture.resolve("中文 空格, & 原图.png");
        ImageIO.write(new BufferedImage(32,24,BufferedImage.TYPE_INT_RGB),"png",file.toFile());
        byte[] before=MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(file));
        var root=scans.addRoot(fixture.toString());scans.start();
        assertTimeoutPreemptively(Duration.ofSeconds(20),()->{while(scans.current().state().equals("running"))Thread.sleep(20);});
        var photo=library.query(null,null,false,"","name",0,100).items().getFirst();
        List<Path> opened=new ArrayList<>();var service=new FileRevealService(library,true,opened::add);
        assertTrue(service.reveal(photo.id()).requested());assertEquals(List.of(file.toRealPath()),opened);
        assertThrows(NoSuchElementException.class,()->service.reveal("not-a-photo"));
        var disabled=new FileRevealService(library,false,opened::add);
        assertThrows(IOException.class,()->disabled.reveal(photo.id()));assertEquals(1,opened.size());
        jdbc.update("UPDATE photo_roots SET enabled=0,status='needs_confirmation' WHERE id=?",root.id);
        assertThrows(IOException.class,()->service.reveal(photo.id()));assertEquals(1,opened.size());
        scans.confirmRoot(root.id);
        Path parked=fixture.resolve("parked.bin");Files.move(file,parked);
        assertThrows(IOException.class,()->service.reveal(photo.id()));assertEquals(1,opened.size());
        Files.move(parked,file);
        assertArrayEquals(before,MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(file)));
    }
    @Test void photoNameIsOneLiteralArgumentToFixedExplorerExecutable(){
        Path windows=Path.of("C:/Windows"),photo=Path.of("D:/独立测试/空格, & $name.png");
        var builder=WindowsFileLauncher.revealCommand(windows,photo);var command=builder.command();
        assertEquals(windows.resolve("System32/WindowsPowerShell/v1.0/powershell.exe").toString(),command.get(0));
        assertEquals(photo.toString(),builder.environment().get("TRAVEL_RECORDING_REVEAL_FILE"));
        String script=new String(Base64.getDecoder().decode(command.getLast()),java.nio.charset.StandardCharsets.UTF_16LE);
        assertTrue(script.contains("/select,\""));assertTrue(script.contains("$env:TRAVEL_RECORDING_REVEAL_FILE"));
        assertFalse(script.contains(photo.toString()));assertFalse(command.contains("cmd.exe"));
    }
}
