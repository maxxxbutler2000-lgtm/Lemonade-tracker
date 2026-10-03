"""Export a private D1/R2 snapshot for PostgreSQL import. No network requests.
Stop the legacy preview first if records are being edited while exporting.
"""
import argparse, json, sqlite3, shutil, tempfile
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('--state',required=True,help='Legacy .wrangler/state directory')
parser.add_argument('--output',required=True,help='Private backup directory (never commit this)')
args=parser.parse_args();root=Path(args.state)/'v3';out=Path(args.output)
if out.exists():raise SystemExit('Choose a new output directory; an existing backup will not be overwritten.')
out.mkdir(parents=True,mode=0o700)

def copied_connection(path,temp):
    target=Path(temp)/path.name
    shutil.copy2(path,target)
    for suffix in ['-wal','-shm']:
        extra=Path(str(path)+suffix)
        if extra.exists():shutil.copy2(extra,Path(str(target)+suffix))
    return sqlite3.connect(target)

with tempfile.TemporaryDirectory() as temp:
    found=False
    for path in (root/'d1/miniflare-D1DatabaseObject').glob('*.sqlite'):
        c=copied_connection(path,temp)
        tables={r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if {'products','sessions','sales','items'}<=tables:
            if found:raise SystemExit('Multiple stand databases found; export the chosen database separately.')
            with sqlite3.connect(out/'stand.sqlite') as dest:c.backup(dest)
            found=True
        c.close()
    if not found:raise SystemExit('No stand database found in that state directory.')
    stand=sqlite3.connect(out/'stand.sqlite')
    wanted={r[0] for r in stand.execute('SELECT photo FROM sales WHERE photo IS NOT NULL')};stand.close()
    manifest={}
    for path in (root/'r2/miniflare-R2BucketObject').glob('*.sqlite'):
        c=copied_connection(path,temp)
        if c.execute("SELECT 1 FROM sqlite_master WHERE name='_mf_objects'").fetchone():
            for key,blob,metadata in c.execute('SELECT key,blob_id,http_metadata FROM _mf_objects'):
                if key not in wanted:continue
                sources=list((root/'r2').glob('*/blobs/'+blob))
                if len(sources)!=1:raise SystemExit('Could not locate an attached photo blob.')
                file=Path('photos')/str(len(manifest));(out/file.parent).mkdir(exist_ok=True)
                shutil.copy2(sources[0],out/file)
                manifest[key]={'path':str(file),'contentType':json.loads(metadata).get('contentType')}
        c.close()
    if set(manifest)!=wanted:raise SystemExit('Some attached photos were missing. Keep the source state and retry after stopping the preview.')
    (out/'photos.json').write_text(json.dumps(manifest,indent=2))
    for file in out.rglob('*'):
        if file.is_file():file.chmod(0o600)
print('Private backup saved. Import stand.sqlite with the photos.json manifest. Do not upload or commit the backup as source code.')
