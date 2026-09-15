/** Offline image build gate: original container checks plus complete pixel decoding. */
import { readFileSync, realpathSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {inflateSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

// Node 22 returns an empty CJS namespace from `await import()` when this process has
// already read a piped stdin (see scripts/verify-team-image.test.mjs). Both decoders are
// plain CommonJS, so load them with require(): correct on every supported Node.
const requireDecoder=createRequire(import.meta.url);

// Container checks only. Call the approved pixel decoder on EVERY decodeInput
// before treating this image as usable; publishing always retains the source bytes.
// PNG: https://www.w3.org/TR/png-3/ (5.3-5.6, 11.2, 11.3.6).
// JPEG: https://www.w3.org/Graphics/JPEG/itu-t81.pdf (Annex B).
const PNG_SIGNATURE=Buffer.from('89504e470d0a1a0a','hex');
function reject(format,reason){throw new Error(`${format} container: ${reason}`);}
function imageBytes(bytes,format){if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>200*1024)reject(format,'invalid byte length (maximum 200 KiB)');}
function imageDimensions(width,height,format){if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>1280||height>1280)reject(format,'dimensions must be 1..1280 pixels');}
function pngCrc(bytes){let crc=0xffffffff;for(const value of bytes){crc^=value;for(let bit=0;bit<8;bit++)crc=(crc&1)?(crc>>>1)^0xedb88320:crc>>>1;}return(crc^0xffffffff)>>>0;}
function pngChunk(type,data=Buffer.alloc(0)){
  const out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length);out.write(type,4,'ascii');data.copy(out,8);out.writeUInt32BE(pngCrc(out.subarray(4,-4)),out.length-4);return out;
}

