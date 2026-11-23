// Run only against an isolated FAKE-provider database, never the user's real database.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(process.env.RESEARCH_TEST_NODE_MODULES ? path.join(process.env.RESEARCH_TEST_NODE_MODULES,'package.json') : import.meta.url);
const {chromium}=require('playwright');
const base=process.env.RESEARCH_TEST_URL ?? 'http://127.0.0.1:5177';
const output=process.env.RESEARCH_TEST_OUTPUT ?? path.resolve('test-results/week7');
await fs.mkdir(output,{recursive:true});
const checks=[];
async function api(url,method='GET',body,status=200){const r=await fetch(`${base}/api${url}`,{method,headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});assert.equal(r.status,status,`${method} ${url}: ${await r.clone().text()}`);return r.json();}
async function until(fn){for(let i=0;i<80;i++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('condition timeout');}
const config=await api('/config');assert.equal(config.provider,'FAKE');
const topic=await api('/topics','POST',{name:`7주차 시험 ${Date.now()}`,query:'클로드'},201);
const run=await api('/search-sessions','POST',{topicId:topic.id,query:'클로드',requestKey:crypto.randomUUID()},202);
await until(async()=>!['QUEUED','RUNNING'].includes((await api(`/search-sessions/${run.runId}`)).status));
const items=(await api(`/search-sessions/${run.runId}/results`)).items;assert.ok(items.length);const id=items[0].documentId;
const endpoint=`/documents/${id}`;
// Documents can already exist on repeated test runs; start from the current version.
const initial=await api(endpoint+'/note');await api(endpoint+'/note','PUT',{text:'',version:initial.version});
await api(endpoint+'/reading','PATCH',{readStatus:'UNREAD',saved:false,favorite:false,readLater:false});
await api(endpoint+'/reading','PATCH',{saved:true,favorite:true,readStatus:'READ',readLater:true});
const partial=await api(endpoint+'/reading','PATCH',{saved:false});assert.equal(partial.readStatus,'READ');assert.equal(partial.favorite,true);assert.equal(partial.readLater,true);
for(const body of [{saved:null},{saved:'true'},{readStatus:'BAD'},{x:true},{}])await api(endpoint+'/reading','PATCH',body,400);
await api('/documents/999999/reading','PATCH',{saved:true},404);
await api('/documents/999999/note','PUT',{text:'x',version:0},404);
await api(endpoint+'/note','PUT',{text:'x'.repeat(20001),version:initial.version+1},400);
await api(endpoint+'/note','PUT',{text:'stale',version:initial.version},409);
checks.push('HTTP partial PATCH, strict/null/length validation, 404 and stale 409');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1365,height:950}});const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(`${base}/documents/${id}`);
 const note=page.getByLabel('일반 텍스트 메모 (최대 20,000자)');await note.waitFor();
 const text='7주차 메모\n줄바꿈 <script>alert(1)</script>\n'+ '긴 내용 '.repeat(1000);
 await note.fill(text);await page.getByRole('button',{name:'메모 저장',exact:true}).click();
 await until(async()=>(await api(endpoint+'/note')).text===text);await page.reload();await note.waitFor();assert.equal(await note.inputValue(),text);
 checks.push('Long multiline plain-text note saves and survives reload without script execution');
 // A genuine non-2xx server response must not clear a local edit.
 const failed=text+'\n실패 후 유지';await note.fill(failed);
 await page.route(`**/api/documents/${id}/note`,route=>route.request().method()==='PUT'?route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({code:'TEST_WRITE_FAILURE',message:'시험용 저장 실패'})}):route.continue());
 await page.getByRole('button',{name:'메모 저장',exact:true}).click();await page.getByText(/저장 실패: 시험용 저장 실패/).waitFor();assert.equal(await note.inputValue(),failed);assert.equal((await api(endpoint+'/note')).text,text);
 await page.screenshot({path:path.join(output,'note-failure.png'),fullPage:true});
 await page.unroute(`**/api/documents/${id}/note`);await page.reload();await note.waitFor();assert.equal(await note.inputValue(),failed);
 await page.getByRole('button',{name:'메모 저장',exact:true}).click();await until(async()=>(await api(endpoint+'/note')).text===failed);
 checks.push('500 save failure retains input, restores after reload and retries');
 // Two tabs hold drafts at the same base version before either saves.
 const tab=await context.newPage();tab.on('dialog',d=>d.accept());await tab.goto(`${base}/documents/${id}`);const other=tab.getByLabel('일반 텍스트 메모 (최대 20,000자)');await other.waitFor();
 await note.fill('탭 A의 최신 메모');await other.fill('탭 B의 보존할 입력');
 await page.getByRole('button',{name:'메모 저장',exact:true}).click();await until(async()=>(await api(endpoint+'/note')).text==='탭 A의 최신 메모');
 await tab.getByRole('button',{name:'메모 저장',exact:true}).click();await tab.getByRole('heading',{name:'다른 탭의 메모와 충돌했습니다'}).waitFor();await tab.getByText('탭 A의 최신 메모',{exact:true}).waitFor();assert.equal(await other.inputValue(),'탭 B의 보존할 입력');
 await tab.screenshot({path:path.join(output,'note-conflict.png'),fullPage:true});
 await tab.getByRole('button',{name:'내 입력으로 저장 (서버 내용 교체)',exact:true}).click();await until(async()=>(await api(endpoint+'/note')).text==='탭 B의 보존할 입력');
 checks.push('Two-tab conflict displays both versions; explicit overwrite uses latest version');
 await tab.getByRole('button',{name:'내 보관함에 담기',exact:true}).click();await until(async()=>(await api(endpoint+'/reading')).saved);
 await tab.goto(`${base}/library?topicId=${topic.id}&readingStatus=READ&favorite=true&includeSynthetic=true`);
 await tab.getByRole('link',{name:'자료 상세 보기 →'}).first().waitFor();assert.ok((await api(`/documents?saved=true&topicId=${topic.id}&readingStatus=READ&favorite=true`)).totalElements>=1);
 await tab.getByRole('link',{name:'자료 상세 보기 →'}).first().click();await tab.getByRole('link',{name:'← 목록으로 돌아가기'}).click();assert.ok(tab.url().includes('/library?topicId='));assert.ok(tab.url().includes('favorite=true'));
 await tab.screenshot({path:path.join(output,'library.png'),fullPage:true});
 // Remove from the saved-only list without deleting the note or other flags.
 await tab.getByRole('button',{name:'보관 해제',exact:true}).first().click();await until(async()=>!(await api(endpoint+'/reading')).saved);await tab.getByText('조건에 맞는 자료가 없습니다',{exact:true}).waitFor();assert.equal((await api(endpoint+'/note')).text,'탭 B의 보존할 입력');assert.equal((await api(endpoint+'/reading')).favorite,true);
 checks.push('Library filters, detail return URL, un-save removes row while note/favorite remain');
 const second=await api('/topics','POST',{name:`두 번째 ${Date.now()}`,query:'자료'},201);
 await tab.goto(`${base}/documents/${id}`);const topicBox=tab.getByRole('checkbox',{name:second.name,exact:true});await topicBox.waitFor();await topicBox.click();await until(async()=>(await api(endpoint+'/topics')).includes(second.id));await until(()=>topicBox.isChecked());
 await tab.getByRole('checkbox',{name:topic.name,exact:true}).click();await until(async()=>!(await api(endpoint+'/topics')).includes(topic.id));assert.equal((await api(endpoint+'/note')).text,'탭 B의 보존할 입력');
 checks.push('Multi-topic checkbox link/unlink preserves document and note');
 await tab.setViewportSize({width:390,height:844});await tab.screenshot({path:path.join(output,'mobile-detail.png'),fullPage:true});assert.equal(await tab.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
 assert.deepEqual(errors,[]);checks.push('390px detail has no horizontal overflow; no page runtime errors');
 await fs.writeFile(path.join(output,'results.json'),JSON.stringify({passed:true,checks,documentId:id,topicId:topic.id,note:(await api(endpoint+'/note')),reading:await api(endpoint+'/reading')},null,2));console.log(JSON.stringify({passed:true,checks,documentId:id}));
} finally {await browser.close();}
