"""Read emitted original-config builds; verify all route and preload closures without changing them."""
import hashlib,json,pathlib,posixpath,re,sys
root=pathlib.Path.cwd()
evidence=root/'docs/field-test/team-meals-pages/q-ui-t01-02-import-fix'
results={}
for mode in ['default','http']:
 dist=pathlib.Path(f'/private/tmp/canteen-q-t01-6bb1-{mode}')
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
 helper=next(c['file'] for c in graph if any(m['id'].endswith('/pages/admin/plan-import.ts') for m in c['modules']))
 assert helper in totals['paths']['plan']['files'] and helper in totals['paths']['import']['files']
 plan_modules={m['id'] for file in totals['paths']['plan']['files'] for m in chunks[file]['modules']}
 import_modules={m['id'] for file in totals['paths']['import']['files'] for m in chunks[file]['modules']}
 assert not any(name.endswith('/pages/admin/import.ts') for name in plan_modules)
 # The approved baseline already shares parse-plan-text's date helpers with Plan.
 # Check that this change adds no parser module or parser bytes, rather than hiding that history.
 baseline=root/'docs/field-test/team-meals-pages/q-ui-t08-01-copy-fix'
 old_graph={c['file']:c for c in json.loads((baseline/f'{mode}-graph.json').read_text())}
 old_totals=json.loads((baseline/f'{mode}.json').read_text())
 old_parser={f for f in old_totals['paths']['plan']['files'] if any('/core/src/import/' in m['id'] for m in old_graph[f]['modules'])}
 parser={f for f in totals['paths']['plan']['files'] if any('/core/src/import/' in m['id'] for m in chunks[f]['modules'])}
 assert parser==old_parser
 old_hashes=json.loads((baseline/'preload-validation.json').read_text())[mode]['artifactHashes']
 assert all(hashlib.sha256((dist/f).read_bytes()).hexdigest()==old_hashes[f] for f in parser)
 assert not any(name.endswith('/pages/admin/plan.ts') or name.endswith('/pages/admin/plan-form.ts') for name in import_modules)
 results[mode]={'sourceCommit':'6bb1ce916c9b4117b6e03db23a78a5d0b9724a10','checks':checks,'callbackConnectionChunk':helper,'budgetCombinations':22,'noReversePageDependency':True,'unchangedBaselineParserFiles':sorted(parser),'artifactHashes':{str(f.relative_to(dist)):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(dist.rglob('*')) if f.is_file() and f.suffix in ['.js','.css','.html']}}
expected=json.loads((evidence/'source-hashes.json').read_text())
assert all(hashlib.sha256((root/f).read_bytes()).hexdigest()==digest for f,digest in expected.items())
(evidence/'preload-validation.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps({mode:{'preloadClosures':len(value['checks']),'callbackConnectionChunk':value['callbackConnectionChunk']} for mode,value in results.items()},indent=2))
