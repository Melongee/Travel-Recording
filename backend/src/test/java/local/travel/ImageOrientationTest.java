package local.travel;
import static org.junit.jupiter.api.Assertions.*;
import java.awt.image.BufferedImage;
import org.junit.jupiter.api.Test;
class ImageOrientationTest {
    @Test void exifRotationAndMirroringPreserveCornerPositions() {
        var image=new BufferedImage(3,2,BufferedImage.TYPE_INT_ARGB);
        int red=0xFFFF0000, blue=0xFF0000FF; image.setRGB(0,0,red);image.setRGB(2,1,blue);
        var clockwise=ImageService.orient(image,6);assertEquals(2,clockwise.getWidth());assertEquals(3,clockwise.getHeight());assertEquals(red,clockwise.getRGB(1,0));assertEquals(blue,clockwise.getRGB(0,2));
        var mirror=ImageService.orient(image,2);assertEquals(red,mirror.getRGB(2,0));assertEquals(blue,mirror.getRGB(0,1));
        for(int orientation=1;orientation<=8;orientation++) {
            var result=ImageService.orient(image,orientation);int count=0;
            for(int y=0;y<result.getHeight();y++)for(int x=0;x<result.getWidth();x++)if(result.getRGB(x,y)==red||result.getRGB(x,y)==blue)count++;
            assertEquals(2,count);
        }
    }
}
