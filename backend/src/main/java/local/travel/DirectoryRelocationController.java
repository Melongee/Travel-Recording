package local.travel;

import java.io.IOException;
import java.util.List;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class DirectoryRelocationController {
    final DirectoryRelocationService relocation;
    DirectoryRelocationController(DirectoryRelocationService relocation){this.relocation=relocation;}
    record DirectoryInput(@NotBlank @Size(max=32760) String path) {}
    record ConfirmInput(@NotBlank String token,@NotEmpty List<@Valid Selection> selections) {}
    record Selection(@NotBlank String photoId,@NotBlank String candidateToken,boolean confirmUnverified) {}
    @PostMapping("/roots/{id}/relocation") Object preview(@PathVariable String id,@Valid @RequestBody DirectoryInput input) throws IOException{return relocation.preview(id,input.path);}
    @PostMapping("/directory-relocations/confirm") Object confirm(@Valid @RequestBody ConfirmInput input) throws IOException {
        return relocation.confirm(input.token,input.selections.stream().map(s->new DirectoryRelocationService.Choice(s.photoId,s.candidateToken,s.confirmUnverified)).toList());
    }
    @DeleteMapping("/directory-relocations/{token}") Object discard(@PathVariable String token) throws IOException {relocation.discard(token);return java.util.Map.of("discarded",true);}
}
