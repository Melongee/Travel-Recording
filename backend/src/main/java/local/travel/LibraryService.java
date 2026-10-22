package local.travel;

import local.travel.Models.*;
import local.travel.mapper.*;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import jakarta.validation.constraints.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.io.IOException;
import java.nio.file.*;
import java.util.*;

@Service
public class LibraryService {
    final PhotoMapper photos; final RootMapper roots; final PlaceMapper places; final CategoryMapper categories;
    final JdbcTemplate jdbc; final AppPaths paths;
    LibraryService(PhotoMapper photos, RootMapper roots, PlaceMapper places, CategoryMapper categories, JdbcTemplate jdbc, AppPaths paths) {
        this.photos=photos; this.roots=roots; this.places=places; this.categories=categories; this.jdbc=jdbc; this.paths=paths;
    }
    record PhotoView(String id,String fileName,String path,String src,String previewSrc,int width,int height,String takenAt,String sortAt,
                     String placeId,List<String> categoryIds,String rootId,boolean available,String availability,String error,String version) {}
    public List<Root> allRoots() { return roots.selectList(new QueryWrapper<Root>().orderByAsc("path")); }
    public void deleteCategory(String id) { categories.deleteById(id); }
    public Path thumbnail(Photo p) { return paths.image(p.id,p.version,false); }
    Photo requirePhoto(String id) {
        Photo p=photos.selectById(id); if (p==null) throw new NoSuchElementException("照片不存在"); return p;
    }
    Path source(Photo p) throws IOException {
        Path file=Path.of(p.path);
        Root root=roots.selectById(p.rootId);
        if (root==null) throw new IOException("照片目录未登记");
        Path base=Path.of(root.path);
        if (!file.startsWith(base)) throw new IOException("文件超出已登记目录");
        for (Path part=file; part!=null; part=part.getParent()) if (ScanService.isLink(part)) throw new IOException("原路径已变为链接，禁止访问");
        Path real=file.toRealPath();
        if (!real.startsWith(base.toRealPath()) || !ScanService.normalized(real).equals(p.normalizedPath) || !Files.isRegularFile(real)) throw new IOException("原始文件不可用");
        return real;
    }
    PhotoView view(Photo p,List<String> ids) {
        boolean available="available".equals(p.availability);
        if (available) { try { source(p); } catch (IOException e) { available=false; } }
        String status=available?p.availability:("available".equals(p.availability)?"missing":p.availability);
        String base="/api/photos/"+p.id;
        return new PhotoView(p.id,p.fileName,p.path,base+"/thumbnail?v="+p.version,base+"/preview?v="+p.version,
            p.width,p.height,p.takenAt,p.sortAt,p.placeId,ids,p.rootId,available,status,p.error,p.version);
    }
    PhotoView detail(String id) {
        Photo p=requirePhoto(id);
        return view(p,jdbc.queryForList("SELECT category_id FROM photo_categories WHERE photo_id=? ORDER BY category_id",String.class,id));
    }
    record PhotoPage(List<PhotoView> items,long total,int page,int size) {}
    PhotoPage query(String placeId,String categoryId,boolean unclassified,String q,String sort,int page,int size) {
        page=Math.max(0,page); size=Math.clamp(size,1,200);
        StringBuilder where=new StringBuilder(" WHERE 1=1"); List<Object> params=new ArrayList<>();
        if (unclassified) where.append(" AND p.place_id IS NULL");
        if (placeId!=null && !placeId.isBlank()) { where.append(" AND p.place_id=?"); params.add(placeId); }
        if (categoryId!=null && !categoryId.isBlank()) { where.append(" AND EXISTS(SELECT 1 FROM photo_categories pc WHERE pc.photo_id=p.id AND pc.category_id=?)"); params.add(categoryId); }
        if (q!=null && !q.isBlank()) {
            if (q.length()>200) throw new IllegalArgumentException("搜索文字过长");
            where.append(" AND (instr(lower(p.file_name),?)>0 OR EXISTS(SELECT 1 FROM places l WHERE l.id=p.place_id AND instr(lower(l.name||' '||l.province),?)>0) OR EXISTS(SELECT 1 FROM photo_categories pc JOIN categories c ON c.id=pc.category_id WHERE pc.photo_id=p.id AND instr(lower(c.name),?)>0))");
            String search=q.trim().toLowerCase(Locale.ROOT); params.add(search); params.add(search); params.add(search);
        }
        long total=jdbc.queryForObject("SELECT count(*) FROM photos p"+where,Long.class,params.toArray());
        String order=switch(sort==null?"":sort) { case "name" -> "p.file_name COLLATE NOCASE,p.id"; case "date-asc" -> "p.sort_at,p.id"; default -> "p.sort_at DESC,p.id"; };
        List<Object> pageParams=new ArrayList<>(params); pageParams.add(size); pageParams.add((long)page*size);
        List<String> ids=jdbc.queryForList("SELECT p.id FROM photos p"+where+" ORDER BY "+order+" LIMIT ? OFFSET ?",String.class,pageParams.toArray());
        List<PhotoView> items=new ArrayList<>();
        for (String id:ids) items.add(detail(id));
        return new PhotoPage(items,total,page,size);
    }
    record PlaceView(String id,String name,String province,String provinceCode,double lat,double lng,String description,String coordinateSystem,String coordinateSource,long photoCount,String coverSrc) {}
    List<PlaceView> allPlaces() {
        return places.selectList(new QueryWrapper<Place>().orderByAsc("province_code","name","id")).stream().map(p -> {
            long count=jdbc.queryForObject("SELECT count(*) FROM photos WHERE place_id=?",Long.class,p.id);
            String cover=null;
            var candidates=photos.selectList(new QueryWrapper<Photo>().eq("place_id",p.id).eq("availability","available").orderByDesc("sort_at").last("LIMIT 20"));
            for (Photo photo:candidates) { try { source(photo); cover="/api/photos/"+photo.id+"/thumbnail?v="+photo.version; break; } catch (IOException ignored) {} }
            return new PlaceView(p.id,p.name,p.province,p.provinceCode,p.lat,p.lng,p.description,p.coordinateSystem,p.coordinateSource,count,cover);
        }).toList();
    }
    record CategoryView(String id,String placeId,String name,long photoCount) {}
    List<CategoryView> allCategories() {
        return categories.selectList(new QueryWrapper<Category>().orderByAsc("name","id")).stream().map(c -> new CategoryView(c.id,c.placeId,c.name,
            jdbc.queryForObject("SELECT count(*) FROM photo_categories WHERE category_id=?",Long.class,c.id))).toList();
    }
    Map<String,Object> overview() {
        return Map.of("photoCount",jdbc.queryForObject("SELECT count(*) FROM photos",Long.class),
            "unclassifiedCount",jdbc.queryForObject("SELECT count(*) FROM photos WHERE place_id IS NULL",Long.class),
            "places",allPlaces(),"categories",allCategories(),"roots",roots.selectList(new QueryWrapper<Root>().orderByAsc("path")),"dataDir",paths.data.toString());
    }
    record PlaceInput(@NotBlank @Size(max=60) String name,@NotBlank String province,@NotBlank String provinceCode,
                      @NotNull @DecimalMin("-90") @DecimalMax("90") Double lat,@NotNull @DecimalMin("-180") @DecimalMax("180") Double lng,@Size(max=500) String description) {}
    private static final Map<String,String> PROVINCES=Map.ofEntries(
        Map.entry("110000","北京"),Map.entry("120000","天津"),Map.entry("130000","河北"),Map.entry("140000","山西"),Map.entry("150000","内蒙古"),
        Map.entry("210000","辽宁"),Map.entry("220000","吉林"),Map.entry("230000","黑龙江"),Map.entry("310000","上海"),Map.entry("320000","江苏"),
        Map.entry("330000","浙江"),Map.entry("340000","安徽"),Map.entry("350000","福建"),Map.entry("360000","江西"),Map.entry("370000","山东"),
        Map.entry("410000","河南"),Map.entry("420000","湖北"),Map.entry("430000","湖南"),Map.entry("440000","广东"),Map.entry("450000","广西"),
        Map.entry("460000","海南"),Map.entry("500000","重庆"),Map.entry("510000","四川"),Map.entry("520000","贵州"),Map.entry("530000","云南"),
        Map.entry("540000","西藏"),Map.entry("610000","陕西"),Map.entry("620000","甘肃"),Map.entry("630000","青海"),Map.entry("640000","宁夏"),
        Map.entry("650000","新疆"),Map.entry("710000","台湾"),Map.entry("810000","香港"),Map.entry("820000","澳门"));
    Place savePlace(String id, PlaceInput input) {
        if (!Objects.equals(PROVINCES.get(input.provinceCode),input.province) || !Double.isFinite(input.lat) || !Double.isFinite(input.lng)) throw new IllegalArgumentException("省份或坐标无效");
        Place p=id==null?new Place():places.selectById(id);
        if (p==null) throw new NoSuchElementException("地点不存在");
        boolean fresh=id==null; p.id=fresh?UUID.randomUUID().toString():id;
        p.name=input.name.trim(); p.province=input.province; p.provinceCode=input.provinceCode; p.lat=input.lat; p.lng=input.lng;
        p.description=input.description==null?"":input.description.trim(); p.coordinateSystem="WGS84"; p.coordinateSource="manual";
        if (fresh) places.insert(p); else places.updateById(p); return p;
    }
    record CategoryInput(@NotBlank String placeId,@NotBlank @Size(max=24) String name) {}
    Category saveCategory(String id, CategoryInput input) {
        if (places.selectById(input.placeId)==null) throw new IllegalArgumentException("地点不存在");
        Category c=id==null?new Category():categories.selectById(id);
        if (c==null) throw new NoSuchElementException("类别不存在");
        if (id!=null && !input.placeId.equals(c.placeId)) throw new IllegalArgumentException("不能移动类别到其他地点");
        boolean fresh=id==null; c.id=fresh?UUID.randomUUID().toString():id; c.placeId=input.placeId; c.name=input.name.trim();
        if (fresh) categories.insert(c); else categories.updateById(c); return c;
    }
    public record Classification(@NotEmpty @Size(max=1000) List<@NotBlank String> photoIds,String placeId,@NotNull @Size(max=100) List<@NotBlank String> categoryIds) {}
    @Transactional
    public void classify(Classification input) {
        Set<String> photoIds=new LinkedHashSet<>(input.photoIds), categoryIds=new LinkedHashSet<>(input.categoryIds);
        if (input.placeId!=null && places.selectById(input.placeId)==null) throw new IllegalArgumentException("地点不存在");
        for (String id:photoIds) requirePhoto(id);
        for (String id:categoryIds) {
            Category c=categories.selectById(id);
            if (c==null || input.placeId==null || !input.placeId.equals(c.placeId)) throw new IllegalArgumentException("类别必须属于目标地点");
        }
        for (String id:photoIds) {
            jdbc.update("DELETE FROM photo_categories WHERE photo_id=?",id);
            jdbc.update("UPDATE photos SET place_id=? WHERE id=?",input.placeId,id);
            for (String category:categoryIds) jdbc.update("INSERT INTO photo_categories(photo_id,category_id) VALUES(?,?)",id,category);
        }
    }
    @Transactional
    public void deletePlace(String id) {
        jdbc.update("DELETE FROM photo_categories WHERE photo_id IN(SELECT id FROM photos WHERE place_id=?)",id);
        places.deleteById(id);
    }
}
