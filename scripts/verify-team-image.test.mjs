import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import * as verifier from './verify-team-image.mjs';

// CI original two-frame counterexample source, SHA256 da988829e471497114bbe2be64ca1421ebd5102d0f5719c15b1bbece198d9405.
const ANIMATED=Buffer.from('UklGRvgAAABXRUJQVlA4WAoAAAACAAAAMQAAMQAAQU5JTQYAAAD/////AABBTk1GYgAAAAAAAAAAADEAADEAAGQAAABWUDggSgAAAHAEAJ0BKjIAMgA+kUigTCWkIyIiCACwEglpANRCgH4AfgAAEXGAXU1AFdQAAP7e1j//RguA4Hvpf/9jMftGf5xTjtX6fAeQgAAAQU5NRmIAAAAAAAAAAAAxAAAxAABkAAAAVlA4IEoAAABwBACdASoyADIAPpFIoEwlpCMiIggAsBIJaQDUQoB+AH4AABFxgF1NQBXUAAD+3tY//0YLgOB76X//YzH7Rn+cU47V+nwHkIAAAA==','base64');
const STILL=Buffer.from('UklGRjgAAABXRUJQVlA4ICwAAADwAQCdASoCAAIAAUAmJaACdLoB+AAETAAA/upl//yz5/DZ1Of/FnIxHZeAAA==','base64');
const parse=b=>verifier.validateWebpContainer(b);
const chunk=(tag,body)=>{const h=Buffer.alloc(8);h.write(tag);h.writeUInt32LE(body.length,4);return Buffer.concat([h,body,Buffer.alloc(body.length%2)]);};
const riff=parts=>{const body=Buffer.concat(parts),h=Buffer.alloc(12);h.write('RIFF');h.writeUInt32LE(body.length+4,4);h.write('WEBP',8);return Buffer.concat([h,body]);};
function topChunks(bytes){const parts=[];for(let i=12;i<bytes.length;){const n=8+bytes.readUInt32LE(i+4)+(bytes.readUInt32LE(i+4)%2);parts.push(bytes.subarray(i,i+n));i+=n;}return parts;}

test('WebP original canvas and each frame are reported before any extraction or decoding',()=>{
 const result=parse(ANIMATED);assert.equal(result.width,50);assert.equal(result.height,50);assert.equal(result.animated,true);
 assert.deepEqual(result.frames.map(f=>[f.width,f.height,f.x,f.y]),[[50,50,0,0],[50,50,0,0]]);
 assert.equal(parse(STILL).frames.length,1);assert.equal(parse(STILL).width,2);
});

test('WebP FourCC byte aliases cannot turn a bad raw header into a repaired valid container',()=>{
 for(const offset of [0,8,12]) {
  const b=Buffer.from(ANIMATED);b[offset]|=0x80;assert.throws(()=>parse(b));
 }
 const first=ANIMATED.indexOf('ANMF'),second=ANIMATED.indexOf('ANMF',first+4),b=Buffer.from(ANIMATED);
 b[first]|=0x80;
 // A byte-distinct unknown chunk remains unknown; it is not an animation frame.
 assert.equal(parse(b).frames.length,1);
 b[second]|=0x80;assert.throws(()=>parse(b),/frames/);
});

test('CI raw WebP canvas/offset/frame-dimension counterexamples fail before normalized mux output',()=>{
 const second=ANIMATED.indexOf('ANMF',ANIMATED.indexOf('ANMF')+4);
 for(const change of [b=>b.writeUIntLE(0,24,3),b=>b.writeUIntLE(25,second+8,3),b=>b.writeUIntLE(0,second+14,3)]) {
  const b=Buffer.from(ANIMATED);change(b);assert.throws(()=>parse(b),/canvas|dimension|frame/i);
 }
});

test('WebP truncation, nested sizes, padding and reconstruction order are checked on original bytes',()=>{
 assert.throws(()=>parse(ANIMATED.subarray(0,-8)),/size|length|truncat/i);
 const b=Buffer.from(ANIMATED);b.writeUInt32LE(400,b.indexOf('ANMF')+4);assert.throws(()=>parse(b),/size|length|truncat/i);
 const parts=topChunks(ANIMATED);
 assert.throws(()=>parse(riff([parts[0],parts[2],parts[1],parts[3]])),/ANIM|order/i);
 assert.throws(()=>parse(riff([parts[0],parts[2],parts[3]])),/ANIM/i);
 const padded=chunk('TEST',Buffer.from([1]));padded[padded.length-1]=1;
 assert.throws(()=>parse(riff([...parts,padded])),/padding/i);
});

