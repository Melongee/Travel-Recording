"""Check packaged local city geometry and its pinned source mapping."""
import hashlib
import json
import math
from pathlib import Path
import sys

root=Path(__file__).resolve().parent.parent
source=Path(sys.argv[1]).read_bytes()
metadata=next(item for item in json.loads((root/'frontend/public/assets/assets-sources.json').read_text(encoding='utf-8')) if item['file']=='cities/*.geojson')
assert hashlib.sha256(source).hexdigest()==metadata['sourceSha256']
original={str(f['properties']['id']):f for f in json.loads(source)['features']}
provinces=json.loads((root/'frontend/public/assets/china-provinces.geojson').read_text(encoding='utf-8'))
codes={str(f['properties']['adcode']) for f in provinces['features']}
seen=set();rings=points=0;total_size=0
for code in codes:
    path=root/f'frontend/public/assets/cities/{code}.geojson';total_size+=path.stat().st_size
    assert hashlib.sha256(path.read_bytes()).hexdigest()==metadata['files'][path.name]
    data=json.loads(path.read_text(encoding='utf-8'));assert data['type']=='FeatureCollection'
    for feature in data['features']:
        props=feature['properties'];city=props['adcode']
        assert city not in seen and props['provinceCode']==code and city[:2]==code[:2] and props['name']
        seen.add(city);geometry=feature['geometry'];assert geometry==original[city]['geometry']
        polygons=[geometry['coordinates']] if geometry['type']=='Polygon' else geometry['coordinates']
        assert geometry['type'] in ('Polygon','MultiPolygon') and polygons
        for polygon in polygons:
            for ring in polygon:
                assert len(ring)>=4 and ring[0]==ring[-1]
                assert all(len(p)==2 and all(math.isfinite(v) for v in p) and -180<=p[0]<=180 and -90<=p[1]<=90 for p in ring)
                assert abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(ring,ring[1:])))>1e-12
                rings+=1;points+=len(ring)
assert seen==set(original)-codes
assert len(json.loads((root/'frontend/public/assets/cities/370000.geojson').read_text(encoding='utf-8'))['features'])==16
print(f'PASS: {len(codes)} files, {len(seen)} unique units, {rings} closed nonzero rings, {points} finite points, {total_size} bytes; all geometry identical to pinned source.')
