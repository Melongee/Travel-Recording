package local.travel;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.*;

@Service
public class FileRevealService {
    interface Launcher { void reveal(Path photo) throws IOException; }
    private final LibraryService library;
    private final boolean enabled;
    private final Launcher launcher;
    FileRevealService(LibraryService library,@Value("${app.desktop.enabled:true}") boolean enabled,Launcher launcher){
        this.library=library;this.enabled=enabled;this.launcher=launcher;
    }
    record Result(boolean requested,String message) {}
    Result reveal(String id) throws IOException {
        Path file;
        try{file=library.source(library.requirePhoto(id));}
        catch(NoSuchFileException e){throw new IOException("原始照片未找到，请重新扫描目录，或复制原始路径查找",e);}
        catch(AccessDeniedException e){throw new IOException("原始照片没有读取权限，可复制原始路径检查",e);}
        if(!enabled)throw new IOException("当前服务关闭了桌面操作，请复制原始路径后打开文件夹");
        launcher.reveal(file);
        return new Result(true,"已请求资源管理器选中原文件；若未出现窗口，可复制路径后打开");
    }
}

@Component
class WindowsFileLauncher implements FileRevealService.Launcher {
    private static final String SCRIPT="""
        $ProgressPreference = 'SilentlyContinue'
        if ([System.Diagnostics.Process]::GetCurrentProcess().SessionId -eq 0) { Write-Output 'NO_DESKTOP'; exit 2 }
        $info = New-Object System.Diagnostics.ProcessStartInfo
        $info.FileName = Join-Path $env:SystemRoot 'explorer.exe'
        $info.Arguments = '/select,"' + $env:TRAVEL_RECORDING_REVEAL_FILE + '"'
        $info.UseShellExecute = $false
        $info.CreateNoWindow = $true
        try { [System.Diagnostics.Process]::Start($info) | Out-Null; Write-Output 'REQUESTED' } catch { Write-Output 'FAILED'; exit 3 }
        """;
    static ProcessBuilder revealCommand(Path windows,Path photo){
        // Explorer parses its own raw command line. Keep its path quotes, including names with commas.
        // The script is constant; the validated filename is data in an environment variable, never code.
        ProcessBuilder command=new ProcessBuilder(windows.resolve("System32/WindowsPowerShell/v1.0/powershell.exe").toString(),
            "-NoProfile","-NonInteractive","-EncodedCommand",Base64.getEncoder().encodeToString(SCRIPT.getBytes(StandardCharsets.UTF_16LE))).redirectError(ProcessBuilder.Redirect.DISCARD);
        command.environment().put("TRAVEL_RECORDING_REVEAL_FILE",photo.toString());
        return command;
    }
    @Override public void reveal(Path photo) throws IOException {
        if(!System.getProperty("os.name","").toLowerCase(Locale.ROOT).startsWith("windows"))
            throw new IOException("打开所在文件夹目前支持本机 Windows 桌面，请复制原始路径");
        String root=System.getenv("SystemRoot");
        if(root==null)throw new IOException("无法定位 Windows 资源管理器，请复制原始路径");
        Path windows=Path.of(root),powershell=windows.resolve("System32/WindowsPowerShell/v1.0/powershell.exe");
        if(!Files.isRegularFile(windows.resolve("explorer.exe"))||!Files.isRegularFile(powershell))
            throw new IOException("本机桌面组件不可用，请复制原始路径");
        Process probe;
        try{probe=revealCommand(windows,photo).start();}
        catch(IOException e){throw new IOException("无法确认本机桌面会话，请复制原始路径后打开文件夹",e);}
        try {
            if(!probe.waitFor(3,TimeUnit.SECONDS)){probe.destroyForcibly();throw new IOException("无法确认桌面会话，请复制原始路径后打开文件夹");}
            String result=new String(probe.getInputStream().readNBytes(128),StandardCharsets.UTF_8).replace("\u0000","").trim();
            if(result.contains("NO_DESKTOP"))
                throw new IOException("当前服务没有可用的 Windows 桌面会话，请复制原始路径后打开文件夹");
            if(probe.exitValue()!=0||!result.contains("REQUESTED"))throw new IOException("无法打开资源管理器，请复制原始路径后打开文件夹");
        }catch(InterruptedException e){Thread.currentThread().interrupt();throw new IOException("打开文件夹已中断，可复制原始路径",e);}
        finally{if(probe.isAlive())probe.destroyForcibly();}
    }
}
