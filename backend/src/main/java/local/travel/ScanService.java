package local.travel;

import local.travel.Models.*;
import local.travel.mapper.*;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Supplier;

@Service
public class ScanService {
    private final RootMapper roots;
    private final PhotoMapper photos;
    private final ImageService images;
    private final AppPaths paths;
    private final JdbcTemplate jdbc;
    private final LibraryMaintenance maintenance;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile Status status = new Status("idle", 0, 0, 0, 0, 0, 0, List.of());
    public record Status(String state, int discovered, int added, int updated, int unchanged, int failed, int missing, List<String> errors) {}
    ScanService(RootMapper roots, PhotoMapper photos, ImageService images, AppPaths paths, JdbcTemplate jdbc, LibraryMaintenance maintenance) {
        this.roots=roots; this.photos=photos; this.images=images; this.paths=paths; this.jdbc=jdbc; this.maintenance=maintenance;
    }
    static String normalized(Path path) { return path.toAbsolutePath().normalize().toString().toLowerCase(Locale.ROOT); }
    static boolean isLink(Path path) throws IOException {
        var a = Files.readAttributes(path, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
        return a.isSymbolicLink() || a.isOther();
    }
    synchronized Root addRoot(String value) throws IOException {
        Path requested = Path.of(value).toAbsolutePath().normalize();
        if (!Files.isDirectory(requested) || !Files.isReadable(requested)) throw new IllegalArgumentException("目录不存在或不可读");
        // Reject reparse points at every level, including a linked root or parent.
        for (Path p=requested; p!=null; p=p.getParent()) if (isLink(p)) throw new IllegalArgumentException("本轮不扫描符号链接或目录联接");
        Path real = requested.toRealPath();
        if (real.startsWith(paths.data) || paths.data.startsWith(real)) throw new IllegalArgumentException("照片目录不能包含或位于应用数据目录");
        String key=normalized(real);
        Root existing=roots.selectOne(new QueryWrapper<Root>().eq("normalized_path",key));
        if (existing!=null) {
            if ("needs_confirmation".equals(existing.status)) {
                existing.enabled=true; existing.status="ready"; roots.updateById(existing);
            }
            return existing;
        }
        Root r=new Root(); r.id=UUID.randomUUID().toString(); r.path=real.toString(); r.normalizedPath=key; r.enabled=true; r.status="ready";
        roots.insert(r); return r;
    }
    public Status current() { return status; }
    public synchronized Root confirmRoot(String id) throws IOException {
        Root root=roots.selectById(id);
        if (root==null) throw new NoSuchElementException("目录不存在");
        return addRoot(root.path);
    }
    public synchronized Status start() {
        if (status.state.equals("running")) return status;
        status=new Status("running",0,0,0,0,0,0,List.of());
        worker.submit(this::run); return status;
    }
    synchronized <T> T whenIdle(Supplier<T> action) {
        if(status.state.equals("running"))throw new LibraryMaintenance.Busy("扫描尚未结束，请等待完成后再移除目录");
        return action.get();
    }
    private void run() {
        try (var lease=maintenance.read()) { runWithAccess(); }
        catch (Exception e) { status=new Status("failed",0,0,0,0,1,0,List.of(e.getMessage())); }
    }
    private void runWithAccess() {
        int[] c=new int[6]; List<String> errors=new ArrayList<>();
        try {
            for (Root root:roots.selectList(new QueryWrapper<Root>().eq("enabled",true))) {
                Path rootPath=Path.of(root.path);
                boolean[] complete={true}; Set<String> seen=new HashSet<>();
                try {
                    if (!Files.isDirectory(rootPath) || isLink(rootPath) || !normalized(rootPath.toRealPath()).equals(root.normalizedPath)) throw new IOException("根目录不可用或已被替换为链接");
                    Files.walkFileTree(rootPath,new SimpleFileVisitor<>() {
                        @Override public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) throws IOException {
                            if (Thread.currentThread().isInterrupted()) throw new IOException("扫描已中断");
                            if (isLink(dir)) return FileVisitResult.SKIP_SUBTREE;
                            if (!dir.toRealPath().startsWith(rootPath)) { complete[0]=false; return FileVisitResult.SKIP_SUBTREE; }
                            return FileVisitResult.CONTINUE;
                        }
                        @Override public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                            String name=file.getFileName().toString().toLowerCase(Locale.ROOT);
                            if (!attrs.isRegularFile() || !name.matches(".*\\.(jpg|jpeg|png|webp)$")) return FileVisitResult.CONTINUE;
                            c[0]++;
                            try {
                                if (isLink(file)) return FileVisitResult.CONTINUE;
                                Path real=file.toRealPath();
                                if (!real.startsWith(rootPath)) { complete[0]=false; return FileVisitResult.CONTINUE; }
                                String key=normalized(real); seen.add(key);
                                Photo photo=photos.selectOne(new QueryWrapper<Photo>().eq("normalized_path",key));
                                boolean fresh=photo==null;
                                if (fresh) { photo=new Photo(); photo.id=UUID.randomUUID().toString(); photo.path=real.toString(); photo.normalizedPath=key; photo.rootId=root.id; }
                                String version=attrs.size()+"-"+attrs.lastModifiedTime().toMillis();
                                Path cached=paths.image(photo.id,version,false);
                                if (!fresh && version.equals(photo.version) && ("corrupt".equals(photo.availability) || (Files.isRegularFile(cached) && Files.size(cached)>0))) {
                                    jdbc.update("UPDATE photos SET availability=? WHERE id=?", "corrupt".equals(photo.availability)?"corrupt":"available",photo.id);
                                    if ("corrupt".equals(photo.availability)) { c[4]++; addError(errors,photo.fileName+"：图片损坏，请替换后重新扫描"); } else c[3]++;
                                } else {
                                    photo.fileName=file.getFileName().toString(); photo.size=attrs.size(); photo.modifiedAt=attrs.lastModifiedTime().toMillis(); photo.version=version;
                                    photo.sortAt=Instant.ofEpochMilli(photo.modifiedAt).atZone(ZoneId.systemDefault()).toLocalDateTime().toString();
                                    try {
                                        var info=images.index(real,photo.id,version);
                                        var after=Files.readAttributes(real,BasicFileAttributes.class);
                                        if (after.size()!=attrs.size() || !after.lastModifiedTime().equals(attrs.lastModifiedTime())) throw new IOException("扫描期间文件发生变化，请重试");
                                        photo.width=info.width(); photo.height=info.height(); photo.orientation=info.orientation(); photo.takenAt=info.takenAt();
                                        if (photo.takenAt!=null) photo.sortAt=photo.takenAt;
                                        photo.availability="available"; photo.error=null;
                                    } catch (IOException | RuntimeException e) {
                                        photo.availability="corrupt"; photo.error=e.getMessage();
                                        if (fresh) { photo.width=0; photo.height=0; photo.orientation=1; }
                                        c[4]++; addError(errors, photo.fileName+"："+e.getMessage());
                                    }
                                    if (fresh) { photos.insert(photo); c[1]++; }
                                    else {
                                        // Explicit null assignment clears previous errors and metadata without touching classification.
                                        jdbc.update("UPDATE photos SET file_name=?,size=?,modified_at=?,version=?,sort_at=?,width=?,height=?,orientation=?,taken_at=?,availability=?,error=? WHERE id=?",
                                            photo.fileName,photo.size,photo.modifiedAt,photo.version,photo.sortAt,photo.width,photo.height,photo.orientation,photo.takenAt,photo.availability,photo.error,photo.id);
                                        c[2]++;
                                    }
                                }
                            } catch (Exception e) { complete[0]=false; c[4]++; addError(errors,file.getFileName()+"："+e.getMessage()); }
                            publish(c,errors,"running"); return FileVisitResult.CONTINUE;
                        }
                        @Override public FileVisitResult visitFileFailed(Path file,IOException e) {
                            complete[0]=false; addError(errors,file.getFileName()+"：无法访问"); return FileVisitResult.CONTINUE;
                        }
                        @Override public FileVisitResult postVisitDirectory(Path dir, IOException e) {
                            if (e!=null) { complete[0]=false; addError(errors,"部分目录读取失败"); } return FileVisitResult.CONTINUE;
                        }
                    });
                    if (complete[0]) {
                        for (Photo old:photos.selectList(null)) if (Path.of(old.path).startsWith(rootPath) && !seen.contains(old.normalizedPath)) {
                            jdbc.update("UPDATE photos SET availability='missing' WHERE id=?",old.id); c[5]++;
                        }
                    }
                    jdbc.update("UPDATE photo_roots SET status=?,last_scan_at=? WHERE id=?",complete[0]?"ready":"partial",Instant.now().toString(),root.id);
                } catch (Exception e) {
                    jdbc.update("UPDATE photo_roots SET status='unavailable' WHERE id=?",root.id);
                    addError(errors,"目录不可用："+root.path); // Do not mark an offline root's photos deleted or missing en masse.
                }
            }
            publish(c,errors,errors.isEmpty()?"completed":"completed_with_errors");
        } catch (Exception e) { addError(errors,"扫描失败："+e.getMessage()); publish(c,errors,"failed"); }
    }
    private static void addError(List<String> errors,String error) { if (errors.size()<50) errors.add(error); }
    private void publish(int[] c,List<String> e,String state) { status=new Status(state,c[0],c[1],c[2],c[3],c[4],c[5],List.copyOf(e)); }
    @PreDestroy void close() { worker.shutdownNow(); }
}