export function validatePngContainer(bytes){
  imageBytes(bytes,'PNG');if(bytes.length<8||!bytes.subarray(0,8).equals(PNG_SIGNATURE))reject('PNG','invalid signature');
  const chunks=[],counts=new Map();let position=8;
  while(position<bytes.length){
    if(bytes.length-position<12)reject('PNG','truncated chunk');
    const length=bytes.readUInt32BE(position),end=position+12+length;
    if(length>0x7fffffff||end>bytes.length)reject('PNG','chunk length exceeds available bytes');
    const typeBytes=bytes.subarray(position+4,position+8),type=typeBytes.toString('ascii');
    if(!typeBytes.every(x=>(x>=65&&x<=90)||(x>=97&&x<=122)))reject('PNG','invalid chunk type');
    // PNG 3 section 13.5: a future reserved bit is handled as an unknown chunk,
    // not a reason to reject. The ancillary/critical bit still controls safety.
    if(pngCrc(bytes.subarray(position+4,end-4))!==bytes.readUInt32BE(end-4))reject('PNG',`${type} CRC mismatch`);
    if((typeBytes[0]&32)===0&&!['IHDR','PLTE','IDAT','IEND'].includes(type))reject('PNG',`unknown critical chunk ${type}`);
    chunks.push({type,data:bytes.subarray(position+8,end-4)});counts.set(type,(counts.get(type)||0)+1);position=end;
  }
  if(chunks[0]?.type!=='IHDR'||chunks.at(-1)?.type!=='IEND')reject('PNG','IHDR must be first and IEND last');
  for(const type of ['IHDR','PLTE','IEND','acTL','cHRM','cICP','gAMA','iCCP','mDCV','cLLI','sBIT','sRGB','bKGD','hIST','tRNS','eXIf','pHYs','tIME'])if(counts.get(type)>1)reject('PNG',`duplicate ${type}`);
  const header=chunks[0].data;
  if(header.length!==13)reject('PNG','IHDR must contain 13 bytes');
  const width=header.readUInt32BE(0),height=header.readUInt32BE(4),depth=header[8],color=header[9];imageDimensions(width,height,'PNG');
  if(!({0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]}[color]?.includes(depth))||header[10]!==0||header[11]!==0||header[12]>1)reject('PNG','invalid IHDR encoding values');
  const firstData=chunks.findIndex(x=>x.type==='IDAT'),lastData=chunks.findLastIndex(x=>x.type==='IDAT'),palette=chunks.findIndex(x=>x.type==='PLTE');
  if(firstData<0||chunks.at(-1).data.length)reject('PNG','missing IDAT or nonempty IEND');
  for(let i=firstData;i<=lastData;i++)if(chunks[i].type!=='IDAT')reject('PNG','IDAT chunks must be consecutive');
  if(palette>=firstData||(color===3&&palette<0)||([0,4].includes(color)&&palette>=0))reject('PNG','invalid PLTE position or color type');
  let paletteEntries=0;
  if(palette>=0){const size=chunks[palette].data.length;paletteEntries=size/3;if(!size||size%3||paletteEntries>256||(color===3&&paletteEntries>2**depth))reject('PNG','invalid PLTE size');}
  const beforePalette=new Set(['cHRM','cICP','gAMA','iCCP','mDCV','cLLI','sBIT','sRGB']);
  // PNG 3 Table 7 puts eXIf before IDAT, but the official PNG Extensions 1.5.0
  // section 3.7 also permits it after the entire IDAT run. This reader preserves
  // those existing files; the consecutive-IDAT check still forbids interposition.
  // https://ftp-osl.osuosl.org/pub/libpng/documents/pngext-1.5.0.html#C.eXIf
  const beforeData=new Set([...beforePalette,'acTL','bKGD','hIST','tRNS','pHYs','sPLT']);
  const fixedLengths={cHRM:32,cICP:4,gAMA:4,mDCV:24,cLLI:8,sRGB:1,pHYs:9,tIME:7};
  for(let i=1;i<chunks.length-1;i++){
    const {type,data}=chunks[i];
    if(beforeData.has(type)&&i>firstData)reject('PNG',`${type} must precede IDAT`);
    if(beforePalette.has(type)&&palette>=0&&i>palette)reject('PNG',`${type} must precede PLTE`);
    if(['bKGD','hIST','tRNS'].includes(type)&&palette>=0&&i<palette)reject('PNG',`${type} must follow PLTE`);
    if(Object.hasOwn(fixedLengths,type)&&data.length!==fixedLengths[type])reject('PNG',`${type} invalid length`);
    if(type==='tRNS'&&((color===0&&data.length!==2)||(color===2&&data.length!==6)||(color===3&&(!data.length||data.length>paletteEntries))||[4,6].includes(color)))reject('PNG','invalid tRNS');
    if(type==='hIST'&&(palette<0||data.length!==2*paletteEntries))reject('PNG','invalid hIST');
    if(type==='bKGD'&&(data.length!==({0:2,2:6,3:1,4:2,6:6}[color])||(color===3&&data[0]>=paletteEntries)))reject('PNG','invalid bKGD');
    if(type==='sBIT'){const size={0:1,2:3,3:3,4:2,6:4}[color];if(data.length!==size||!data.every(x=>x>0&&x<=(color===3?8:depth)))reject('PNG','invalid sBIT');}
  }
  const defaultData=chunks.slice(firstData,lastData+1).map(x=>x.data);
  if(defaultData.reduce((n,x)=>n+x.length,0)===0)reject('PNG','empty compressed image');
  const animation=chunks.find(x=>x.type==='acTL');const frames=[];
  if(!animation&&(counts.has('fcTL')||counts.has('fdAT')))reject('PNG','animation frame without acTL');
  if(animation){
    if(animation.data.length!==8||animation.data.readUInt32BE(0)===0)reject('PNG','invalid acTL');
    let sequence=0,current=null;
    for(let i=1;i<chunks.length-1;i++){
      const {type,data}=chunks[i];
      if(type==='fcTL'){
        if(data.length!==26||data.readUInt32BE(0)!==sequence++)reject('PNG','invalid fcTL length or sequence');
        if(current&&!current.data.some(x=>x.length>0))reject('PNG','animation frame has no compressed data');
        const fw=data.readUInt32BE(4),fh=data.readUInt32BE(8),x=data.readUInt32BE(12),y=data.readUInt32BE(16);imageDimensions(fw,fh,'PNG');
        if(x+fw>width||y+fh>height||data[24]>2||data[25]>1)reject('PNG','invalid frame rectangle or operations');
        const isDefault=i<firstData;
        if(isDefault&&(frames.length||x||y||fw!==width||fh!==height))reject('PNG','invalid default animation frame');
        current={width:fw,height:fh,data:isDefault?defaultData:[],isDefault};frames.push(current);
      }else if(type==='fdAT'){
        if(i<lastData||!current||current.isDefault||data.length<4||data.readUInt32BE(0)!==sequence++)reject('PNG','invalid fdAT position, length or sequence');
        current.data.push(data.subarray(4));
      }
    }
    if(!current||!current.data.some(x=>x.length>0)||frames.length!==animation.data.readUInt32BE(0))reject('PNG','animation frame count or data mismatch');
  }
  // Only after the complete original stream passes all checks, wrap each original
  // compressed frame in PNG framing. No pixel decoding or recompression happens.
  const decodeFrames=frames.length&&frames[0].isDefault?frames:[{width,height,data:defaultData},...frames];
  const paletteAndAlpha=chunks.filter(x=>['PLTE','tRNS'].includes(x.type)).map(x=>pngChunk(x.type,x.data));
  const decodeInputs=decodeFrames.map(frame=>{
    const frameHeader=Buffer.from(header);frameHeader.writeUInt32BE(frame.width,0);frameHeader.writeUInt32BE(frame.height,4);
    return{width:frame.width,height:frame.height,compressed:Buffer.concat(frame.data),bitDepth:depth,colorType:color,interlace:header[12],bytes:Buffer.concat([PNG_SIGNATURE,pngChunk('IHDR',frameHeader),...paletteAndAlpha,...frame.data.map(x=>pngChunk('IDAT',x)),pngChunk('IEND')])};
  });
  return{format:'png',width,height,decodeInputs};
}

