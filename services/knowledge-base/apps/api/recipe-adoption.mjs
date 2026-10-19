import { fail } from './errors.mjs';
import { hash, objectBody } from './validation.mjs';
import { transaction } from './database.mjs';

export class RecipeAdoption {
  constructor(repo,ingredients,techniques){this.repo=repo;this.ingredients=ingredients;this.techniques=techniques;this.db=repo.db;}
  approval(id,version){const row=this.repo.one('SELECT document FROM recipe_approvals WHERE recipe_id=? AND recipe_version=?',id,version);return row?JSON.parse(row.document):null;}
  origin(id,version){
    const candidate=this.repo.one("SELECT * FROM favorite_candidates WHERE recipe_id=? AND status='approved' ORDER BY reviewed_at,id LIMIT 1",id);
    if(candidate)return {kind:'favorite',candidateId:candidate.id,originalRecipeVersion:candidate.recipe_version};
    const first=this.repo.one('SELECT document FROM recipe_approvals WHERE recipe_id=? ORDER BY recipe_version LIMIT 1',id);
    if(first)return JSON.parse(first.document).origin;
    if(this.repo.one('SELECT 1 FROM legacy_recipe_evidence WHERE recipe_id=?',id))return {kind:'legacy',originalRecipeVersion:1};
    // The first saved revision is the manual original, even when its first kitchen approval is later.
    const original=this.repo.one('SELECT min(version) version FROM recipe_revisions WHERE recipe_id=?',id);
    return {kind:'manual',originalRecipeVersion:original.version};
  }
  adoption(id,version){
    return transaction(this.db,()=>{
      const detail=this.repo.revision(id,version),origin=this.origin(id,version),kitchenApproval=this.approval(id,version),current=this.repo.recipeRow(id);
      return {recipeId:id,recipeVersion:version,current:{version:current.version,archived:Boolean(current.archived_at)},origin,source:{status:origin.kind==='favorite'||kitchenApproval||this.repo.one('SELECT 1 FROM recipe_approvals WHERE recipe_id=?',id)?'approved':'needs_review'},kitchenApproval,
        issues:detail.recipe.ingredients.flatMap(row=>[...(!row.ingredientId?['unmapped-ingredient']:[]),...((row.amount?row.amount.kind==='unknown':!row.qty)?['unknown-amount']:[])])};
    },false);
  }
  approve(id,version,body,headers){
    objectBody(body,['reviewer','note','sourceConfirmed','ingredientVersions','techniqueVersions']);
    if(typeof body.reviewer!=='string'||!body.reviewer.trim()||body.reviewer.length>200||typeof body.note!=='string'||!body.note.trim()||body.note.length>2000||
      (body.sourceConfirmed!==undefined&&typeof body.sourceConfirmed!=='boolean')||!body.ingredientVersions||Array.isArray(body.ingredientVersions)||typeof body.ingredientVersions!=='object')fail(400,'INVALID_APPROVAL','核定需要审核人、说明与准确食材版本。');
    const requestHash=hash({path:`/api/v1/recipes/${id}/revisions/${version}/approve`,ifMatch:headers.match,body});
    return transaction(this.db,()=>{
      const receipt=this.repo.one('SELECT * FROM write_receipts WHERE actor=? AND request_key=?',headers.actor,headers.key);
      if(receipt){if(receipt.request_hash!==requestHash)fail(409,'IDEMPOTENCY_KEY_REUSED','请求键已用于不同内容。');return {status:receipt.http_status,body:JSON.parse(receipt.response),replayed:true};}
      const old=this.repo.one('SELECT * FROM recipe_approvals WHERE recipe_id=? AND recipe_version=?',id,version);
      if(old){if(old.request_hash!==requestHash)fail(409,'ALREADY_APPROVED','已核定版本不能原地改写，请保存新版本。');return {status:200,body:JSON.parse(old.document),replayed:true};}
      const current=this.repo.recipeRow(id);
      if(current.archived_at)fail(409,'RECIPE_ARCHIVED','已归档菜谱不能新核定。');
      if(current.version!==version||headers.version!==version)fail(409,'VERSION_CONFLICT','先读取最新保存版本再核定。',{currentVersion:current.version});
      const detail=this.repo.revision(id,version),recipe=detail.recipe,origin=this.origin(id,version);
      if(!recipe.ingredients.length||!recipe.steps.length)fail(422,'RECIPE_INCOMPLETE','请先记录全部食材和做法；未知用量可保留。');
      const original=this.repo.revision(id,origin.originalRecipeVersion);
      if(origin.kind==='favorite'){
        const originals=new Set(original.recipe.sources.map(x=>x.sourceId));
        if(!originals.size||!recipe.sources.some(x=>originals.has(x.sourceId)))fail(409,'SOURCE_REVIEW_REQUIRED','厨房修订失去原审核来源，请重新核对来源。');
      }else if(!this.repo.one('SELECT 1 FROM recipe_approvals WHERE recipe_id=?',id)&&body.sourceConfirmed!==true)fail(409,'SOURCE_REVIEW_REQUIRED','手工或旧导入菜谱须明确确认原方来源。');
      const ids=[...new Set(recipe.ingredients.map(row=>row.ingredientId).filter(Boolean))].sort();
      if(Object.keys(body.ingredientVersions).length!==ids.length||Object.keys(body.ingredientVersions).some(key=>!ids.includes(key)))fail(422,'INVALID_INGREDIENT_BINDINGS','核定食材集合须与保存的配料映射完全一致。');
      const ingredients=ids.map(ingredientId=>{
        const expected=body.ingredientVersions[ingredientId],head=this.ingredients.current(ingredientId);
        if(!Number.isSafeInteger(expected)||expected<=0)fail(400,'INVALID_INGREDIENT_VERSION','请指定准确标准食材版本。');
        if(expected!==head.version)fail(409,'INGREDIENT_VERSION_CONFLICT','标准食材版本变化，请保留输入并重新核对。',{ingredientId,currentVersion:head.version});
        return this.ingredients.revision(ingredientId,expected);
      });
      const techniqueIds=[...new Set([...recipe.ingredients.map(row=>row.kitchenPrep?.techniqueId),...recipe.steps.map(row=>row.techniqueId)].filter(Boolean))].sort();
      if(body.techniqueVersions!==undefined&&(!body.techniqueVersions||Array.isArray(body.techniqueVersions)||typeof body.techniqueVersions!=='object'||Object.keys(body.techniqueVersions).length!==techniqueIds.length||Object.keys(body.techniqueVersions).some(id=>!techniqueIds.includes(id))))fail(422,'INVALID_TECHNIQUE_BINDINGS','核定技法集合须与保存版本完全一致。');
      const techniques=techniqueIds.map(techniqueId=>{
        const head=this.techniques.current(techniqueId);
        const current=this.techniques.revision(techniqueId,head.version);
        const expected=body.techniqueVersions?.[techniqueId];
        if(expected!==undefined&&(!Number.isSafeInteger(expected)||expected<=0))fail(400,'INVALID_TECHNIQUE_VERSION','请指定准确标准技法版本。');
        if(body.techniqueVersions!==undefined&&expected!==current.version)fail(409,'TECHNIQUE_VERSION_CONFLICT','标准技法版本变化，请保留输入并重新核对。',{techniqueId,currentVersion:current.version});
        return {id:techniqueId,version:current.version,hash:hash(current.technique),technique:current.technique};
      });
      const candidate=origin.candidateId?this.repo.one('SELECT document FROM favorite_candidates WHERE id=?',origin.candidateId):null;
      const gaps=candidate?JSON.parse(candidate.document).unresolved??[]:[];
      const value={approvalVersion:'1',status:'approved',recipeId:id,recipeVersion:version,origin,recipeSnapshotHash:hash(detail),originalSnapshotHash:hash(original),
        dependencies:{ingredients,techniques},unresolved:gaps,reviewer:body.reviewer.trim(),note:body.note.trim(),actor:headers.actor,createdAt:new Date().toISOString()};
      const approved={...value,approvalHash:hash(value)};
      this.repo.run('INSERT INTO recipe_approvals VALUES(?,?,?,?,?)',id,version,requestHash,JSON.stringify(approved),approved.createdAt);
      this.repo.run('INSERT INTO write_receipts VALUES(?,?,?,?,?,?)',headers.actor,headers.key,requestHash,201,JSON.stringify(approved),approved.createdAt);
      return {status:201,body:approved,replayed:false};
    });
  }
}
