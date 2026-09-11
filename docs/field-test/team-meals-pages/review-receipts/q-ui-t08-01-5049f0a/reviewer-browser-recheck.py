from pathlib import Path
import json,re,hashlib,subprocess
p=Path(__file__).resolve().parent/'consumed-browser'
metadata=json.loads((p/'fixed-source-integrity.json').read_text())
assert metadata['head']=='5049f0a47c76c4149a91a288a6a9b6edf279b1ea'
checks=[]
def check(name,condition):
 checks.append({'name':name,'pass':bool(condition)})
 if not condition: raise AssertionError(name)
revision=metadata['fixtureRevision']
labels={
 'zh':{'groups':['待核对','待买','已有','已买'],'source':'使用来源:','missing':['尚未录入配料','采购规格未录','计划份数未录','配方基准份数未录','原用量未录'],'taste':'原配方用量: 适量','unknown':'原配方用量: 用量未录','budget':'不代表完整预算'},
 'en':{'groups':['Check','Buy','Available','Bought'],'source':'Used in:','missing':['Ingredients not recorded','Purchase specification missing','Planned servings missing','Recipe servings missing','Recipe quantity missing'],'taste':'Original recipe quantity: To taste','unknown':'Original recipe quantity: Quantity not recorded','budget':'not a complete budget'},
 'uk':{'groups':['Перевірити','Купити','Є в наявності','Куплено'],'source':'Використовується в:','missing':['Інгредієнти не записано','Закупівельні параметри не записано','Порції в плані не вказано','Порції рецепта не вказано','Кількість рецепта не вказано'],'taste':'Початкова кількість рецепта: За смаком','unknown':'Початкова кількість рецепта: Кількість не записано','budget':'не повним бюджетом'},
}
for lang,l in labels.items():
 n=(p/f'native-{lang}.txt').read_text();fallback=(p/f'fallback-{lang}.txt').read_text();lines=n.splitlines()
 check(lang+' native clipboard equals rejected clipboard textarea byte-for-byte',n==fallback)
 check(lang+' selected list scope and full original basis',all(x in n for x in ['d-copy-all',revision,'2026-09-14','2026-09-15','team-week']))
 check(lang+' four current decision groups',all(x in lines for x in l['groups']))
 check(lang+' same-name IDs remain distinct current items',all(len([x for x in lines if x.startswith('  ')==False and f'[{i}] — ' in x])==1 for i in ['tomato-other','cooking-oil','salt','tomato']))
 source=[x for x in lines if x.startswith('  '+l['source'])]
 check(lang+' all six supplied source occurrences',len(source)==6 and sum('[first-dish]' in x for x in source)==3 and sum('[second-dish]' in x for x in source)==3)
 check(lang+' raw known and unknown tomato sources plus seasoning',any('[first-dish]' in x and '300 g' in x for x in source) and any('[second-dish]' in x and l['unknown'] in x for x in source) and sum(l['taste'] in x for x in source)==2)
 check(lang+' concrete issues and original no-component dish locator',all(x in n for x in l['missing']) and '[name-only]' in n and l['budget'] in n)
 check(lang+' unknown quantities do not become zero',re.search(r'(?<![0-9.])0 (?:g|kg|ml|l)(?![A-Za-z])',n) is None)
check('latest B read leaves bound A clipboard unchanged',(p/'bound-a-latest-b-native-uk.txt').read_text()==(p/'native-uk.txt').read_text())
visible=(p/'bound-a-latest-b-visible-uk.txt').read_text();check('page simultaneously shows bound A and unapplied latest B','ab3f5846' in visible and '1928d305' in visible)
l=json.loads((p/'held-language.json').read_text());check('late old-language rejection leaves new textarea hidden with no stale feedback',l['area']['hidden'] and 'Copy failed' not in l['main'] and 'Не вдалося скопіювати' not in l['main'])
l=json.loads((p/'held-route.json').read_text());check('late detached-route rejection leaves Plan untouched',l['dom']=={'copyFailure':False,'hash':'#/admin/plan/team-week','textareas':0})
ledger=json.loads((p/'fixed-ledger.json').read_text());writes=[x for x in ledger['requests'] if x['method']=='POST']
check('only initial list creation and explicit manual decision save write through Worker',len(writes)==2 and all(x['path']=='/shopping-list/d-copy-all' and x['status']==200 for x in writes))
check('original create and acknowledged update preconditions retained',writes[0]['ifNoneMatch']=='*' and writes[0]['ifMatch'] is None and bool(writes[1]['ifMatch']) and writes[1]['ifNoneMatch'] is None)
check('saved decisions unchanged during copy and language journeys',[(x['ingredientRef'],x['decision'],x.get('bought',False)) for x in writes[1]['body']['items']]==[('cooking-oil','buy',False),('salt','available',False),('tomato','buy',True),('tomato-other','check',False)])
repo='/Users/terry/Desktop/coding/chief-master/chief-master/canteen-os-team-pages'
for row in metadata['sourceIntegrity']:
 raw=subprocess.check_output(['git','show',metadata['head']+':'+row['file']],cwd=repo)
 assert hashlib.sha256(raw).hexdigest()==row['sha256'],row['file']
check('all 57 production Web sources match fixed Git candidate',len(metadata['sourceIntegrity'])==57)
result={'reviewedCodeSha':metadata['head'],'packagesTree':metadata['packagesTree'],'runtime':metadata['node'],'nativeClipboardLanguages':['zh','en','uk'],'checks':checks,'summary':str(sum(c['pass'] for c in checks))+'/'+str(len(checks)),'boundary':metadata['boundary']}
assert result==json.loads((p/'browser-results.json').read_text()), 'Recomputed receipt differs'
assert writes[1]['ifMatch']==writes[0]['response']['blobSha'], 'Manual save must use actual create ACK blobSha'
assert all(x['decision']=='check' for x in writes[0]['body']['items'])
result['reviewerAdditionalObservations']={'actualAckUsedForManualSave':True,'allInitialDecisionsCheck':True,'originalReceiptRecomputedExactly':True}
result['reviewerIdentity']='Codex /root/plan_review (original nonauthor)'
(Path(__file__).resolve().parent/'reviewer-browser-recheck.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False,indent=2))