test('WebP preserves permitted metadata/unknown order, duplicate metadata and ignored reserved fields',()=>{
 const parts=topChunks(ANIMATED).map(Buffer.from);
 parts[0][8]|=0xc1;parts[0][9]=255;parts[2][23]|=0xfc;
 const mixed=riff([chunk('EXIF',Buffer.from('a')),parts[0],chunk('TEST',Buffer.from([1])),parts[1],parts[2],chunk('XMP ',Buffer.from('x')),parts[3],chunk('EXIF',Buffer.from('b'))]);
 assert.equal(parse(mixed).frames.length,2);
 // Readers may ignore data after the declared RIFF size; it remains in the source.
 assert.equal(parse(Buffer.concat([STILL,Buffer.from('trailing')])).width,2);
});

test('WebP enforces single per-frame image data and requires every frame payload',()=>{
 const parts=topChunks(ANIMATED),frame=parts[2].subarray(8),nested=frame.subarray(16);
 const duplicate=chunk('ANMF',Buffer.concat([frame.subarray(0,16),nested,nested]));
 assert.throws(()=>parse(riff([parts[0],parts[1],duplicate,parts[3]])),/bitstream|duplicate/i);
 const noPixels=chunk('ANMF',frame.subarray(0,16));
 assert.throws(()=>parse(riff([parts[0],parts[1],noPixels,parts[3]])),/bitstream|frame/i);
});

test('WebP fully decodes the original static image and every animation frame without changing source bytes',async()=>{
 for(const original of [STILL,ANIMATED]) {
  const bytes=Buffer.from(original),before=Buffer.from(bytes),result=await verifier.verifyTeamImage(bytes);
  assert.deepEqual(result,{format:'webp',width:original===STILL?2:50,height:original===STILL?2:50});
  assert.deepEqual(bytes,before);
 }
});

test('WebP legal metadata order is decodable but raw canvas/offset errors cannot be repaired by rewrapping',async()=>{
 const parts=topChunks(ANIMATED),mixed=riff([chunk('EXIF',Buffer.from('a')),parts[0],chunk('TEST',Buffer.from([1])),parts[1],parts[2],chunk('XMP ',Buffer.from('x')),parts[3]]),before=Buffer.from(mixed);
 assert.deepEqual(await verifier.verifyTeamImage(mixed),{format:'webp',width:50,height:50});
 assert.deepEqual(mixed,before);
 const second=ANIMATED.indexOf('ANMF',ANIMATED.indexOf('ANMF')+4);
 for(const change of [b=>b.writeUIntLE(0,24,3),b=>b.writeUIntLE(25,second+8,3),b=>b.writeUIntLE(0,second+14,3)]) {
  const b=Buffer.from(ANIMATED);change(b);await assert.rejects(()=>verifier.verifyTeamImage(b),/canvas|dimension|frame/i);
 }
});

test('WebP bad nonfirst compressed frame with consistent RIFF lengths fails actual full decoding',async()=>{
 const parts=topChunks(ANIMATED),second=parts[3].subarray(8),payload=second.subarray(24,24+second.readUInt32LE(20));
 // Keep the original valid VP8 dimension header but truncate compressed pixels.
 const brokenFrame=chunk('ANMF',Buffer.concat([second.subarray(0,16),chunk('VP8 ',payload.subarray(0,20))]));
 const bad=riff([parts[0],parts[1],parts[2],brokenFrame]);
 assert.equal(parse(bad).frames.length,2,'all original container lengths remain valid');
 await assert.rejects(()=>verifier.verifyTeamImage(bad),/decode|dwebp/i);
});

