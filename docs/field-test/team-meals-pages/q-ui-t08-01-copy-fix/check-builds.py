"""Read emitted original-config builds; verify all route and preload closures without changing them."""
import hashlib,json,pathlib,posixpath,re,sys
root=pathlib.Path.cwd()
evidence=root/'docs/field-test/team-meals-pages/q-ui-t08-01-copy-fix'
results={}
for mode in ['default','http']:
 dist=pathlib.Path(f'/private/tmp/canteen-q-ui-t08-5049-{mode}')
 graph=json.loads((dist/'bundle-attribution-final.json').read_text())
 (evidence/f'{mode}-graph.json').write_text(json.dumps(graph,indent=2)+'\n')
 chunks={x['file']:x for x in graph}
 def closure(file):
  seen=set()
  def visit(name):
   if name in seen:return
   seen.add(name)
   for dependency in chunks[name]['imports']:visit(dependency)
  visit(file)
  return seen
 checks=[]
 for chunk in graph:
  js=(dist/chunk['file']).read_text()
  match=re.search(r'm\.f=(\[[^\]]*\])',js)
  if not match:continue
  deps=json.loads(match.group(1))
  for selected in re.findall(r'__vite__mapDeps\((\[[0-9,]*\])\)',js):
   files=[posixpath.normpath(posixpath.join(posixpath.dirname(chunk['file']),deps[i])) for i in json.loads(selected) if deps[i].endswith('.js')]
   assert files
   outside=set(files)-closure(files[0])
   checks.append({'caller':chunk['file'],'preloadedJs':files,'outsideStaticClosure':sorted(outside)})
   assert not outside,(chunk['file'],outside)
 totals=json.loads((evidence/f'{mode}.json').read_text())
 assert len(totals['paths'])==11
 for route,value in totals['paths'].items():
  assert value['gzipBytes']<=60000 and value['noSwGzipBytes']<=60000,(mode,route,value)
 assert totals['missingPrecachedJs']==[]
 helper=next(c['file'] for c in graph if any(m['id'].endswith('/pages/shopping-copy.ts') for m in c['modules']))
 assert helper in totals['paths']['purchase']['files']
 assert helper not in totals['paths']['plan']['files']
 results[mode]={'sourceCommit':'5049f0a47c76c4149a91a288a6a9b6edf279b1ea','checks':checks,'shoppingCopyChunk':helper,'all44BudgetChecksPass':True,'artifactHashes':{str(f.relative_to(dist)):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(dist.rglob('*')) if f.is_file() and f.suffix in ['.js','.css','.html']}}
expected=json.loads((evidence/'source-hashes.json').read_text())
assert all(hashlib.sha256((root/f).read_bytes()).hexdigest()==digest for f,digest in expected.items())
(evidence/'preload-validation.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps({mode:{'preloadClosures':len(value['checks']),'shoppingCopyChunk':value['shoppingCopyChunk']} for mode,value in results.items()},indent=2))
