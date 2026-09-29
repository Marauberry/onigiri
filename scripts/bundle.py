"""Portable scene ZIP I/O. Extract only validated media entries, never archive paths."""
import json
from pathlib import Path
import re
import shutil
import sys
import zipfile

action, request_file = sys.argv[1:]
request = json.loads(Path(request_file).read_text(encoding='utf-8'))
if action == 'export':
    with zipfile.ZipFile(request['output'], 'x', compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
        archive.writestr('manifest.json', json.dumps(request['manifest'], ensure_ascii=False))
        for entry in request['files']:
            archive.write(entry['source'], entry['name'])
elif action == 'import':
    folder = Path(request['folder'])
    with zipfile.ZipFile(request['input']) as archive:
        info = archive.getinfo('manifest.json')
        if info.file_size > 10 * 1024 * 1024:
            raise ValueError('Manifest is too large')
        manifest = json.loads(archive.read(info))
        entries = archive.infolist()
        if len(entries) > 2000 or sum(x.file_size for x in entries) > 8 * 1024**3:
            raise ValueError('Package exceeds the import limit')
        names = set()
        for entry in entries:
            if entry.filename == 'manifest.json':
                continue
            if not re.fullmatch(r'media/[a-f0-9]{64}\.(png|jpg|jpeg|webp|bmp|mp4|mov|webm|mkv|wav|mp3|flac|ogg|m4a)', entry.filename):
                raise ValueError('Unexpected archive entry')
            if entry.filename in names:
                raise ValueError('Duplicate archive entry')
            names.add(entry.filename)
            destination = folder / entry.filename.split('/')[1]
            with archive.open(entry) as source, destination.open('xb') as target:
                shutil.copyfileobj(source, target, 1024 * 1024)
        (folder / 'manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
else:
    raise ValueError('Unknown operation')
