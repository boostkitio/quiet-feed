import { chromium } from 'playwright';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const markup=await readFile(process.env.QUIET_FEED_JOBS_HTML || 'tests/jobs-anonymous.html','utf8');
const bundle=await build({entryPoints:['src/dom.ts'],bundle:true,write:false,format:'iife',globalName:'QuietDom',platform:'browser'});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 await page.route('**/*',route=>route.abort());
 for(const area of ['main','aside']){
  await page.setContent(`<${area}><article id="before">Keep before</article><div id="mount"></div><article id="after">Keep after</article><div class="comments-comment-item" id="quote"></div></${area}>`);
  await page.evaluate(html=>{
   const parsed=new DOMParser().parseFromString(html,'text/html');
   parsed.querySelectorAll('script,iframe,object,embed,link,meta,style').forEach(n=>n.remove());
   for(const el of parsed.querySelectorAll('*'))for(const attr of [...el.attributes])if(attr.name.startsWith('on'))el.removeAttribute(attr.name);
   const module=parsed.body.firstElementChild;
   if(!module)throw new Error('No fixture root');
   module.id='actual-jobs-module';
   document.querySelector('#mount').replaceWith(module);
   const quote=module.cloneNode(true);quote.id='quoted-jobs-module';document.querySelector('#quote').append(quote);
  },markup);
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  const ids=await page.evaluate(()=>QuietDom.jobRecommendationSections().map(n=>n.id));
  assert.deepEqual(ids,['actual-jobs-module'],`identify only the real anonymous jobs module in ${area}`);
  await page.evaluate(()=>QuietDom.jobRecommendationSections().forEach(n=>n.classList.add('qf-jobs-hidden')));
  await page.addStyleTag({content:'.qf-jobs-hidden{display:none!important}'});
  assert.equal(await page.locator('#actual-jobs-module').isVisible(),false);
  for(const id of ['before','after','quote'])assert.equal(await page.locator('#'+id).isVisible(),true);
 }
 console.log('Passed: supplied/sanitised anonymous jobs markup matched in main and sidebar; entire module hidden; neighbours and comment quotes preserved.');
}finally{await browser.close();}
