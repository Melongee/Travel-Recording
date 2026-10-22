package local.travel;

import java.io.IOException;
import java.sql.SQLException;
import java.util.Map;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.core.io.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/backups")
public class BackupController {
    private final BackupService backups;
    BackupController(BackupService backups){this.backups=backups;}
    @PostMapping("/export") ResponseEntity<Resource> export() throws IOException,SQLException {
        var file=backups.export();
        return ResponseEntity.ok().contentType(MediaType.parseMediaType("application/zip"))
            .cacheControl(CacheControl.noStore()).header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=\""+file.getFileName()+"\"")
            .contentLength(java.nio.file.Files.size(file)).body(new FileSystemResource(file));
    }
    @PostMapping(value="/inspect",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    Object inspect(@RequestParam("file") MultipartFile file) throws IOException,SQLException {
        try(var input=file.getInputStream()){return backups.inspect(input);}
    }
    record RestoreInput(@NotBlank String token,boolean confirmed) {}
    @PostMapping("/restore") Object restore(@Valid @RequestBody RestoreInput input) throws IOException,SQLException {
        return Map.of("restored",true,"counts",backups.restore(input.token,input.confirmed),"requiresRootConfirmation",true);
    }
    @ExceptionHandler(SQLException.class) ResponseEntity<?> databaseError(SQLException e) {
        return ResponseEntity.badRequest().body(Map.of("message","备份数据库无法校验或读写，请检查文件及本机磁盘；图库未被覆盖"));
    }
    @ExceptionHandler(tools.jackson.core.JacksonException.class) ResponseEntity<?> invalidManifest(Exception e){
        return ResponseEntity.badRequest().body(Map.of("message","备份清单无法读取，请选择本应用导出的完整 ZIP 文件"));
    }
}
