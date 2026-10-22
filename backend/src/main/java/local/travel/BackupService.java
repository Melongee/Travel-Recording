package local.travel;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.sql.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.zip.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.sqlite.SQLiteConfig;
import tools.jackson.databind.json.JsonMapper;

@Service
public class BackupService {
    static final String FORMAT="travel-recording-backup";
    static final long MAX_DATABASE=512L*1024*1024, MAX_UPLOAD=256L*1024*1024;
    static final List<String> TABLES=List.of("photo_roots","photos","places","categories","photo_categories");
    private static final JsonMapper JSON=JsonMapper.builder().build();
    private final AppPaths paths;
    private final LibraryDatabase database;
    private final JdbcTemplate jdbc;
    private final LibraryMaintenance maintenance;
    private final ScanService scans;
    private final Map<String,Pending> pending=new ConcurrentHashMap<>();
    public record Counts(long roots,long photos,long places,long categories,long links) {}
    public record Manifest(String format,int formatVersion,String appVersion,int schemaVersion,String exportedAt,String databaseSha256,Counts counts) {}
    public record Inspection(String token,Manifest manifest,List<String> roots,String expiresAt) {}
    private record Pending(Path directory,Path database,Manifest manifest,Instant expires) {}
    BackupService(AppPaths paths,LibraryDatabase database,JdbcTemplate jdbc,LibraryMaintenance maintenance,ScanService scans) {
        this.paths=paths; this.database=database; this.jdbc=jdbc; this.maintenance=maintenance; this.scans=scans;
    }
    public Path export() throws IOException,SQLException {
        try (var lease=maintenance.read()) {
            cleanupExpired();
            Path work=Files.createTempDirectory(paths.data,"export-");
            Path target=Files.createDirectories(paths.data.resolve("backups")).resolve("travel-backup-"+Instant.now().toEpochMilli()+"-"+UUID.randomUUID()+".zip");
            try {
                Path snapshot=work.resolve("library.db"); database.snapshot(snapshot);
                Counts counts;
                try (Connection c=readOnly(snapshot)) { counts=counts(c); }
                Manifest manifest=new Manifest(FORMAT,1,"0.1.0",1,Instant.now().toString(),sha256(snapshot),counts);
                Path zip=work.resolve("backup.zip");
                try (ZipOutputStream output=new ZipOutputStream(Files.newOutputStream(zip))) {
                    output.putNextEntry(new ZipEntry("manifest.json")); output.write(JSON.writeValueAsBytes(manifest)); output.closeEntry();
                    output.putNextEntry(new ZipEntry("library.db")); Files.copy(snapshot,output); output.closeEntry();
                }
                LibraryDatabase.atomicReplace(zip,target); return target;
            } finally { deleteWork(work); }
        }
    }
    public Inspection inspect(InputStream input) throws IOException,SQLException {
        try (var lease=maintenance.read()) {
            cleanupExpired();
            String token=UUID.randomUUID().toString();
            Path work=Files.createDirectories(paths.data.resolve("restore")).resolve(token);
            Files.createDirectory(work);
            try {
                Path archive=work.resolve("upload.zip");
                try (OutputStream file=Files.newOutputStream(archive)) { copyLimited(input,file,MAX_UPLOAD); }
                Set<String> names=new HashSet<>();
                try (ZipInputStream zip=new ZipInputStream(Files.newInputStream(archive))) {
                    ZipEntry entry;
                    while ((entry=zip.getNextEntry())!=null) {
                        String name=entry.getName();
                        if (entry.isDirectory() || !Set.of("manifest.json","library.db").contains(name) || !names.add(name)) throw new IllegalArgumentException("备份只能包含 manifest.json 和 library.db，不能含重复项或其他路径");
                        try (OutputStream out=Files.newOutputStream(work.resolve(name),StandardOpenOption.CREATE_NEW)) { copyLimited(zip,out,name.equals("manifest.json")?65536:MAX_DATABASE); }
                        zip.closeEntry();
                    }
                }
                if (names.size()!=2) throw new IllegalArgumentException("备份不完整");
                Manifest manifest=JSON.readValue(Files.readAllBytes(work.resolve("manifest.json")),Manifest.class);
                validateManifest(manifest);
                Path snapshot=work.resolve("library.db");
                if (!sha256(snapshot).equalsIgnoreCase(manifest.databaseSha256)) throw new IllegalArgumentException("备份校验值不一致，文件可能损坏");
                List<String> roots=validateDatabase(snapshot,manifest);
                Instant expires=Instant.now().plus(Duration.ofHours(1));
                pending.put(token,new Pending(work,snapshot,manifest,expires));
                return new Inspection(token,manifest,roots,expires.toString());
            } catch (Exception e) { deleteWork(work); throw e; }
        }
    }
    public Counts restore(String token,boolean confirmed) throws IOException,SQLException {
        if (!confirmed) throw new IllegalArgumentException("请先确认恢复预览");
        try (var lease=maintenance.exclusive()) {
            if (scans.current().state().equals("running")) throw new LibraryMaintenance.Busy("扫描尚未结束，请稍后恢复");
            try (Connection c=database.getConnection()) {
                if (!counts(c).equals(new Counts(0,0,0,0,0))) throw new LibraryMaintenance.Busy("只允许向空图库恢复；当前已有目录、照片或分类，请使用新的数据目录启动后再恢复");
            }
            Pending upload=pending.get(token);
            if (upload==null || Instant.now().isAfter(upload.expires)) throw new IllegalArgumentException("恢复预览已过期，请重新选择备份");
            if (!sha256(upload.database).equalsIgnoreCase(upload.manifest.databaseSha256)) throw new IllegalArgumentException("预览后的备份发生变化，请重新选择");
            validateDatabase(upload.database,upload.manifest);
            // Only known-schema files reach this point. Read permission is not inherited from an imported path.
            SQLiteConfig config=new SQLiteConfig(); config.enforceForeignKeys(true);
            try (Connection c=DriverManager.getConnection("jdbc:sqlite:"+upload.database,config.toProperties()); Statement s=c.createStatement()) {
                s.execute("PRAGMA trusted_schema=OFF"); s.execute("PRAGMA journal_mode=DELETE");
                s.executeUpdate("UPDATE photo_roots SET enabled=0,status='needs_confirmation'");
            }
            database.replace(upload.database,c->{
                if (!counts(c).equals(upload.manifest.counts)) throw new SQLException("恢复后的记录数量不一致");
                try (Statement s=c.createStatement(); ResultSet r=s.executeQuery("PRAGMA foreign_key_check")) { if (r.next()) throw new SQLException("恢复后的关联不完整"); }
            });
            pending.remove(token); deleteWork(upload.directory);
            return upload.manifest.counts;
        }
    }
    private void validateManifest(Manifest m) {
        if (m==null || !FORMAT.equals(m.format) || m.formatVersion!=1 || m.schemaVersion!=1 || m.counts==null
            || m.databaseSha256==null || !m.databaseSha256.matches("[a-fA-F0-9]{64}")) throw new IllegalArgumentException("备份格式或数据库版本不受支持");
        try { Instant.parse(m.exportedAt); } catch (Exception e) { throw new IllegalArgumentException("备份时间格式无效"); }
    }
    private List<String> validateDatabase(Path file,Manifest manifest) throws SQLException,IOException {
        try (Connection candidate=readOnly(file); Connection current=database.getConnection()) {
            if (!schema(candidate).equals(schema(current))) throw new IllegalArgumentException("备份表结构与当前版本不符，拒绝执行未知数据库结构");
            try (Statement s=candidate.createStatement(); ResultSet r=s.executeQuery("PRAGMA integrity_check")) {
                if (!r.next() || !"ok".equals(r.getString(1)) || r.next()) throw new IllegalArgumentException("备份数据库完整性检查失败");
            }
            try (Statement s=candidate.createStatement(); ResultSet r=s.executeQuery("PRAGMA foreign_key_check")) { if (r.next()) throw new IllegalArgumentException("备份存在失效关联"); }
            if (!counts(candidate).equals(manifest.counts)) throw new IllegalArgumentException("备份清单与数据库记录数量不一致");
            if (!migrations(candidate).equals(migrations(current))) throw new IllegalArgumentException("备份迁移记录与当前版本不一致");
            for (String table:List.of("photo_roots","photos","places","categories")) {
                try (Statement s=candidate.createStatement(); ResultSet r=s.executeQuery("SELECT id FROM "+table)) { while(r.next()) validId(r.getString(1)); }
            }
            Map<String,Path> rootPaths=new HashMap<>();
            try (Statement s=candidate.createStatement(); ResultSet r=s.executeQuery("SELECT id,path,normalized_path FROM photo_roots")) {
                while (r.next()) {
                    Path path=validPath(r.getString("path"),r.getString("normalized_path"));
                    if (path.startsWith(paths.data) || paths.data.startsWith(path)) throw new IllegalArgumentException("备份中的照片目录与当前应用数据目录重叠");
                    rootPaths.put(r.getString("id"),path);
                }
            }
            try (Statement s=candidate.createStatement(); ResultSet r=s.executeQuery("SELECT path,normalized_path,root_id,version FROM photos")) {
                while(r.next()) {
                    Path path=validPath(r.getString("path"),r.getString("normalized_path"));
                    Path root=rootPaths.get(r.getString("root_id"));
                    if (root==null || !path.startsWith(root) || r.getString("version")==null || !r.getString("version").matches("\\d+--?\\d+")) throw new IllegalArgumentException("备份中的照片路径或缓存版本无效");
                }
            }
            try (Statement s=candidate.createStatement(); ResultSet r=s.executeQuery("SELECT count(*) FROM photo_categories pc JOIN photos p ON p.id=pc.photo_id JOIN categories c ON c.id=pc.category_id WHERE p.place_id IS NOT c.place_id")) {
                if(r.next() && r.getLong(1)!=0) throw new IllegalArgumentException("备份存在跨地点类别关联");
            }
            return rootPaths.values().stream().map(Path::toString).sorted().toList();
        }
    }
    private static Path validPath(String value,String normalized) {
        if (value==null || value.length()>32760) throw new IllegalArgumentException("备份路径无效");
        Path path=Path.of(value);
        if (!path.isAbsolute() || !ScanService.normalized(path).equals(normalized)) throw new IllegalArgumentException("备份路径不是有效的绝对规范路径");
        return path.normalize(); // Deliberately no exists/toRealPath/readAttributes on imported photo paths.
    }
    private static void validId(String id) {
        if (id==null || !id.matches("[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}")) throw new IllegalArgumentException("备份包含无效记录 ID");
    }
    static Connection readOnly(Path file) throws SQLException {
        SQLiteConfig config=new SQLiteConfig(); config.setReadOnly(true);
        Connection c=DriverManager.getConnection("jdbc:sqlite:"+file,config.toProperties());
        try (Statement s=c.createStatement()) { s.execute("PRAGMA trusted_schema=OFF"); s.execute("PRAGMA query_only=ON"); }
        return c;
    }
    static Counts counts(Connection c) throws SQLException {
        long[] values=new long[5]; int i=0;
        for(String table:TABLES) try(Statement s=c.createStatement();ResultSet r=s.executeQuery("SELECT count(*) FROM "+table)){r.next();values[i++]=r.getLong(1);}
        return new Counts(values[0],values[1],values[2],values[3],values[4]);
    }
    private static List<String> schema(Connection c) throws SQLException {
        List<String> result=new ArrayList<>();
        try(Statement s=c.createStatement();ResultSet r=s.executeQuery("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name")) {
            while(r.next()) result.add(r.getString(1)+"|"+r.getString(2)+"|"+r.getString(3)+"|"+Objects.toString(r.getString(4),"").replaceAll("\\s+"," ").trim());
        }
        return result;
    }
    private static List<String> migrations(Connection c) throws SQLException {
        List<String> result=new ArrayList<>();
        try(Statement s=c.createStatement();ResultSet r=s.executeQuery("SELECT version,checksum,success FROM flyway_schema_history WHERE type='SQL' ORDER BY installed_rank")) {
            while(r.next()) result.add(r.getString(1)+"|"+r.getString(2)+"|"+r.getString(3));
        }
        return result;
    }
    static String sha256(Path file) throws IOException {
        try {
            MessageDigest digest=MessageDigest.getInstance("SHA-256");
            try(InputStream input=Files.newInputStream(file)){byte[] buffer=new byte[65536];int n;while((n=input.read(buffer))!=-1)digest.update(buffer,0,n);}
            return HexFormat.of().formatHex(digest.digest());
        } catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}
    }
    static void copyLimited(InputStream input,OutputStream output,long maximum) throws IOException {
        byte[] buffer=new byte[65536]; long total=0; int n;
        while((n=input.read(buffer))!=-1) { total+=n; if(total>maximum)throw new IllegalArgumentException("备份文件超出允许大小");output.write(buffer,0,n); }
    }
    private void cleanupExpired() throws IOException {
        Instant now=Instant.now();
        for(var item:pending.entrySet()) if(now.isAfter(item.getValue().expires)&&pending.remove(item.getKey(),item.getValue()))deleteWork(item.getValue().directory);
    }
    private void deleteWork(Path work) throws IOException {
        if (!work.toAbsolutePath().normalize().startsWith(paths.data) || work.equals(paths.data)) throw new IOException("无效临时目录");
        if (!Files.exists(work)) return;
        try(var files=Files.walk(work)){for(Path p:files.sorted(Comparator.reverseOrder()).toList())Files.deleteIfExists(p);}
    }
}
