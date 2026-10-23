package local.travel;

import java.io.IOException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.core.io.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class RelocationController {
    final RelocationService relocation;final FolderPickerService picker;
    RelocationController(RelocationService relocation,FolderPickerService picker){this.relocation=relocation;this.picker=picker;}
    record FileInput(@NotBlank @Size(max=32760) String path) {}
    record ConfirmInput(@NotBlank String token,boolean confirmUnverified) {}
    @PostMapping("/photos/choose-file") Object choose() throws IOException{return picker.chooseFile();}
    @PostMapping("/photos/{id}/relocation") Object preview(@PathVariable String id,@Valid @RequestBody FileInput input) throws IOException{return relocation.preview(id,input.path);}
    @PostMapping("/relocations/confirm") Object confirm(@Valid @RequestBody ConfirmInput input) throws IOException{return relocation.confirm(input.token,input.confirmUnverified);}
    @DeleteMapping("/relocations/{token}") Object discard(@PathVariable String token) throws IOException {relocation.discard(token);return java.util.Map.of("discarded",true);}
    @GetMapping("/relocations/{token}/{kind:old|candidate}") ResponseEntity<Resource> image(@PathVariable String token,@PathVariable String kind) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.IMAGE_PNG).body(new FileSystemResource(relocation.image(token,kind.equals("old"))));
    }
}
