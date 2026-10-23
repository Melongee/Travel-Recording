# 本地基础地图资源

正式前端使用 `china-provinces.geojson` 及 `cities/` 中按省拆分的下级区域叠加层；不打包 Demo 示例照片，不导入 Demo 分类数据。

地图来自 Natural Earth 的 1:50m admin-1/admin-0 数据。作者为 Natural Earth contributors、Tom Patterson、Nathaniel Vaughn Kelso。其[官方使用条款](https://www.naturalearthdata.com/about/terms-of-use/)将地图数据置于公共领域，允许修改与分发。原始文件地址及处理记录见 [assets-sources.json](./assets-sources.json)。

GeoJSON 包含 34 个省级交互区域，沿用 Demo 提取和中文属性整理结果，坐标为 WGS84，经纬度顺序为 `[经度, 纬度]`。手动地点采用 WGS84；在线服务为天地图，CGCS2000 候选保留原始坐标和来源，以相同数值作旅行地图近似显示，不承诺精密转换。在线底图需在本机配置服务端 Key 后主动开启。

**这是交互示意数据，不是中国标准地图。** 2026-10-23 已核实来源与分发条件，34 个区域的几何均与固定上游版本一致，编码与结构检查通过。资源缺少完整南部岛屿/海域表示，小岛概化明显；部分标签包围盒中心在面外，不能据区域数量齐全认定疆域完整。保留“交互示意”标识及 Natural Earth 的 de facto 来源说明。

脚本、样式、图标和此 GeoJSON 均随 JAR 提供，运行时不请求 CDN。用户断网地图手测及独立强制离线服务的浏览、归类与重启保存均已通过；2026-10-23 用户已取消新增物理断网及严格无缓存组合专项，不再安排或作为交付门槛。代表点位与多个缩放级别抽查通过，不替代正式基础地图内容核验。

## 市级交互叠加层（2026-10-23）

用户新增省/市点击缩放需求。`cities/*.geojson` 来自 [cn-atlas](https://github.com/BarbarossaWang/cn-atlas/tree/6e83a19923e39f2c0e58a0a7ad29b349b2a71b9f)，固定提交 `6e83a19923e39f2c0e58a0a7ad29b349b2a71b9f` 的 `prefectures.json`；作者声明底层为 CTAmap 2023 版数据。上游 package.json 声明 ISC，底层仓库声明 MIT，许可与署名保留在 [cities-LICENSE.txt](cities-LICENSE.txt)，原地址、哈希与每个本地文件哈希记录在 [assets-sources.json](assets-sources.json)。

372 个源要素中，365 个市/州/省直管单位按行政代码前两位拆分，保留原始几何与中文名称；直辖市、港澳台的 7 个整体轮廓不冒充下级城市，对应省文件为空集合，界面明确提示无下级市界。经纬度按未投影 GeoJSON/WGS84 近似解释，不进行精密基准转换。该 2023 版叠加层与现有 Natural Earth 省界的海岸及外缘可能不完全重合，不承诺最新行政变更或完整标准地图内容；照片不匹配到市。

复现：将固定版原始 `prefectures.json` 下载到项目忽略目录，运行 `python scripts/prepare-city-boundaries.py <原始文件>`，再运行 `python scripts/verify-city-boundaries.py <原始文件>`。脚本使用 Python 标准库，校验固定源哈希、365 个几何一致性、34 个文件哈希、唯一编码与父省、闭合/有限数/非零面积；不访问个人照片或数据库。运行时按所选省份读取本地文件，约 4.56 MB 总量无需首次一次加载。