const SOF_MARKERS=new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
export function validateJpegContainer(bytes){
  imageBytes(bytes,'JPEG');if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8)reject('JPEG','missing SOI');
  let position=2,frame=null,width=0,height=0,scanCount=0,restartInterval=0,hierarchical=false,sawEnd=false;
  while(position<bytes.length){
    if(bytes[position++]!==0xff)reject('JPEG','expected marker');
    while(position<bytes.length&&bytes[position]===0xff)position++;
    if(position>=bytes.length)reject('JPEG','truncated marker');
    const marker=bytes[position++];
    if(marker===0||marker===0xd8||(marker>=0xd0&&marker<=0xd7))reject('JPEG','unexpected standalone marker');
    if(marker===0xd9){if(!frame||!scanCount||position!==bytes.length)reject('JPEG','invalid EOI or trailing bytes');sawEnd=true;break;}
    if(marker===1)continue;
    if(position+2>bytes.length)reject('JPEG','truncated segment length');
    const length=bytes.readUInt16BE(position),end=position+length;
    if(length<2||end>bytes.length)reject('JPEG','segment length exceeds available bytes');
    const data=bytes.subarray(position+2,end);position=end;
    if(SOF_MARKERS.has(marker)||marker===0xde){
      if(length<11)reject('JPEG','truncated frame');
      const components=data[5],fw=data.readUInt16BE(3),fh=data.readUInt16BE(1),precision=data[0];
      if(!components||length!==8+3*components)reject('JPEG','invalid SOF length');
      if(fw<1||fw>1280||fh>1280)reject('JPEG','frame exceeds dimension limit');
      const progressive=[0xc2,0xc6,0xca,0xce].includes(marker),lossless=[0xc3,0xc7,0xcb,0xcf].includes(marker);
      // T.81 Table B.2 limits progressive Nf to 1..4; sequential Nf may be
      // 1..255. This is independent of the scan Ns limit in Table B.3 below.
      if((marker===0xc0&&precision!==8)||(lossless?(precision<2||precision>16):![8,12].includes(precision))||(progressive&&components>4))reject('JPEG','invalid frame encoding values');
      const ids=new Set();
      for(let i=0;i<components;i++){const at=6+3*i,id=data[at],h=data[at+1]>>>4,v=data[at+1]&15,q=data[at+2];if(ids.has(id)||h<1||h>4||v<1||v>4||q>3||(lossless&&q!==0))reject('JPEG','invalid frame component');ids.add(id);}
      if(marker===0xde){if(frame||hierarchical)reject('JPEG','invalid DHP position');hierarchical=true;width=fw;height=fh;}
      else{if(frame&&!hierarchical)reject('JPEG','multiple nonhierarchical frames');frame={marker,ids,precision,progressive,lossless};if(!hierarchical){width=fw;height=fh;}scanCount=0;}
    }else if(marker===0xda){
      if(!frame||data.length<4)reject('JPEG','SOS before frame or truncated SOS');
      const count=data[0];if(count<1||count>4||count>frame.ids.size||length!==6+2*count)reject('JPEG','invalid SOS length or component count');
      const ids=new Set();for(let i=0;i<count;i++){const id=data[1+2*i],tables=data[2+2*i];if(ids.has(id)||!frame.ids.has(id)||(tables>>>4)>(frame.marker===0xc0?1:3)||(tables&15)>(frame.marker===0xc0?1:3)||(frame.lossless&&(tables&15)!==0))reject('JPEG','invalid SOS component');ids.add(id);}
      const start=data[1+2*count],stop=data[2+2*count],high=data[3+2*count]>>>4,low=data[3+2*count]&15;
      if(frame.lossless?(start<1||start>7||stop!==0||high!==0||low>=frame.precision):frame.progressive?(start>63||stop<start||stop>63||(start===0&&stop!==0)||(start>0&&count!==1)||high>13||low>13||(high!==0&&high!==low+1)):(start!==0||stop!==63||high!==0||low!==0))reject('JPEG','invalid SOS scan parameters');
      let entropyBytes=0,restart=0;
      while(position<bytes.length){
        if(bytes[position]!==0xff){position++;entropyBytes++;continue;}
        const boundary=position;position++;let fill=0;while(position<bytes.length&&bytes[position]===0xff){fill++;position++;}
        if(position>=bytes.length)reject('JPEG','truncated entropy marker');
        const next=bytes[position];
        if(next===0){if(fill)reject('JPEG','invalid entropy byte stuffing');position++;entropyBytes++;continue;}
        if(next>=0xd0&&next<=0xd7){if(!restartInterval||next!==0xd0+restart||!entropyBytes)reject('JPEG','invalid restart marker');restart=(restart+1)%8;position++;entropyBytes=0;continue;}
        position=boundary;break;
      }
      if(!entropyBytes)reject('JPEG','empty entropy-coded scan');scanCount++;
    }else if(marker===0xdb){
      if(!data.length)reject('JPEG','empty DQT');let at=0;while(at<data.length){const selector=data[at++],precision=selector>>>4;if(precision>1||(selector&15)>3||at+64*(precision+1)>data.length)reject('JPEG','invalid DQT length or selector');for(let i=0;i<64;i++){const value=precision?data.readUInt16BE(at):data[at];if(!value)reject('JPEG','zero quantization value');at+=precision+1;}}
    }else if(marker===0xc4){
      if(!data.length)reject('JPEG','empty DHT');let at=0;while(at<data.length){const selector=data[at++];if((selector>>>4)>1||(selector&15)>3||at+16>data.length)reject('JPEG','invalid DHT selector or counts');let symbols=0,space=1;for(let i=0;i<16;i++){const count=data[at++];symbols+=count;space=2*space-count;if(space<0)reject('JPEG','oversubscribed Huffman table');}if(!symbols||symbols>256||at+symbols>data.length)reject('JPEG','invalid DHT symbol length');at+=symbols;}
    }else if(marker===0xcc){
      if(!data.length||data.length%2)reject('JPEG','invalid DAC length');for(let at=0;at<data.length;at+=2){const type=data[at]>>>4,id=data[at]&15,value=data[at+1];if(type>1||id>3||(type===1?(value<1||value>63):((value&15)>(value>>>4))))reject('JPEG','invalid DAC entry');}
    }else if(marker===0xdd){if(length!==4)reject('JPEG','invalid DRI length');restartInterval=data.readUInt16BE(0);
    }else if(marker===0xdc){if(length!==4||!frame||scanCount!==1||data.readUInt16BE(0)===0||data.readUInt16BE(0)>1280)reject('JPEG','invalid DNL');height=data.readUInt16BE(0);
    }else if(marker===0xdf){if(!hierarchical||length!==3||(data[0]>>>4)>1||(data[0]&15)>1)reject('JPEG','invalid EXP');
    }else if(!((marker>=0xe0&&marker<=0xfe)||marker===0xc8))reject('JPEG','unknown reserved marker');
  }
  if(!sawEnd)reject('JPEG','missing EOI');imageDimensions(width,height,'JPEG');return{format:'jpeg',width,height};
}

