package local.travel;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.*;
import java.util.*;
import local.travel.Models.Root;
import local.travel.mapper.RootMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class RootRemovalService {
    private final RootMapper roots;
    private final JdbcTemplate jdbc;
    private final ScanService scans;
    private final LibraryMaintenance maintenance;
    private final TransactionTemplate transaction;
    RootRemovalService(RootMapper roots,JdbcTemplate jdbc,ScanService scans,LibraryMaintenance maintenance,PlatformTransactionManager manager) {
        this.roots=roots;this.jdbc=jdbc;this.scans=scans;this.maintenance=maintenance;this.transaction=new TransactionTemplate(manager);
    }
    record Impact(String rootId,String path,int deleteCount,int unclassifiedCount,int classifiedCount,int excludedCount,int retainedCount,String token) {}
    private record Photo(String id,String path,String rootId,String placeId,boolean excluded,String version) {}
    private record Kept(Photo photo,Root owner) {}
    private record Plan(Impact impact,List<Photo> deleted,List<Kept> kept) {}

    Impact preview(String id) {
        try(var lease=maintenance.read()) {
            return scans.whenIdle(()->transaction.execute(status->plan(id).impact));
        }
    }
    Impact remove(String id,String token) {
        try(var lease=maintenance.read()) {
            // Hold the scan monitor until the transaction commits: a newly requested scan cannot
            // capture the removed root, and an already queued/running scan prevents removal.
            return scans.whenIdle(()->transaction.execute(status->{
                Plan plan=plan(id);
                if(!plan.impact.token.equals(token))throw new LibraryMaintenance.Busy("目录或照片索引已变化，请重新核对移除影响");
                for(Kept kept:plan.kept) if(kept.photo.rootId.equals(id))
                    jdbc.update("UPDATE photos SET root_id=? WHERE id=?",kept.owner.id,kept.photo.id);
                for(Photo photo:plan.deleted) jdbc.update("DELETE FROM photos WHERE id=?",photo.id);
                roots.deleteById(id); // Photo/category links cascade; places and categories remain.
                return plan.impact;
            }));
        }
    }
    private Plan plan(String id) {
        List<Root> all=roots.selectList(null).stream().sorted(Comparator.comparing(r->r.id)).toList();
        Root target=all.stream().filter(r->r.id.equals(id)).findFirst().orElseThrow(()->new NoSuchElementException("目录不存在或已被移除"));
        Path base=Path.of(target.normalizedPath);
        List<Root> remaining=all.stream().filter(r->!r.id.equals(id)&&(Boolean.TRUE.equals(r.enabled)||"single_file".equals(r.status))&&!"needs_confirmation".equals(r.status))
            .sorted(Comparator.<Root>comparingInt(r->Path.of(r.normalizedPath).getNameCount()).reversed().thenComparing(r->r.id)).toList();
        List<Photo> deleted=new ArrayList<>();List<Kept> kept=new ArrayList<>();
        MessageDigest digest;
        try{digest=MessageDigest.getInstance("SHA-256");}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}
        for(Root root:all)fingerprint(digest,root.id,root.normalizedPath,String.valueOf(root.enabled),root.status);
        var photos=jdbc.query("SELECT id,normalized_path,root_id,place_id,excluded,version FROM photos ORDER BY id",
            (row,index)->new Photo(row.getString(1),row.getString(2),row.getString(3),row.getString(4),row.getBoolean(5),row.getString(6)));
        for(Photo photo:photos) {
            Path file=Path.of(photo.path);
            if(!file.startsWith(base)&&!photo.rootId.equals(id))continue;
            fingerprint(digest,photo.id,photo.path,photo.rootId,photo.placeId,String.valueOf(photo.excluded),photo.version);
            Root owner=remaining.stream().filter(r->file.startsWith(Path.of(r.normalizedPath))).findFirst().orElse(null);
            if(owner==null)deleted.add(photo);else kept.add(new Kept(photo,owner));
        }
        int excluded=(int)deleted.stream().filter(Photo::excluded).count();
        int classified=(int)deleted.stream().filter(p->!p.excluded&&p.placeId!=null).count();
        Impact impact=new Impact(id,target.path,deleted.size(),deleted.size()-excluded-classified,classified,excluded,kept.size(),HexFormat.of().formatHex(digest.digest()));
        return new Plan(impact,deleted,kept);
    }
    private static void fingerprint(MessageDigest digest,String... values) {
        for(String value:values){if(value!=null)digest.update(value.getBytes(StandardCharsets.UTF_8));digest.update((byte)0);}
    }
}
