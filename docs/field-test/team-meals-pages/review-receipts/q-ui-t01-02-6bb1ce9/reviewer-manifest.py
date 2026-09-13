from pathlib import Path
import hashlib,json
P=Path(__file__).resolve().parent
H='6bb1ce916c9b4117b6e03db23a78a5d0b9724a10'
exclude={'reviewer-artifact-manifest.json','reviewer-manifest-check.log'}
files={p for p in P.glob('reviewer-*') if p.is_file() and p.name not in exclude}
files.update(P/f for f in ['REVIEW.md','VERDICT.json','COMMANDS.md','packages/web/test/reviewer-q-t01.test.mjs','packages/web/test/team-meals-pages-plan-import.test.mjs','packages/web/src/pages/admin/plan.ts','packages/web/src/pages/admin/plan-form.ts','packages/web/src/pages/admin/plan-import.ts','packages/web/src/pages/admin/import.ts','docs/field-test/team-meals-pages/Q-UI-T01-02-contract.md','docs/design/team-meals-pages/D0-contract.md'])
for folder in ['consumed-author','consumed-browser','consumed-native-red','docs/field-test/team-meals-pages/q-ui-t01-02']:
 files.update(p for p in (P/folder).rglob('*') if p.is_file())
for mode in ['default','http']:
 build=P/('build-'+mode)
 files.update(build/f for f in ['index.html','bundle-attribution.json','bundle-attribution-final.json','manifest.webmanifest'])
 files.update(p for p in build.rglob('*') if p.is_file() and p.suffix in ['.js','.css'])
entries=[]
for p in sorted(files):
 b=p.read_bytes();entries.append({'path':str(p.relative_to(P)),'original':str(p),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
out={'reviewerIdentity':'Codex /root/plan_review (original nonauthor)','reviewedHeadSha':H,'reviewSubjectRef':'task:01a08db7-43f3-7952-adb5-75106389e557/Q-UI-T01-02','acceptedSourceRef':'docs/field-test/team-meals-pages/Q-UI-T01-02-contract.md','acceptedRevision':'85be50155723114256d8e597160e7db7a8c2995a','verdict':'APPROVE','entryCount':len(entries),'entries':entries}
manifest=P/'reviewer-artifact-manifest.json';manifest.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
for e in entries:
 b=(P/e['path']).read_bytes();assert len(b)==e['bytes'] and hashlib.sha256(b).hexdigest()==e['sha256'],e['path']
result={'reviewedHeadSha':H,'verifiedEntries':len(entries),'manifestSha256':hashlib.sha256(manifest.read_bytes()).hexdigest(),'reportSha256':hashlib.sha256((P/'REVIEW.md').read_bytes()).hexdigest(),'verdictSha256':hashlib.sha256((P/'VERDICT.json').read_bytes()).hexdigest(),'manifestExcludes':['reviewer-artifact-manifest.json','reviewer-manifest-check.log'],'pass':True}
print(json.dumps(result,ensure_ascii=False,indent=2))
