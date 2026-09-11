from pathlib import Path
import json,hashlib,subprocess,sys
p=Path(__file__).resolve().parent/'consumed-browser'
checks=[]
def check(name,value):
 checks.append({'name':name,'pass':bool(value)})
 if not value:raise AssertionError(name)
def read(name):return json.loads((p/(name+'.json')).read_text())
def row(capture,date,dish='first-dish'):
 return next(x for x in capture['rows'] if x['slot'].startswith(date) and x['dish']==dish)
a=read('green-before');b=read('green-after');allrows=read('green-all-dates')
check('initial unsaved eleven is visible',row(a,'2026-09-14')['servings']=='11')
check('unrelated import retains eleven',row(b,'2026-09-14')['servings']=='11')
check('import returns to original day filter',next(x['value'] for x in b['selects'] if x.get('focus')=='range')=='day')
check('new unrelated meal count remains omitted',row(allrows,'2026-09-15')['servings']=='')
check('original omitted count stays omitted',row(allrows,'2026-09-14','second-dish')['servings']=='')
r=read('green-raw-before');m=read('green-raw-moved');e=read('green-explicit')
check('invalid raw numeric text observed',row(r,'2026-09-14')['servings']=='13.7' and row(r,'2026-09-14')['invalid']=='true')
check('raw invalid follows original row through earlier-date sort',row(m,'2026-09-14')['servings']=='13.7' and row(m,'2026-09-14')['invalid']=='true' and row(m,'2026-09-14')['index']!=row(r,'2026-09-14')['index'])
check('explicit matching import replaces invalid override',row(e,'2026-09-14')['servings']=='7' and row(e,'2026-09-14')['invalid']!='true')
h=read('green-held-before-release');f=read('green-held-after-release')
check('imported new row is present while original save pending',row(h,'2026-09-16')['servings']=='' and h['phase']=='saving')
check('old save acknowledgement does not clean later import',row(f,'2026-09-16')['servings']=='' and f['phase']=='dirty')
ledger=read('green-ledger');writes=[x for x in ledger['requests'] if x['method']=='POST']
check('only two explicit saves wrote to Worker',len(writes)==2 and all(x['path']=='/plan/team-week' and x['status']==200 for x in writes))
check('initial explicit save transmitted eight',writes[0]['body']['meals'][0]['plannedServings']==8)
check('held save retained acknowledged original condition',writes[1]['ifMatch']==writes[0]['response']['blobSha'] and writes[1]['ifNoneMatch'] is None)
check('later imported row never entered the already-dispatched request',not any(x['date']=='2026-09-16' for x in writes[1]['body']['meals']) and writes[1].get('held') and writes[1].get('released'))
metadata=read('green-source-integrity');repo='/Users/terry/Desktop/coding/chief-master/chief-master/canteen-os-team-pages'
for source in metadata['sourceIntegrity']:
 data=subprocess.check_output(['git','show',metadata['head']+':'+source['file']],cwd=repo)
 assert hashlib.sha256(data).hexdigest()==source['sha256']
check('all captured Web production sources match reviewed Git code',len(metadata['sourceIntegrity'])>57)
result={'sourceCommit':metadata['head'],'packagesTree':metadata['packagesTree'],'node':metadata['node'],'boundary':metadata['boundary'],'checks':checks,'summary':str(len(checks))+'/'+str(len(checks))}
(p.parent/'reviewer-browser-recomputed.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False,indent=2))
