"""Create an independent 5,000-photo library; never read personal photograph directories."""
from pathlib import Path
from datetime import datetime
from PIL import Image, ImageDraw
import hashlib
import json

base = Path(__file__).resolve().parents[1] / 'test-data'
root = base / ('mvp-5000-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
root.mkdir(parents=True, exist_ok=False)
(root / '.travel-generated-samples').write_text('Travel-Recording independent MVP fixtures', encoding='utf-8')
a, nested, b = root / '目录 A', root / '目录 A' / '子目录 中文 空格', root / '目录 B'
for directory in (a, nested, b):
    directory.mkdir(parents=True, exist_ok=True)
entries = []
first = None
sizes = {}
for i in range(5000):
    directory = nested if i < 1200 else a if i < 3000 else b
    kind = 'jpg' if i % 10 < 7 else 'png' if i % 10 < 9 else 'webp'
    size = (6000, 4000) if i % 500 == 0 else (800, 600) if kind == 'jpg' else (480, 720)
    mode = 'RGBA' if kind == 'png' else 'RGB'
    color = (50 + i % 170, 80 + i * 3 % 140, 80 + i * 7 % 140)
    image = Image.new(mode, size, color + (160,) if mode == 'RGBA' else color)
    draw = ImageDraw.Draw(image)
    draw.rectangle((20, 20, size[0] // 2, size[1] // 2), outline='white', width=3)
    draw.text((28, 30), f'TRAVEL SAMPLE {i:04d}', fill='white')
    name = f'样本-{i:04d}.{kind}' if i else '定位 中文 空格, & 原图.jpg'
    file = directory / name
    if i == 4999:
        # Two physically separate paths intentionally hold identical bytes.
        file = directory / '相同内容 不同路径.jpg'
        file.write_bytes(first.read_bytes())
    elif kind == 'jpg':
        exif = Image.Exif()
        exif[36867] = f'2024:01:{1 + i % 28:02d} 10:20:30'
        if i % 250 == 0:
            exif[274] = 6
        image.save(file, quality=82, exif=exif)
    else:
        image.save(file, lossless=True) if kind == 'webp' else image.save(file)
    if i == 0:
        first = file
    actual_size = (6000, 4000) if i == 4999 else size
    sizes[str(actual_size)] = sizes.get(str(actual_size), 0) + 1
    entries.append({'relative': str(file.relative_to(root)), 'sha256': hashlib.sha256(file.read_bytes()).hexdigest(), 'length': file.stat().st_size, 'mtimeNs': file.stat().st_mtime_ns})
    image.close()
broken = b / '损坏图片.jpg'
broken.write_bytes(b'independent corrupt fixture')
entries.append({'relative': str(broken.relative_to(root)), 'sha256': hashlib.sha256(broken.read_bytes()).hexdigest(), 'length': broken.stat().st_size, 'mtimeNs': broken.stat().st_mtime_ns})
(a / '不支持的文件.txt').write_text('must be ignored', encoding='utf-8')
manifest = {'root': str(root), 'roots': [str(a), str(nested), str(b)], 'validPhotos': 5000, 'corruptPhotos': 1, 'sizeDistribution': sizes, 'duplicates': [str(first), str(b / '相同内容 不同路径.jpg')], 'entries': entries}
(root / 'fixture-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print(root)
