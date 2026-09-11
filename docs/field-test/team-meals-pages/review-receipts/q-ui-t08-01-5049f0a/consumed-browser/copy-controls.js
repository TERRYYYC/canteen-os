// D-owned visible verification controls. Production pages and successful clipboard remain native.
const nativeClipboard=navigator.clipboard;let held=[];
const panel=document.createElement('aside');panel.id='d-copy-controls';panel.style.cssText='padding:12px;border:2px solid #98794d;background:#fff8e8;position:relative;z-index:10';
panel.innerHTML='<strong>D Q-UI-T08-01 local verification</strong><p>Real main/C/Worker, local Q FakeRepo. Native clipboard unless the explicit failure/hold control is selected.</p><button id="d-native">Use native clipboard</button> <button id="d-fail">Fail clipboard</button> <button id="d-hold">Hold clipboard result</button> <button id="d-release">Reject held clipboard</button> <button id="d-read">Read native clipboard</button> <button id="d-change">Change latest metadata to B</button><pre id="d-control-status">native clipboard</pre><pre id="d-native-text"></pre><pre id="d-attempt"></pre>';
document.body.append(panel);const el=id=>document.getElementById(id),status=value=>el('d-control-status').textContent=value;
const setClipboard=value=>Object.defineProperty(navigator,'clipboard',{configurable:true,value});
el('d-native').onclick=()=>{setClipboard(nativeClipboard);status('native clipboard');};
el('d-fail').onclick=()=>{setClipboard({writeText:async content=>{el('d-attempt').textContent=content;status('explicit clipboard rejection');throw Error('D explicit clipboard rejection');}});status('failure boundary armed');};
el('d-hold').onclick=()=>{setClipboard({writeText:content=>{el('d-attempt').textContent=content;status('clipboard response held');return new Promise((resolve,reject)=>held.push({resolve,reject}));}});status('hold boundary armed');};
el('d-release').onclick=()=>{const pending=held;held=[];pending.forEach(x=>x.reject(Error('D explicit held rejection')));status('held clipboard rejected');};
el('d-read').onclick=async()=>{try{el('d-native-text').textContent=await nativeClipboard.readText();status('native clipboard read completed');}catch(error){status('native clipboard read failed: '+String(error));}};
el('d-change').onclick=async()=>{const response=await fetch('/__control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'change-metadata'})});status('latest metadata changed: '+await response.text());};
