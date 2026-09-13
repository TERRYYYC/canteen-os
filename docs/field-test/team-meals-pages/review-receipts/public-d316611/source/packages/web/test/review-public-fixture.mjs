import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {publishedFixture} from './published-fixture.mjs';
import {runBuild} from '../../../scripts/build-data.mjs';
export function richFixture(){
 const source=publishedFixture('image-a'),file=join(source.root,'data/dishes/tomato-egg-stir-fry.json'),dish=JSON.parse(readFileSync(file));
 const image={src:'../images/A %2F?# 雪.png',license:'CC0',author:'Independent synthetic image'};
 dish.schemaVersion='3';delete dish.baseServings;delete dish.components[0].qty;dish.image=image;
 dish.components[0].prep={...dish.components[0].prep,timing:'morning',image};dish.components[1].prep={...dish.components[0].prep,...dish.components[1].prep,timing:'before-service',image};
 dish.steps[0].image=image;dish.steps[1].image=image;writeFileSync(file,JSON.stringify(dish));
 const planFile=join(source.root,'data/menu-plans/week-41.json'),plan=JSON.parse(readFileSync(planFile));plan.schemaVersion='3';plan.meals.forEach(m=>delete m.plannedServings);writeFileSync(planFile,JSON.stringify(plan));
 const git=args=>execFileSync('git',args,{cwd:source.root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();git(['add','data']);git(['-c','user.name=Independent D review fixture','-c','user.email=review@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Rich public pointer review input']);const revision=git(['rev-parse','HEAD']),at='September 11, 2026 00:00:00 GMT',output=runBuild({root:source.root,commit:revision,target:'team-meals',at,write:false});if(output.issues.some(i=>i.kind==='error'))throw Error(JSON.stringify(output.issues));return{...source,revision,manifest:output.build,projection:output.sheets['week-41'].teamMeals,publish:outDir=>runBuild({root:source.root,commit:revision,target:'team-meals',at,write:true,outDir})};
}