test('native decoder failures, invalid pixel output, and a shared animation deadline fail closed and remove temporary files',()=>{
 for(const mode of ['missing','malformed','dimensions','partial','exit','deadline']) {
  const code=`import childProcess from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
   import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
   const original=childProcess.execFile;let calls=0;const directories=[];
   childProcess.execFile=function(command,args,options,callback){
    calls++;const out=args[2];directories.push(path.dirname(out));
    const mode=${JSON.stringify(mode)};
    if(mode==='missing'){queueMicrotask(()=>callback(null));return;}
    if(mode==='exit')return original(process.execPath,['-e','process.exit(7)'],options,callback);
    const width=mode==='dimensions'?49:50;
    const header='P7\\nWIDTH '+width+'\\nHEIGHT 50\\nDEPTH 4\\nMAXVAL 255\\nTUPLTYPE RGB_ALPHA\\nENDHDR\\n';
    const bytes=mode==='malformed'?Buffer.from('bad pixels'):Buffer.concat([Buffer.from(header),Buffer.alloc(mode==='partial'?5:width*50*4)]);
    if(mode==='deadline')return original(process.execPath,['-e','setTimeout(()=>require("fs").writeFileSync('+JSON.stringify(out)+',Buffer.from('+JSON.stringify(bytes.toString('base64'))+',"base64")),850)'],options,callback);
    fs.writeFileSync(out,bytes);queueMicrotask(()=>callback(null));
   };
   syncBuiltinESMExports();const {verifyTeamImage}=await import(${JSON.stringify(new URL('./verify-team-image.mjs',import.meta.url).href)});
   await assert.rejects(()=>verifyTeamImage(Buffer.from(${JSON.stringify(ANIMATED.toString('base64'))},'base64'),{timeoutMs:1500}));
   assert.ok(calls>=1);if(${JSON.stringify(mode)}==='deadline')assert.equal(calls,2,'both frames consume one shared deadline');
   assert.ok(directories.every(d=>!fs.existsSync(d)),'native temporary images/pixels must be removed after failure');`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',timeout:5000});
  assert.equal(result.status,0,`${mode}: ${result.stderr||result.error}`);
 }
});

test('PNG deadline rejects a stalled decoder through the normal error path',()=>{
 const input=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGO0qdjCwMDAxAAGABCSAWwmSJZFAAAAAElFTkSuQmCC','base64');
 const code=`import assert from 'node:assert/strict';import png from 'pngjs';
  png.PNG=class{parse(){}};
  const {verifyTeamImage}=await import(${JSON.stringify(new URL('./verify-team-image.mjs',import.meta.url).href)});
  await assert.rejects(()=>verifyTeamImage(Buffer.from(${JSON.stringify(input.toString('base64'))},'base64'),{timeoutMs:50}),/deadline/);`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',timeout:3000});
 assert.equal(result.status,0,result.stderr||result.error);
});

import {deflateSync,inflateSync} from 'node:zlib';
{
const {validatePngContainer,validateJpegContainer}=verifier;
// Self-contained private rasters: no production data, shared fixtures, external
// paths, image-generation runtime, or codec dependency is used by these tests.
const JPEG=Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDx2iiiu04z/9k=','base64');
// Real 2x2 progressive JPEG, 520 bytes; generated once, embedded for portability.
const PROGRESSIVE=Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wgARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUAQEAAAAAAAAAAAAAAAAAAAAD/9oADAMBAAIQAxAAAAGODD//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAn//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AX//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/An//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IX//2gAMAwEAAgADAAAAEAv/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==','base64');
const PNG_SIGNATURE=Buffer.from('89504e470d0a1a0a','hex');
function crc(bytes){let value=0xffffffff;for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=(value&1)?(value>>>1)^0xedb88320:value>>>1;}return(value^0xffffffff)>>>0;}
function chunk(type,data=Buffer.alloc(0)){const out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length);out.write(type,4,'ascii');data.copy(out,8);out.writeUInt32BE(crc(out.subarray(4,-4)),out.length-4);return out;}
function pack(chunks){return Buffer.concat([PNG_SIGNATURE,...chunks.map(({type,data})=>chunk(type,data))]);}
function chunks(bytes){const out=[];for(let at=8;at<bytes.length;){const n=bytes.readUInt32BE(at);out.push({type:bytes.toString('ascii',at+4,at+8),data:bytes.subarray(at+8,at+8+n)});at+=12+n;}return out;}
function header({width=2,height=2,color=2,depth=8,interlace=0}={}){const out=Buffer.alloc(13);out.writeUInt32BE(width);out.writeUInt32BE(height,4);out[8]=depth;out[9]=color;out[12]=interlace;return out;}
const PIXELS=Buffer.from([0,12,34,56,12,34,56,0,12,34,56,12,34,56]);
const SIMPLE=[{type:'IHDR',data:header()},{type:'IDAT',data:deflateSync(PIXELS)},{type:'IEND',data:Buffer.alloc(0)}];
const PNG=pack(SIMPLE);
function animation({defaultInAnimation=true,palette=false}={}){
  const acTL=Buffer.alloc(8);acTL.writeUInt32BE(defaultInAnimation?2:1);
  const fcTL=(seq,w=2,h=2,x=0,y=0)=>{const data=Buffer.alloc(26);data.writeUInt32BE(seq);data.writeUInt32BE(w,4);data.writeUInt32BE(h,8);data.writeUInt32BE(x,12);data.writeUInt32BE(y,16);return{type:'fcTL',data};};
  const out=[{type:'IHDR',data:header({color:palette?3:2})},{type:'acTL',data:acTL}];
  if(palette)out.push({type:'PLTE',data:Buffer.from([255,0,0,0,0,255])},{type:'tRNS',data:Buffer.from([0,255])});
  if(defaultInAnimation)out.push(fcTL(0));
  out.push({type:'IDAT',data:deflateSync(palette?Buffer.from([0,0,0,0,0,0]):PIXELS)});
  out.push(fcTL(defaultInAnimation?1:0,1,1,1,1));
  const sequence=Buffer.alloc(4);sequence.writeUInt32BE(defaultInAnimation?2:1);
  out.push({type:'fdAT',data:Buffer.concat([sequence,deflateSync(palette?Buffer.from([0,1]):Buffer.from([0,56,34,12]))])},{type:'IEND',data:Buffer.alloc(0)});
  return out;
}

