package local.travel;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.*;
import java.sql.*;
import java.util.List;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class DatabaseMigrationsTest {
    @TempDir(factory=ProjectTempDirFactory.class) Path fixtures;
    Flyway flyway(LibraryDatabase db,String target){return Flyway.configure().dataSource(db).target(target).load();}
    @Test void v1UpgradeSnapshotAndFailedNextMigrationPreserveData() throws Exception {
        AppPaths paths=new AppPaths(fixtures.resolve("upgrade-library").toString());
        try(LibraryDatabase db=new LibraryDatabase(paths)) {
            flyway(db,"1").migrate();
            try(Connection c=db.getConnection();Statement s=c.createStatement()) {
                s.execute("INSERT INTO photo_roots(id,path,normalized_path) VALUES('root','fixture','fixture')");
                s.execute("INSERT INTO places(id,name,province,province_code,lat,lng) VALUES('place','地点','青海','630000',36.9,100.18)");
                s.execute("INSERT INTO categories VALUES('category','place','风景')");
                s.execute("INSERT INTO photos(id,path,normalized_path,root_id,file_name,size,modified_at,sort_at,place_id,version) VALUES('photo','fixture/a.png','fixture/a.png','root','a.png',1,1,'2026','place','1-1')");
                s.execute("INSERT INTO photo_categories VALUES('photo','category')");
            }
            DatabaseMigrations.migrate(flyway(db,"2"),db,paths);
            List<Path> snapshots;try(var files=Files.list(paths.data.resolve("backups"))){snapshots=files.toList();}
            assertEquals(1,snapshots.size());
            try(Connection c=BackupService.readOnly(snapshots.getFirst());Statement s=c.createStatement()) {
                try(ResultSet r=s.executeQuery("SELECT max(version) FROM flyway_schema_history WHERE success=1")){r.next();assertEquals("1",r.getString(1));}
                try(ResultSet r=s.executeQuery("SELECT category_id FROM photo_categories WHERE photo_id='photo'")){assertTrue(r.next());assertEquals("category",r.getString(1));}
                try(ResultSet r=s.executeQuery("PRAGMA integrity_check")){r.next();assertEquals("ok",r.getString(1));}
            }
            try(Connection c=db.getConnection();Statement s=c.createStatement();ResultSet r=s.executeQuery("SELECT excluded,place_id FROM photos WHERE id='photo'")) {
                r.next();assertEquals(0,r.getInt(1));assertEquals("place",r.getString(2));
            }
            DatabaseMigrations.migrate(flyway(db,"2"),db,paths);
            try(var files=Files.list(paths.data.resolve("backups"))){assertEquals(1,files.count());}
            Path scripts=Files.createDirectories(fixtures.resolve("failed-migration"));
            Files.writeString(scripts.resolve("V3__intentional_failure.sql"),"ALTER TABLE photos ADD COLUMN rollback_probe TEXT; INSERT INTO absent_table VALUES(1);");
            var broken=Flyway.configure().dataSource(db).locations("classpath:db/migration","filesystem:"+scripts).target("3").load();
            var failure=assertThrows(IllegalStateException.class,()->DatabaseMigrations.migrate(broken,db,paths));
            assertTrue(failure.getMessage().contains("升级前一致性快照"));
            try(Connection c=db.getConnection();Statement s=c.createStatement()) {
                try(ResultSet r=s.executeQuery("SELECT count(*) FROM photos WHERE id='photo' AND excluded=0")){r.next();assertEquals(1,r.getInt(1));}
                try(ResultSet r=s.executeQuery("SELECT count(*) FROM pragma_table_info('photos') WHERE name='rollback_probe'")){r.next();assertEquals(0,r.getInt(1));}
            }
            try(var files=Files.list(paths.data.resolve("backups"))){assertEquals(2,files.count());}
        }
    }
    @Test void missingSnapshotPreventsUpgrade() throws Exception {
        AppPaths paths=new AppPaths(fixtures.resolve("blocked-library").toString());
        try(LibraryDatabase db=new LibraryDatabase(paths)) {
            flyway(db,"1").migrate();Files.writeString(paths.data.resolve("backups"),"prevent snapshot directory creation");
            assertThrows(IllegalStateException.class,()->DatabaseMigrations.migrate(flyway(db,"2"),db,paths));
            try(Connection c=db.getConnection();Statement s=c.createStatement();ResultSet r=s.executeQuery("SELECT max(version) FROM flyway_schema_history WHERE success=1")){r.next();assertEquals("1",r.getString(1));}
        }
    }
}
