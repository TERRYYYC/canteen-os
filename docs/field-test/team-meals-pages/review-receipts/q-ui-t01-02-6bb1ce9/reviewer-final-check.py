from pathlib import Path
import hashlib,json,subprocess
P=Path(__file__).resolve().parent
H='6bb1ce916c9b4117b6e03db23a78a5d0b9724a10'
def read(f):return json.loads((P/f).read_text())
def sha(b):return hashlib.sha256(b).hexdigest()
checks=[]
def check(name,v):
 assert v,name
 checks.append({'name':name,'pass':True})
result=read('reviewer-browser-recomputed.json');orig=read('consumed-browser/browser-results.json')
check('all 15 consumed browser predicates recompute identically',result==orig and result['sourceCommit']==H)
ledger=read('consumed-browser/green-ledger.json')['requests'];writes=[r for r in ledger if r['method']=='POST'];sources=[r for r in ledger if r['path'].startswith('/source/')]
check('7 recorded requests, one Source read, exactly 2 explicit writes',len(ledger)==7 and len(sources)==1 and len(writes)==2)
check('first write retains original Source blob lock',writes[0]['ifMatch']==sources[0]['response']['blobSha'] and writes[0]['ifNoneMatch'] is None)
check('held old write snapshots exactly 5 rows before sixth later import',len(writes[1]['body']['meals'])==5 and len(read('consumed-browser/green-held-after-release.json')['rows'])==6)
allrows=read('consumed-browser/green-all-dates.json')['rows']
check('recorded original dinner count 2 preserved',any(r['dish']=='name-only' and r['servings']=='2' for r in allrows))
meta=read('consumed-browser/green-source-integrity.json')
check('browser source metadata pins exact 58 files and Node20',meta['head']==H and len(meta['sourceIntegrity'])==58 and meta['node']=='v20.20.2')
intg=read('reviewer-source-integrity.json');check('post-check tracked package files remain same',all(sha((P/x['path']).read_bytes())==x['sha256'] for x in intg['packageIntegrity']))
emitted=read('reviewer-emitted-sha256.json');check('all 52 emitted JS bytes remain measured bytes',emitted['reviewedHeadSha']==H and all(sha((P/('build-'+mode)/e['file']).read_bytes())==e['sha256'] for mode,es in emitted['configurations'].items() for e in es))
author=read('consumed-author/summary.json')
for mode in ['default','http']:
 b=read('reviewer-budget-'+mode+'.json')
 check(mode+' exact current SHA/Node20 metadata',b['reviewedHeadSha']==H and b['node']=='v20.20.2')
 check(mode+' all 22 independently measured route bytes agree with author',all(r['normalSW']['gzipBytes']==author[mode]['paths'][name]['gzipBytes'] and r['noSW']['gzipBytes']==author[mode]['paths'][name]['noSwGzipBytes'] for name,r in b['routes'].items()))
 check(mode+' 11 route budgets within 60000 and no missing precache',len(b['routes'])==11 and all(r['within60000'] for r in b['routes'].values()) and b['missingPrecache']==[])
for f in ['reviewer-runtime.json','reviewer-source-integrity.json','reviewer-custody.json','reviewer-dependency-continuity.json']:
 check(f+' current verification head',read(f)['reviewedHeadSha']==H)
out={'reviewerIdentity':'Codex /root/plan_review (original nonauthor)','reviewedHeadSha':H,'browserReceiptChecksRecomputed':15,'checks':checks,'summary':f'{len(checks)}/{len(checks)}','boundary':'Stored root-operated browser receipts and fixed emitted artifacts; this command starts no browser, rebuild or test matrix.'}
(P/'reviewer-final-check.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print(json.dumps(out,ensure_ascii=False,indent=2))
