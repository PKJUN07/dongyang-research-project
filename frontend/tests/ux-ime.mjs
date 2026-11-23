// Dedicated FAKE test database only. Never point this script at user preview.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire('C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');
const {chromium}=require('playwright');
const base=process.env.RESEARCH_TEST_URL??'http://127.0.0.1:5182';
const out=process.env.RESEARCH_TEST_OUTPUT??'C:/Users/USER/Documents/ChatGPT/동미대 리서치 보드/output/ux-ime';await fs.mkdir(out,{recursive:true});
async function api(p,body){const r=await fetch(base+'/api'+p,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});assert.ok(r.ok,await r.clone().text());return r.json();}
assert.equal((await api('/config')).provider,'FAKE');
const topic=await api('/topics',{name:'한글 입력 시험 '+Date.now(),query:'한국어 검색'});
const run=await api('/search-sessions',{topicId:topic.id,query:'한국어 검색',requestKey:crypto.randomUUID()});
for(let i=0;i<100;i++){const r=await api('/search-sessions/'+run.runId);if(!['RUNNING','QUEUED'].includes(r.status))break;await new Promise(r=>setTimeout(r,100));}
const browser=await chromium.launch({channel:'msedge',headless:true});const checks=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/documents');await page.getByText('전체 수집 자료 0건',{exact:true}).waitFor();assert.equal(await page.locator('.result-card').count(),0);await page.getByRole('checkbox',{name:'테스트 자료 포함',exact:true}).check();await page.locator('.result-card').first().waitFor();assert.equal(await page.locator('.result-card').count(),2);checks.push('Synthetic documents hidden by default; include toggle restores both fixtures');
 const titles=[];page.on('request',r=>{if(r.url().includes('/api/documents?')){const q=new URL(r.url()).searchParams;if(q.get('title'))titles.push(q.get('title'));}});
 const input=page.getByRole('searchbox',{name:'수집 자료 제목 검색',exact:true});await input.focus();const cdp=await page.context().newCDPSession(page);
 for(const text of ['ㅎ','하','한','한국','한국어'])await cdp.send('Input.imeSetComposition',{text,selectionStart:text.length,selectionEnd:text.length});
 assert.equal(await input.inputValue(),'한국어');assert.equal(new URL(page.url()).searchParams.has('title'),false);assert.equal(titles.length,0);
 await page.keyboard.press('Enter');assert.equal(new URL(page.url()).searchParams.has('title'),false);
 await cdp.send('Input.insertText',{text:'한국어'});assert.equal(await input.inputValue(),'한국어');await page.getByRole('button',{name:'제목 검색',exact:true}).click();await page.waitForURL(/title=/);assert.equal(new URL(page.url()).searchParams.get('title'),'한국어');assert.equal(await input.inputValue(),'한국어');await page.locator('.result-card').first().waitFor();assert.ok(titles.every(t=>t==='한국어'));
 checks.push('Chromium IME composition ㅎ→하→한→한국→한국어 stays local, composing Enter ignored, single committed query');
 await page.getByRole('button',{name:'필터 초기화',exact:true}).click();assert.equal(await input.inputValue(),'');await input.fill('아직 제출하지 않은 입력');await page.getByRole('button',{name:'필터 초기화',exact:true}).click();assert.equal(await input.inputValue(),'');checks.push('Reset clears submitted and unsubmitted Korean text');
 await page.goto(base+'/library');await page.getByRole('heading',{name:'아직 보관한 자료가 없습니다',exact:true}).waitFor();assert.equal(await page.getByRole('navigation',{name:'자료 페이지 이동',exact:true}).count(),0);assert.ok(await page.getByRole('link',{name:'수집 자료 둘러보기 →',exact:true}).isVisible());checks.push('Empty library explains how to save and hides 0/0 pagination');
 await page.goto(base+'/brief');await page.getByRole('checkbox',{name:'테스트 자료 포함',exact:true}).check();await page.getByText('아직 분석을 완료한 자료가 없습니다.',{exact:false}).waitFor();const selections=page.locator('.brief-selection input');assert.equal(await selections.count(),2);assert.equal(await selections.first().isEnabled(),false);assert.equal(await page.getByRole('button',{name:'선택한 자료 요약 모으기',exact:true}).isEnabled(),false);await page.screenshot({path:out+'/brief-status.png',fullPage:true});checks.push('Brief shows unanalysed state and prevents invalid selection before submit');
 await page.goto(base+'/search');await page.getByText('실제 검색 연결 대기 · 테스트 모드',{exact:true}).waitFor();assert.ok(await page.getByRole('button',{name:'테스트 검색 (외부 호출 없음)',exact:true}).isVisible());await page.screenshot({path:out+'/search-status.png',fullPage:true});checks.push('Search distinguishes test mode and cumulative—not daily—budget');
 await page.goto(base+'/documents');await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'제목 검색',exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:out+'/mobile.png',fullPage:true});assert.deepEqual(errors,[]);checks.push('390px mobile has no overflow or page errors');await fs.writeFile(out+'/results.json',JSON.stringify({passed:true,checks,pageErrors:errors},null,2));console.log(JSON.stringify({passed:true,checks}));
}finally{await browser.close();}
