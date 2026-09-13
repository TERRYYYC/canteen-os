import pathlib,json,hashlib,subprocess
p=pathlib.Path('/private/tmp/canteen-bundle-d1-review-df992aa');repo='/Users/terry/Desktop/coding/chief-master/chief-master/canteen-os-team-pages';head='df992aad3807638c2ef1a092cdb38d01b9d60f6d'; rows=[]
for part in ['bundle-d1','bundle-d1-browser']:
 d=p/'docs/field-test/team-meals-pages'/part;m=json.loads((d/'manifest.json').read_text());fail=[]
 if isinstance(m,dict):m=[{'path':k,**v} for k,v in m.items()]
 for e in m:
  f=d/e['path'];a=f.read_bytes();g=subprocess.check_output(['git','-C',repo,'show',head+':'+str(f.relative_to(p))]);
  if hashlib.sha256(a).hexdigest()!=e['sha256'] or a!=g:fail.append(e['path'])
 rows.append({'group':part,'count':len(m),'failures':fail})
sources=[]
for f in sorted((p/'packages/web/src').rglob('*')):
 if not f.is_file():continue
 a=f.read_bytes();q=f.relative_to(p);g=subprocess.check_output(['git','-C',repo,'show',head+':'+str(q)]);b=p/'browser-web/src'/f.relative_to(p/'packages/web/src');sources.append({'path':str(q),'sha256':hashlib.sha256(a).hexdigest(),'gitEqual':a==g,'browserEqual':a==b.read_bytes()})
(p/'reviewer-source-evidence.json').write_text(json.dumps({'manifests':rows,'sources':sources},indent=2)+'\n');print(rows);print('sources',len(sources),'allEqual',all(r['gitEqual'] and r['browserEqual'] for r in sources))
assert not any(r['failures'] for r in rows)
assert all(r['gitEqual'] and r['browserEqual'] for r in sources)
