import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Readable} from 'node:stream';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {bodyLimit,bodyOf,workerRequest,knowledgeBaseUrl,LEGACY_BODY_LIMIT,KNOWLEDGE_JSON_LIMIT,KNOWLEDGE_UPLOAD_LIMIT} from './http-adapter.mjs';
const origin='http://127.0.0.1:4280';
const routes=[['/__q/worker/plan/team-week',LEGACY_BODY_LIMIT],['/__q/worker/knowledge/recipes',KNOWLEDGE_JSON_LIMIT],['/__q/worker/knowledge/assets/upload',KNOWLEDGE_UPLOAD_LIMIT]];
test('legacy/KB JSON/upload boundaries are exact, including chunked requests',async()=>{
 for(const [url,limit] of routes){
  assert.equal(bodyLimit(url+'?test=1',origin),limit);
  for(const size of [limit,limit+1]){
   const req=Readable.from([Buffer.alloc(size-1),Buffer.alloc(1)]);req.url=url;
   if(size===limit)assert.equal((await bodyOf(req,origin)).length,limit);
   else await assert.rejects(bodyOf(req,origin),{status:413});
  }
 }
 assert.equal(bodyLimit('/__q/worker/knowledgeevil/assets/upload',origin),LEGACY_BODY_LIMIT);
});
test('PUT bytes and conditional/idempotency headers reach Worker unchanged',async()=>{
 const bytes=Buffer.from('{"title":"原文"}');
 const request=workerRequest({url:'/__q/worker/knowledge/recipes/123?version=2',method:'PUT',headers:{authorization:'Bearer synthetic', 'content-type':'application/json','content-length':String(bytes.length),'if-match':'"v2"','idempotency-key':'one-key'}},origin,bytes);
 assert.equal(request.method,'PUT');assert.equal(request.headers.get('idempotency-key'),'one-key');assert.equal(request.headers.get('if-match'),'"v2"');
 assert.deepEqual(Buffer.from(await request.arrayBuffer()),bytes);
 assert.equal(new URL(request.url).pathname,'/knowledge/recipes/123');
 assert.equal(knowledgeBaseUrl({},{}),'http://127.0.0.1:4390');
 assert.throws(()=>knowledgeBaseUrl({knowledgeBaseUrl:'https://outside.invalid'},{}));
 assert.equal(knowledgeBaseUrl({}, {KNOWLEDGE_BASE_URL:'http://127.0.0.1:4391'}),'http://127.0.0.1:4391');
 assert.throws(()=>knowledgeBaseUrl({}, {KNOWLEDGE_BASE_URL:'http://127.0.0.1:4392'}));
});
test('HTTP overflow returns a readable 413 rather than a reset connection',async t=>{
 const server=createServer(async(req,res)=>{
  try{await bodyOf(req,origin);res.writeHead(204);res.end();}
  catch(error){res.writeHead(error.status??400,{'Content-Type':'application/json'});res.end('{"error":"body_limit"}');}
 });
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 server.listen(0,'127.0.0.1');await once(server,'listening');
 for(const [path,limit] of routes){
  const response=await fetch(`http://127.0.0.1:${server.address().port}`+path,{method:'PUT',body:Buffer.alloc(limit+1)});
  assert.equal(response.status,413);assert.deepEqual(await response.json(),{error:'body_limit'});
 }
});
