import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { fail } from './errors.mjs';
import { hash } from './validation.mjs';
import { transaction } from './database.mjs';

const schema = JSON.parse(readFileSync(new URL('../../contracts/standard-technique.schema.json',import.meta.url),'utf8'));
const check = new Ajv2020({strict:true,allErrors:true}).compile(schema);
export function techniqueBody(value) {
  if(!check(value))fail(400,'INVALID_TECHNIQUE','标准技法规格不符合约定。',check.errors.slice(0,12).map(e=>({path:e.instancePath,rule:e.keyword})));
  return structuredClone(value);
}
export class StandardTechniques {
  constructor(repo){this.repo=repo;this.db=repo.db;}
  current(id) {
    const row=this.repo.one('SELECT * FROM techniques WHERE id=?',id);
    if(!row)fail(404,'TECHNIQUE_NOT_FOUND','标准技法不存在。');
    return row;
  }
  revision(id,version){
    const row=this.current(id);
    const saved=this.repo.one('SELECT document FROM technique_revisions WHERE technique_id=? AND version=?',id,version);
    if(saved)return JSON.parse(saved.document);
    if(version===1&&row.version===1)return {id,version:1,technique:{kind:row.kind,name:JSON.parse(row.name),...(row.note?{note:JSON.parse(row.note)}:{})},createdAt:row.created_at??null};
    fail(404,'TECHNIQUE_REVISION_NOT_FOUND','标准技法历史版本不存在。');
  }
  detail(id){return transaction(this.db,()=>this.revision(id,this.current(id).version),false);}
  write({method,path,id,headers,technique}){
    const requestHash=hash({method,path,ifMatch:headers.match,body:technique});
    return transaction(this.db,()=>{
      const receipt=this.repo.one('SELECT * FROM write_receipts WHERE actor=? AND request_key=?',headers.actor,headers.key);
      if(receipt){
        if(receipt.request_hash!==requestHash)fail(409,'IDEMPOTENCY_KEY_REUSED','请求键已用于不同内容。');
        return {status:receipt.http_status,body:JSON.parse(receipt.response),replayed:true};
      }
      const creating=!id; const now=new Date().toISOString();let version=1;
      if(creating){
        id=randomUUID();
        this.repo.run('INSERT INTO techniques(id,kind,name,note,document,version,created_at) VALUES(?,?,?,?,?,?,?)',id,technique.kind,JSON.stringify(technique.name),technique.note?JSON.stringify(technique.note):null,'{}',1,now);
      }else{
        const current=this.current(id);
        if(current.version!==headers.version)fail(409,'VERSION_CONFLICT','标准技法已被修改。',{currentVersion:current.version});
        if(!this.repo.one('SELECT 1 FROM technique_revisions WHERE technique_id=? AND version=?',id,current.version)){
          const original=this.revision(id,current.version);
          this.repo.run('INSERT INTO technique_revisions VALUES(?,?,?,?)',id,current.version,JSON.stringify(original),original.createdAt);
        }
        version=current.version+1;
        this.repo.run('UPDATE techniques SET kind=?,name=?,note=?,version=?,created_at=? WHERE id=? AND version=?',technique.kind,JSON.stringify(technique.name),technique.note?JSON.stringify(technique.note):null,version,now,id,headers.version);
      }
      const body={id,version,technique,createdAt:now};const status=creating?201:200;
      this.repo.run('INSERT INTO technique_revisions VALUES(?,?,?,?)',id,version,JSON.stringify(body),now);
      this.repo.run('INSERT INTO write_receipts VALUES(?,?,?,?,?,?)',headers.actor,headers.key,requestHash,status,JSON.stringify(body),now);
      return {status,body,replayed:false};
    });
  }
}
