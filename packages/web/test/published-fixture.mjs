import {mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {materializeFixture} from '../../../scripts/validate-contract-fixtures.mjs';
import {runBuild} from '../../../scripts/build-data.mjs';
import png from 'pngjs';

/** Rebuild the approved producer's four cases from unchanged Q sources in isolated Git. */
export function publishedFixture(name='normal') {
 const root=mkdtempSync(join(tmpdir(),'c2b-fixture-'));
 materializeFixture('golden',root);
 const planFile=join(root,'data/menu-plans/week-41.json');
 const plan=JSON.parse(readFileSync(planFile,'utf8'));
 if(name==='empty-plan')writeFileSync(planFile,JSON.stringify({schemaVersion:'3',name:{en:'Empty'},meals:[]}));
 if(name==='no-plans')rmSync(planFile);
 if(name==='quantity-warning'){plan.schemaVersion='3';plan.meals.forEach(m=>delete m.plannedServings);writeFileSync(planFile,JSON.stringify(plan));}
 if(name==='external-image') {
  const file=join(root,'data/ingredients/tomato.json'),ingredient=JSON.parse(readFileSync(file,'utf8'));
  ingredient.image={src:'https://example.org/tomato.png',license:'CC0'};writeFileSync(file,JSON.stringify(ingredient));
 }
 if(name==='image-a'||name==='image-b') {
  const image={src:'data/images/A %2F?# 雪.png',license:'CC0'};
  const pixels=new png.PNG({width:2,height:2});
  for(let i=0;i<pixels.data.length;i+=4){pixels.data[i]=name==='image-a'?255:0;pixels.data[i+2]=name==='image-b'?255:0;pixels.data[i+3]=255;}
  mkdirSync(join(root,'data/images'));writeFileSync(join(root,image.src),png.PNG.sync.write(pixels));
  const ingredientFile=join(root,'data/ingredients/tomato.json'),ingredient=JSON.parse(readFileSync(ingredientFile,'utf8'));
  ingredient.image={...image,src:'../images/A %2F?# 雪.png'};writeFileSync(ingredientFile,JSON.stringify(ingredient));
  const eggFile=join(root,'data/ingredients/egg.json'),egg=JSON.parse(readFileSync(eggFile,'utf8'));
  egg.image={...image,src:'../images/Unseen.png'};writeFileSync(eggFile,JSON.stringify(egg));
  writeFileSync(join(root,'data/images/Unseen.png'),png.PNG.sync.write(pixels));
  const dish=JSON.parse(readFileSync(join(root,'data/dishes/tomato-egg-stir-fry.json'),'utf8'));
  const selected=new Set([...dish.components.map(c=>c.prep?.techniqueRef),...dish.steps.map(s=>s.techniqueRef)].filter(Boolean));
  const file=join(root,'data/techniques.json'),techniques=JSON.parse(readFileSync(file,'utf8'));
  techniques.unshift({id:'unused-leading',kind:'cut',name:{en:'Not selected'}});
  for(const technique of techniques)if(selected.has(technique.id))technique.image=image;
  writeFileSync(file,JSON.stringify(techniques));
 }
 const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git(['init','--quiet']);git(['add','data']);git(['-c','user.name=C2b fixture','-c','user.email=c2b@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Isolated published fixture']);
 const revision=git(['rev-parse','HEAD']);
 const result=runBuild({root,commit:revision,target:'team-meals',at:'September 11, 2026 00:00:00 GMT',write:false});
 if(result.issues.some(i=>i.kind==='error'))throw new Error(`Published fixture failed: ${JSON.stringify(result.issues)}`);
 return {root,revision,manifest:result.build,projection:result.sheets['week-41']?.teamMeals,
  publish:(outDir,at=result.build.builtAt)=>runBuild({root,commit:revision,target:'team-meals',at,write:true,outDir}),
  cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
