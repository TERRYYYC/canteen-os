import {createServer} from 'node:http';
let broken = true;
const requests=[];
const html=`<!doctype html><meta charset="utf-8"><title>D1 module retry calibration</title><h1>Local module retry calibration</h1><p>Browser network import only; no application behavior claim.</p><button id="load">Try same module</button><button id="restore">Restore local module response</button><pre id="out">Ready; module response starts unavailable.</pre><script type="module">
let attempt=0;const result=[];
load.onclick=async()=>{load.disabled=true;const item={attempt:++attempt};try{const module=await import('./optional.js');item.ok=true;item.value=module.value;}catch(error){item.ok=false;item.error=String(error);}result.push(item);out.textContent=JSON.stringify({result,requests:await(await fetch('./requests')).json()},null,2);load.disabled=false;};
restore.onclick=async()=>{await fetch('./restore',{method:'POST'});out.textContent+='\\nLocal module response restored.';};
</script>`;
createServer((req,res)=>{requests.push({path:req.url,method:req.method,broken});res.setHeader('Cache-Control','no-store');if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(html);}else if(req.url==='/optional.js'){res.setHeader('Content-Type','application/javascript');res.statusCode=broken?503:200;res.end(broken?'throw Error("network unavailable")':'export const value="real fetched module";');}else if(req.url==='/restore'&&req.method==='POST'){broken=false;res.end('restored');}else if(req.url==='/requests'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(requests));}else{res.statusCode=404;res.end();}}).listen(0,'127.0.0.1',function(){process.stdout.write(JSON.stringify({url:'http://127.0.0.1:'+this.address().port+'/'})+'\n');});
