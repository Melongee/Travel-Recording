package local.travel;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.core.io.*;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.*;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class ApiController {
    final LibraryService library; final ScanService scans; final ImageService images; final FileRevealService files; final FolderPickerService folders;
    ApiController(LibraryService library, ScanService scans, ImageService images,FileRevealService files,FolderPickerService folders) { this.library=library; this.scans=scans; this.images=images;this.files=files;this.folders=folders; }
    @GetMapping("/health") Object health(@Value("${app.data-dir}") String dataDir) { return Map.of("app","travel-recording","version","0.1.0","dataDir",Path.of(dataDir).toAbsolutePath().normalize().toString()); }
    @GetMapping("/session") Object session(CsrfToken token) { return Map.of("token",token.getToken(),"headerName",token.getHeaderName()); }
    @GetMapping("/overview") Object overview() { return library.overview(); }
    @GetMapping("/roots") Object roots() { return library.allRoots(); }
    @PostMapping("/roots/choose-folder") Object chooseFolder() throws IOException { return folders.choose(); }
    record RootInput(@NotBlank @Size(max=1024) String path) {}
    @PostMapping("/roots") Object root(@Valid @RequestBody RootInput input) throws IOException { return scans.addRoot(input.path); }
    @PostMapping("/roots/{id}/confirm") Object confirmRoot(@PathVariable String id) throws IOException { return scans.confirmRoot(id); }
    @PostMapping("/scans") Object scan() { return scans.start(); }
    @GetMapping("/scans/current") Object scanState() { return scans.current(); }
    @GetMapping("/photos") Object photos(@RequestParam(required=false) String placeId,@RequestParam(required=false) String categoryId,
        @RequestParam(defaultValue="false") boolean unclassified,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="date-desc") String sort,
        @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="100") int size,@RequestParam(defaultValue="false") boolean excluded) { return library.query(placeId,categoryId,unclassified,q,sort,page,size,excluded); }
    @GetMapping("/photos/{id}") Object photo(@PathVariable String id) { return library.detail(id); }
    @PostMapping("/photos/{id}/reveal") Object reveal(@PathVariable String id) throws IOException { return files.reveal(id); }
    @PostMapping("/photos/classify") Object classify(@Valid @RequestBody LibraryService.Classification input) { library.classify(input); return Map.of("saved",true); }
    @PostMapping("/places/{id}/photos") Object addPhotos(@PathVariable String id,@Valid @RequestBody LibraryService.PlacePhotos input) { library.addPhotosToPlace(id,input);return Map.of("saved",true); }
    @PostMapping("/photos/exclusion") Object exclusion(@Valid @RequestBody LibraryService.Exclusion input) { library.setExcluded(input); return Map.of("saved",true); }
    @GetMapping("/photos/{id}/{kind:thumbnail|preview|original}") ResponseEntity<Resource> image(@PathVariable String id,@PathVariable String kind) throws IOException {
        var photo=library.requirePhoto(id);
        Path source=library.source(photo); // Even a cached response must respect current file availability and root scope.
        if (!"available".equals(photo.availability)) throw new IOException("图片不可用，请重新扫描");
        if (kind.equals("thumbnail") && !Files.isRegularFile(library.thumbnail(photo))) images.index(source,photo.id,photo.version);
        Path file=switch(kind) { case "thumbnail" -> library.thumbnail(photo); case "preview" -> images.preview(photo,source); default -> source; };
        if (!Files.isRegularFile(file)) throw new IOException("缩略图缺失，请重新扫描");
        String type=kind.equals("original")?Files.probeContentType(source):"image/png";
        return ResponseEntity.ok().cacheControl(CacheControl.noCache()).contentType(MediaType.parseMediaType(type==null?"application/octet-stream":type))
            .contentLength(Files.size(file)).body(new FileSystemResource(file));
    }
    @GetMapping("/places") Object places() { return library.allPlaces(); }
    @PostMapping("/places") Object addPlace(@Valid @RequestBody LibraryService.PlaceInput input) { return library.savePlace(null,input); }
    @PatchMapping("/places/{id}") Object updatePlace(@PathVariable String id,@Valid @RequestBody LibraryService.PlaceInput input) { return library.savePlace(id,input); }
    @DeleteMapping("/places/{id}") Object deletePlace(@PathVariable String id) { library.deletePlace(id); return Map.of("saved",true); }
    @GetMapping("/categories") Object categories() { return library.allCategories(); }
    @PostMapping("/categories") Object addCategory(@Valid @RequestBody LibraryService.CategoryInput input) { return library.saveCategory(null,input); }
    @PatchMapping("/categories/{id}") Object updateCategory(@PathVariable String id,@Valid @RequestBody LibraryService.CategoryInput input) { return library.saveCategory(id,input); }
    @DeleteMapping("/categories/{id}") Object deleteCategory(@PathVariable String id) { library.deleteCategory(id); return Map.of("saved",true); }
}

@RestControllerAdvice
class ApiErrors {
    @ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException.class) ResponseEntity<?> oversized(Exception e){return ResponseEntity.status(413).body(Map.of("message","备份文件超过 256 MiB 上传限制"));}
    @ExceptionHandler(LibraryMaintenance.Busy.class) ResponseEntity<?> busy(Exception e) { return ResponseEntity.status(409).body(Map.of("message",e.getMessage())); }
    @ExceptionHandler({IllegalArgumentException.class, MethodArgumentNotValidException.class, DataIntegrityViolationException.class})
    ResponseEntity<?> bad(Exception e) {
        String message=e instanceof DataIntegrityViolationException?"名称或目录重复，或关联数据无效":e instanceof MethodArgumentNotValidException?"请检查必填字段、文字长度和坐标范围":e.getMessage();
        return ResponseEntity.badRequest().body(Map.of("message",message==null?"输入无效":message));
    }
    @ExceptionHandler(NoSuchElementException.class) ResponseEntity<?> missing(Exception e) { return ResponseEntity.status(404).body(Map.of("message",e.getMessage())); }
    @ExceptionHandler(IOException.class) ResponseEntity<?> file(IOException e) { return ResponseEntity.status(409).body(Map.of("message",e.getMessage()==null?"文件不可用":e.getMessage())); }
}
