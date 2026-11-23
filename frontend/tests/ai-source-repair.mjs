// Read-only production data; all AI mutations are intercepted as fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire('C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const {chromium}=require('playwright');
const base=process.env.RESEARCH_TEST_URL??'http://127.0.0.1:5178';
const out=process.env.RESEARCH_TEST_OUTPUT??'C:/Users/USER/Documents/ChatGPT/동미대 리서치 보드/output/ai-source-repair';await fs.mkdir(out,{recursive:true});
const original=await (await fetch(base+'/api/documents/32?runId=5')).json();assert.equal(original.documentId,32);
const longSnippet='화면 표시 확인을 위한 합성 요약입니다.\n'+'아주 긴 검색 제공자 문장과 한국어가 줄바꿈되어 모두 표시되어야 합니다. '.repeat(40)+'...';
const fixture={...original,title:'[화면 시험] 긴 요약',snippet:longSnippet,contentText:null,extractionStatus:'METADATA_ONLY'};
const browser=await chromium.launch({channel:'msedge',headless:true});const checks=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let online=false,healthCode='AI_NOT_RUNNING',jobs=[],mode='RUNNING',lastCancel=null,posts=0;
 const template={document_id:32,model:'fixture',input_type:'SNIPPET',result_json:null,error_code:null,created_at:new Date().toISOString(),stale:false};
 const success={...template,id:100,status:'SUCCEEDED',result_json:JSON.stringify({summary:'기존에 성공한 요약은 보존됩니다.',claims:[{text:'확인할 주장',quote:'합성 근거 구간'}],limitations:[],inferences:[]})};
 await page.route('**/api/**',route=>route.request().method()==='GET'?route.continue():route.abort());
 await page.route(/\/api\/documents\/32(?:\?.*)?$/,route=>route.fulfill({json:fixture}));
 await page.route('**/api/ai/health',route=>route.fulfill({json:{available:online,code:online?'READY':healthCode,model:'fixture'}}));
 await page.route('**/api/ai/documents/32',route=>{
  if(route.request().method()==='POST'){posts++;jobs=mode==='RUNNING'?[{...template,id:101,status:'RUNNING'}]:[{...template,id:101,status:'FAILED',error_code:mode==='TIMEOUT'?'AI_TIMEOUT':'INVALID_EVIDENCE'},success];return route.fulfill({status:202,json:{jobId:101,reused:false}});}
  return route.fulfill({json:{jobs,inputAvailable:true,model:'fixture',promptVersion:'v2'}});
 });
 await page.route(/\/api\/ai\/jobs\/\d+\/cancel$/,route=>{lastCancel=Number(route.request().url().match(/jobs\/(\d+)/)[1]);jobs=jobs.map(j=>j.id===lastCancel?{...j,status:'CANCELLED'}:j);return route.fulfill({json:{cancelled:true}});});
 await page.goto(base+'/documents/32?runId=5');const panel=page.getByRole('region',{name:'AI 요약',exact:true});
 // section aria-label is mapped as region in Chromium.
 await page.getByText(/Ollama가 실행되지 않았거나 연결할 수 없습니다/).waitFor();assert.equal(await page.getByRole('button',{name:'검색 발췌문 간단 정리',exact:true}).isEnabled(),false);assert.equal(posts,0);checks.push('Offline Ollama is explained and analysis is disabled before submission');
 const paragraph=page.locator('.source-content .document-body');assert.equal(await paragraph.innerText(),longSnippet);const size=await paragraph.evaluate(el=>({scroll:el.scrollHeight,height:el.clientHeight,clamp:getComputedStyle(el).webkitLineClamp,overflow:getComputedStyle(el).overflow}));assert.ok(size.scroll<=size.height+1);assert.notEqual(size.clamp,'1');await page.getByText(/검색 제공자가 일부 내용만 전달/).waitFor();assert.ok(await page.getByRole('link',{name:'원문에서 전체 내용 확인 ↗',exact:true}).isVisible());checks.push('Complete received snippet wraps without clipping; provider ellipsis is explicitly explained');
 await page.getByRole('button',{name:'공개 본문',exact:true}).click();await page.getByText('저장된 본문이 없습니다. 검색 요약 탭 또는 원문 링크를 확인하세요.',{exact:true}).waitFor();await page.getByRole('button',{name:'검색 요약',exact:true}).click();checks.push('Missing public body has an actionable explanation');
 online=true;await page.getByRole('button',{name:'연결 상태 다시 확인',exact:true}).click();await page.getByText(/로컬 모델 연결됨/).waitFor();await page.getByRole('button',{name:'검색 발췌문 간단 정리',exact:true}).click();await page.getByRole('button',{name:'분석 취소',exact:true}).waitFor();await page.getByRole('button',{name:'분석 취소',exact:true}).click();await page.getByText('취소됨',{exact:true}).waitFor();assert.equal(lastCancel,101);checks.push('Connection refresh enables analysis; running task can be cancelled');
 jobs=[success];await page.getByRole('button',{name:'연결 상태 다시 확인',exact:true}).click();await page.getByText('기존에 성공한 요약은 보존됩니다.',{exact:true}).waitFor();mode='FAILED';await page.getByRole('button',{name:'검색 발췌문 간단 정리',exact:true}).click();await page.getByText(/입력에 없는 근거를 반환하여/).waitFor();assert.ok(await page.getByText('기존에 성공한 요약은 보존됩니다.',{exact:true}).isVisible());assert.ok(await page.getByRole('button',{name:'AI 요약 다시 시도',exact:true}).isEnabled());checks.push('Failed regeneration preserves the prior valid summary and offers a retry');
 mode='TIMEOUT';await page.getByRole('button',{name:'AI 요약 다시 시도',exact:true}).click();await page.getByText(/모델 응답 대기 시간을 초과/).waitFor();assert.ok(await page.getByText('기존에 성공한 요약은 보존됩니다.',{exact:true}).isVisible());checks.push('Timeout provides retry and preserves the previous result');
 jobs=[{...template,id:104,status:'CANCELLED'},{...template,id:103,status:'RUNNING'},success];await page.getByRole('button',{name:'연결 상태 다시 확인',exact:true}).click();await page.getByRole('button',{name:'분석 취소',exact:true}).waitFor();await page.getByRole('button',{name:'분석 취소',exact:true}).click();assert.equal(lastCancel,103);checks.push('Cancel targets the active job even when a newer historical job exists');
 online=false;healthCode='MODEL_MISSING';await page.getByRole('button',{name:'연결 상태 다시 확인',exact:true}).click();await page.getByText(/설정된 모델이 설치되어 있지 않습니다/).waitFor();checks.push('Missing model is distinguished from a disconnected service');
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:out+'/mobile.png',fullPage:true});assert.deepEqual(errors,[]);checks.push('Long snippet and AI controls fit 390px without runtime errors');await fs.writeFile(out+'/results.json',JSON.stringify({passed:true,checks,pageErrors:errors},null,2));console.log(JSON.stringify({passed:true,checks}));void panel;
}finally{await browser.close();}
