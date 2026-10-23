# 本地基础地图资源

正式前端使用 `china-provinces.geojson` 及 `cities/` 中按省拆分的下级区域叠加层；不打包 Demo 示例照片，不导入 Demo 分类数据。

省界于 2026-10-24 更新为与市界同源的 [cn-atlas / CTAmap 2023](https://github.com/BarbarossaWang/cn-atlas/tree/6e83a19923e39f2c0e58a0a7ad29b349b2a71b9f)，固定版本的 `provinces.json`。源几何保留，包含该源中的南部岛屿；全国及海南视野不再裁掉这些几何。作者为 Amll / BarbarossaWang，底层数据作者为 ruiduobao/shengshixian.com。上游 ISC、底层 MIT，署名与许可见 [cities-LICENSE.txt](cities-LICENSE.txt)。来源与哈希见 [assets-sources.json](./assets-sources.json)。

GeoJSON 包含 34 个省级交互区域，沿用 Demo 提取和中文属性整理结果，坐标为 WGS84，经纬度顺序为 `[经度, 纬度]`。手动地点采用 WGS84；在线服务为天地图，CGCS2000 候选保留原始坐标和来源，以相同数值作旅行地图近似显示，不承诺精密转换。在线底图需在本机配置服务端 Key 后主动开启。

**这是 2023 版交互底图，不是经过内容审定的中国标准地图。** 34 个区域保留固定上游几何，标签改用主体面内代表点。新资源补足旧 Natural Earth 示意图缺失的南部几何，但不据此宣称逐岛覆盖、最新行政变更或标准地图验收通过。没有新增海域界线或自行绘制缺失边界。

脚本、样式、图标和此 GeoJSON 均随 JAR 提供，运行时不请求 CDN。用户断网地图手测及独立强制离线服务的浏览、归类与重启保存均已通过；2026-10-23 用户已取消新增物理断网及严格无缓存组合专项，不再安排或作为交付门槛。代表点位与多个缩放级别抽查通过，不替代正式基础地图内容核验。

## 轻量离线道路（2026-10-24）

用户选择“主要道路走向”方案。`roads/*.geojson` 来自 [Natural Earth Roads](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/roads/)，固定源文件与 SHA-256 见 `assets-sources.json`。Natural Earth contributors 提供的数据属[公共领域](https://www.naturalearthdata.com/about/terms-of-use/)。准备脚本提取 Major/Secondary Highway、Beltway、Bypass，按源 `expressway` 标记区分高速，其余只称“其他主干”，不等同于国道。省界裁切与概化在构建资源时执行，不在运行时联网。

34 个省文件加全国概览共约 0.90 MB；全国显示较少的主要线路，选省后读取该省的较细线路，缩放后分级显示。没有完整道路编号，不承诺完整或实时路网，不用于导航。道路层可关闭；文件失效时保留省市和照片浏览并可重试。准备脚本使用 Shapely，应用运行无需 Python/Shapely。

## 市级交互叠加层（2026-10-23）

用户新增省/市点击缩放需求。`cities/*.geojson` 来自 [cn-atlas](https://github.com/BarbarossaWang/cn-atlas/tree/6e83a19923e39f2c0e58a0a7ad29b349b2a71b9f)，固定提交 `6e83a19923e39f2c0e58a0a7ad29b349b2a71b9f` 的 `prefectures.json`；作者声明底层为 CTAmap 2023 版数据。上游 package.json 声明 ISC，底层仓库声明 MIT，许可与署名保留在 [cities-LICENSE.txt](cities-LICENSE.txt)，原地址、哈希与每个本地文件哈希记录在 [assets-sources.json](assets-sources.json)。

372 个源要素中，365 个市/州/省直管单位按行政代码前两位拆分，保留原始几何与中文名称；直辖市、港澳台的 7 个整体轮廓不冒充下级城市，对应省文件为空集合，界面明确提示无下级市界。经纬度按未投影 GeoJSON/WGS84 近似解释，不进行精密基准转换。该 2023 版叠加层与现有 Natural Earth 省界的海岸及外缘可能不完全重合，不承诺最新行政变更或完整标准地图内容；照片不匹配到市。

复现：将固定版原始 `prefectures.json` 下载到项目忽略目录，运行 `python scripts/prepare-city-boundaries.py <原始文件>`，再运行 `python scripts/verify-city-boundaries.py <原始文件>`。脚本使用 Python 标准库，校验固定源哈希、365 个几何一致性、34 个文件哈希、唯一编码与父省、闭合/有限数/非零面积；不访问个人照片或数据库。运行时按所选省份读取本地文件，约 4.56 MB 总量无需首次一次加载。
