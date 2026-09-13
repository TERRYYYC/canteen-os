from pathlib import Path
import json,hashlib,subprocess
p=Path.cwd();repo='/Users/terry/Desktop/coding/chief-master/chief-master/canteen-os-team-pages';target='7920496e06996eedac6e08e862fa097453ed9462';oldHead='df992aad3807638c2ef1a092cdb38d01b9d60f6d';production='734e295edbfa03b360e0052a782f8b5c6f0c980c';accepted='b5ccc0abad0bc07fd783b40e880321372c44b384';source='docs/design/team-meals-pages/APP-BUNDLE-D1-contract.md'
def sha(b):return hashlib.sha256(b).hexdigest()
def git(*args):return subprocess.check_output(['git','-C',repo,*args])
originalManifest=p/'reviewer-artifact-manifest.json';manifest=json.loads(originalManifest.read_text());bad=[e['path'] for e in manifest if sha((p/e['path']).read_bytes())!=e['sha256']]
emitted=json.loads((p/'reviewer-emitted-sha256.json').read_text());emittedBad=[e['path'] for e in emitted if sha((p/e['path']).read_bytes())!=e['sha256']]
comparison=[]
for config in ['default','http']:
 a=p/f'reviewer-budget-{config}.json';b=p/f'reviewer-budget-{config}-corrected.json';old=json.loads(a.read_text());new=json.loads(b.read_text());assert old['reviewedHeadSha']==oldHead and new['reviewedHeadSha']==target
 x=dict(old);y=dict(new);x.pop('reviewedHeadSha');y.pop('reviewedHeadSha')
 metadata=p/f'build-{config}/bundle-attribution-final.json';meta=json.loads(metadata.read_text());modulePaths=sorted(set(m['id'] for chunk in meta for m in chunk['modules'] if str(p/'packages/web/src') in m['id']))
 row={'configuration':config,'original':str(a.relative_to(p)),'corrected':str(b.relative_to(p)),'originalSha256':sha(a.read_bytes()),'correctedSha256':sha(b.read_bytes()),'equalAfterRemovingOnlyReviewedHeadSha':x==y,'wholeFileEqualAfterOnlyExpectedLiteralReplacement':a.read_bytes().replace(oldHead.encode(),target.encode(),1)==b.read_bytes(),'consoleOutputByteEqual':(p/f'reviewer-budget-{config}.log').read_bytes()==(p/f'reviewer-budget-{config}-corrected.log').read_bytes(),'graphMetadataSha256':sha(metadata.read_bytes()),'graphModulesInExactReviewArchive':modulePaths,'routes':len(new['routes']),'precacheMissing':new['missingPrecache']}
 assert row['equalAfterRemovingOnlyReviewedHeadSha'] and row['wholeFileEqualAfterOnlyExpectedLiteralReplacement'] and row['consoleOutputByteEqual'];comparison.append(row)
src=[]
for f in sorted((p/'packages/web/src').rglob('*')):
 if not f.is_file():continue
 path=str(f.relative_to(p));data=f.read_bytes();src.append({'path':path,'sha256':sha(data),'equalExactGit':data==git('show',target+':'+path)})
originalTool=(p/'reviewer-graph.mjs').read_bytes();correctedTool=(p/'reviewer-graph-metadata-corrected.mjs').read_bytes();assert originalTool.replace(oldHead.encode(),target.encode(),1)==correctedTool
feda=git('rev-parse','feda').decode().strip();r={'reviewerIdentity':'/root/plan_review','reviewedHeadSha':target,'productionEquivalentSha':production,'acceptedSourceRef':source,'acceptedRevision':accepted,'originalManifestSha256':sha(originalManifest.read_bytes()),'originalManifestEntries':len(manifest),'originalManifestMismatches':bad,'emittedJsFiles':len(emitted),'emittedHashMismatches':emittedBad,'toolOnlyExpectedTargetLiteralChanged':True,'comparisons':comparison,'sources':src,'sourceFileCount':len(src),'sourceEqualsAccepted':(p/source).read_bytes()==git('show',accepted+':'+source),'targetEqualsProductionPackages':not git('diff',target,production,'--','packages'),'finalRootEvidenceSha':feda,'finalRootEvidencePackagesEqualReviewedTarget':not git('diff',target,feda,'--','packages'),'finalRootAcceptedSourceRevision':git('log','-1','--format=%H',feda,'--',source).decode().strip()}
assert not bad and not emittedBad and all(e['equalExactGit'] for e in src);assert r['sourceEqualsAccepted'] and r['targetEqualsProductionPackages'] and r['finalRootEvidencePackagesEqualReviewedTarget'] and r['finalRootAcceptedSourceRevision']==accepted
(p/'reviewer-metadata-correction-verification.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({k:v for k,v in r.items() if k not in ['sources','comparisons']},indent=2));print('Both corrected reports differ from originals only at reviewedHeadSha; all 52 emitted hashes unchanged.')
