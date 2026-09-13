from pathlib import Path
import json, hashlib, subprocess

ROOT=Path(__file__).resolve().parent
REPO=Path('/Users/terry/Desktop/coding/chief-master/chief-master/canteen-os-team-pages')
HEAD='5049f0a47c76c4149a91a288a6a9b6edf279b1ea'
BASE='842b778bd352c0dba8921584ce142d94665e5ca2'
ACCEPTED='71fd5663ffddc2161ad2c48f1987e9ea2957147a'
BROWSER='eb42e575b8cce463ff34653d9382e7b58eea60d5'
AUTHOR='e6aef33e8f9e910c6f5d17b5a4e0b85030194a44'
def git(*args): return subprocess.check_output(['git',*args],cwd=REPO)
def sha(raw): return hashlib.sha256(raw).hexdigest()
def save(path,obj): (ROOT/path).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
paths=git('ls-tree','-r','--name-only',HEAD,'packages').decode().splitlines()
package_integrity=[]
for path in paths:
    expected=git('show',HEAD+':'+path)
    actual=(ROOT/path).read_bytes()
    assert actual==expected,path
    package_integrity.append({'path':path,'sha256':sha(actual)})
changed=git('diff','--name-only',BASE,HEAD,'--','packages').decode().splitlines()
contract='docs/field-test/team-meals-pages/Q-UI-T08-01-contract.md'
assert (ROOT/contract).read_bytes()==git('show',ACCEPTED+':'+contract)
assert not git('diff',HEAD,BROWSER,'--','packages')
assert not git('diff',HEAD,AUTHOR,'--','packages')

# Preserve committed author input exactly, including intermediate failures.
custody={}
for label,commit,directory in [('browser',BROWSER,'q-ui-t08-01-browser'),('author',AUTHOR,'q-ui-t08-01-copy-fix')]:
    prefix='docs/field-test/team-meals-pages/'+directory
    target=ROOT/('consumed-'+label);target.mkdir(exist_ok=True)
    files=git('ls-tree','-r','--name-only',commit,prefix).decode().splitlines()
    rows=[]
    for file in files:
        rel=file[len(prefix)+1:];raw=git('show',commit+':'+file)
        destination=target/rel;destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(raw)
        rows.append({'path':file,'bytes':len(raw),'sha256':sha(raw)})
    manifest=json.loads((target/'manifest.json').read_text())
    entries=manifest.get('entries',manifest.get('files'))
    if entries is None:
        assert all(isinstance(value,str) and len(value)==64 for value in manifest.values())
        entries=[{'path':key,'sha256':value} for key,value in manifest.items()]
    if label=='browser':
        for row in entries:
            raw=(target/row['path']).read_bytes()
            assert sha(raw)==row['sha256'] and len(raw)==row['bytes'],row['path']
            assert Path(row['original']).read_bytes()==raw,row['original']
    else:
        for row in entries:
            raw=(target/row['path']).read_bytes()
            assert sha(raw)==row['sha256'],row['path']
    custody[label]={'commit':commit,'copiedFiles':rows,'manifestEntriesChecked':len(entries),'manifestSha256':sha((target/'manifest.json').read_bytes())}

metadata=json.loads((ROOT/'consumed-browser/fixed-source-integrity.json').read_text())
assert metadata['head']==HEAD
assert len(metadata['sourceIntegrity'])==57
for row in metadata['sourceIntegrity']:
    assert sha(git('show',HEAD+':'+row['file']))==row['sha256']
    actual=Path(metadata['root'])/'web'/row['file'].removeprefix('packages/web/')
    assert sha(actual.read_bytes())==row['sha256']

emitted={};budget=[]
for config in ['default','http']:
    folder=ROOT/('build-'+config)
    emitted[config]=[{'file':str(p.relative_to(folder)),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in sorted(folder.rglob('*.js'))]
    data=json.loads((ROOT/('reviewer-budget-'+config+'.json')).read_text())
    assert data['reviewedHeadSha']==HEAD and data['node']=='v20.20.2'
    assert data['staticDynamicGraphs']==24 and not data['missingPrecache']
    assert len(data['precache'])==52
    for route,value in data['routes'].items():
        for mode in ['normalSW','noSW']:
            assert value[mode]['gzipBytes']<=60000
            budget.append({'config':config,'route':route,'mode':mode,'gzipBytes':value[mode]['gzipBytes']})
    graph=json.loads((folder/'bundle-attribution-final.json').read_text())
    copy_chunks=[x['file'] for x in graph if any(m['id'].endswith('/src/pages/shopping-copy.ts') for m in x['modules'])]
    assert len(copy_chunks)==1 and copy_chunks[0] in data['routes']['purchase']['normalSW']['files']
    assert copy_chunks[0] not in data['routes']['plan']['normalSW']['files']
assert len(budget)==44
save('reviewer-emitted-sha256.json',{'reviewedHeadSha':HEAD,'configurations':emitted})
save('reviewer-integrity.json',{'reviewerIdentity':'Codex /root/plan_review (original nonauthor)','reviewedHeadSha':HEAD,'baseSha':BASE,'acceptedSourceRef':contract,'acceptedRevision':ACCEPTED,'acceptedSourceSha256':sha(git('show',ACCEPTED+':'+contract)),'packagesTree':git('rev-parse',HEAD+':packages').decode().strip(),'trackedPackageFilesUnchanged':len(paths),'packageIntegrity':package_integrity,'changedPackages':changed,'evidenceCustody':custody,'browserSourceFiles':57,'budgetCombinations':budget})
print(json.dumps({'reviewedHeadSha':HEAD,'trackedPackageFilesUnchanged':len(paths),'browserOriginals':custody['browser']['manifestEntriesChecked'],'authorOriginals':custody['author']['manifestEntriesChecked'],'browserSourceFiles':57,'budgetCombinations':len(budget),'emittedJsPerConfig':{k:len(v) for k,v in emitted.items()}},indent=2))
