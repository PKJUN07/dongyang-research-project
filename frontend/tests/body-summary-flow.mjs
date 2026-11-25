// All mutations are browser fixtures. The user's documents are read only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire('C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');const {chromium}=require('playwright');
const base=process.env.RESEARCH_TEST_URL??'http://127.0.0.1:5178',out=process.env.RESEARCH_TEST_OUTPUT??'C:/Users/USER/Documents/ChatGPT/동미대 리서치 보드/output/body-summary-ui';await fs.mkdir(out,{recursive:true});
const original=await(await fetch(base+'/api/documents/32?runId=5')).json();assert.ok(original.contentText.length>1000);
const browser=await chromium.launch({channel:'msedge',headless:true});const checks=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});let hasBody=false,allowed=true,bodyCalls=0,aiCalls=0,bodyOutcome='SUCCESS';
 const old={id:1,status:'SUCCEEDED',model:'fixture',input_type:'SNIPPET',result_json:JSON.stringify({summary:'짧은 시험 요약',claims:[{text:'발췌 주장',quote:'발췌'}],limitations:[],inferences:[]}),created_at:new Date().toISOString(),stale:false};let fresh=false;
 const summary='기본 운용을 설명합니다. 본문에서 콤보와 선택 기준을 확인했습니다. 적용할 때 주의점을 함께 검토해야 합니다.';
 await page.route('**/api/**',route=>route.request().method()==='GET'?route.continue():route.abort());
 await page.route(/\/api\/documents\/32(?:\?.*)?$/,route=>route.fulfill({json:{...original,contentText:hasBody?original.contentText:null,extractionStatus:hasBody?'SUCCESS':'METADATA_ONLY',extractionReason:hasBody?null:'POLICY_NOT_APPROVED'}}));
 await page.route('**/api/ai/health',route=>route.fulfill({json:{available:true,code:'READY',model:'fixture'}}));
 await page.route('**/api/ai/documents/32/body-status',route=>route.fulfill({json:{available:hasBody,canFetch:allowed&&!hasBody,reason:allowed?'READY_TO_FETCH':'POLICY_NOT_APPROVED'}}));
 await page.route('**/api/ai/documents/32/body',async route=>{bodyCalls++;await new Promise(r=>setTimeout(r,800));hasBody=bodyOutcome==='SUCCESS';await route.fulfill({json:{status:bodyOutcome,characters:hasBody?original.contentText.length:0,reason:hasBody?'':'FIXTURE_ERROR'}});});
 await page.route('**/api/ai/documents/32',route=>{if(route.request().method()==='POST'){aiCalls++;fresh=true;return route.fulfill({status:202,json:{jobId:2,reused:false}});}const jobs=fresh?[{...old,id:2,input_type:'BODY',stale:false,result_json:JSON.stringify({summary,claims:[{text:'기본 운용',quote:'근거1'},{text:'콤보',quote:'근거2'},{text:'선택 기준',quote:'근거3'}],limitations:[],inferences:[]})},{...old,stale:true}]:[{...old,stale:hasBody}];return route.fulfill({json:{jobs,inputAvailable:true,model:'fixture',promptVersion:'v4'}});});
 await page.goto(base+'/documents/32?runId=5');await page.getByRole('button',{name:'공개 본문',exact:true}).click();const fetchButton=page.getByRole('button',{name:'공개 본문 가져오기',exact:true});await fetchButton.waitFor();assert.equal(bodyCalls,0);checks.push('Public body fetch is explicit; no automatic network request on opening detail');
 await fetchButton.evaluate(el=>{el.click();el.click();});await page.getByRole('button',{name:'본문 가져오는 중…',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'본문 가져오는 중…',exact:true}).isEnabled(),false);await page.getByLabel('확보한 공개 본문',{exact:true}).waitFor();assert.equal(bodyCalls,1);assert.equal(aiCalls,0);checks.push('Repeated clicks issue one fetch and AI waits until body acquisition completes');
 const body=page.getByLabel('확보한 공개 본문',{exact:true});assert.equal(await body.innerText(),original.contentText);assert.ok(await body.evaluate(el=>el.scrollHeight>el.clientHeight));await body.evaluate(el=>{el.scrollTop=el.scrollHeight;});checks.push('Full received body remains available in a keyboard-focusable scroll region');
 await page.getByText(/현재 자료 또는 요약 기준과 다른 이전 분석/).waitFor();await page.getByRole('button',{name:'현재 자료로 다시 요약',exact:true}).click();await page.getByText(summary,{exact:true}).waitFor();await page.getByText('공개 본문 기반 정리',{exact:true}).waitFor();assert.equal(aiCalls,1);assert.equal(await page.locator('blockquote').count(),3);checks.push('Body acquisition marks old snippet analysis stale and new analysis is labelled body-based');
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:out+'/body-mobile.png',fullPage:true});checks.push('Long body and detailed results fit mobile width');
 hasBody=false;allowed=false;fresh=false;await page.reload();await page.getByRole('button',{name:'공개 본문',exact:true}).click();await page.getByText('이 출처는 자동 본문 수집을 사용할 수 없습니다.',{exact:false}).waitFor();assert.equal(await page.getByRole('button',{name:'공개 본문 가져오기',exact:true}).count(),0);assert.equal(bodyCalls,1);checks.push('Unreviewed sources do not get a fetch button or network attempt');
 allowed=true;await page.reload();await page.getByRole('button',{name:'공개 본문',exact:true}).click();
 for(const [outcome,message] of [['BLOCKED','이 페이지의 본문 접근이 제한되었습니다.'],['FAILED','본문 추출에 실패했습니다.']]){
   bodyOutcome=outcome;await page.getByRole('button',{name:'공개 본문 가져오기',exact:true}).click();
   await page.getByText(message,{exact:false}).waitFor();
   assert.ok(await page.getByRole('link',{name:'원문에서 전체 내용 확인 ↗'}).isVisible());
 }
 checks.push('Access restriction and extraction failure have distinct messages and original link');
 await fs.writeFile(out+'/results.json',JSON.stringify({passed:true,checks},null,2));console.log(JSON.stringify({passed:true,checks}));
}finally{await browser.close();}
