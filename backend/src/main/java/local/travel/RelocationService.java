package local.travel;

import java.io.*;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import local.travel.Models.*;
import local.travel.mapper.RootMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class RelocationService {
    final LibraryService library;final ScanService scans;final ImageService images;final LibraryMaintenance maintenance;
    final JdbcTemplate jdbc;final AppPaths paths;final TransactionTemplate transaction;final RootMapper roots;
    final Map<String,Selection> selections=new ConcurrentHashMap<>();
    record Preview(String token,String photoId,String oldPath,String newPath,String fileName,int width,int height,boolean verified,String verification,String oldImage,String newImage) {}
    record Selection(Preview preview,Photo original,Path file,String hash,String version,ImageService.Details details,Path work,Instant expires) {}
    RelocationService(LibraryService library,ScanService scans,ImageService images,LibraryMaintenance maintenance,JdbcTemplate jdbc,AppPaths paths,PlatformTransactionManager manager,RootMapper roots) {
        this.library=library;this.scans=scans;this.images=images;this.maintenance=maintenance;this.jdbc=jdbc;this.paths=paths;this.roots=roots;transaction=new TransactionTemplate(manager);
    }
    Preview preview(String id,String value) throws IOException {
        try(var lease=maintenance.read()) {
            return idle(()->prepare(id,value).preview);
        }
    }
    Selection prepare(String id,String value) throws IOException {
        cleanup();Photo photo=library.requirePhoto(id);requireUnavailable(photo);
        Path file=safeFile(value);checkOccupied(photo.id,file);
        var before=Files.readAttributes(file,BasicFileAttributes.class);
        if(before.size()!=photo.size)throw new IllegalArgumentException("所选文件大小与旧索引不同，不能确认为同一照片");
        String beforeHash=BackupService.sha256(file);
        String token=UUID.randomUUID().toString();Path work=Files.createDirectories(paths.data.resolve("relocations").resolve(token));
        try {
            var info=images.inspect(file,work.resolve("candidate.png"));
            if(info.width()!=photo.width||info.height()!=photo.height)throw new IllegalArgumentException("所选照片尺寸与旧索引不同");
            Path reference=library.thumbnail(photo);boolean verified=Files.isRegularFile(reference);
            if(verified) {
                if(!images.sameThumbnail(reference,work.resolve("candidate.png")))throw new IllegalArgumentException("所选照片影像与原缩略图不一致，请选择正确文件");
                Files.copy(reference,work.resolve("old.png"));
            }
            String hash=BackupService.sha256(file);var after=Files.readAttributes(file,BasicFileAttributes.class);
            if(!beforeHash.equals(hash)||before.size()!=after.size()||!before.lastModifiedTime().equals(after.lastModifiedTime()))throw new IOException("文件在核对期间发生变化，请重新选择");
            String version=after.size()+"-"+after.lastModifiedTime().toMillis();
            Preview view=new Preview(token,id,photo.path,file.toString(),file.getFileName().toString(),info.width(),info.height(),verified,
                verified?"文件大小、图像尺寸及原缩略图一致；确认时再次校验所选文件内容":"旧缩略图不可用，仅文件大小和尺寸一致，需人工核对照片身份",
                verified?"/api/relocations/"+token+"/old":null,"/api/relocations/"+token+"/candidate");
            Selection selection=new Selection(view,photo,file,hash,version,info,work,Instant.now().plus(Duration.ofMinutes(30)));
            selections.put(token,selection);return selection;
        }catch(Exception e){deleteWork(work);throw e;}
    }
    LibraryService.PhotoView confirm(String token,boolean confirmUnverified) throws IOException {
        try(var lease=maintenance.read()) {
            return idle(()->{
                Selection selection=requireSelection(token);
                if(!selection.preview.verified&&!confirmUnverified)throw new IllegalArgumentException("请先人工核对所选照片，明确确认后再恢复关联");
                validate(selection);
                // Generate only application cache before committing; originals are never written.
                Files.copy(selection.work.resolve("candidate.png"),paths.image(selection.original.id,selection.version,false),StandardCopyOption.REPLACE_EXISTING);
                transaction.executeWithoutResult(status->{
                    validateIndex(selection);
                    Root owner=owner(selection.file);
                    if(owner==null) {
                        owner=library.allRoots().stream().filter(r->r.normalizedPath.equals(ScanService.normalized(selection.file))).findFirst().orElse(null);
                    }
                    if(owner==null) {
                        owner=new Root();owner.id=UUID.randomUUID().toString();owner.path=selection.file.toString();owner.normalizedPath=ScanService.normalized(selection.file);owner.enabled=false;owner.status="single_file";
                        roots.insert(owner);
                    } else if(owner.normalizedPath.equals(ScanService.normalized(selection.file))) {
                        owner.enabled=false;owner.status="single_file";roots.updateById(owner);
                    }
                    apply(selection,owner.id);
                    Photo old=selection.original;
                    Root previous=roots.selectById(old.rootId);
                    if(previous!=null&&previous.normalizedPath.equals(old.normalizedPath)&&jdbc.queryForObject("SELECT count(*) FROM photos WHERE root_id=?",Integer.class,previous.id)==0)roots.deleteById(previous.id);
                });
                LibraryService.PhotoView result=library.detail(selection.original.id);
                try{discard(token);}catch(IOException ignored){/* Committed index remains valid even if temporary cache cleanup fails. */}
                return result;
            });
        }
    }
    void validate(Selection selection) throws IOException {
        validateIndex(selection);requireUnavailable(library.requirePhoto(selection.original.id));
        Path file=safeFile(selection.file.toString());checkOccupied(selection.original.id,file);
        var attrs=Files.readAttributes(file,BasicFileAttributes.class);
        if(!(attrs.size()+"-"+attrs.lastModifiedTime().toMillis()).equals(selection.version)||!BackupService.sha256(file).equals(selection.hash))
            throw new LibraryMaintenance.Busy("所选文件在预览后发生变化，请重新选择并核对");
    }
    void validateIndex(Selection selection) {
        Photo current=library.requirePhoto(selection.original.id),old=selection.original;
        if(!Objects.equals(current.path,old.path)||!Objects.equals(current.rootId,old.rootId)||!Objects.equals(current.version,old.version))throw new LibraryMaintenance.Busy("原索引在预览后发生变化，请重新核对");
    }
    void apply(Selection selection,String rootId) {
        jdbc.update("UPDATE photos SET path=?,normalized_path=?,root_id=?,file_name=?,size=?,modified_at=?,version=?,width=?,height=?,orientation=?,availability='available',error=NULL WHERE id=?",
            selection.file.toString(),ScanService.normalized(selection.file),rootId,selection.preview.fileName,selection.original.size,Long.parseLong(selection.version.substring(selection.version.indexOf('-')+1)),selection.version,
            selection.details.width(),selection.details.height(),selection.details.orientation(),selection.original.id);
    }
    Root owner(Path file) {
        String key=ScanService.normalized(file);
        return library.allRoots().stream().filter(r->!"needs_confirmation".equals(r.status)&&(Boolean.TRUE.equals(r.enabled)||"single_file".equals(r.status)))
            .filter(r->Path.of(key).startsWith(Path.of(r.normalizedPath))).max(Comparator.comparingInt(r->Path.of(r.normalizedPath).getNameCount())).orElse(null);
    }
    void checkOccupied(String id,Path file) {
        if(jdbc.queryForObject("SELECT count(*) FROM photos WHERE normalized_path=? AND id<>?",Integer.class,ScanService.normalized(file),id)>0)throw new IllegalArgumentException("该新路径已被另一张照片索引占用，不会覆盖或合并已有记录");
    }
    void requireUnavailable(Photo photo) {
        try {library.source(photo);}catch(IOException e){return;}
        throw new IllegalArgumentException("原照片仍可访问，无需重新定位");
    }
    Path safeFile(String value) throws IOException {
        Path file=safePath(value);
        if(!Files.isRegularFile(file)||!Files.isReadable(file)||!file.getFileName().toString().toLowerCase(Locale.ROOT).matches(".*\\.(jpg|jpeg|png|webp)$"))throw new IllegalArgumentException("请选择可读取的 JPEG、PNG 或 WebP 照片文件");
        return file.toRealPath();
    }
    Path safePath(String value) throws IOException {
        Path path=Path.of(value).toAbsolutePath().normalize();
        if(path.startsWith(paths.data)||paths.data.startsWith(path))throw new IllegalArgumentException("照片路径不能与应用数据目录重叠");
        for(Path part=path;part!=null;part=part.getParent())if(ScanService.isLink(part))throw new IllegalArgumentException("不允许符号链接或目录联接");
        return path;
    }
    Path image(String token,boolean old) {Selection value=requireSelection(token);return value.work.resolve(old?"old.png":"candidate.png");}
    Selection requireSelection(String token) {
        Selection value=selections.get(token);
        if(value==null||Instant.now().isAfter(value.expires))throw new NoSuchElementException("核对已过期，请重新选择照片");return value;
    }
    void discard(String token) throws IOException {Selection value=selections.remove(token);if(value!=null)deleteWork(value.work);}
    void cleanup() throws IOException {for(var value:selections.values())if(Instant.now().isAfter(value.expires))discard(value.preview.token);}
    void deleteWork(Path work) throws IOException {
        Path base=paths.data.resolve("relocations");if(!work.normalize().startsWith(base)||work.equals(base))throw new IOException("无效临时路径");
        if(Files.exists(work))try(var files=Files.walk(work)){for(Path file:files.sorted(Comparator.reverseOrder()).toList())Files.deleteIfExists(file);}
    }
    interface IOAction<T>{T run() throws IOException;}
    <T>T idle(IOAction<T> action) throws IOException {
        try{return scans.whenIdle(()->{try{return action.run();}catch(IOException e){throw new UncheckedIOException(e);}});}catch(UncheckedIOException e){throw e.getCause();}
    }
}
