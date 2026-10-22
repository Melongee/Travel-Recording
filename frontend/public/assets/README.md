# 本地基础地图资源

正式前端本轮只复用 `china-provinces.geojson`，不打包 Demo 示例照片，不导入 Demo 分类数据。

地图来自 Natural Earth 的 1:50m admin-1/admin-0 数据。作者为 Natural Earth contributors、Tom Patterson、Nathaniel Vaughn Kelso。其[官方使用条款](https://www.naturalearthdata.com/about/terms-of-use/)将地图数据置于公共领域，允许修改与分发。原始文件地址及处理记录见 [assets-sources.json](./assets-sources.json)。

GeoJSON 包含 34 个省级交互区域，沿用 Demo 提取和中文属性整理结果，坐标为 WGS84，经纬度顺序为 `[经度, 纬度]`。地点也以 WGS84 保存，来源为用户手动指定。本轮没有在线图层或其他坐标转换。

**这是交互示意数据，不是中国标准地图。** Natural Earth 采用事实管辖边界；本轮未完成正式地图内容、岛屿海域表示与在线坐标的全面核验。地图上的“交互示意”标识继续保留，不应视为已完成正式地图验收。

脚本、样式、图标和此 GeoJSON 均随 JAR 提供，运行时不请求 CDN。断外网、无历史缓存的完整验收仍在后续阶段安排。
