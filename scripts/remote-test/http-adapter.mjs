/** Loopback adapter limits; Worker owns authentication and KB route validation. */
export const LEGACY_BODY_LIMIT=256*1024;
export const KNOWLEDGE_JSON_LIMIT=4*1024*1024;
export const KNOWLEDGE_UPLOAD_LIMIT=8*1024*1024+64*1024;
export const forwardHeaders=['authorization','content-type','content-length','if-match','if-none-match','idempotency-key','x-image-license','x-image-author','x-image-source-url','x-image-name'];
export function bodyLimit(rawUrl,origin){
 let path;try{path=new URL(rawUrl,origin).pathname;}catch{return LEGACY_BODY_LIMIT;}
 if(path==='/__q/worker/knowledge/assets/upload')return KNOWLEDGE_UPLOAD_LIMIT;
 return path.startsWith('/__q/worker/knowledge/')?KNOWLEDGE_JSON_LIMIT:LEGACY_BODY_LIMIT;
}
export async function bodyOf(req,origin){
 const limit=bodyLimit(req.url,origin),chunks=[];let size=0;
 // Consume without destroying IncomingMessage on overflow, so HTTP clients get 413.
 // Stop retaining bytes immediately; do not wait for an unbounded sender to finish.
 for await(const chunk of req.iterator({destroyOnReturn:false})){
  size+=chunk.length;
  if(size>limit){req.resume();const error=new Error('Request body exceeds limit');error.status=413;throw error;}
  chunks.push(chunk);
 }
 return Buffer.concat(chunks);
}
export function workerRequest(req,origin,bytes){
 const url=new URL(req.url,origin),path=url.pathname.slice('/__q/worker'.length);
 const headers=new Headers();for(const h of forwardHeaders)if(req.headers[h])headers.set(h,req.headers[h]);
 return new Request('https://worker.example.invalid'+path+url.search,{method:req.method,headers,body:bytes.length?bytes:undefined});
}
export function knowledgeBaseUrl(config,env=process.env){
 // Only operator-owned config/environment can select the upstream. Never request input.
 const value=env.KNOWLEDGE_BASE_URL??config.knowledgeBaseUrl??'http://127.0.0.1:4390';
 if(!['http://127.0.0.1:4390','http://127.0.0.1:4391'].includes(value))throw new Error('Remote test KB must use a fixed loopback port (4390 or 4391)');
 return value;
}