test('PNG validates a complete small raster and preserves its original compressed stream',()=>{
  const out=validatePngContainer(PNG);assert.equal(out.format,'png');assert.equal(out.width,2);assert.equal(out.height,2);assert.equal(out.decodeInputs.length,1);
  const data=Buffer.concat(chunks(out.decodeInputs[0].bytes).filter(x=>x.type==='IDAT').map(x=>x.data));assert.deepEqual(data,SIMPLE[1].data);assert.deepEqual(inflateSync(data),PIXELS);
});
test('PNG rejects header-only, half, tail, oversized lengths, bad CRC and bytes after IEND',()=>{
  const badCrc=Buffer.from(PNG);badCrc[badCrc.length-1]^=1;
  const badLength=Buffer.from(PNG);badLength.writeUInt32BE(0x7fffffff,8);
  for(const bad of [PNG.subarray(0,24),PNG.subarray(0,Math.floor(PNG.length/2)),PNG.subarray(0,-2),badCrc,badLength,Buffer.concat([PNG,Buffer.from([0])])])assert.throws(()=>validatePngContainer(bad));
});
test('PNG accepts legal unknown ancillary chunks including the future reserved bit',()=>{
  for(const type of ['aaAa','aaaa'])assert.equal(validatePngContainer(pack([SIMPLE[0],{type,data:Buffer.from([1,2])},...SIMPLE.slice(1)])).width,2);
  for(const type of ['AaAA','Aaaa'])assert.throws(()=>validatePngContainer(pack([SIMPLE[0],{type,data:Buffer.from([1,2])},...SIMPLE.slice(1)])),/unknown critical/);
});
test('PNG keeps backward-compatible eXIf before or after IDAT, but rejects duplicate or interposed eXIf',()=>{
  // PNG Extensions 1.5.0 section 3.7 permits either side of the complete IDAT run.
  const exif={type:'eXIf',data:Buffer.from('49492a0008000000000000000000','hex')};
  for(const at of [1,2]){const cs=SIMPLE.slice();cs.splice(at,0,exif);assert.equal(validatePngContainer(pack(cs)).width,2);}
  assert.throws(()=>validatePngContainer(pack([SIMPLE[0],exif,SIMPLE[1],exif,SIMPLE[2]])));
  const data=SIMPLE[1].data;assert.throws(()=>validatePngContainer(pack([SIMPLE[0],{type:'IDAT',data:data.subarray(0,5)},exif,{type:'IDAT',data:data.subarray(5)},SIMPLE[2]])),/consecutive/);
});
test('PNG allows split consecutive IDAT and metadata while preserving critical chunk order',()=>{
  const data=SIMPLE[1].data;
  const split=[SIMPLE[0],{type:'tEXt',data:Buffer.from('Author\0Example')},{type:'IDAT',data:data.subarray(0,5)},{type:'IDAT',data:data.subarray(5)},SIMPLE[2]];
  assert.equal(validatePngContainer(pack(split)).width,2);
  for(const cs of [[SIMPLE[1],SIMPLE[0],SIMPLE[2]],[SIMPLE[0],SIMPLE[0],...SIMPLE.slice(1)],[SIMPLE[0],SIMPLE[2]]])assert.throws(()=>validatePngContainer(pack(cs)));
});
test('PNG enforces encoded dimensions/byte budgets and standard header values',()=>{
  for(const patch of [{width:0},{height:1281},{color:1},{depth:3}])assert.throws(()=>validatePngContainer(pack([{type:'IHDR',data:header(patch)},...SIMPLE.slice(1)])));
  assert.throws(()=>validatePngContainer(Buffer.alloc(200*1024+1)));
  for(const offset of [10,11,12]){const h=header();h[offset]=2;assert.throws(()=>validatePngContainer(pack([{type:'IHDR',data:h},...SIMPLE.slice(1)])));}
});
test('PNG framing accepts all standard depth/color pairs and both interlace methods',()=>{
  // Framing only: raw pixels for these encoding combinations are the decoder's
  // responsibility, not something the container parser fabricates or decodes.
  for(const [color,depths] of [[0,[1,2,4,8,16]],[2,[8,16]],[3,[1,2,4,8]],[4,[8,16]],[6,[8,16]]])for(const depth of depths)for(const interlace of [0,1]){
    const cs=[{type:'IHDR',data:header({color,depth,interlace})}];if(color===3)cs.push({type:'PLTE',data:Buffer.from([0,0,0])});cs.push(...SIMPLE.slice(1));assert.equal(validatePngContainer(pack(cs)).width,2);
  }
});
test('APNG includes every animation frame and the separate default image in decode inputs',()=>{
  for(const defaultInAnimation of [true,false]){const out=validatePngContainer(pack(animation({defaultInAnimation})));assert.deepEqual(out.decodeInputs.map(x=>[x.width,x.height]),[[2,2],[1,1]]);for(const frame of out.decodeInputs)validatePngContainer(frame.bytes);}
});
test('APNG rejects wrong sequence/count/rectangle/operations or missing later frame data',()=>{
  for(const change of ['sequence','count','x','y','width','dispose','blend','missing']){
    const cs=animation().map(x=>({...x,data:Buffer.from(x.data)})),frame=cs.findLast(x=>x.type==='fcTL').data;
    if(change==='sequence')frame.writeUInt32BE(77);if(change==='count')cs.find(x=>x.type==='acTL').data.writeUInt32BE(5);
    if(change==='x')frame.writeUInt32BE(2,12);if(change==='y')frame.writeUInt32BE(2,16);if(change==='width')frame.writeUInt32BE(0,4);
    if(change==='dispose')frame[24]=3;if(change==='blend')frame[25]=2;if(change==='missing')cs.splice(cs.findIndex(x=>x.type==='fdAT'),1);
    assert.throws(()=>validatePngContainer(pack(cs)),change);
  }
});
test('APNG copies only necessary palette/transparency and retains original compressed frame bytes',()=>{
  const cs=animation({defaultInAnimation:false,palette:true});cs.splice(4,0,{type:'tEXt',data:Buffer.from('Long metadata\0'+'.'.repeat(1024))});
  const out=validatePngContainer(pack(cs));
  for(const frame of out.decodeInputs){const framed=chunks(frame.bytes);assert.deepEqual(framed.map(x=>x.type),['IHDR','PLTE','tRNS','IDAT','IEND']);assert.deepEqual(framed.find(x=>x.type==='PLTE').data,Buffer.from([255,0,0,0,0,255]));assert.deepEqual(framed.find(x=>x.type==='tRNS').data,Buffer.from([0,255]));}
  const fd=cs.find(x=>x.type==='fdAT').data.subarray(4);assert.deepEqual(chunks(out.decodeInputs[1].bytes).find(x=>x.type==='IDAT').data,fd);assert.deepEqual(inflateSync(fd),Buffer.from([0,1]));
});
test('APNG valid CRCs cannot hide later compressed corruption by discarding that frame',()=>{
  const cs=animation();cs.find(x=>x.type==='fdAT').data.fill(0,4);
  const out=validatePngContainer(pack(cs));assert.equal(out.decodeInputs.length,2);
  const later=chunks(out.decodeInputs[1].bytes).find(x=>x.type==='IDAT').data;assert.throws(()=>inflateSync(later));
  // Actual PNG pixel decoder rejection belongs in the integration suite; zlib is
  // used here only to establish this embedded test data really is corrupt.
});
test('JPEG accepts real baseline/progressive and APP/COM/marker fill',()=>{
  assert.deepEqual(validateJpegContainer(JPEG),{format:'jpeg',width:2,height:2});assert.deepEqual(validateJpegContainer(PROGRESSIVE),{format:'jpeg',width:2,height:2});
  const metadata=Buffer.from([255,239,0,5,1,2,3,255,254,0,2,255]);assert.equal(validateJpegContainer(Buffer.concat([JPEG.subarray(0,2),metadata,JPEG.subarray(2)])).width,2);
});
test('JPEG rejects the CI SOS length-zero mutation plus truncated/oversized marker segments',()=>{
  const sos=JPEG.indexOf(Buffer.from([255,218])),bad=Buffer.from(JPEG);bad.writeUInt16BE(0,sos+2);assert.throws(()=>validateJpegContainer(bad),/segment length/);
  for(const b of [JPEG.subarray(0,64),JPEG.subarray(0,Math.floor(JPEG.length/2)),JPEG.subarray(0,-2),Buffer.concat([JPEG,Buffer.from([1])]),Buffer.from([255,216,255,217])])assert.throws(()=>validateJpegContainer(b));
  for(const length of [1,65535]){const b=Buffer.from(JPEG);b.writeUInt16BE(length,4);assert.throws(()=>validateJpegContainer(b));}
});
test('JPEG validates SOS count/length/component/parameters and rejects duplicate nonhierarchical frames',()=>{
  const sos=JPEG.indexOf(Buffer.from([255,218])),sof=JPEG.indexOf(Buffer.from([255,192]));
  for(const [offset,value] of [[sos+3,13],[sos+4,0],[sos+4,4],[sos+5,99],[sos+7,1],[sos+11,1],[sos+12,62],[sos+13,1]]){const b=Buffer.from(JPEG);b[offset]=value;assert.throws(()=>validateJpegContainer(b));}
  const end=sof+2+JPEG.readUInt16BE(sof+2);assert.throws(()=>validateJpegContainer(Buffer.concat([JPEG.subarray(0,end),JPEG.subarray(sof,end),JPEG.subarray(end)])));
});
function jpegSegment(marker,data){const out=Buffer.alloc(data.length+4);out[0]=255;out[1]=marker;out.writeUInt16BE(data.length+2,2);data.copy(out,4);return out;}
function structuralJpeg(components,progressive=false,scanComponents=1){
  // Synthetic structural boundary fixture: intentionally does not claim valid
  // entropy coding. Official codec integration must independently decode pixels.
  const frame=Buffer.alloc(6+3*components);frame[0]=8;frame.writeUInt16BE(1,1);frame.writeUInt16BE(1,3);frame[5]=components;
  for(let i=0;i<components;i++){frame[6+3*i]=i;frame[7+3*i]=0x11;}
  const scans=[];for(let i=0;i<components;i+=scanComponents){const n=Math.min(scanComponents,components-i),scan=Buffer.alloc(4+2*n);scan[0]=n;for(let j=0;j<n;j++)scan[1+2*j]=i+j;scan[2+2*n]=progressive?0:63;scans.push(jpegSegment(0xda,scan),Buffer.from([1]));}
  return Buffer.concat([Buffer.from([255,216]),jpegSegment(progressive?0xc2:0xc0,frame),...scans,Buffer.from([255,217])]);
}
test('JPEG keeps distinct standard limits for progressive Nf and scan Ns',()=>{
  // T.81 Table B.2: progressive Nf 1..4, sequential Nf 1..255.
  // Table B.3: Ns 1..4 in all modes; noninterleaved scans can cover larger frames.
  assert.equal(validateJpegContainer(structuralJpeg(4,true)).width,1);
  assert.throws(()=>validateJpegContainer(structuralJpeg(5,true)),/frame encoding/);
  assert.equal(validateJpegContainer(structuralJpeg(5,false)).width,1);
  assert.throws(()=>validateJpegContainer(structuralJpeg(5,false,5)),/SOS length or component/);
});
test('JPEG enforces dimensions/DQT/DHT framing and does not permit disabled restarts',()=>{
  const sof=JPEG.indexOf(Buffer.from([255,192])),sos=JPEG.indexOf(Buffer.from([255,218]));
  for(const value of [0,1281]){const b=Buffer.from(JPEG);b.writeUInt16BE(value,sof+7);assert.throws(()=>validateJpegContainer(b));}
  for(const marker of [0xdb,0xc4]){const at=JPEG.indexOf(Buffer.from([255,marker])),b=Buffer.from(JPEG);b.writeUInt16BE(3,at+2);assert.throws(()=>validateJpegContainer(b));}
  const entropy=sos+2+JPEG.readUInt16BE(sos+2);assert.throws(()=>validateJpegContainer(Buffer.concat([JPEG.subarray(0,entropy+1),Buffer.from([255,208]),JPEG.subarray(entropy+1)])));
  assert.throws(()=>validateJpegContainer(Buffer.alloc(200*1024+1)));
});

