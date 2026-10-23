"""Prepare provinces from the same pinned cn-atlas edition as the city overlays.

Requires Shapely only for this build-time resource preparation, not application runtime.
Usage: python scripts/prepare-province-boundaries.py path/to/provinces.json
"""
import hashlib
import json
from pathlib import Path
import sys
from shapely.geometry import shape

ROOT = Path(__file__).resolve().parent.parent
SHA256 = '0c2613c489a9c017be76f384f5b97d0df1a7632b18242009631834c495689fae'


def main():
    raw = Path(sys.argv[1]).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == SHA256, 'Unexpected province source'
    assets = ROOT / 'frontend/public/assets'
    previous = json.loads((assets / 'china-provinces.geojson').read_text(encoding='utf-8'))
    codes = {str(f['properties']['adcode']) for f in previous['features']}
    features = []
    for source in json.loads(raw)['features']:
        code = str(source['properties']['id'])
        geometry = shape(source['geometry'])
        polygons = list(geometry.geoms) if geometry.geom_type == 'MultiPolygon' else [geometry]
        anchor = max(polygons, key=lambda polygon: polygon.area).representative_point()
        center = [round(anchor.x, 10), round(anchor.y, 10)]
        assert geometry.covers(anchor), code
        features.append(dict(type='Feature', properties=dict(
            name=source['properties']['\u5730\u540d'], adcode=code, center=center), geometry=source['geometry']))
    assert len(features) == 34 and {f['properties']['adcode'] for f in features} == codes
    features.sort(key=lambda f: f['properties']['adcode'])
    target = assets / 'china-provinces.geojson'
    target.write_text(json.dumps(dict(type='FeatureCollection', features=features), ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    metadata = json.loads((assets / 'assets-sources.json').read_text(encoding='utf-8'))
    metadata[0] = dict(
        file=target.name, title='省级区域交互底图（34个区域，CTAmap 2023）',
        source='https://github.com/BarbarossaWang/cn-atlas',
        sourceRevision='6e83a19923e39f2c0e58a0a7ad29b349b2a71b9f',
        upstreamFile='https://raw.githubusercontent.com/BarbarossaWang/cn-atlas/6e83a19923e39f2c0e58a0a7ad29b349b2a71b9f/provinces.json',
        sourceSha256=SHA256, sha256=hashlib.sha256(target.read_bytes()).hexdigest(),
        author='Amll / BarbarossaWang; underlying CTAmap: ruiduobao/shengshixian.com',
        license='ISC; underlying CTAmap MIT; see cities-LICENSE.txt',
        coordinateSystem='Unprojected longitude/latitude; displayed as WGS84, no precision datum conversion',
        changes='保留源几何；统一名称/编码属性，最大主体面内代表点作为标签锚点。补入源文件包含的南部岛屿，与市界同源。',
        notice='2023版交互底图，不承诺最新行政变更、逐岛完整性或标准地图内容审定；不用于导航。',
        verifiedAt='2026-10-24')
    (assets / 'assets-sources.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Prepared {len(features)} provinces, {target.stat().st_size} bytes; source geometries retained.')


if __name__ == '__main__':
    main()
