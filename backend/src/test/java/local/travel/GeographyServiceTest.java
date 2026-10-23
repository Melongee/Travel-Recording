package local.travel;
import static org.junit.jupiter.api.Assertions.*;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
class GeographyServiceTest {
    @Test void unconfiguredAndOfflineModesNeverCallExternalService(){
        AtomicInteger calls=new AtomicInteger();
        GeographyService.Transport transport=(uri,max)->{calls.incrementAndGet();throw new IOException("should not connect");};
        var absent=new GeographyService("",false,transport);
        assertFalse(absent.state().configured());assertThrows(GeographyService.Unavailable.class,()->absent.search("青海湖","630000"));
        var offline=new GeographyService("private-test-key",true,transport);
        assertThrows(GeographyService.Unavailable.class,()->offline.tile("vec",4,3,6));assertEquals(0,calls.get());
    }
    @Test void searchUsesFixedOfficialHostAndPreservesSourceCoordinates(){
        var service=new GeographyService("private-test-key",false,(uri,max)->{
            assertEquals("https",uri.getScheme());assertEquals("api.tianditu.gov.cn",uri.getHost());assertEquals("/v2/search",uri.getPath());
            return new GeographyService.Reply(200,"{\"status\":{\"infocode\":1000},\"pois\":[{\"name\":\"青海湖\",\"provinceCode\":\"156630000\",\"lonlat\":\"100.18,36.9\",\"hotPointID\":\"poi-1\"},{\"name\":\"bad\",\"lonlat\":\"NaN,999\"}]}".getBytes(StandardCharsets.UTF_8));
        });
        var result=service.search("青海湖","630000");assertEquals(1,result.size());
        var place=result.getFirst();assertEquals("630000",place.provinceCode());assertEquals(36.9,place.lat());assertEquals(100.18,place.lng());assertEquals("CGCS2000",place.source().coordinateSystem());
    }
    @Test void tileValidationAndProviderFailureDoNotLeakKey() throws Exception {
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(256,256,BufferedImage.TYPE_INT_RGB),"png",bytes);
        var valid=new GeographyService("private-test-key",false,(uri,max)->{assertEquals("t0.tianditu.gov.cn",uri.getHost());assertEquals("/vec_w/wmts",uri.getPath());return new GeographyService.Reply(200,bytes.toByteArray());});
        assertEquals("image/png",valid.tile("vec",3,2,3).type());
        assertThrows(IllegalArgumentException.class,()->valid.tile("http://elsewhere",3,2,3));assertThrows(IllegalArgumentException.class,()->valid.tile("vec",3,8,0));
        var failed=new GeographyService("private-test-key",false,(uri,max)->{throw new IOException(uri.toString());});
        var error=assertThrows(GeographyService.Unavailable.class,()->failed.search("地点","630000"));assertFalse(error.getMessage().contains("private-test-key"));
        var wrongType=new GeographyService("private-test-key",false,(uri,max)->new GeographyService.Reply(403,"{\"code\":301012,\"msg\":\"private-test-key\"}".getBytes(StandardCharsets.UTF_8)));
        var permission=assertThrows(GeographyService.Unavailable.class,()->wrongType.search("地点","630000"));
        assertTrue(permission.getMessage().contains("服务端"));assertFalse(permission.getMessage().contains("private-test-key"));
        assertTrue(assertThrows(GeographyService.Unavailable.class,()->wrongType.tile("vec",3,2,3)).getMessage().contains("301012"));
    }
    @Test void nationwideSearchMatchesProvincesWithoutUsingTheFormsPreviousProvince(){
        AtomicInteger calls=new AtomicInteger();
        var service=new GeographyService("private-test-key",false,(uri,max)->{
            calls.incrementAndGet();
            String query=java.net.URLDecoder.decode(uri.getRawQuery(),StandardCharsets.UTF_8);
            assertTrue(query.contains("\"specify\":\"156000000\""));
            return new GeographyService.Reply(200,("""
                {"status":{"infocode":1000},"pois":[
                  {"name":"外滩","provinceCode":"156310000","lonlat":"121.49,31.24"},
                  {"name":"青龙寺","cityCode":"610100","lonlat":"108.99,34.23"},
                  {"name":"青海湖","province":"青海省","lonlat":"100.18,36.9"},
                  {"name":"未知省份","provinceCode":"invalid","lonlat":"100,36"}
                ]}
                """).getBytes(StandardCharsets.UTF_8));
        });
        var result=service.search("景点","");
        assertEquals(4,result.size());assertEquals("310000",result.get(0).provinceCode());assertEquals("上海",result.get(0).province());
        assertEquals("610000",result.get(1).provinceCode());assertEquals("陕西",result.get(1).province());
        assertEquals("630000",result.get(2).provinceCode());assertEquals("",result.get(3).provinceCode());
        assertThrows(IllegalArgumentException.class,()->service.search("景点","990000"));assertEquals(1,calls.get());
    }
}
