package local.travel;

import static org.junit.jupiter.api.Assertions.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Base64;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class FolderPickerServiceTest {
    @Test void selectionCancellationAndDisabledDesktopAreDistinct() throws Exception {
        String path="D:\\独立样本\\中文 空格, & $name";
        assertEquals(new FolderPickerService.Result(path,false),new FolderPickerService(true,()->path).choose());
        assertEquals(new FolderPickerService.Result(null,true),new FolderPickerService(true,()->null).choose());
        assertThrows(IOException.class,()->new FolderPickerService(false,()->{fail("Disabled desktop launched a dialog");return null;}).choose());
    }
    @Test void concurrentDialogIsRejectedAndFailureReleasesTheGuard() throws Exception {
        CountDownLatch started=new CountDownLatch(1),release=new CountDownLatch(1);
        AtomicInteger calls=new AtomicInteger();
        var service=new FolderPickerService(true,()->{
            if(calls.getAndIncrement()>0)return null;
            started.countDown();
            try{if(!release.await(5,TimeUnit.SECONDS))throw new IOException("Test timeout");}
            catch(InterruptedException e){Thread.currentThread().interrupt();throw new IOException(e);}
            throw new IOException("Simulated desktop failure");
        });
        try(var executor=Executors.newSingleThreadExecutor()) {
            Future<?> first=executor.submit(()->assertThrows(IOException.class,service::choose));
            try{assertTrue(started.await(5,TimeUnit.SECONDS));assertThrows(IOException.class,service::choose);}
            finally{release.countDown();}
            first.get(5,TimeUnit.SECONDS);
            assertTrue(service.choose().cancelled());assertEquals(2,calls.get());
        }
    }
    @Test void nativeCommandUsesBundledConstantScriptAndHiddenStaProcess() throws Exception {
        var command=WindowsFolderPicker.command(Path.of("C:/Windows")).command();
        assertTrue(command.getFirst().endsWith("powershell.exe"));assertTrue(command.contains("-STA"));assertTrue(command.contains("Hidden"));
        String script=new String(Base64.getDecoder().decode(command.getLast()),StandardCharsets.UTF_16LE);
        assertTrue(script.contains("IFileDialog"));assertTrue(script.contains("0x20u"));assertTrue(script.contains("CANCELLED"));
    }
}
