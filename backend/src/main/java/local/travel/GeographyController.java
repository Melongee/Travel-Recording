package local.travel;
import java.util.Map;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/geography")
public class GeographyController {
    private final GeographyService geography;
    GeographyController(GeographyService geography){this.geography=geography;}
    @GetMapping("/status") Object status(){return geography.state();}
    @GetMapping("/search") Object search(@RequestParam String q,@RequestParam(defaultValue="") String provinceCode){return geography.search(q,provinceCode);}
    @GetMapping("/tiles/{layer}/{z}/{x}/{y}") ResponseEntity<byte[]> tile(@PathVariable String layer,@PathVariable int z,@PathVariable int x,@PathVariable int y){
        var tile=geography.tile(layer,z,x,y);return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.parseMediaType(tile.type())).body(tile.body());
    }
    @ExceptionHandler(GeographyService.Unavailable.class) ResponseEntity<?> unavailable(Exception e){return ResponseEntity.status(503).body(Map.of("message",e.getMessage()));}
}
