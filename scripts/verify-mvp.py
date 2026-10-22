"""Packaged-app acceptance with generated fixtures only. Requires Python 3.10+."""
from pathlib import Path
from datetime import datetime
import argparse, hashlib, http.cookiejar, json, os, socket, statistics, subprocess, time
from urllib.request import build_opener, HTTPCookieProcessor, ProxyHandler, Request
from urllib.error import HTTPError, URLError

repo = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--fixtures', type=Path, required=True)
parser.add_argument('--java', type=Path, required=True)
parser.add_argument('--port', type=int, default=8095)
parser.add_argument('--restore-port', type=int, default=8096)
parser.add_argument('--keep-source', action='store_true')
args = parser.parse_args()
fixture = args.fixtures.resolve()
if not fixture.is_relative_to((repo / 'test-data').resolve()) or not (fixture / '.travel-generated-samples').is_file():
    raise ValueError('Only marked project-generated fixtures are allowed')
manifest = json.loads((fixture / 'fixture-manifest.json').read_text(encoding='utf-8'))
if len(manifest['roots']) != 3 or any(not Path(root).resolve().is_relative_to(fixture) for root in manifest['roots']):
    raise ValueError('All three scan roots must stay inside the marked generated fixture')
evidence = repo / 'artifacts' / ('mvp-check-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
evidence.mkdir(parents=True, exist_ok=False)
checks, timings, children = [], {}, []
source_data, restored_data = evidence / 'source', evidence / 'restored'

def check(condition, label):
    if not condition:
        raise AssertionError(label)
    checks.append(label)
    print('PASS:', label, flush=True)

def measured(label, action):
    start = time.perf_counter()
    result = action()
    timings[label] = round(time.perf_counter() - start, 3)
    return result

class Client:
    def __init__(self, port):
        self.base = f'http://127.0.0.1:{port}'
        self.opener = build_opener(ProxyHandler({}), HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = None
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            try:
                self.csrf = self.call('/session')
                return
            except (URLError, TimeoutError):
                time.sleep(.3)
        raise TimeoutError('JAR failed to start')
    def call(self, path, body=None, method=None, binary=False, content_type=None, token=True):
        payload = None if body is None else body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode('utf-8')
        headers = {}
        if payload is not None:
            headers['Content-Type'] = content_type or 'application/json; charset=utf-8'
            if token:
                headers[self.csrf['headerName']] = self.csrf['token']
        request = Request(self.base + '/api' + path, data=payload, headers=headers, method=method or ('GET' if body is None else 'POST'))
        with self.opener.open(request, timeout=60) as response:
            data = response.read()
            return data if binary else json.loads(data)
    def inspect(self, archive):
        boundary = 'TravelRecordingGeneratedBackupBoundary'
        data = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="backup.zip"\r\nContent-Type: application/zip\r\n\r\n'.encode()
                + archive.read_bytes() + f'\r\n--{boundary}--\r\n'.encode())
        return self.call('/backups/inspect', data, content_type='multipart/form-data; boundary=' + boundary)

def start(port, data, desktop=True):
    with socket.socket() as probe:
        if probe.connect_ex(('127.0.0.1', port)) == 0:
            raise RuntimeError(f'Verification port {port} already in use')
    data.mkdir(parents=True, exist_ok=True)
    command = [str(args.java.resolve()), '-Xmx1024m', '-jar', str(repo / 'backend/target/travel-recording-0.1.0.jar'),
               f'--server.port={port}', f'--app.data-dir={data}', '--app.geography.offline=true',
               '--app.desktop.enabled=' + str(desktop).lower()]
    with (data / 'console.log').open('ab') as output:
        process = subprocess.Popen(command, cwd=repo, stdout=output, stderr=subprocess.STDOUT,
                                   creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    children.append(process)
    (data / 'app.pid').write_text(str(process.pid), encoding='ascii')
    return process, Client(port)

def stop(process, data):
    if process.poll() is None:
        process.terminate()
        process.wait(timeout=15)
    (data / 'app.pid').unlink(missing_ok=True)

def scan(client, label):
    def run():
        client.call('/scans', {})
        deadline, last_report = time.monotonic() + 900, 0
        while time.monotonic() < deadline:
            state = client.call('/scans/current')
            if state['state'] != 'running':
                if state['state'] == 'failed':
                    raise RuntimeError(state)
                return state
            if time.monotonic() - last_report > 15:
                print(f'SCAN {label}: discovered={state["discovered"]}, added={state["added"]}', flush=True)
                measured(label + '_browse_during_scan_seconds', lambda: client.call('/photos?size=100&sort=name'))
                last_report = time.monotonic()
            time.sleep(.5)
        raise TimeoutError(label)
    result = measured(label + '_seconds', run)
    (evidence / (label + '.json')).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    return result

def all_photos(client, label):
    result, latencies, page = [], [], 0
    while True:
        begin = time.perf_counter()
        response = client.call(f'/photos?size=200&page={page}&sort=name')
        latencies.append(time.perf_counter() - begin)
        result.extend(response['items'])
        if len(result) >= response['total']:
            break
        page += 1
    timings[label] = {'pages': len(latencies), 'medianSeconds': round(statistics.median(latencies), 3),
                      'p95Seconds': round(sorted(latencies)[int((len(latencies)-1)*.95)], 3)}
    return result

def expect_http(code, action):
    try:
        action()
    except HTTPError as error:
        if error.code == code:
            return
        raise
    raise AssertionError(f'Expected HTTP {code}')

def verify_originals():
    for entry in manifest['entries']:
        file = (fixture / entry['relative']).resolve()
        if not file.is_relative_to(fixture):
            raise ValueError('Fixture path escaped marked directory')
        stat = file.stat()
        if stat.st_size != entry['length'] or stat.st_mtime_ns != entry['mtimeNs'] or hashlib.sha256(file.read_bytes()).hexdigest() != entry['sha256']:
            raise AssertionError('Generated original changed: ' + entry['relative'])

source_process = restore_process = None
completed = False
try:
    source_process, source = start(args.port, source_data)
    restore_process, restored = start(args.restore_port, restored_data, desktop=False)
    check(source.call('/geography/status')['offline'], 'Isolated verification service forces offline mode')
    verify_originals()
    for root in manifest['roots']:
        source.call('/roots', {'path': root})
    first_scan = scan(source, 'initial_scan')
    check(first_scan['added'] == 5001 and first_scan['failed'] == 1, 'Three overlapping roots index 5000 valid photos plus one isolated corrupt record')
    catalog = all_photos(source, 'source_pagination')
    check(len(catalog) == 5001 and len({p['id'] for p in catalog}) == 5001, 'All 26 pages have unique complete IDs')
    valid = [p for p in catalog if p['available']]
    check(len(valid) == 5000, 'All 5000 valid photos are browsable')
    duplicate = [p for p in valid if p['path'] in manifest['duplicates']]
    check(len(duplicate) == 2 and duplicate[0]['id'] != duplicate[1]['id'], 'Identical content at two physical paths remains two photos')
    for extension in ('.jpg', '.png', '.webp'):
        photo = next(p for p in valid if p['fileName'].endswith(extension))
        check(len(source.call('/photos/' + photo['id'] + '/thumbnail', binary=True)) > 0, 'Real packaged thumbnail: ' + extension)
    repeated = scan(source, 'unchanged_scan')
    check(repeated['added'] == 0 and repeated['updated'] == 0 and source.call('/photos')['total'] == 5001, 'Repeated scan retains 5001 rows and reuses valid caches')
    location = source.call('/places', {'name': 'MVP 青海湖', 'province': '青海', 'provinceCode': '630000', 'lat': 36.65058, 'lng': 100.13767})
    categories = [source.call('/categories', {'name': name, 'placeId': location['id']}) for name in ('A 风景', 'B 留念')]
    chosen = [p['id'] for p in valid[:100]]
    measured('classify_100_seconds', lambda: source.call('/photos/classify', {'photoIds': chosen, 'placeId': location['id'], 'categoryIds': [c['id'] for c in categories]}))
    check(all(source.call('/photos?categoryId=' + c['id'])['total'] == 100 for c in categories) and source.call('/photos?placeId=' + location['id'])['total'] == 100, '100 photos belong to two categories without duplicate place results')
    disposable = source.call('/places', {'name': '待删除地点（独立样本）', 'province': '四川', 'provinceCode': '510000', 'lat': 30.5728, 'lng': 104.0668})
    disposable_categories = [source.call('/categories', {'name': name, 'placeId': disposable['id']}) for name in ('临时 A', '临时 B')]
    disposable_ids = [p['id'] for p in valid[100:103]]
    source.call('/photos/classify', {'photoIds': disposable_ids, 'placeId': disposable['id'], 'categoryIds': [c['id'] for c in disposable_categories]})
    expect_http(403, lambda: source.call('/photos/' + chosen[0] + '/reveal', {}, token=False))
    expect_http(404, lambda: source.call('/photos/not-a-photo/reveal', {}))
    check(True, 'Folder reveal requires CSRF and a registered photo ID')
    archive = evidence / 'management-backup.zip'
    archive.write_bytes(measured('backup_export_seconds', lambda: source.call('/backups/export', {}, binary=True)))
    preview = measured('backup_inspect_seconds', lambda: restored.inspect(archive))
    check(preview['manifest']['counts'] == {'roots': 3, 'photos': 5001, 'places': 2, 'categories': 4, 'links': 206}, 'Backup manifest retains complete 5001-photo library and 206 category links')
    measured('backup_restore_seconds', lambda: restored.call('/backups/restore', {'token': preview['token'], 'confirmed': True}))
    before_confirm = restored.call('/photos?size=100')
    check(all(p['availability'] == 'unverified' for p in before_confirm['items']), 'Restored paths require confirmation before any original read')
    for root in restored.call('/overview')['roots']:
        restored.call('/roots/' + root['id'] + '/confirm', {})
    scan(restored, 'restore_cache_rebuild')
    restored_catalog = all_photos(restored, 'restored_pagination')
    expected = {p['id']: (p['placeId'], tuple(sorted(p['categoryIds']))) for p in all_photos(source, 'source_classified_pagination')}
    actual = {p['id']: (p['placeId'], tuple(sorted(p['categoryIds']))) for p in restored_catalog}
    check(expected == actual, 'Restore preserves every photo ID, place and category relationship across 5001 rows')
    missing = next(p for p in restored_catalog if p['id'] == chosen[0])
    file, parked = Path(missing['path']), fixture / 'temporarily-missing.bin'
    if not file.resolve().is_relative_to(fixture) or parked.exists():
        raise ValueError('Invalid generated missing-file fixture')
    file.rename(parked)
    try:
        expect_http(409, lambda: restored.call('/photos/' + missing['id'] + '/reveal', {}))
        scan(restored, 'missing_scan')
        state = restored.call('/photos/' + missing['id'])
        check(not state['available'] and len(state['categoryIds']) == 2, 'Missing generated file keeps ID, place and both categories')
    finally:
        parked.rename(file)
    scan(restored, 'return_scan')
    stop(restore_process, restored_data)
    restore_process, restored = start(args.restore_port, restored_data, desktop=False)
    check(all(restored.call('/photos?categoryId=' + c['id'])['total'] == 100 for c in categories), '100-photo dual-category classification survives real JAR restart')
    expect_http(409, lambda: restored.call('/photos/' + chosen[0] + '/reveal', {}))
    check(True, 'Disabled desktop operation fails clearly while path remains available for copying')
    restored.call('/places/' + disposable['id'], {}, method='DELETE')
    check(all(restored.call('/photos/' + p)['placeId'] is None and restored.call('/photos/' + p)['categoryIds'] == [] for p in disposable_ids), 'Deleting a place returns its three photos to unclassified with category links removed')
    check(restored.call('/photos')['total'] == 5001 and len(restored.call('/overview')['categories']) == 2, 'Place deletion preserves all photo indexes and other place categories')
    expect_http(404, lambda: restored.call('/places/' + disposable['id'], {}, method='DELETE'))
    verify_originals()
    check(True, 'All 5001 generated originals retain paths, timestamps, lengths and SHA256')
    ui_state = {'sourceUrl': source.base, 'sourceData': str(source_data), 'restoreData': str(restored_data), 'fixture': str(fixture),
                'mainPlace': location, 'categories': categories, 'deletePlace': disposable, 'deletePhotoIds': disposable_ids,
                'revealPhoto': next(p for p in valid if p['fileName'].startswith('定位'))}
    (evidence / 'ui-state.json').write_text(json.dumps(ui_state, ensure_ascii=False, indent=2), encoding='utf-8')
    completed = True
finally:
    for process, data in ((restore_process, restored_data), (source_process, source_data)):
        if process is not None and not (completed and args.keep_source and process is source_process):
            stop(process, data)
    (evidence / 'results.json').write_text(json.dumps({'completed': completed, 'checks': checks, 'timings': timings}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Checks={len(checks)}, complete={completed}, evidence={evidence}', flush=True)
