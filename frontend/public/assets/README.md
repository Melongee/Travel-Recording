# 本地基础地图资源

正式前端本轮只复用 `china-provinces.geojson`，不打包 Demo 示例照片，不导入 Demo 分类数据。

地图来自 Natural Earth 的 1:50m admin-1/admin-0 数据。作者为 Natural Earth contributors、Tom Patterson、Nathaniel Vaughn Kelso。其[官方使用条款](https://www.naturalearthdata.com/about/terms-of-use/)将地图数据置于公共领域，允许修改与分发。原始文件地址及处理记录见 [assets-sources.json](./assets-sources.json)。

GeoJSON 包含 34 个省级交互区域，沿用 Demo 提取和中文属性整理结果，坐标为 WGS84，经纬度顺序为 `[经度, 纬度]`。手动地点采用 WGS84；在线服务为天地图，CGCS2000 候选保留原始坐标和来源，以相同数值作旅行地图近似显示，不承诺精密转换。在线底图需在本机配置服务端 Key 后主动开启。

**这是交互示意数据，不是中国标准地图。** Natural Earth 采用事实管辖边界；本轮未完成正式地图内容、岛屿海域表示与在线坐标的全面核验。地图上的“交互示意”标识继续保留，不应视为已完成正式地图验收。

脚本、样式、图标和此 GeoJSON 均随 JAR 提供，运行时不请求 CDN。用户断网地图手测及独立强制离线服务的浏览、归类与重启保存均已通过；严格新 profile/物理断网组合验收仍未关闭。代表点位与多个缩放级别抽查通过，不替代正式基础地图内容核验。
