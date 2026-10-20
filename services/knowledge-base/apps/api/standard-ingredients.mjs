import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { fail } from './errors.mjs';
import { hash } from './validation.mjs';
import { transaction } from './database.mjs';

const schema = JSON.parse(readFileSync(new URL('../../contracts/standard-ingredient.schema.json',import.meta.url),'utf8'));
const check = new Ajv2020({strict:true,allErrors:true}).compile(schema);
export function ingredientBody(value) {
  if(!check(value))fail(400,'INVALID_INGREDIENT','标准食材规格不符合约定。',check.errors.slice(0,12).map(e=>({path:e.instancePath,rule:e.keyword})));
  return {...structuredClone(value),aliases:value.aliases??[],trackStock:value.trackStock??false};
}
export class StandardIngredients {
  constructor(repo){this.repo=repo;this.db=repo.db;}
  current(id) {
    const row=this.repo.one('SELECT * FROM ingredients WHERE id=?',id);
    if(!row)fail(404,'INGREDIENT_NOT_FOUND','标准食材不存在。');
    return row;
  }
  revision(id,version){
    const row=this.current(id);
    const saved=this.repo.one('SELECT document FROM ingredient_revisions WHERE ingredient_id=? AND version=?',id,version);
    if(saved)return JSON.parse(saved.document);
    // Legacy imports after migration create identity records only. They are
    // unverified v1; procurement fields in legacy.original are not promoted.
    if(version===1&&row.version===1)return {id,version:1,ingredient:{name:JSON.parse(row.name),aliases:JSON.parse(row.aliases),trackStock:false},createdAt:row.created_at};
    fail(404,'INGREDIENT_REVISION_NOT_FOUND','标准食材历史版本不存在。');
  }
  detail(id){return transaction(this.db,()=>this.revision(id,this.current(id).version),false);}
  write({method,path,id,headers,ingredient}){
    const requestHash=hash({method,path,ifMatch:headers.match,body:ingredient});
    return transaction(this.db,()=>{
      const receipt=this.repo.one('SELECT * FROM write_receipts WHERE actor=? AND request_key=?',headers.actor,headers.key);
      if(receipt){
        if(receipt.request_hash!==requestHash)fail(409,'IDEMPOTENCY_KEY_REUSED','请求键已用于不同内容。');
        return {status:receipt.http_status,body:JSON.parse(receipt.response),replayed:true};
      }
      const creating=!id; const now=new Date().toISOString();let version=1;
      if(creating){
        id=randomUUID();
        this.repo.run('INSERT INTO ingredients(id,name,aliases,version,created_at) VALUES(?,?,?,?,?)',id,JSON.stringify(ingredient.name),JSON.stringify(ingredient.aliases),1,now);
      }else{
        const current=this.current(id);
        if(current.version!==headers.version)fail(409,'VERSION_CONFLICT','标准食材已被修改。',{currentVersion:current.version});
        if(!this.repo.one('SELECT 1 FROM ingredient_revisions WHERE ingredient_id=? AND version=?',id,current.version)){
          const original=this.revision(id,current.version);
          this.repo.run('INSERT INTO ingredient_revisions VALUES(?,?,?,?)',id,current.version,JSON.stringify(original),original.createdAt);
        }
        version=current.version+1;
        this.repo.run('UPDATE ingredients SET name=?,aliases=?,version=? WHERE id=? AND version=?',JSON.stringify(ingredient.name),JSON.stringify(ingredient.aliases),version,id,headers.version);
      }
      const body={id,version,ingredient,createdAt:now};const status=creating?201:200;
      this.repo.run('INSERT INTO ingredient_revisions VALUES(?,?,?,?)',id,version,JSON.stringify(body),now);
      this.repo.run('INSERT INTO write_receipts VALUES(?,?,?,?,?,?)',headers.actor,headers.key,requestHash,status,JSON.stringify(body),now);
      return {status,body,replayed:false};
    });
  }
}
