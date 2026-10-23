package local.travel;

import com.baomidou.mybatisplus.annotation.*;

public class Models {
    @TableName("photo_roots")
    public static class Root {
        @TableId(type=IdType.INPUT) public String id;
        public String path, normalizedPath, status, lastScanAt;
        public Boolean enabled;
    }
    @TableName("photos")
    public static class Photo {
        @TableId(type=IdType.INPUT) public String id;
        public String path, normalizedPath, rootId, fileName, takenAt, sortAt, placeId, availability, error, version;
        public Long size, modifiedAt;
        public Integer width, height, orientation;
        public Boolean excluded;
    }
    @TableName("places")
    public static class Place {
        @TableId(type=IdType.INPUT) public String id;
        public String name, province, provinceCode, description, coordinateSystem, coordinateSource;
        public Double lat, lng;
    }
    @TableName("categories")
    public static class Category {
        @TableId(type=IdType.INPUT) public String id;
        public String name, placeId;
    }
}
