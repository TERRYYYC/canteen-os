from pathlib import Path
import json,hashlib
p=Path(__file__).resolve().parent
base=Path('/private/tmp/canteen-q-t08-review-5049f0a')
out={'reviewedHeadSha':'6bb1ce916c9b4117b6e03db23a78a5d0b9724a10','baselineHeadSha':'5049f0a47c76c4149a91a288a6a9b6edf279b1ea','configurations':{}}
for mode in ['default','http']:
 old=json.loads((base/f'build-{mode}/bundle-attribution-final.json').read_text());new=json.loads((p/f'build-{mode}/bundle-attribution-final.json').read_text())
 oldr=json.loads((base/f'reviewer-budget-{mode}.json').read_text());newr=json.loads((p/f'reviewer-budget-{mode}.json').read_text())
 def modules(graph,files,archive):
  return sorted(set(m['id'].replace(str(archive),'<ARCHIVE>') for c in graph if c['file'] in files for m in c['modules']))
 delta={}
 for route in ['plan','import']:
  prior=modules(old,oldr['routes'][route]['normalSW']['files'],base);current=modules(new,newr['routes'][route]['normalSW']['files'],p)
  delta[route]={'addedModules':sorted(set(current)-set(prior)),'removedModules':sorted(set(prior)-set(current))}
  assert delta[route]['addedModules']==['<ARCHIVE>/packages/web/src/pages/admin/plan-import.ts'],delta[route]
  assert not delta[route]['removedModules']
 oldparse=next(c for c in old if 'parse-plan-text-' in c['file']);newparse=next(c for c in new if 'parse-plan-text-' in c['file'])
 a=(base/f'build-{mode}'/oldparse['file']).read_bytes();b=(p/f'build-{mode}'/newparse['file']).read_bytes()
 assert a==b and oldparse['file']==newparse['file']
 helper=[c for c in new if any(m['id'].endswith('/pages/admin/plan-import.ts') for m in c['modules'])];assert len(helper)==1
 out['configurations'][mode]={'routeModuleDelta':delta,'preexistingParserChunk':newparse['file'],'parserChunkByteIdentical':True,'parserChunkSha256':hashlib.sha256(b).hexdigest(),'helperChunk':helper[0]['file']}
(p/'reviewer-dependency-continuity.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out,indent=2))
