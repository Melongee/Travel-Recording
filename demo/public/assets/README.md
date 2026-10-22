# Demo 离线资源

本目录中的照片和地图均随 Demo 本地提供，运行时无需请求外部图片或地图服务。

## 照片

`scene-01.jpg` 至 `scene-12.jpg` 为 Wikimedia Commons 提供的真实旅行照片，共约 3.4 MiB。已保存适合页面预览的尺寸，原图有些较小，最大宽度为 1280 像素。素材包含湖泊、雪山、沙漠和古镇。

逐张标题、作者、原始页面、许可证链接和尺寸调整说明见 [`assets-sources.json`](./assets-sources.json)。照片保持各自原始许可证，不能统一改为项目代码许可证。使用 CC BY / CC BY-SA 素材时应保留摄影者、原作链接、许可证及变更说明；CC BY-SA 图片的修改版本应继续采用相应兼容许可。页面可提供“素材来源”入口链接本清单。

这些文件只用于验证相册交互。界面中的地点、拍摄日期、文件名、目录和分类都是模拟数据，不表示照片真实拍摄信息。

| 文件 | 内容 | 摄影者 | 许可 |
| --- | --- | --- | --- |
| scene-01.jpg | 湖边日落 | juniperphoton | CC0 |
| scene-02.jpg | 青海湖风景 | Sergio Tittarini | CC BY 2.0 |
| scene-03.jpg | 天山雪峰 | Oleg Brovko | CC BY-SA 2.0 |
| scene-04.jpg | 九寨沟长海 | Suicasmo | CC0 |
| scene-05.jpg | 九寨沟五花海 | Charlie fong | Public domain |
| scene-06.jpg | 喀纳斯湖岸 | Clemson | CC BY 2.0 |
| scene-07.jpg | 敦煌沙丘 | Daniel Eriksson | CC BY 4.0 |
| scene-08.jpg | 敦煌沙丘 | Daniel Eriksson | CC BY 4.0 |
| scene-09.jpg | 敦煌沙丘 | Daniel Eriksson | CC BY 4.0 |
| scene-10.jpg | 绿洲与沙丘 | Popolon | CC BY-SA 3.0 |
| scene-11.jpg | 喜洲古镇 | Mx. Granger | CC0 |
| scene-12.jpg | 大理古城 | chensiyuan | CC BY-SA 4.0 |

## 地图

`china-provinces.geojson` 为 34 个省级区域的离线交互示意数据，来自 Natural Earth 的 1:50m admin-1 和 admin-0 数据。其[官方使用条款](https://www.naturalearthdata.com/about/terms-of-use/)明确说明地图数据属于公共领域，可以使用、修改和分发。

提取大陆 31 个省级区域，并将台湾、香港、澳门的整体轮廓作为另外 3 个区域。仅统一名称和属性，未绘制或修补原始几何。源文件地址见来源清单。Natural Earth 作者包括 Tom Patterson、Nathaniel Vaughn Kelso 及其他贡献者。

**这是一份交互 Demo 示意数据，不是中国标准地图。** Natural Earth 默认使用事实管辖（de facto）边界，其区域边界、岛屿与海域表示不等同于中国标准地图。本文件不能保证包含全部岛屿、海域界线或领土主张，也不能直接用于正式地图发布。正式版本须另行核对标准地图数据、显示要求及分发许可。

GeoJSON 使用 WGS84 地理坐标，点坐标顺序为 `[经度, 纬度]`，可由 Leaflet `L.geoJSON` 直接读取。转换为 Leaflet `LatLng` 使用时需改为 `[纬度, 经度]`。

每个 Feature 的统一属性：

- `name`：完整中文名称，例如 `青海省`、`香港特别行政区`。
- `adcode`：6 位省级编码字符串，例如 `630000`。
- `center`：用于 UI 标记定位的参考中心，顺序为 `[经度, 纬度]`，不是经严格计算的多边形质心。
- `sourceId`：Natural Earth 的原始区域标识，便于追溯。

## 验证

- GeoJSON 具有 34 个 Feature，含台湾、香港、澳门；几何保留为 Polygon / MultiPolygon。
- 12 张照片均可作为 JPEG 解码，尺寸与文件均已检查。
- 素材只用于 Demo 展示，未读取或包含用户的私人照片。
