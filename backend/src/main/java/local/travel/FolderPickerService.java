package local.travel;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.*;

@Service
public class FolderPickerService {
    interface Picker { String choose() throws IOException; }
    private final boolean enabled;
    private final Picker picker;
    private final AtomicBoolean choosing=new AtomicBoolean();
    FolderPickerService(@Value("${app.desktop.enabled:true}") boolean enabled,Picker picker){this.enabled=enabled;this.picker=picker;}
    record Result(String path,boolean cancelled) {}
    Result choose() throws IOException {
        if(!enabled)throw new IOException("当前服务已关闭桌面操作，无法打开文件夹选择窗口");
        if(!choosing.compareAndSet(false,true))throw new IOException("文件夹选择窗口已打开，请先完成或取消选择");
        try {String path=picker.choose();return new Result(path,path==null);}
        finally {choosing.set(false);}
    }
}

@Component
class WindowsFolderPicker implements FolderPickerService.Picker {
    static ProcessBuilder command(Path windows) throws IOException {
        String script;
        try(var input=WindowsFolderPicker.class.getResourceAsStream("/desktop/choose-folder.ps1")) {
            if(input==null)throw new IOException("文件夹选择组件缺失，请重新构建应用");
            script=new String(input.readAllBytes(),StandardCharsets.UTF_8);
        }
        return new ProcessBuilder(windows.resolve("System32/WindowsPowerShell/v1.0/powershell.exe").toString(),
            "-NoProfile","-NonInteractive","-STA","-WindowStyle","Hidden","-EncodedCommand",
            Base64.getEncoder().encodeToString(script.getBytes(StandardCharsets.UTF_16LE)))
            .redirectError(ProcessBuilder.Redirect.DISCARD);
    }
    @Override public String choose() throws IOException {
        if(!System.getProperty("os.name","").toLowerCase(Locale.ROOT).startsWith("windows"))
            throw new IOException("文件夹选择目前支持本机 Windows 桌面");
        String root=System.getenv("SystemRoot");
        if(root==null)throw new IOException("无法定位 Windows 文件夹选择组件");
        Path windows=Path.of(root);
        if(!Files.isRegularFile(windows.resolve("System32/WindowsPowerShell/v1.0/powershell.exe")))
            throw new IOException("本机文件夹选择组件不可用");
        Process process=command(windows).start();
        try {
            if(!process.waitFor(5,TimeUnit.MINUTES))throw new IOException("选择文件夹已超时，请重试");
            String result=new String(process.getInputStream().readNBytes(32768),StandardCharsets.US_ASCII).trim();
            if(result.equals("NO_DESKTOP"))throw new IOException("当前服务没有可用的 Windows 桌面会话");
            if(process.exitValue()!=0)throw new IOException("无法打开文件夹选择窗口，请确认服务运行在本机桌面会话后重试");
            if(result.equals("CANCELLED"))return null;
            if(!result.startsWith("SELECTED:"))throw new IOException("无法读取所选目录，请重试");
            try {return new String(Base64.getDecoder().decode(result.substring(9)),StandardCharsets.UTF_8);}
            catch(IllegalArgumentException e){throw new IOException("所选目录返回无效，请重试",e);}
        }catch(InterruptedException e){Thread.currentThread().interrupt();throw new IOException("选择文件夹已中断，请重试",e);}
        finally {
            // A timeout/interruption must also dismiss the native helper dialog.
            if(process.isAlive()) {
                process.descendants().forEach(child->{if(child.isAlive())child.destroyForcibly();});
                process.destroyForcibly();
            }
        }
    }
}
