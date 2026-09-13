from pathlib import Path
import json,hashlib,subprocess
p=Path.cwd();repo='/Users/terry/Desktop/coding/chief-master/chief-master/canteen-os-team-pages';head='7920496e06996eedac6e08e862fa097453ed9462';base='df992aad3807638c2ef1a092cdb38d01b9d60f6d';prod='734e295edbfa03b360e0052a782f8b5c6f0c980c';source='docs/design/team-meals-pages/APP-BUNDLE-D1-contract.md';accepted='b5ccc0abad0bc07fd783b40e880321372c44b384'
def sha(a):return hashlib.sha256(a).hexdigest()
def git(*args):return subprocess.check_output(['git','-C',repo,*args])
rows=[]
for part in ['bundle-d1-route-fix','bundle-d1-route-browser']:
 d=p/'docs/field-test/team-meals-pages'/part;m=json.loads((d/'manifest.json').read_text());fail=[]
 if isinstance(m,dict):m=[{'path':k,**v} for k,v in m.items()]
 for e in m:
  f=d/e['path'];a=f.read_bytes()
  if sha(a)!=e['sha256'] or a!=git('show',head+':'+str(f.relative_to(p))):fail.append(e['path'])
 rows.append({'group':part,'count':len(m),'failures':fail})
src=json.loads((p/'docs/field-test/team-meals-pages/bundle-d1-route-browser/source-integrity.json').read_text());sourceFail=[]
for f in src['src']:
 if sha(git('show',head+':'+f['path']))!=f['sha256'] or sha((p/f['path']).read_bytes())!=f['sha256']:sourceFail.append(f['path'])
old=Path('/private/tmp/canteen-bundle-d1-review-df992aa');m=json.loads((old/'reviewer-artifact-manifest.json').read_text());receipt=p/'docs/field-test/team-meals-pages/review-receipts/bundle-d1-df992aa';receiptFail=[]
for e in m:
 if sha((old/e['path']).read_bytes())!=e['sha256'] or sha((receipt/e['path']).read_bytes())!=e['sha256']:receiptFail.append(e['path'])
contract=(p/source).read_bytes();r={'head':head,'production':prod,'packagesEqualProduction':not git('diff',prod,head,'--','packages'),'acceptedSource':source,'acceptedRevision':accepted,'actualSourceRevision':git('log','-1','--format=%H',head,'--',source).decode().strip(),'sourceEqualsAccepted':contract==git('show',accepted+':'+source),'sourceSha256':sha(contract),'authorManifests':rows,'authorBrowserSourceCount':len(src['src']),'authorBrowserSourceFailures':sourceFail,'oldReceiptCount':len(m),'oldArchiveAndReceiptFailures':receiptFail,'oldReportSha256':sha((old/'REVIEW.md').read_bytes()),'originalProbeByteEqual':(p/'packages/web/test/reviewer-d1-owner.test.mjs').read_bytes()==(old/'packages/web/test/reviewer-d1-owner.test.mjs').read_bytes(),'originalProbeSha256':sha((p/'packages/web/test/reviewer-d1-owner.test.mjs').read_bytes()),'packagesDiff':git('diff','--name-status',base,head,'--','packages').decode()}
(p/'reviewer-integrity.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r,indent=2));assert r['packagesEqualProduction'] and r['sourceEqualsAccepted'] and r['actualSourceRevision']==accepted and r['originalProbeByteEqual'];assert not (sourceFail or receiptFail or any(x['failures'] for x in rows))
