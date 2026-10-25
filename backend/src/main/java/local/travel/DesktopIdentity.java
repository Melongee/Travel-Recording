package local.travel;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** Startup challenge only. The secret is inherited through the child environment, never served to the page. */
@RestController
class DesktopIdentity {
    private final String token;
    private final AppPaths paths;
    DesktopIdentity(@Value("${TRAVEL_DESKTOP_TOKEN:}") String token, AppPaths paths) { this.token=token; this.paths=paths; }
    @GetMapping("/api/desktop/identity")
    ResponseEntity<?> identity(@RequestHeader(value="X-Travel-Desktop",defaultValue="") String challenge) {
        if (token.isBlank() || !MessageDigest.isEqual(token.getBytes(StandardCharsets.UTF_8),challenge.getBytes(StandardCharsets.UTF_8)))
            return ResponseEntity.notFound().build();
        return ResponseEntity.ok().header("Cache-Control","no-store").body(Map.of(
            "app","travel-recording","pid",ProcessHandle.current().pid(),"dataDir",paths.data.toString()));
    }
}