const {verifyTeamImage}=verifier;
test('complete decoding accepts real baseline/progressive JPEG without changing input bytes',async()=>{
  for(const [format,input] of [['jpeg',JPEG],['jpeg',PROGRESSIVE],['png',PNG]]){
    const original=Buffer.from(input);
    assert.deepEqual(await verifyTeamImage(input),{format,width:2,height:2});
    assert.deepEqual(input,original);
  }
});

test('complete decoding accepts all APNG frames with default image included or separate',async()=>{
  for(const defaultInAnimation of [true,false])for(const palette of [true,false]){
    const input=pack(animation({defaultInAnimation,palette})),original=Buffer.from(input);
    assert.deepEqual(await verifyTeamImage(input),{format:'png',width:2,height:2});
    assert.deepEqual(input,original);
  }
});

test('complete decoding rejects bad later APNG pixels even with valid raw lengths and repaired CRC',async()=>{
  for(const defaultInAnimation of [true,false]){
    const imageChunks=animation({defaultInAnimation,palette:true});
    // Keep fcTL geometry, fdAT sequence and length; zero only compressed pixels.
    // pack recomputes the CRC for the damaged original fdAT source chunk.
    imageChunks.find(x=>x.type==='fdAT').data.fill(0,4);
    const input=pack(imageChunks),original=Buffer.from(input);
    const framed=validatePngContainer(input);
    assert.equal(framed.decodeInputs.length,2);
    // The first image alone is valid. Whole-image acceptance must wait for the
    // separate later frame, rather than treating pngjs's default image as enough.
    assert.deepEqual(await verifyTeamImage(framed.decodeInputs[0].bytes),{format:'png',width:2,height:2});
    await assert.rejects(()=>verifyTeamImage(input));
    assert.deepEqual(input,original);
  }
});

