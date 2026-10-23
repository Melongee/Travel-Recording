package local.travel;

import java.io.IOException;
import java.nio.file.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.boot.flyway.autoconfigure.FlywayMigrationStrategy;

@Configuration
public class AppConfig {
    @Bean
    AppPaths appPaths(@Value("${app.data-dir}") String dir) throws IOException { return new AppPaths(dir); }

    @Bean
    LibraryDatabase dataSource(AppPaths paths) { return new LibraryDatabase(paths); }

    @Bean
    FlywayMigrationStrategy migrationStrategy(LibraryDatabase database,AppPaths paths) {
        return flyway -> DatabaseMigrations.migrate(flyway,database,paths);
    }
}

class AppPaths {
    final Path data, cache;
    AppPaths(String dir) throws IOException {
        data = Files.createDirectories(Path.of(dir).toAbsolutePath().normalize()).toRealPath();
        cache = Files.createDirectories(data.resolve("cache"));
        Files.createDirectories(data.resolve("uploads"));
    }
    Path image(String id, String version, boolean preview) {
        return cache.resolve(id + "-" + version + (preview ? "-preview.png" : "-thumb.png"));
    }
}