const webpError=message=>{throw new Error(`Invalid WebP container: ${message}`);};
function webpBounds(width,height) {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>1280||height>1280) webpError('dimensions exceed 1280px');
}
function riffChunks(bytes,start,end) {
  const chunks=[];
  for(let offset=start;offset<end;) {
    if(end-offset<8) webpError('truncated chunk header');
    const size=bytes.readUInt32LE(offset+4),body=offset+8,next=body+size+(size%2);
    if(next>end) webpError('chunk length exceeds its original container');
    if(size%2&&bytes[body+size]!==0) webpError('nonzero RIFF padding');
    chunks.push({tag:bytes.toString('latin1',offset,offset+4),offset,body,size,end:body+size,next});
    offset=next;
  }
  return chunks;
}
function webpBitstreamSize(bytes,chunk) {
  const p=chunk.body;
  if(chunk.tag==='VP8 ') {
    if(chunk.size<10||(bytes[p]&1)!==0||bytes[p+3]!==0x9d||bytes[p+4]!==1||bytes[p+5]!==0x2a) webpError('invalid VP8 key-frame header');
    return {width:bytes.readUInt16LE(p+6)&0x3fff,height:bytes.readUInt16LE(p+8)&0x3fff};
  }
  if(chunk.size<5||bytes[p]!==0x2f) webpError('invalid VP8L header');
  const bits=bytes.readUInt32LE(p+1);
  if(bits>>>29) webpError('unsupported VP8L version');
  return {width:(bits&0x3fff)+1,height:((bits>>>14)&0x3fff)+1};
}
function webpFrame(bytes,chunks,declared) {
  let alpha,bitstream;
  const misplaced=new Set(['VP8X','ICCP','ANIM','ANMF','EXIF','XMP ']);
  for(const c of chunks) {
    if(c.tag==='ALPH') {
      if(alpha||bitstream) webpError('duplicate or out-of-order frame alpha');
      if(c.size<1||(bytes[c.body]&3)>1) webpError('invalid alpha compression');
      alpha=c;
    } else if(c.tag==='VP8 '||c.tag==='VP8L') {
      if(bitstream) webpError('duplicate frame bitstream');
      bitstream=c;
    } else if(misplaced.has(c.tag)) webpError(`misplaced ${c.tag} in frame data`);
    // Unknown chunks are retained in the source and ignored for pixel decoding.
  }
  if(!bitstream) webpError('missing frame bitstream');
  const actual=webpBitstreamSize(bytes,bitstream);webpBounds(actual.width,actual.height);
  if(declared&&(actual.width!==declared.width||actual.height!==declared.height)) webpError('original frame declared dimensions disagree with bitstream');
  if(alpha&&bitstream.tag==='VP8L') webpError('lossless frame cannot also contain ALPH');
  if(alpha&&(bytes[alpha.body]&3)===0&&alpha.size!==1+actual.width*actual.height) webpError('raw alpha length disagrees with frame dimensions');
  return {...actual,...declared,alpha,bitstream};
}