test('complete decoding preserves backward-compatible eXIf and future ancillary chunks',async()=>{
  const exif={type:'eXIf',data:Buffer.from('49492a0008000000000000000000','hex')};
  for(const at of [1,2]){
    const imageChunks=SIMPLE.slice();imageChunks.splice(at,0,exif);
    imageChunks.splice(1,0,{type:'aaaa',data:Buffer.from([9,8,7])});
    const input=pack(imageChunks),original=Buffer.from(input);
    assert.deepEqual(await verifyTeamImage(input),{format:'png',width:2,height:2});
    assert.deepEqual(input,original);
  }
});

test('complete decoding rejects the CI bad-SOS-length mutation before tolerant JPEG parsing',async()=>{
  const input=Buffer.from(JPEG),sos=input.indexOf(Buffer.from([255,218]));
  input.writeUInt16BE(0,sos+2);
  const original=Buffer.from(input);
  await assert.rejects(()=>verifyTeamImage(input));
  assert.deepEqual(input,original);
});

test('complete decoding rejects CRC-correct corrupt static PNG compressed data',async()=>{
  const imageChunks=SIMPLE.map(x=>({...x,data:Buffer.from(x.data)}));
  imageChunks.find(x=>x.type==='IDAT').data.fill(0);
  const input=pack(imageChunks),original=Buffer.from(input);
  assert.equal(validatePngContainer(input).decodeInputs.length,1);
  await assert.rejects(()=>verifyTeamImage(input));
  assert.deepEqual(input,original);
});


