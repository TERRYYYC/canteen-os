from pathlib import Path
import hashlib,json,subprocess
R=Path(__file__).resolve().parent
REPO=Path('/Users/terry/Desktop/coding/chief-master/chief-master/canteen-os-team-pages')
HEAD='6bb1ce916c9b4117b6e03db23a78a5d0b9724a10'
def git(*a):return subprocess.check_output(['git','-C',str(REPO),*a])
def sha(b):return hashlib.sha256(b).hexdigest()
out={'reviewerIdentity':'/root/plan_review (original nonauthor)','reviewedHeadSha':HEAD,'packagesTree':git('rev-parse',HEAD+':packages').decode().strip(),'sets':[]}
sets=[('consumed-author','af115810c2097d51e021f1437ef7580eff236d20','q-ui-t01-02-import-fix'),('consumed-browser','fb00e8292bc5e531d1e7c3432516bdb6b7a4ecf7','q-ui-t01-02-browser-green'),('consumed-native-red',HEAD,'q-ui-t01-02-browser-red')]
for dest,commit,name in sets:
 prefix='docs/field-test/team-meals-pages/'+name+'/'
 files=git('ls-tree','-r','--name-only',commit,'--',prefix).decode().splitlines()
 folder=R/dest;folder.mkdir(exist_ok=True)
 for path in files:
  local=folder/path[len(prefix):];local.parent.mkdir(parents=True,exist_ok=True);data=git('show',commit+':'+path)
  if local.exists():assert local.read_bytes()==data
  else:local.write_bytes(data)
 manifest=json.loads((folder/'manifest.json').read_text())
 entries=manifest.get('entries') if 'entries' in manifest else [{'path':k,'sha256':v} for k,v in manifest.items()]
 rows=[]
 for e in entries:
  b=(folder/e['path']).read_bytes();assert sha(b)==e['sha256'],e['path']
  if 'bytes' in e:assert len(b)==e['bytes']
  original=Path(e['original']) if 'original' in e else REPO/prefix/e['path']
  assert original.read_bytes()==b,original
  rows.append({'path':e['path'],'bytes':len(b),'sha256':sha(b),'gitAndOriginalMatch':True,'original':str(original)})
 assert set(files)=={prefix+e['path'] for e in entries}|{prefix+'manifest.json'}
 assert git('diff','--name-only',HEAD,commit,'--','packages')==b''
 out['sets'].append({'name':dest,'evidenceCommit':commit,'gitPrefix':prefix,'packagesUnchanged':True,'manifestSha256':sha((folder/'manifest.json').read_bytes()),'count':len(rows),'entries':rows})
metadata=json.loads((R/'consumed-browser/green-source-integrity.json').read_text());assert metadata['head']==HEAD;assert metadata['packagesTree']==out['packagesTree'];assert len(metadata['sourceIntegrity'])==58
for row in metadata['sourceIntegrity']:assert sha(git('show',HEAD+':'+row['file']))==row['sha256']
author=json.loads((R/'consumed-author/source-hashes.json').read_text())
# Source receipt is a mapping of tracked path to SHA256.
for path,digest in author.items():assert sha(git('show',HEAD+':'+path))==digest
assert len(author)==5
out['capturedBrowserSourcesVerified']=58;out['authorSourcesVerified']=5
(R/'reviewer-custody.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'reviewedHeadSha':HEAD,'sets':[{k:v for k,v in s.items() if k!='entries'} for s in out['sets']],'browserSourceCount':58,'authorSourceCount':5},indent=2))
