package local.travel;

import java.io.IOException;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/appearance/home-background")
public class HomeBackgroundController {
    private final HomeBackgroundService backgrounds;
    HomeBackgroundController(HomeBackgroundService backgrounds){this.backgrounds=backgrounds;}
    @GetMapping ResponseEntity<HomeBackgroundService.View> get() throws IOException {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(backgrounds.read());
    }
    @PutMapping ResponseEntity<HomeBackgroundService.View> save(@RequestBody HomeBackgroundService.Input input) throws IOException {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(backgrounds.save(input));
    }
}
