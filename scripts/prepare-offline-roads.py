"""Clip pinned Natural Earth roads into small offline province files (requires Shapely)."""
import hashlib
import json
from pathlib import Path
import sys
from shapely import make_valid
from shapely.geometry import shape, mapping
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parent.parent
SHA256 = '66a0c7b438e92fd124822cc5921cfa11042f48c294ade5e0f03f2c6640fd0248'


def lines(geometry):
    if geometry.geom_type == 'LineString':
        if len(geometry.coords) >= 2 and geometry.length > 0:
            yield geometry
    elif hasattr(geometry, 'geoms'):
        for child in geometry.geoms:
            yield from lines(child)


def main():
    raw = Path(sys.argv[1]).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == SHA256, 'Unexpected roads source'
    assets = ROOT / 'frontend/public/assets'
    target = assets / 'roads'
    target.mkdir(exist_ok=True)
    provinces = json.loads((assets / 'china-provinces.geojson').read_text(encoding='utf-8'))['features']
    source = [f for f in json.loads(raw)['features'] if f['properties']['type'] in ('Major Highway', 'Secondary Highway', 'Beltway', 'Bypass')]
    geometries = [shape(f['geometry']).simplify(0.002, preserve_topology=False) for f in source]
    tree = STRtree(geometries)
    overview = []
    hashes = {}
    counts = {}

    def feature(index, geometry):
        props = source[index]['properties']
        return dict(type='Feature', properties=dict(kind='expressway' if props['expressway'] == 1 else 'trunk', rank=props['scalerank']), geometry=mapping(geometry))

    def save(name, features):
        path = target / (name + '.geojson')
        path.write_text(json.dumps(dict(type='FeatureCollection', features=features), ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
        hashes[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
        counts[name] = len(features)

    for province in provinces:
        boundary = make_valid(shape(province['geometry']))
        features = []
        for index in sorted(tree.query(boundary)):
            for line in lines(geometries[index].intersection(boundary)):
                features.append(feature(index, line))
                if source[index]['properties']['scalerank'] <= 3:
                    for simple in lines(line.simplify(0.025, preserve_topology=False).intersection(boundary)):
                        overview.append(feature(index, simple))
        save(province['properties']['adcode'], features)
    save('overview', overview)
    metadata_path = assets / 'assets-sources.json'
    metadata = json.loads(metadata_path.read_text(encoding='utf-8'))
    metadata = [entry for entry in metadata if entry['file'] != 'roads/*.geojson']
    metadata.append(dict(
        file='roads/*.geojson', title='高速及其他主干道路走向示意',
        source='https://www.naturalearthdata.com/downloads/10m-cultural-vectors/roads/',
        sourceRevision='ca96624a56bd078437bca8184e78163e5039ad19',
        upstreamFile='https://raw.githubusercontent.com/nvkelso/natural-earth-vector/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_10m_roads.geojson',
        sourceSha256=SHA256, license='Public domain — https://www.naturalearthdata.com/about/terms-of-use/',
        author='Natural Earth contributors', coordinateSystem='WGS84 longitude/latitude',
        changes='提取 Major/Secondary Highway、Beltway、Bypass，按源 expressway 标记区分高速；概化后裁切到本地省界，分省加载；全国仅保留 rank<=3 的线路。',
        notice='小比例尺历史走向示意，不是完整或实时路网；其他主干道不能等同于国道，缺少完整道路编号；不用于导航。',
        verifiedAt='2026-10-24', featureCounts=counts, files=hashes))
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Prepared {len(hashes)} files, {sum(counts.values())} line segments, {sum(p.stat().st_size for p in target.glob("*.geojson"))} bytes.')


if __name__ == '__main__':
    main()
