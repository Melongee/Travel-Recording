package local.travel;

import java.nio.file.*;
import java.util.UUID;
import org.flywaydb.core.Flyway;

/** Snapshot an existing library before applying local, versioned migrations. */
final class DatabaseMigrations {
    static final int CURRENT=2;
    static void migrate(Flyway flyway,LibraryDatabase database,AppPaths paths) {
        Path snapshot=null;
        try {
            var info=flyway.info();
            if(info.current()!=null && info.pending().length>0) {
                snapshot=Files.createDirectories(paths.data.resolve("backups"))
                    .resolve("before-upgrade-v"+info.current().getVersion()+"-"+UUID.randomUUID()+".db");
                database.snapshot(snapshot);
            }
            flyway.migrate();
        } catch(Exception e) {
            throw new IllegalStateException(snapshot==null?"数据库升级未完成，原数据已保留，服务停止启动"
                :"数据库升级失败，服务停止启动；升级前一致性快照保留于 "+snapshot,e);
        }
    }
    static Flyway forFile(Path file,int version) {
        return Flyway.configure().dataSource("jdbc:sqlite:"+file,null,null)
            .locations("classpath:db/migration").target(Integer.toString(version)).load();
    }
}