/** Raw RIFF validation, before any mux normalization. Pixel decode is a separate gate.
 * https://developers.google.com/speed/webp/docs/riff_container
 */
export function validateWebpContainer(bytes) {
  if(!Buffer.isBuffer(bytes)||bytes.length<12||bytes.length>200*1024) webpError('invalid image byte length');
  if(bytes.toString('latin1',0,4)!=='RIFF'||bytes.toString('latin1',8,12)!=='WEBP') webpError('missing RIFF/WEBP header');
  const size=bytes.readUInt32LE(4),end=size+8;
  if(size<4||size%2||end>bytes.length) webpError('invalid RIFF file size or truncated data');
  // The specification permits readers to ignore bytes after the declared RIFF.
  const chunks=riffChunks(bytes,12,end),headers=chunks.filter(c=>c.tag==='VP8X');
  if(headers.length>1) webpError('duplicate VP8X header');
  const header=headers[0];let width,height,animated=false,seenHeader=false,seenIcc=false,seenAnim=false,seenImage=false;
  if(header) {
    if(header.size<10) webpError('truncated VP8X header');
    width=bytes.readUIntLE(header.body+4,3)+1;height=bytes.readUIntLE(header.body+7,3)+1;
    animated=Boolean(bytes[header.body]&2);webpBounds(width,height);
    // Reserved and future VP8X fields MUST be ignored by readers.
  }
  const frames=[],still=[];
  for(const c of chunks) {
    if(c.tag==='VP8X') {seenHeader=true;continue;}
    if(c.tag==='EXIF'||c.tag==='XMP ') continue; // metadata may occur out of order or repeat
    if(c.tag==='ICCP') {
      if(seenIcc) continue; // the specification permits ignoring duplicate profiles
      if(!seenHeader||seenAnim||seenImage) webpError('ICCP reconstruction order');
      seenIcc=true;continue;
    }
    if(c.tag==='ANIM') {
      if(!animated) continue; // expressly ignored when the animation flag is unset
      if(!seenHeader||seenAnim||seenImage||c.size!==6) webpError('invalid ANIM order or length');
      seenAnim=true;continue;
    }
    if(c.tag==='ANMF') {
      if(!animated||!seenAnim||!seenHeader||c.size<16) webpError('ANMF requires preceding ANIM and VP8X');
      const p=c.body,frame={x:2*bytes.readUIntLE(p,3),y:2*bytes.readUIntLE(p+3,3),width:bytes.readUIntLE(p+6,3)+1,height:bytes.readUIntLE(p+9,3)+1};
      webpBounds(frame.width,frame.height);
      if(frame.x+frame.width>width||frame.y+frame.height>height) webpError('frame lies outside original canvas');
      frames.push(webpFrame(bytes,riffChunks(bytes,p+16,c.end),frame));seenImage=true;continue;
    }
    if(['ALPH','VP8 ','VP8L'].includes(c.tag)) {
      if(animated||header&&!seenHeader) webpError('invalid image reconstruction order');
      if(c.tag==='ALPH'&&!header) webpError('alpha requires extended header');
      still.push(c);seenImage=true;
    }
  }
  if(animated) {if(!seenAnim||!frames.length) webpError('animation has no ANIM or frames');}
  else {
    const frame=webpFrame(bytes,still,header?{x:0,y:0,width,height}:undefined);
    frames.push({...frame,x:0,y:0});width=frame.width;height=frame.height;
  }
  return {format:'webp',width,height,animated,frames};
}