test('PNG rejects a missing zlib trailer and surplus decoded scanlines after raw lengths and CRCs are repaired',async()=>{
  for(const compressed of [SIMPLE[1].data.subarray(0,-4),deflateSync(Buffer.concat([PIXELS,PIXELS.subarray(0,7)]))]){
    const input=pack([SIMPLE[0],{type:'IDAT',data:compressed},SIMPLE[2]]);
    assert.equal(validatePngContainer(input).decodeInputs.length,1);
    await assert.rejects(()=>verifyTeamImage(input));
  }
});

test('APNG checks the zlib trailer and scanline count of the nonfirst frame',async()=>{
  for(const mode of ['missing-trailer','extra-scanline']){
    const cs=animation({defaultInAnimation:false}),last=cs.find(x=>x.type==='fdAT');
    last.data=mode==='missing-trailer'?last.data.subarray(0,-4):Buffer.concat([last.data.subarray(0,4),deflateSync(Buffer.from([0,56,34,12,0,56,34,12]))]);
    const input=pack(cs);assert.equal(validatePngContainer(input).decodeInputs.length,2);
    await assert.rejects(()=>verifyTeamImage(input));
  }
});

test('complete PNG/APNG streams preserve permitted unused final chunk bytes',async()=>{
  const tail=Buffer.from([7,8,9,0]),cs=animation({defaultInAnimation:false});
  cs.find(x=>x.type==='IDAT').data=Buffer.concat([cs.find(x=>x.type==='IDAT').data,tail]);
  cs.find(x=>x.type==='fdAT').data=Buffer.concat([cs.find(x=>x.type==='fdAT').data,tail]);
  const input=pack(cs),before=Buffer.from(input);
  assert.deepEqual(await verifyTeamImage(input),{format:'png',width:2,height:2});assert.deepEqual(input,before);
  const compressed=SIMPLE[1].data;
  const split=pack([SIMPLE[0],{type:'IDAT',data:compressed.subarray(0,-2)},{type:'IDAT',data:Buffer.concat([compressed.subarray(-2),tail])},SIMPLE[2]]);
  assert.deepEqual(await verifyTeamImage(split),{format:'png',width:2,height:2});
});

