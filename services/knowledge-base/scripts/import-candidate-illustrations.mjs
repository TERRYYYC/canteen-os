#!/usr/bin/env node
/** Import inspected source frames as private candidate events, without editing recipe/capture snapshots. */
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { resolve, join, sep, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { hash, uuid } from '../apps/api/validation.mjs';
import { imageType } from '../apps/api/media.mjs';

function dimensions(bytes,type){
 if(type.extension==='png')return [bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
 if(type.extension==='jpg'){
  let at=2;
  while(at+4<=bytes.length){
   if(bytes[at++]!==255)break;while(bytes[at]===255)at++;
   const marker=bytes[at++];if(marker===0xd9||marker===0xda)break;
   if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
   const length=bytes.readUInt16BE(at);if(length<2||at+length>bytes.length)break;
   if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&length>=7)return [bytes.readUInt16BE(at+5),bytes.readUInt16BE(at+3)];
   at+=length;
  }
 }
 if(type.extension==='webp'){
  const chunk=bytes.toString('ascii',12,16);
  if(chunk==='VP8X'&&bytes.length>=30)return [1+bytes.readUIntLE(24,3),1+bytes.readUIntLE(27,3)];
  if(chunk==='VP8L'&&bytes.length>=25&&bytes[20]===0x2f){const bits=bytes.readUInt32LE(21);return [(bits&0x3fff)+1,((bits>>>14)&0x3fff)+1];}
  if(chunk==='VP8 '&&bytes.length>=30&&bytes.subarray(23,26).equals(Buffer.from([0x9d,0x01,0x2a])))return [bytes.readUInt16LE(26)&0x3fff,bytes.readUInt16LE(28)&0x3fff];
 }
 throw Error('Cannot read source-image dimensions');
}
function identity(value){return hash(Object.fromEntries(['sourceMediaSha256','frameMs','role','stepId','caption','sourceUrl','author','rightsState','imageSha256'].map(k=>[k,value[k]])));}
function localApi(base){const url=new URL(base);if(!['http:','https:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('api-base must be a loopback KB origin');return url.origin;}
async function request(base,path,init={}){
 const response=await fetch(`${base}/api/v1${path}`,{...init,headers:{'X-KB-Client':'agent',...(init.body instanceof FormData?{}:{'Content-Type':'application/json'}),...init.headers},redirect:'error',signal:AbortSignal.timeout(30000)});
 const result=await response.json();if(!response.ok)throw Error(`KB ${response.status}: ${result.error?.code??'request_failed'} ${result.error?.message??''}`);
 return {data:result,status:response.status};
}

export async function importIllustrations({artifactDir,candidateId,apiBase='http://127.0.0.1:4390',apply=false}){
 const dir=await realpath(resolve(artifactDir)),base=localApi(apiBase);
 const manifest=JSON.parse(await readFile(join(dir,'illustrations.json'),'utf8'));
 if(!candidateId){const receipt=JSON.parse(await readFile(join(dir,'local-import-receipt.json'),'utf8'));candidateId=receipt.candidateId??receipt.imported?.candidateId;}
 uuid(candidateId);
 const candidate=(await request(base,`/favorites/candidates/${candidateId}`)).data;
 const captures=(await request(base,`/favorites/items/${candidate.sourceItemId}/captures`)).data.items;
 const capture=captures.find(x=>x.id===candidate.captureId),media=capture?.evidence.media;
 if(capture?.method!=='video_analysis'||capture.status!=='ready'||!media||manifest.sourceMediaSha256!==media.sha256)throw Error('Source media hash does not match the candidate capture');
 if(!Array.isArray(manifest.images)||!manifest.images.length||manifest.images.length>100)throw Error('A manifest must contain 1–100 inspected source images');
 const prepared=[];
 // Validate all input before any upload. A failure never leaves a partial logical batch.
 for(const image of manifest.images){
  const step=candidate.recipe.steps?.[image.stepOrder-1];
  if(!Number.isSafeInteger(image.stepOrder)||image.stepOrder<1||!step)throw Error(`Invalid stepOrder: ${image.stepOrder}`);
  uuid(step.id);
  if(!Number.isSafeInteger(image.frameMs)||image.frameMs<0||image.frameMs>media.videoDurationMs)throw Error('Source frame time exceeds the video');
  const sourceMediaSha256=image.sourceMediaSha256??manifest.sourceMediaSha256,sourceUrl=image.sourceUrl??manifest.sourceUrl,author=image.author??manifest.author,rightsState=image.rightsState??manifest.rightsState;
  if(sourceMediaSha256!==media.sha256||sourceUrl!==capture.evidence.sourceUrl)throw Error('Source media hash or URL mismatch');
  if(!['ingredient','step','finished'].includes(image.role)||rightsState!=='unknown'||typeof author!=='string'||!author.trim())throw Error('Invalid source-frame role, author or unknown rights state');
  if(typeof image.path!=='string'||!image.path)throw Error('Source image path is missing');
  const path=await realpath(resolve(dir,image.path));if(!path.startsWith(dir+sep))throw Error('Source image must stay inside its artifact directory');
  const bytes=await readFile(path),imageSha256=createHash('sha256').update(bytes).digest('hex');
  if(image.sha256!==undefined&&image.sha256!==imageSha256)throw Error(`Source image hash mismatch: ${image.path}`);
  const type=imageType(bytes),[width,height]=dimensions(bytes,type);
  if(bytes.length>200000||width<1||height<1||Math.max(width,height)>1280)throw Error('Source images must be at most 200000 bytes and 1280 pixels');
  const caption=typeof image.caption==='string'?{zh:image.caption}:image.caption;
  if(!caption||Array.isArray(caption)||typeof caption!=='object'||!Object.keys(caption).length||Object.keys(caption).some(k=>!['zh','en','uk'].includes(k)||typeof caption[k]!=='string'||!caption[k].trim()||caption[k].length>2000))throw Error('Caption must be a nonempty I18nString');
  const body={sourceMediaSha256,frameMs:image.frameMs,role:image.role,stepId:step.id,caption,sourceUrl,author,rightsState};
  prepared.push({body,path,bytes,mime:type.mime,imageSha256,width,height});
 }
 const report={candidateId,sourceMediaSha256:media.sha256,applied:apply,items:[]},known=[...(candidate.illustrations??[])];
 for(const picture of prepared){
  const summary={...picture.body,imageSha256:picture.imageSha256,width:picture.width,height:picture.height,byteCount:picture.bytes.length};
  const previous=known.find(x=>identity(x)===identity(summary));
  if(!apply){report.items.push({...summary,existingId:previous?.id??null});continue;}
  if(previous){report.items.push({...summary,illustration:previous,replayed:true});continue;}
  const form=new FormData();form.set('file',new Blob([picture.bytes],{type:picture.mime}),basename(picture.path));
  const asset=(await request(base,'/assets/upload',{method:'POST',body:form})).data;
  if(asset.sha256!==picture.imageSha256)throw Error('Uploaded asset hash mismatch');
  const saved=await request(base,`/favorites/candidates/${candidateId}/illustrations`,{method:'POST',body:JSON.stringify({...picture.body,assetId:asset.id})});
  known.push(saved.data);report.items.push({...summary,illustration:saved.data,replayed:saved.status===200});
 }
 return report;
}

async function main(){
 const args=process.argv.slice(2),options={apply:false};let output;
 for(let i=0;i<args.length;i++){
  const arg=args[i];if(arg==='--apply')options.apply=true;
  else if(['--artifact-dir','--candidate-id','--api-base','--output'].includes(arg)){const value=args[++i];if(!value)throw Error(`Missing value for ${arg}`);if(arg==='--output')output=value;else options[{'--artifact-dir':'artifactDir','--candidate-id':'candidateId','--api-base':'apiBase'}[arg]]=value;}
  else throw Error(`Unknown argument: ${arg}`);
 }
 if(!options.artifactDir)throw Error('Usage: node scripts/import-candidate-illustrations.mjs --artifact-dir <recipe-artifacts> [--candidate-id <UUID>] [--api-base http://127.0.0.1:4390] [--apply] [--output <receipt.json>]');
 const report=await importIllustrations(options);if(output)await writeFile(resolve(output),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
