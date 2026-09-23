import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FeedbackStore } from '../src/feedback.ts';
import { createApp } from '../src/server.ts';
import { flagged, makeRequest, parseVerdict } from '../src/shared.ts';

test('feedback persists, corrections replace flags, and corrupt files are preserved', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'quiet-feedback-')), 'feedback.json');
  const store = new FeedbackStore(file);
  store.save('A reply the user suspects.', 'potential-ai');
  assert.equal(new FeedbackStore(file).lookup('A reply the user suspects.'), 'potential-ai');
  store.save('A reply the user suspects.', 'keep');
  const reloaded = new FeedbackStore(file);
  assert.equal(reloaded.lookup('A reply the user suspects.'), 'keep');
  assert.deepEqual([reloaded.index().potentialAI,reloaded.index().kept], [0,1]);
  assert.equal(JSON.stringify(reloaded.index()).includes('the user suspects'), false, 'public feedback index does not include text');
  reloaded.clear(); assert.equal(new FeedbackStore(file).entries.length,0);
  writeFileSync(file, '{broken');
  assert.throws(()=>new FeedbackStore(file), /could not be read/);
  assert.equal(readFileSync(file,'utf8'),'{broken');
});
test('learning examples are bounded and explicitly subjective, with manual decisions taking precedence', () => {
  const store = new FeedbackStore();
  for(let i=0;i<210;i++) store.save('x'.repeat(900)+i, i%2 ? 'potential-ai':'keep');
  assert.equal(store.entries.length,200);
  assert.equal(store.examples().length,6);
  assert.ok(store.examples().every(e=>e.text.length<=600));
  const request=makeRequest('A new reply','jev-test',store.examples());
  assert.equal(request.state.readerFeedback?.length,6);
  assert.ok(request.questions.preference?.instructions.includes('not verified authorship'));
  assert.equal(flagged({manualDecision:'keep',signals:{aiStyle:.99,boilerplate:.99,disclosure:.99,preference:.99}}),false);
  assert.equal(flagged({manualDecision:'potential-ai'}),true);
  assert.equal(flagged({signals:{aiStyle:.2,boilerplate:.2,disclosure:.01,preference:.96}}),true);
  assert.equal(flagged({signals:{aiStyle:.44,boilerplate:.49,disclosure:.02,preference:.75,keepPreference:.2}}),true);
  assert.equal(flagged({signals:{aiStyle:.99,boilerplate:.99,disclosure:.02,preference:.1,keepPreference:.8}}),false,'learned keep preferences counter a future model flag');
  const data={model:'test',answers:{aiStyle:{type:'noul',noul:.2},boilerplate:{type:'noul',noul:.2},disclosure:{type:'noul',noul:.1}}};
  assert.throws(()=>parseVerdict(data,true),/Invalid/,'personalisation answer is required when requested');
});
test('feedback route is authenticated, invalidates model caches and supplies examples for new replies',async()=>{
  const feedback=new FeedbackStore(); const sent: unknown[]=[];
  const app=createApp({key:'fixture',token:'fixture-token',feedback,fetcher:async(_url,init)=>{
    const request=JSON.parse(init!.body as string);sent.push(request);
    return Response.json({model:'fixture',answers:{aiStyle:{type:'noul',noul:.2},boilerplate:{type:'noul',noul:.2},disclosure:{type:'noul',noul:.02},...(request.questions.preference?{preference:{type:'noul',noul:.94},keepPreference:{type:'noul',noul:.1}}:{})}});
  }});
  await new Promise<void>(resolve=>app.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${(app.address() as {port:number}).port}`;
  const send=(path:string,body:unknown,auth=true)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer fixture-token'}:{})},body:JSON.stringify(body)});
  const text='A sufficiently long unseen reply that will be evaluated again when reader preferences change.';
  try{
    assert.equal((await send('/feedback',{text:'short',label:'potential-ai'},false)).status,401);
    assert.equal((await send('/feedback',{text:'short',label:'verified-human'})).status,400);
    assert.equal(feedback.entries.length,0);
    await send('/analyse-reply-v3',{text}); await send('/analyse-reply-v3',{text}); assert.equal(sent.length,1);
    const save=await send('/feedback',{text:'An earlier reply flagged by the reader.',label:'potential-ai'});assert.equal(save.status,200);
    const personalised=await (await send('/analyse-reply-v3',{text})).json();
    assert.equal(personalised.signals.preference,.94);assert.equal(sent.length,2);
    await send('/feedback',{text,label:'keep'});
    const kept=await (await send('/analyse-reply-v3',{text})).json();assert.equal(kept.manualDecision,'keep');assert.equal(sent.length,2);
    await send('/feedback/clear',{}); await send('/analyse-reply-v3',{text});assert.equal(sent.length,3);
  }finally{await new Promise<void>(resolve=>app.close(()=>resolve()));}
});