function remaining(deadline) {
  const ms=deadline-Date.now();
  if(ms<=0) throw new Error('Image decode exceeded the whole-image deadline');
  return ms;
}
function decodedPixels(decoded,expected) {
  if(decoded?.width!==expected.width||decoded?.height!==expected.height||
      !ArrayBuffer.isView(decoded?.data)||decoded.data.byteLength!==expected.width*expected.height*4) {
    throw new Error('Full decoded pixels or dimensions disagree with the original image declaration');
  }
}
function frameRiff(bytes,frame) {
  const parts=[];
  if(frame.alpha) {
    const extended=Buffer.alloc(18);extended.write('VP8X');extended.writeUInt32LE(10,4);extended[8]=0x10;
    extended.writeUIntLE(frame.width-1,12,3);extended.writeUIntLE(frame.height-1,15,3);parts.push(extended);
    parts.push(bytes.subarray(frame.alpha.offset,frame.alpha.next));
  }
  parts.push(bytes.subarray(frame.bitstream.offset,frame.bitstream.next));
  const body=Buffer.concat(parts),header=Buffer.alloc(12);
  header.write('RIFF');header.writeUInt32LE(body.length+4,4);header.write('WEBP',8);
  return Buffer.concat([header,body]);
}
function validatePngStream(input) {
  const bitsPerPixel={0:1,2:3,3:1,4:2,6:4}[input.colorType]*input.bitDepth;
  const passes=input.interlace?[[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]]:[[0,0,1,1]];
  let expected=0;
  for(const [x,y,dx,dy] of passes) {
    const width=Math.max(0,Math.ceil((input.width-x)/dx)),height=Math.max(0,Math.ceil((input.height-y)/dy));
    if(width&&height) expected+=height*(1+Math.ceil(width*bitsPerPixel/8));
  }
  // pngjs can report complete pixels before noticing a missing zlib trailer or
  // surplus scanlines. Node's built-in zlib must finish with a valid checksum;
  // default Z_FINISH is intentional. No inflate/filter/pixel codec is written here.
  const result=inflateSync(input.compressed,{info:true,maxOutputLength:expected});
  if(result.buffer.length!==expected) reject('PNG','decompressed scanline length disagrees with the original frame');
  const consumed=result.engine.bytesWritten;
  if(!Number.isInteger(consumed)||consumed<1||consumed>input.compressed.length) reject('PNG','invalid completed zlib input-consumption result');
  // PNG3 11.2.3 permits unused bytes after the completed stream. Chunk boundaries
  // are arbitrary and zero-length chunks are legal; do not require full input
  // consumption or interpret a zlib-shaped tail as another image. fdAT inherits
  // the frame image-data encoding rules (11.3.6.3). Published bytes are unchanged.
}
async function decodePng(input,PNG,deadline) {
  remaining(deadline);validatePngStream(input);remaining(deadline);
  const decoded=await new Promise((resolve,reject)=>{
    const parser=new PNG({checkCRC:true});
    // pngjs 5 exposes parse(), but its outer PNG stream has no destroy() API.
    // A late callback cannot turn a rejected promise into an accepted image.
    const timer=setTimeout(()=>reject(new Error('Image decode exceeded the whole-image deadline')),remaining(deadline));
    try {parser.parse(input.bytes,(error,result)=>{clearTimeout(timer);error?reject(error):resolve(result);});}
    catch(error) {clearTimeout(timer);reject(error);}
  });
  remaining(deadline);decodedPixels(decoded,input);
}
async function decodeWebp(bytes,container,deadline) {
  // Preparation is an explicit CI-owned command. This import and read-only
  // path/integrity check never downloads, builds, or silently chooses a codec.
  const {requireTeamImageTools}=await import('./prepare-team-image-tools.mjs');
  remaining(deadline);const {dwebp}=requireTeamImageTools();remaining(deadline);
  const directory=mkdtempSync(path.join(tmpdir(),'team-image-decode-'));
  try {
    for(const frame of container.frames) {
      remaining(deadline);
      // The entire raw original container has already passed. Rewrap only its
      // original compressed payload; dwebp cannot directly decode animation.
      const input=path.join(directory,'frame.webp'),output=path.join(directory,'frame.pam');
      writeFileSync(input,frameRiff(bytes,frame));rmSync(output,{force:true});
      await new Promise((resolve,reject)=>{
        execFile(dwebp,['-pam','-o',output,'--',input],{timeout:remaining(deadline),maxBuffer:64*1024},error=>error?reject(error):resolve());
      });
      remaining(deadline);
      const pixels=readFileSync(output),end=pixels.indexOf('ENDHDR\n');
      if(end<0||end>256) throw new Error('dwebp returned missing or invalid pixel-output framing');
      const header=pixels.toString('latin1',0,end+7);
      const match=/^P7\nWIDTH ([1-9][0-9]*)\nHEIGHT ([1-9][0-9]*)\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n$/.exec(header);
      if(!match) throw new Error('dwebp returned an unexpected pixel-output format');
      decodedPixels({width:Number(match[1]),height:Number(match[2]),data:pixels.subarray(end+7)},frame);
    }
  } finally {rmSync(directory,{recursive:true,force:true});}
}

