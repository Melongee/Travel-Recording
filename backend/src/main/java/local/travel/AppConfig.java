package local.travel;

import java.io.IOException;
import java.nio.file.*;
import javax.sql.DataSource;
import org.sqlite.SQLiteConfig;
import org.sqlite.SQLiteDataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import com.zaxxer.hikari.*;

@Configuration
public class AppConfig {
    @Bean
    AppPaths appPaths(@Value("${app.data-dir}") String dir) throws IOException { return new AppPaths(dir); }

    @Bean
    DataSource dataSource(AppPaths paths) {
        SQLiteConfig sqlite = new SQLiteConfig();
        sqlite.enforceForeignKeys(true); sqlite.setBusyTimeout(5000); sqlite.setJournalMode(SQLiteConfig.JournalMode.WAL);
        SQLiteDataSource source = new SQLiteDataSource(sqlite);
        source.setUrl("jdbc:sqlite:" + paths.data.resolve("library.db"));
        HikariConfig pool = new HikariConfig(); pool.setDataSource(source); pool.setMaximumPoolSize(1);
        pool.setPoolName("library");
        return new HikariDataSource(pool);
    }
}

class AppPaths {
    final Path data, cache;
    AppPaths(String dir) throws IOException {
        data = Files.createDirectories(Path.of(dir).toAbsolutePath().normalize()).toRealPath();
        cache = Files.createDirectories(data.resolve("cache"));
    }
    Path image(String id, String version, boolean preview) {
        return cache.resolve(id + "-" + version + (preview ? "-preview.png" : "-thumb.png"));
    }
}
