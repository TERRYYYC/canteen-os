import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVideoImport } from '../../apps/api/video-candidate.mjs';

const item = { kind:'video', url:'https://www.douyin.com/video/7000000000000000002' };
const source = { workId:'7000000000000000002',sourceUrl:item.url,accessMethod:'browser_playback',sha256:'a'.repeat(64), byteCount:10000, durationMs:120000, audioDurationMs:120000, videoDurationMs:119900,streams:{video:true,audio:true},
  analysisCoverage:{audioProcessedThroughMs:120000,frameCount:240,lastFrameMs:119500,maxFrameGapMs:500} };
const evidence = [
  { id:'title',kind:'subtitle',startMs:1000,endMs:2000,text:'古法羊腩煲' },
  { id:'meat',kind:'subtitle',startMs:10000,endMs:11000,text:'羊腩5斤' },
  { id:'fry',kind:'visual',startMs:60000,endMs:61000,text:'整块羊肉下油锅炸' },
];
const candidate = { status:'needs_human_review',classification:'recipe',sourceSha256:source.sha256,title:'古法羊腩煲',titleEvidenceIds:['title'],
  yield:{raw:null,normalized:null,state:'not_stated'},ingredients:[{name:'羊腩',rawQuantity:'5斤',quantityState:'stated',prep:'整块带皮',evidenceIds:['meat'],uncertainty:'具体肉部位待核实'},
    {name:'油',rawQuantity:null,quantityState:'not_stated',prep:null,evidenceIds:['fry'],uncertainty:'用量未述'}],
  steps:[{order:1,action:'整块羊肉下油锅炸',startMs:60000,endMs:61000,evidenceIds:['fry'],unknowns:['油温未知']}],
  unresolved:['煲煮时长未说明'],approvedForMenu:false,approvedForProcurement:false };

test('video candidate maps into a complete, stable KB draft without inventing servings or unknown quantities', () => {
  const first = buildVideoImport({ item, source, evidence, candidate, sourceMethod:'browser_playback' });
  const second = buildVideoImport({ item, source, evidence, candidate, sourceMethod:'browser_playback' });
  assert.deepEqual(first,second);
  assert.equal(first.capture.method,'video_analysis');
  assert.equal(first.capture.evidence.media.sha256,source.sha256);
  assert.deepEqual(first.capture.evidence.media.coverage,source.analysisCoverage);
  assert.equal(first.capture.evidence.segments.length,3);
  assert.equal(first.proposal.recipe.baseServings,undefined);
  assert.equal(first.proposal.recipe.ingredients.length,2);
  assert.equal(first.proposal.recipe.ingredients[0].amount.value,'5');
  assert.equal(first.proposal.recipe.ingredients[1].amount.kind,'unknown');
  assert.equal(first.proposal.recipe.steps.length,1);
  assert(first.proposal.unresolved.includes('煲煮时长未说明'));
  assert(first.proposal.unresolved.includes('羊腩：具体肉部位待核实'));
  assert(first.proposal.unresolved.includes('步骤 1：油温未知'));
  assert.deepEqual(first.proposal.fieldEvidence.ingredients[0].evidenceIds,['meat']);
});

test('video import rejects a media mismatch and ungrounded fields', () => {
  assert.throws(() => buildVideoImport({item,source,evidence,candidate:{...candidate,sourceSha256:'b'.repeat(64)},sourceMethod:'browser_playback'}),/media hash/i);
  assert.throws(() => buildVideoImport({item,source,evidence,candidate:{...candidate,ingredients:[{...candidate.ingredients[0],evidenceIds:['absent']}]},sourceMethod:'browser_playback'}),/evidence/i);
  assert.throws(() => buildVideoImport({item,source:{...source,workId:'7000000000000000004'},evidence,candidate,sourceMethod:'browser_playback'}),/source item/i);
  assert.throws(() => buildVideoImport({item,source:{...source,sourceUrl:'https://www.douyin.com/video/7000000000000000004'},evidence,candidate,sourceMethod:'browser_playback'}),/source item/i);
  assert.throws(() => buildVideoImport({item,source,evidence,candidate,sourceMethod:'f2'}),/acquisition method/i);
  assert.throws(() => buildVideoImport({item,source,evidence,candidate:{...candidate,ingredients:[{...candidate.ingredients[0],quantityState:'not_checked'}]},sourceMethod:'browser_playback'}),/not.checked/i);
});

test('an imprecise stated amount keeps its original words but cannot enter procurement arithmetic', () => {
  const uncertain={...candidate,ingredients:[{...candidate.ingredients[0],rawQuantity:'5克',quantityState:'stated_imprecise'}]};
  const imported=buildVideoImport({item,source,evidence,candidate:uncertain,sourceMethod:'browser_playback'});
  assert.deepEqual(imported.proposal.recipe.ingredients[0].amount,{kind:'text',raw:'5克'});
});

test('an AI-reported serving count cannot become a scaling basis without chef review', () => {
  const claimedYield={...candidate,yield:{raw:null,normalized:50,state:'stated'}};
  const imported=buildVideoImport({item,source,evidence,candidate:claimedYield,sourceMethod:'browser_playback'});
  assert.equal(imported.proposal.recipe.baseServings,undefined);
});

test('timed observations must fit their actual audio or video stream', () => {
  const importWith=(sourceOverride,evidenceOverride=evidence)=>buildVideoImport({item,source:{...source,...sourceOverride},evidence:evidenceOverride,candidate,sourceMethod:'browser_playback'});
  assert.throws(()=>importWith({videoDurationMs:1}),/coverage|media/i);
  assert.throws(()=>importWith({audioDurationMs:0,streams:{video:true,audio:false},analysisCoverage:{...source.analysisCoverage,audioProcessedThroughMs:0}},
    [...evidence,{id:'speech',kind:'spoken',startMs:70000,endMs:71000,text:'加盐'}]),/timed evidence/i);
  assert.throws(()=>importWith({videoDurationMs:119000},evidence.map(row=>row.id==='fry'?{...row,endMs:120500}:row)),/timed evidence/i);
});
