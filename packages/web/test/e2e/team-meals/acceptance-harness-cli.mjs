#!/usr/bin/env node
/** Never prints role secrets. Read-only inspection and owned scratch cleanup only. */
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {initializeAcceptance,readAcceptanceConfig,startAcceptanceServer,cleanupAcceptance} from './acceptance-harness.mjs';
const [command,...argv]=process.argv.slice(2),options={};
for(let i=0;i<argv.length;i++){
 const key=argv[i];if(!key.startsWith('--'))throw new Error('Expected named option');
 if(['--test-only-local','--allow-rollback'].includes(key))options[key]=true;
 else{if(!argv[i+1]||argv[i+1].startsWith('--'))throw new Error('Expected option value');options[key]=argv[++i];}
}
try{
 if(command==='init'){
  const knowledgeSource=options['--kb-source']?{root:options['--kb-source'],revision:options['--kb-revision']}:undefined;
  const {configPath,config}=await initializeAcceptance({scratchParent:options['--scratch-parent'],productionRevision:options['--revision'],port:Number(options['--port']??4398),seedMode:options['--seed'],testOnlyLocal:options['--test-only-local']===true,allowRollback:options['--allow-rollback']===true,knowledgeSource,knowledgeBaseUrl:knowledgeSource?'http://127.0.0.1:4392':undefined});
  console.log(JSON.stringify({configPath,seedMode:config.seedMode,actor:config.actor,boundary:'LOCAL TEST ONLY; private random roles saved owner 0600; no remote writes'}));
 }else{
  const config=await readAcceptanceConfig(options['--config']);
  if(command==='serve'){
   const service=await startAcceptanceServer(config);console.log(JSON.stringify({event:'ready',...service.summary}));
   let stopping=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{if(stopping)return;stopping=true;void service.stop().then(()=>process.exit(0)).catch(()=>{console.error('Could not complete local shutdown; inspect owned state before restart');process.exit(1);});});
  }else if(command==='inspect'){
   const receipts=JSON.parse(await readFile(join(config.scratchRoot,'receipts.json'),'utf8'));
   const integrity=JSON.parse(await readFile(join(config.scratchRoot,'integrity.json'),'utf8'));
   console.log(JSON.stringify({boundary:receipts.boundary,actor:receipts.actor,productionRevision:receipts.productionRevision,seedMode:receipts.seedMode,privateHead:receipts.privateHead,publicHead:receipts.publicHead,receiptCount:receipts.receipts.length,integrityFileCount:integrity.entries.length,knowledgeBaseState:integrity.knowledgeBase.state}));
  }else if(command==='cleanup')console.log(JSON.stringify(await cleanupAcceptance(config)));
  else throw new Error('Unknown acceptance command');
 }
}catch{
 console.error('Local acceptance command failed. Check fixed revisions, private config, owned scratch boundaries and required builds. No secrets emitted.');process.exitCode=1;
}
