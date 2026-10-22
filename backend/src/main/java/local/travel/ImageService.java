package local.travel;

import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import javax.imageio.*;
import com.drew.imaging.ImageMetadataReader;
import com.drew.metadata.exif.*;
import net.coobird.thumbnailator.Thumbnails;
import org.springframework.stereotype.Service;

@Service
public class ImageService {
    private final AppPaths paths;
    ImageService(AppPaths paths) { this.paths = paths; ImageIO.scanForPlugins(); ImageIO.setUseCache(false); }
    record Details(int width, int height, int orientation, String takenAt) {}

    // Bound concurrent decodes; disk traversal and decoding never hold a database transaction.
    synchronized Details index(Path file, String id, String version) throws IOException {
        int orientation = 1; String takenAt = null;
        try {
            var metadata = ImageMetadataReader.readMetadata(file.toFile());
            var exif = metadata.getFirstDirectoryOfType(ExifIFD0Directory.class);
            if (exif != null && exif.containsTag(ExifIFD0Directory.TAG_ORIENTATION)) orientation = exif.getInt(ExifIFD0Directory.TAG_ORIENTATION);
            var date = metadata.getFirstDirectoryOfType(ExifSubIFDDirectory.class);
            if (date != null) {
                String raw = date.getString(ExifSubIFDDirectory.TAG_DATETIME_ORIGINAL);
                if (raw != null && raw.matches("\\d{4}:\\d{2}:\\d{2} \\d{2}:\\d{2}:\\d{2}.*")) {
                    // EXIF time has no reliable zone: preserve the camera wall time, never invent UTC.
                    takenAt = raw.substring(0, 10).replace(':', '-') + "T" + raw.substring(11, 19);
                }
            }
        } catch (Exception ignored) { /* Metadata absence must not reject a decodable image. */ }
        BufferedImage original = decode(file);
        BufferedImage oriented = orient(original, orientation);
        save(oriented, paths.image(id, version, false), 480);
        return new Details(oriented.getWidth(), oriented.getHeight(), orientation, takenAt);
    }

    synchronized Path preview(Models.Photo photo, Path file) throws IOException {
        Path target = paths.image(photo.id, photo.version, true);
        if (!Files.isRegularFile(target) || Files.size(target)==0) save(orient(decode(file), photo.orientation), target, 1920);
        return target;
    }
    private BufferedImage decode(Path path) throws IOException {
        try (var input = ImageIO.createImageInputStream(path.toFile())) {
            if (input == null) throw new IOException("无法读取图片");
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw new IOException("图片格式不受支持或文件已损坏");
            var reader = readers.next();
            try {
                reader.setInput(input, true, true);
                int w = reader.getWidth(0), h = reader.getHeight(0);
                if (w <= 0 || h <= 0 || (long)w * h > 100_000_000) throw new IOException("图片尺寸超过本轮解码保护范围（1 亿像素）");
                BufferedImage image = reader.read(0);
                if (image == null) throw new IOException("图片解码失败");
                return image;
            } finally { reader.dispose(); }
        }
    }
    static BufferedImage orient(BufferedImage image, int orientation) {
        if (orientation < 2 || orientation > 8) return image;
        int w = image.getWidth(), h = image.getHeight();
        boolean swap = orientation >= 5;
        var result = new BufferedImage(swap ? h : w, swap ? w : h, BufferedImage.TYPE_INT_ARGB);
        for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
            int xx = x, yy = y;
            switch (orientation) {
                case 2 -> xx = w - 1 - x;
                case 3 -> { xx = w - 1 - x; yy = h - 1 - y; }
                case 4 -> yy = h - 1 - y;
                case 5 -> { xx = y; yy = x; }
                case 6 -> { xx = h - 1 - y; yy = x; }
                case 7 -> { xx = h - 1 - y; yy = w - 1 - x; }
                case 8 -> { xx = y; yy = w - 1 - x; }
            }
            result.setRGB(xx, yy, image.getRGB(x, y));
        }
        return result;
    }
    private void save(BufferedImage image, Path target, int edge) throws IOException {
        Path temporary = Files.createTempFile(paths.cache, "image-", ".png");
        try {
            Thumbnails.of(image).size(Math.min(image.getWidth(), edge), Math.min(image.getHeight(), edge))
                .outputFormat("png").toFile(temporary.toFile());
            if (Files.size(temporary)==0) throw new IOException("图片缓存生成失败");
            try { Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING); }
            catch (AtomicMoveNotSupportedException e) { Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING); }
        } finally { Files.deleteIfExists(temporary); }
    }
}
