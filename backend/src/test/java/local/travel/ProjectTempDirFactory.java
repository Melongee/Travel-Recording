package local.travel;
import java.io.IOException;
import java.nio.file.*;
import org.junit.jupiter.api.extension.*;
import org.junit.jupiter.api.io.TempDirFactory;
public class ProjectTempDirFactory implements TempDirFactory {
    @Override public Path createTempDirectory(AnnotatedElementContext element,ExtensionContext context) throws IOException {
        return create();
    }
    static Path create() throws IOException {
        Path base=Files.createDirectories(Path.of("target","test-work").toAbsolutePath());
        return Files.createTempDirectory(base,"case-");
    }
}
