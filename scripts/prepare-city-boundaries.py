"""Prepare local city overlays from the pinned cn-atlas source (no network at runtime)."""
import hashlib
import json
from pathlib import Path
import sys

REVISION = '6e83a19923e39f2c0e58a0a7ad29b349b2a71b9f'
SOURCE_SHA256 = '2ee25af1abd1cfceceb83e20d14623879fe6005b8095237cdbf198c4b39b90e1'
ROOT = Path(__file__).resolve().parent.parent


def main():
    source = Path(sys.argv[1]).read_bytes()
    if hashlib.sha256(source).hexdigest() != SOURCE_SHA256:
        raise ValueError('Source differs from pinned cn-atlas revision ' + REVISION)
    provinces = json.loads((ROOT / 'frontend/public/assets/china-provinces.geojson').read_text(encoding='utf-8'))
    groups = {str(feature['properties']['adcode']): [] for feature in provinces['features']}
    seen = set()
    for feature in json.loads(source)['features']:
        props = feature['properties']
        code = str(props['id'])
        if code in groups:
            # This source only contains the whole municipality/SAR/Taiwan, not cities within it.
            continue
        parent = code[:2] + '0000'
        assert parent in groups and code not in seen, code
        seen.add(code)
        groups[parent].append(dict(type='Feature', properties=dict(name=props['地名'], adcode=code, provinceCode=parent), geometry=feature['geometry']))
    target = ROOT / 'frontend/public/assets/cities'
    target.mkdir(exist_ok=True)
    for code, features in sorted(groups.items()):
        features.sort(key=lambda f: f['properties']['adcode'])
        (target / (code + '.geojson')).write_text(json.dumps(dict(type='FeatureCollection', features=features), ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'Prepared {len(seen)} city/prefecture/direct-admin units in {len(groups)} local province files; original geometry preserved.')


if __name__ == '__main__':
    main()
