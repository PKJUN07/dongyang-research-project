// Isolated fake DB only. Run once normally, restart backend, then run with --after-restart.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
const require=createRequire(path.join(process.env.RESEARCH_TEST_NODE_MODULES,'package.json'));
const {chromium}=require('playwright');
const base=process.env.RESEARCH_TEST_URL??'http://127.0.0.1:5179';
const out=process.env.RESEARCH_TEST_OUTPUT;await fs.mkdir(out,{recursive:true});
async function api(url,method='GET',body,status=200){const r=await fetch(base+'/api'+url,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});assert.equal(r.status,status,await r.clone().text());return r.json();}
async function until(fn){for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('timeout');}
const config=await api('/config');assert.equal(config.provider,'FAKE');
const browser=await chromium.launch({channel:'msedge',headless:true});const checks=[];
try{
 const page=await browser.newPage({viewport:{width:1365,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 if(process.argv.includes('--after-restart')){
  const saved=JSON.parse(await fs.readFile(out+'/state.json','utf8'));
  assert.equal((await api(`/documents/${saved.id}/note`)).text,saved.text);assert.equal((await api(`/documents/${saved.id}/reading`)).saved,true);
  await page.goto(base+'/library?includeSynthetic=true');const detail=page.locator(`a[href^="/documents/${saved.id}?"]`).filter({hasText:'자료 상세 보기'});await detail.first().click();const input=page.getByLabel('일반 텍스트 메모 (최대 20,000자)');await input.waitFor();assert.equal(await input.inputValue(),saved.text);
  await page.goto(base+'/stats');await page.locator('.stats-kpis').waitFor();assert.ok((await api('/stats')).saved>=1);await page.screenshot({path:out+'/after-restart.png',fullPage:true});checks.push('Real backend process restart: note, saved state, library and stats preserved without AI');
 }else{
  await page.goto(base+'/search');await page.getByText('관심 주제 선택 또는 만들기',{exact:true}).click();await page.getByText('새 관심 주제 만들기',{exact:true}).click();await page.getByLabel('주제명',{exact:true}).fill('9주차 전체 흐름 '+Date.now());await page.getByLabel('기본 검색어').fill('클로드');await page.getByRole('button',{name:'주제 저장',exact:true}).click();await until(async()=>(await page.getByLabel('검색어',{exact:true}).inputValue())==='클로드');
  let posted=0;await page.route('**/api/search-sessions',async route=>{if(route.request().method()==='POST'){posted++;await new Promise(r=>setTimeout(r,1000));}await route.continue();});
  await page.getByRole('button',{name:/테스트 검색/}).evaluate(b=>{b.click();b.click();});await page.getByRole('button',{name:'처리 중…',exact:true}).waitFor();await page.locator('.result-card').first().waitFor();assert.equal(posted,1);await page.unroute('**/api/search-sessions');checks.push('UI topic creation -> slow search -> duplicate clicks yield one POST');
  const runId=Number(new URL(page.url()).searchParams.get('runId'));const topicId=(await api('/search-sessions/'+runId)).topicId;const id=Number((await page.getByRole('link',{name:'자료 상세 보기 →'}).first().getAttribute('href')).match(/\/documents\/(\d+)/)[1]);await api(`/documents/${id}/reading`,'PATCH',{saved:false,readStatus:'UNREAD'});
  await page.getByRole('link',{name:'자료 상세 보기 →'}).first().click();await page.getByText('출처 근거',{exact:true}).waitFor();await page.getByRole('button',{name:'내 보관함에 담기',exact:true}).click();await until(async()=>(await api(`/documents/${id}/reading`)).saved);
  const note=page.getByLabel('일반 텍스트 메모 (최대 20,000자)');const firstText='9주차 재시작 보존 메모\n근거를 확인한 뒤 기록했습니다.';await note.fill(firstText);await page.getByRole('button',{name:'메모 저장',exact:true}).click();await until(async()=>(await api(`/documents/${id}/note`)).text===firstText);
  await page.getByLabel('읽기 상태 변경').selectOption('READ');await until(async()=>(await api(`/documents/${id}/reading`)).readStatus==='READ');checks.push('Source details -> save -> multiline note -> mark read');
  // Hold a real SQLite write lock in an independent process, then use the actual HTTP/UI save.
  const lock=spawn(process.env.RESEARCH_TEST_PYTHON,['-u','-c',"import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute('BEGIN IMMEDIATE'); print('READY',flush=True); sys.stdin.readline(); c.rollback(); c.close()",process.env.RESEARCH_TEST_DB]);
  await new Promise((resolve,reject)=>{lock.stdout.once('data',resolve);lock.once('error',reject);lock.once('exit',code=>{if(code)reject(Error('lock failed'));});});
  const text='DB 잠금 후 재시도한 최종 메모\n사용자 입력을 보존합니다.';
  try{await note.fill(text);await page.getByRole('button',{name:'메모 저장',exact:true}).click();await page.getByText(/저장 실패: 다른 저장 작업/).waitFor();assert.equal(await note.inputValue(),text);assert.notEqual((await api(`/documents/${id}/note`)).text,text);await page.screenshot({path:out+'/real-db-lock.png',fullPage:true});}finally{lock.stdin.end('\n');}
  await new Promise(resolve=>setTimeout(resolve,300));await page.getByRole('button',{name:'메모 저장',exact:true}).click();await until(async()=>(await api(`/documents/${id}/note`)).text===text);checks.push('Real SQLite lock -> HTTP503 helpful message -> draft retained -> retry succeeds');
  await page.goto(base+'/stats');await page.locator('.stats-kpis').waitFor();assert.ok((await api('/stats')).read>=1);await page.locator('.stats-kpis a').nth(2).click();await page.locator('.result-card').first().waitFor();assert.ok(page.url().includes('/library'));checks.push('Read/saved state reflected in stats and same-condition library');
  await page.goto(base+'/search');await page.getByLabel('검색어',{exact:true}).fill('테스트:실패');await page.getByRole('button',{name:/테스트 검색/}).click();await page.getByText('검색을 완료하지 못했습니다',{exact:true}).waitFor();await page.getByRole('link',{name:'내 보관함 열기 →',exact:true}).click();await page.locator('.result-card').first().waitFor();assert.equal((await api(`/documents/${id}/note`)).text,text);checks.push('Provider failure keeps library/note available; direct recovery link works');
  await page.route('**/api/documents?*',route=>route.abort());await page.reload();await page.getByText('자료 필터 조회 실패',{exact:true}).waitFor();await page.unroute('**/api/documents?*');await page.getByRole('button',{name:'다시 시도',exact:true}).click();await page.locator('.result-card').first().waitFor();checks.push('Disconnected list request shows retry; recovery restores saved materials');
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:out+'/library-mobile.png',fullPage:true});
  await fs.writeFile(out+'/state.json',JSON.stringify({id,text,topicId,runId}));
 }
 assert.deepEqual(errors,[]);await fs.writeFile(out+(process.argv.includes('--after-restart')?'/restart-results.json':'/results.json'),JSON.stringify({passed:true,checks,pageErrors:errors},null,2));console.log(JSON.stringify({passed:true,checks}));
}finally{await browser.close();}