function adam7Raster(width,height,color=6,depth=8){
  // Test encoder only: seven official pass coordinate sets, zero-valued pixels,
  // filter type 0. Production still delegates inflate and pixel decoding.
  const pattern=[[1,6,4,6,2,6,4,6],[7,7,7,7,7,7,7,7],[5,6,5,6,5,6,5,6],[7,7,7,7,7,7,7,7],[3,6,4,6,3,6,4,6],[7,7,7,7,7,7,7,7],[5,6,5,6,5,6,5,6],[7,7,7,7,7,7,7,7]];
  const channels={0:1,2:3,3:1,4:2,6:4}[color],rows=[];
  // Enumerate the normative pattern instead of reusing production pass lengths.
  for(let pass=1;pass<=7;pass++)for(let y=0;y<height;y++){
    let pixels=0;for(let x=0;x<width;x++)if(pattern[y%8][x%8]===pass)pixels++;
    if(!pixels)continue;
    const bits=pixels*channels*depth,row=Buffer.alloc(1+Math.ceil(bits/8)),unused=(8-bits%8)%8;
    if(unused)row[row.length-1]|=(1<<unused)-1; // legal unused low bits need not be zero
    rows.push(row);
  }
  const scanlines=Buffer.concat(rows),cs=[{type:'IHDR',data:header({width,height,color,depth,interlace:1})}];
  if(color===3)cs.push({type:'PLTE',data:Buffer.from([0,0,0])});
  cs.push({type:'IDAT',data:deflateSync(scanlines)},SIMPLE[2]);return{bytes:pack(cs),scanlines,cs};
}

test('Adam7 real pixel decoding accepts tiny empty-pass boundaries and standard depth/color combinations',async()=>{
  assert.equal(adam7Raster(2,2).scanlines.length,19);
  for(const [width,height] of [[1,1],[1,2],[2,1],[2,2],[3,3],[8,8],[9,9],[1280,1]]){
    const input=adam7Raster(width,height).bytes;assert.deepEqual(await verifyTeamImage(input),{format:'png',width,height});
  }
  for(const [color,depths] of [[0,[1,2,4,8,16]],[2,[8,16]],[3,[1,2,4,8]],[4,[8,16]],[6,[8,16]]])for(const depth of depths)for(const [width,height] of [[1,1],[1,9],[9,1],[2,2],[3,5],[8,8],[9,7]]){
    assert.deepEqual(await verifyTeamImage(adam7Raster(width,height,color,depth).bytes),{format:'png',width,height});
  }
});

test('Adam7 rejects missing and surplus decompressed pass bytes',async()=>{
  const raster=adam7Raster(2,2);
  for(const scanlines of [raster.scanlines.subarray(0,-1),Buffer.concat([raster.scanlines,Buffer.from([0])])]){
    const cs=raster.cs.map(x=>x.type==='IDAT'?{type:'IDAT',data:deflateSync(scanlines)}:x);
    await assert.rejects(()=>verifyTeamImage(pack(cs)));
  }
});

test('APNG Adam7 passes use each original frame size independently of its canvas offset',async()=>{
  const cs=animation({defaultInAnimation:false});cs[0].data[12]=1;
  cs.find(x=>x.type==='IDAT').data=adam7Raster(2,2,2).cs.find(x=>x.type==='IDAT').data;
  const last=cs.find(x=>x.type==='fdAT');last.data=Buffer.concat([last.data.subarray(0,4),adam7Raster(1,1,2).cs.find(x=>x.type==='IDAT').data]);
  const original=pack(cs);assert.deepEqual(await verifyTeamImage(original),{format:'png',width:2,height:2});
  const input=validatePngContainer(original);assert.deepEqual(input.decodeInputs.map(f=>[f.width,f.height]),[[2,2],[1,1]]);
});

}