/** Build-only gate, not a claim of complete format conformance. Every decoded
 * frame is checked against its original declarations; source bytes are retained.
 * A single deadline covers parsing, decoder loading/checking, and every frame.
 * The synchronous build caller also enforces a hard 30-second process timeout.
 */
export async function verifyTeamImage(bytes,{timeoutMs=29000}={}) {
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>29000) throw new Error('Invalid image deadline');
  const deadline=Date.now()+timeoutMs;imageBytes(bytes,'Image');let container;
  if(bytes.subarray(0,8).equals(PNG_SIGNATURE)) {
    container=validatePngContainer(bytes);remaining(deadline);
    const {PNG}=requireDecoder('pngjs');remaining(deadline);
    for(const input of container.decodeInputs) await decodePng(input,PNG,deadline);
  } else if(bytes[0]===0xff&&bytes[1]===0xd8) {
    container=validateJpegContainer(bytes);remaining(deadline);
    const jpeg=requireDecoder('jpeg-js');remaining(deadline);
    const decoded=jpeg.decode(bytes,{useTArray:true,formatAsRGBA:true,tolerantDecoding:false,maxResolutionInMP:1.6384,maxMemoryUsageInMB:64});
    remaining(deadline);decodedPixels(decoded,container);
  } else if(bytes.toString('latin1',0,4)==='RIFF') {
    container=validateWebpContainer(bytes);remaining(deadline);
    await decodeWebp(bytes,container,deadline);
  } else throw new Error('Unsupported image format; expected PNG, JPEG, or WebP');
  remaining(deadline);
  return {format:container.format,width:container.width,height:container.height};
}

let direct=false;
try {direct=Boolean(process.argv[1])&&realpathSync(process.argv[1])===realpathSync(fileURLToPath(import.meta.url));}catch{}
if(direct) try {
  const bytes=readFileSync(0);
  process.stdout.write(JSON.stringify(await verifyTeamImage(bytes))+'\n');
} catch(error) {
  process.stderr.write(`Image decode failed: ${error.message}\n`);
  process.exitCode=1;
}
