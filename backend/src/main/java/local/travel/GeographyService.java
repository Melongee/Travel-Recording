package local.travel;

import java.io.*;
import java.net.*;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import javax.imageio.ImageIO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.*;
import tools.jackson.databind.*;
import tools.jackson.databind.json.JsonMapper;

@Service
public class GeographyService {
    private static final JsonMapper JSON=JsonMapper.builder().build();
    private final String key;
    private final boolean offline;
    private final Transport transport;
    GeographyService(@Value("${app.geography.tianditu-key:}") String key,@Value("${app.geography.offline:false}") boolean offline,Transport transport) {
        this.key=key.trim();this.offline=offline;this.transport=transport;
    }
    public record State(boolean configured,boolean offline,String provider,String message) {}
    public State state(){return new State(!key.isBlank(),offline,"天地图",offline?"当前为离线模式，保留基础地图与本地照片管理":key.isBlank()?"尚未配置天地图 Key，可继续使用基础地图与手动选点":"已配置天地图，点击在线地图或地名搜索时才联网");}
    private void requireOnline(){if(offline)throw new Unavailable("当前为离线模式，请使用基础地图和手动选点");if(key.isBlank())throw new Unavailable("尚未配置天地图 Key，请使用基础地图和手动选点");}
    public record Candidate(String name,String address,String province,String provinceCode,double lat,double lng,Source source) {}
    public record Source(String provider,String coordinateSystem,double lat,double lng,String poiId,String adaptation) {}
    public List<Candidate> search(String keyword,String provinceCode) {
        requireOnline();keyword=keyword.trim();
        if(keyword.isEmpty()||keyword.length()>80||!provinceCode.matches("[1-8][0-9]0000"))throw new IllegalArgumentException("请填写有效地名并选择省份");
        Map<String,Object> query=Map.of("keyWord",keyword,"specify","156"+provinceCode,"queryType",12,"start",0,"count",10,"show",2);
        URI uri=URI.create("https://api.tianditu.gov.cn/v2/search?postStr="+encode(JSON.writeValueAsString(query))+"&type=query&tk="+encode(key));
        try {
            Reply reply=transport.get(uri,1024*1024);
            checkReply(reply,"在线地名搜索暂不可用，请稍后重试或手动选点");
            JsonNode body=JSON.readTree(reply.body);var status=body.path("status");
            if(status.isArray()&&!status.isEmpty())status=status.get(0);
            String code=status.path("infocode").asText("");
            if(!code.isEmpty()&&!code.equals("1000")&&!code.equals("3001"))throw new Unavailable("天地图拒绝了搜索请求，请检查 Key 的服务权限或额度");
            List<Candidate> candidates=new ArrayList<>();
            for(JsonNode poi:body.path("pois")){
                String[] xy=poi.path("lonlat").asText("").split(",");if(xy.length!=2)continue;
                try {
                    double lng=Double.parseDouble(xy[0]),lat=Double.parseDouble(xy[1]);
                    if(!Double.isFinite(lng)||!Double.isFinite(lat)||Math.abs(lng)>180||Math.abs(lat)>90)continue;
                    String codeValue=poi.path("provinceCode").asText(provinceCode);if(codeValue.startsWith("156"))codeValue=codeValue.substring(3);if(codeValue.length()!=6)codeValue=provinceCode;
                    candidates.add(new Candidate(poi.path("name").asText(keyword),poi.path("address").asText(""),poi.path("province").asText(""),codeValue,lat,lng,
                        new Source("tianditu","CGCS2000",lat,lng,poi.path("hotPointID").asText(""),"geographic-approximation")));
                }catch(NumberFormatException ignored){}
            }
            return candidates;
        } catch(Unavailable e){throw e;}catch(Exception e){throw new Unavailable("在线搜索连接失败，基础地图和手动选点仍可使用");}
    }
    public record Tile(byte[] body,String type) {}
    public Tile tile(String layer,int z,int x,int y) {
        requireOnline();
        if(!Set.of("vec","cva").contains(layer)||z<1||z>18||x<0||y<0||x>=(1<<z)||y>=(1<<z))throw new IllegalArgumentException("地图瓦片参数无效");
        URI uri=URI.create("https://t0.tianditu.gov.cn/"+layer+"_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER="+layer+"&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX="+z+"&TILEROW="+y+"&TILECOL="+x+"&tk="+encode(key));
        try {
            Reply reply=transport.get(uri,1024*1024);
            checkReply(reply,"在线地图不可用，已保留基础地图");
            var image=ImageIO.read(new ByteArrayInputStream(reply.body));
            if(image==null||image.getWidth()!=256||image.getHeight()!=256)throw new Unavailable("在线地图返回无效内容，请检查 Key 或稍后重试");
            String type=reply.body.length>3&&(reply.body[0]&255)==255&&(reply.body[1]&255)==216?"image/jpeg":"image/png";
            return new Tile(reply.body,type);
        }catch(Unavailable e){throw e;}catch(Exception e){throw new Unavailable("在线地图连接失败，已保留基础地图");}
    }
    private static void checkReply(Reply reply,String fallback) {
        if(reply.status==200)return;
        try {
            if(JSON.readTree(reply.body).path("code").asInt(0)==301012)
                throw new Unavailable("天地图 Key 权限类型不匹配（301012）。本应用由 Java 服务调用，请在天地图控制台选择“服务端”Key，更新本机配置后重启");
        }catch(Unavailable e){throw e;}catch(Exception ignored){}
        throw new Unavailable(fallback);
    }
    private static String encode(String value){return URLEncoder.encode(value,java.nio.charset.StandardCharsets.UTF_8);}
    public static class Unavailable extends RuntimeException { Unavailable(String message){super(message);} }
    public record Reply(int status,byte[] body) {}
    interface Transport { Reply get(URI uri,int limit) throws IOException,InterruptedException; }
}

@Component
class TiandituTransport implements GeographyService.Transport {
    private HttpClient client;
    private synchronized HttpClient client(){
        if(client==null)client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(4)).followRedirects(HttpClient.Redirect.NEVER).build();
        return client;
    }
    @Override public GeographyService.Reply get(URI uri,int limit) throws IOException,InterruptedException {
        // URLs are built only by GeographyService; no arbitrary URL or user-supplied hostname is accepted.
        var request=HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(7)).header("Accept","application/json,image/png,image/jpeg").GET().build();
        var reply=client().send(request,HttpResponse.BodyHandlers.ofInputStream());
        try(InputStream in=reply.body();ByteArrayOutputStream bytes=new ByteArrayOutputStream()){
            BackupService.copyLimited(in,bytes,limit);return new GeographyService.Reply(reply.statusCode(),bytes.toByteArray());
        }
    }
}
