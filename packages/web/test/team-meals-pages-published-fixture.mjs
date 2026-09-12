/** D navigation variant: genuine local fixture revision, built by the approved producer. */
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {publishedFixture} from './published-fixture.mjs';
import {runBuild} from '../../../scripts/build-data.mjs';
export function pagesPublishedFixture(name){
 if(!['multi-row','multi-dish','menu-image','menu-external','menu-empty-recipe'].includes(name))return publishedFixture(name);
 const source=publishedFixture(name==='menu-image'?'image-a':'normal'),path=join(source.root,'data/menu-plans/week-41.json');
 const plan=JSON.parse(readFileSync(path,'utf8')),first=plan.meals[0];
 if(name==='menu-empty-recipe'){const file=join(source.root,`data/dishes/${first.dishRef}.json`),dish=JSON.parse(readFileSync(file,'utf8'));dish.schemaVersion='3';delete dish.steps;delete dish.description;writeFileSync(file,JSON.stringify(dish));}
 else if(name==='menu-image'||name==='menu-external'){const file=join(source.root,`data/dishes/${first.dishRef}.json`),dish=JSON.parse(readFileSync(file,'utf8'));dish.image={src:name==='menu-image'?'../images/A %2F?# 雪.png':'https://example.org/original-dish.png',license:'CC0'};writeFileSync(file,JSON.stringify(dish));}
 else if(name==='multi-row'){plan.meals.splice(1,0,{...first,plannedServings:7});plan.meals.splice(2,0,{...first,mealType:'dinner',plannedServings:9});}
 else {
  const dish=JSON.parse(readFileSync(join(source.root,`data/dishes/${first.dishRef}.json`),'utf8'));
  dish.name={zh:'第二道示例菜',en:'Second fixture dish',uk:'Друга тестова страва'};
  dish.components=[dish.components[0],{...dish.components[0],ingredientRef:'ketchup'}];
  writeFileSync(join(source.root,'data/dishes/second-fixture.json'),JSON.stringify(dish));
  plan.meals.splice(1,0,{...first,dishRef:'second-fixture',plannedServings:7});
 }
 writeFileSync(path,JSON.stringify(plan));
 const git=args=>execFileSync('git',args,{cwd:source.root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git(['add','data']);git(['-c','user.name=D page fixture','-c','user.email=d-pages@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Explicit navigation duplicate-row fixture']);
 const revision=git(['rev-parse','HEAD']),at='September 11, 2026 00:00:00 GMT';
 const output=runBuild({root:source.root,commit:revision,target:'team-meals',at,write:false});
 if(output.issues.some(issue=>issue.kind==='error'))throw new Error(JSON.stringify(output.issues));
 return {...source,revision,manifest:output.build,projection:output.sheets['week-41'].teamMeals,publish:outDir=>runBuild({root:source.root,commit:revision,target:'team-meals',at,write:true,outDir})};
}
