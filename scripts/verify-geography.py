"""Sample public landmarks against the configured local Tianditu gateway and offline geometry."""
from pathlib import Path
from urllib.request import build_opener, ProxyHandler, Request
from urllib.parse import urlencode
from PIL import Image
import argparse, io, json, math

repo = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=8080)
parser.add_argument('--output', type=Path, default=repo / 'artifacts' / 'round3-geography.json')
args = parser.parse_args()
opener = build_opener(ProxyHandler({}))
base = f'http://127.0.0.1:{args.port}/api/geography'
regions = json.loads((repo / 'frontend/public/assets/china-provinces.geojson').read_text(encoding='utf-8'))

def ring_contains(ring, lng, lat):
    inside = False
    for p, q in zip(ring, ring[1:] + ring[:1]):
        if (p[1] > lat) != (q[1] > lat) and lng < (q[0]-p[0])*(lat-p[1])/(q[1]-p[1])+p[0]:
            inside = not inside
    return inside

def geometry_contains(geometry, lng, lat):
    polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
    return any(ring_contains(polygon[0], lng, lat) and not any(ring_contains(h, lng, lat) for h in polygon[1:]) for polygon in polygons)

results = []
for keyword, code, province in [('天安门', '110000', '北京'), ('外滩', '310000', '上海'), ('青海湖', '630000', '青海')]:
    with opener.open(base + '/search?' + urlencode({'q': keyword, 'provinceCode': code}), timeout=20) as response:
        candidates = json.load(response)
    candidate = next(c for c in candidates if c['provinceCode'] == code)
    lng, lat = candidate['lng'], candidate['lat']
    region = next(f for f in regions['features'] if f['properties']['adcode'] == code)
    in_region = geometry_contains(region['geometry'], lng, lat)
    if not in_region:
        raise AssertionError(keyword + ' is outside offline province geometry')
    if candidate['source']['lng'] != lng or candidate['source']['lat'] != lat:
        raise AssertionError('Source coordinate mismatch')
    tiles = []
    for zoom in (5, 9, 13):
        n = 2 ** zoom
        x = int((lng+180)/360*n)
        y = int((1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n)
        for layer in ('vec', 'cva'):
            with opener.open(f'{base}/tiles/{layer}/{zoom}/{x}/{y}', timeout=20) as response:
                data = response.read()
            if Image.open(io.BytesIO(data)).size != (256, 256):
                raise AssertionError('Invalid tile dimensions')
            tiles.append({'layer': layer, 'z': zoom, 'x': x, 'y': y, 'bytes': len(data)})
    results.append({'query': keyword, 'province': province, 'candidate': candidate, 'insideOfflineProvince': in_region, 'tiles': tiles})
    print(f'PASS: province {code}, one POI inside offline geometry and 6 live tiles', flush=True)
args.output.write_text(json.dumps({'points': results, 'formalBoundaryApproved': False, 'precisionGuarantee': False}, ensure_ascii=False, indent=2), encoding='utf-8')
