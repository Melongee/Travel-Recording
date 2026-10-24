package local.travel;

import java.io.IOException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class HomeBackgroundService {
    public record Input(String mode,String photoId,Double opacity,Double zoom,Double x,Double y) {}
    public record Settings(int formatVersion,String mode,String photoId,double opacity,double zoom,double x,double y) {}
    public record View(Settings settings,String src,String warning) {}
    static final Settings DEFAULT=new Settings(1,"default",null,1,1,.5,.4);
    private final JdbcTemplate jdbc;
    private final LibraryService library;
    HomeBackgroundService(JdbcTemplate jdbc,LibraryService library){this.jdbc=jdbc;this.library=library;}
    public View read() {
        var rows=jdbc.query("SELECT * FROM home_background WHERE id=1",(r,n)->settings(r));
        return view(rows.isEmpty()?DEFAULT:rows.getFirst());
    }
    @Transactional(rollbackFor=Exception.class)
    public View save(Input input) throws IOException {
        var settings=validate(input);
        if(settings.mode().equals("photo")) {
            var photo=library.requirePhoto(settings.photoId());
            if(Boolean.TRUE.equals(photo.excluded)||!"available".equals(photo.availability))throw new IllegalArgumentException("请选择图库中可用且未排除的照片");
            library.source(photo);
        }
        jdbc.update("INSERT INTO home_background(id,mode,photo_id,opacity,zoom,x,y) VALUES(1,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET mode=excluded.mode,photo_id=excluded.photo_id,opacity=excluded.opacity,zoom=excluded.zoom,x=excluded.x,y=excluded.y",
            settings.mode(),settings.photoId(),settings.opacity(),settings.zoom(),settings.x(),settings.y());
        return view(settings);
    }
    static Settings settings(ResultSet r) throws SQLException {
        return new Settings(1,r.getString("mode"),r.getString("photo_id"),r.getDouble("opacity"),r.getDouble("zoom"),r.getDouble("x"),r.getDouble("y"));
    }
    static Settings validate(Input input) {
        if(input==null||input.mode()==null||!Set.of("default","photo","none").contains(input.mode()))throw new IllegalArgumentException("背景模式无效");
        if(input.mode().equals("photo")) {
            if(input.photoId()==null||!input.photoId().matches("[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}"))throw new IllegalArgumentException("背景照片 ID 无效");
        }else if(input.photoId()!=null&&!input.photoId().isEmpty())throw new IllegalArgumentException("默认或空白背景不应指定照片");
        range(input.opacity(),0,1);range(input.zoom(),1,4);range(input.x(),0,1);range(input.y(),0,1);
        return new Settings(1,input.mode(),input.mode().equals("photo")?input.photoId():null,input.opacity(),input.zoom(),input.x(),input.y());
    }
    private static void range(Double number,double minimum,double maximum) {
        if(number==null||!Double.isFinite(number)||number<minimum||number>maximum)throw new IllegalArgumentException("背景透明度、缩放或位置超出允许范围");
    }
    private View view(Settings settings) {
        if(!settings.mode().equals("photo"))return new View(settings,null,null);
        try {
            if(settings.photoId()==null)throw new IOException();
            var photo=library.requirePhoto(settings.photoId());
            if(Boolean.TRUE.equals(photo.excluded)||!"available".equals(photo.availability))throw new IOException();
            library.source(photo);
            return new View(settings,"/api/photos/"+photo.id+"/preview?v="+photo.version,null);
        }catch(IOException|NoSuchElementException unavailable){return new View(settings,null,"背景照片暂不可用，请重新选择；已保存的取景设置仍保留。");}
    }
}
