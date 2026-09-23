// Explicit, bounded paid integration check: two synthetic replies, never part of verify.
import { chromium } from 'playwright';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const extension=process.env.QUIET_FEED_INSTALLED_EXTENSION;
if(!extension)throw new Error('Set QUIET_FEED_INSTALLED_EXTENSION to the intended installed folder');
await mkdir('work',{recursive:true});
const context=await chromium.launchPersistentContext(await mkdtemp(resolve('work/live-check-profile-')),{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],viewport:{width:1000,height:900}});
try{
 let [worker]=context.serviceWorkers();if(!worker)worker=await context.waitForEvent('serviceworker');
 const id=new URL(worker.url()).hostname;
 const fixture=`<!doctype html><html><head><title>Quiet Feed · Live TypeSafe Check</title><style>body{font:16px/1.6 system-ui;background:#f4f6f3;padding:30px}main{max-width:650px;margin:auto}.feed-shared-update-v2{background:white;border:1px solid #ddd;border-radius:12px;padding:20px;margin:15px 0}.comments-comment-item{padding:14px;background:#f3f6f2;margin-top:12px}</style></head><body><main><h1>Live TypeSafe Check</h1><p>Two synthetic replies. Real installed extension and companion. No real LinkedIn data or account actions.</p><div class="feed-shared-update-v2"><p class="update-components-text">Original post remains unchanged.</p><div class="comments-comment-item" id="ai"><b>Synthetic AI Reply</b><div class="update-components-text">As an AI language model, I do not have personal experiences, but here is a polished LinkedIn reply you can post: This is such a powerful reminder of the transformative potential of purposeful leadership. By embracing collaboration and fostering a growth mindset, we can collectively unlock meaningful impact in an ever-evolving landscape.</div></div><div class="comments-comment-item" id="short"><b>Short Specific Question</b><div class="update-components-text">Which file failed?</div></div></div><div class="feed-shared-update-v2" id="jobs"><h2>Jobs recommended for you</h2><p>Test recommendations</p></div></main></body></html>`;
 await context.route('https://www.linkedin.com/**',r=>r.fulfill({status:200,contentType:'text/html',body:fixture}));
 const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);
 await popup.getByText('Connected & Filtering',{exact:true}).waitFor({timeout:15000});
 const page=await context.newPage();await page.goto('https://www.linkedin.com/feed/');
 await page.locator('#ai .qf-reply-collapsed').waitFor({state:'attached',timeout:60000});
 for(let i=0;i<40;i++){
  const stats=await worker.evaluate(()=>chrome.storage.session.get('analysed'));
  if(Number(stats.analysed)>=2)break;
  await page.waitForTimeout(250);
 }
 const stats=await worker.evaluate(()=>chrome.storage.session.get(['analysed','requests','lastError']));
 assert.equal(Number(stats.analysed),2);
 assert.equal(await page.locator('#short .update-components-text').isVisible(),true);
 assert.equal(await page.locator('#jobs').isVisible(),false);
 await page.screenshot({path:'work/live-installed-check.png',fullPage:true});
 const report={testedAt:new Date().toISOString(),checked:Number(stats.analysed),automaticAiReplyHidden:true,shortReplyCheckedAndPreserved:true,jobsHidden:true,manualFlagClicks:0,extensionBuild:await page.evaluate(()=>document.documentElement.dataset.quietFeedBuild),workerBuild:await page.evaluate(()=>document.documentElement.dataset.quietFeedWorkerBuild),note:'Real installed files, companion and TypeSafe; synthetic page in an isolated Chrome profile. Not the user\'s existing browser profile or an authorship accuracy benchmark.'};
 await writeFile('work/live-installed-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await context.close();}
