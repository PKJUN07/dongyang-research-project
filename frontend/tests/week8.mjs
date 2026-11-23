// Only an isolated fake-provider DB may be used; default port is the test frontend.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(path.join(process.env.RESEARCH_TEST_NODE_MODULES,'package.json'));
const {chromium}=require('playwright');
const base=process.env.RESEARCH_TEST_URL??'http://127.0.0.1:5177';
const out=process.env.RESEARCH_TEST_OUTPUT??'test-results/week8';await fs.mkdir(out,{recursive:true});
const checks=[];
async function api(url,method='GET',body,status=200){const r=await fetch(base+'/api'+url,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});assert.equal(r.status,status,await r.clone().text());return r.json();}
assert.equal((await api('/config')).provider,'FAKE');
const topic=await api('/topics','POST',{name:'8주차 검증 '+Date.now(),query:'통계'},201);
async function search(query){let r=await api('/search-sessions','POST',{topicId:topic.id,query,requestKey:crypto.randomUUID()},202);for(let i=0;i<100 && ['QUEUED','RUNNING'].includes(r.status);i++){await new Promise(r=>setTimeout(r,100));r=await api('/search-sessions/'+r.runId);}return r;}
await search('통계');const again=await search('통계');await search('테스트:실패');await search('테스트:부분실패');
const day=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
const query=new URLSearchParams({from:day,to:day,topicId:String(topic.id)});
const overview=await api('/stats?'+query);assert.ok(overview.total>0);
assert.equal(overview.readingCounts.reduce((sum,r)=>sum+r.count,0),overview.total);
const history=await api('/stats/history?'+query);assert.equal(history.total,4);const repeat=history.items.find(r=>r.id===again.runId);assert.equal(repeat.created,0);assert.equal(repeat.existing,2);assert.equal(repeat.raw,2);
await api('/stats?from=2026-11-04&to=2026-11-01','GET',undefined,400);await api('/stats/history?page=-1','GET',undefined,400);checks.push('API: repeated search, counts, failed/partial history and invalid range');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/stats?'+query);await page.locator('.stats-kpis').waitFor();await page.locator('.stats-run').first().waitFor();assert.equal(await page.locator('.stats-run').count(),4);
 const expected=Number(await page.locator('.stats-kpis a').first().locator('strong').innerText().then(s=>s.replace(/\D/g,'')));assert.equal(expected,overview.total);assert.equal(await page.locator('.stats-reading a').count(),3);
 await page.screenshot({path:out+'/stats-desktop.png',fullPage:true});
 await page.locator('.stats-kpis a').first().click();await page.locator('.result-card').first().waitFor();assert.equal(await page.locator('.result-card').count(),overview.total);assert.equal(await page.getByLabel('기간 기준').inputValue(),'FIRST_SAVED');
 await page.getByRole('link',{name:'자료 상세 보기 →'}).first().click();await page.getByLabel('읽기 상태 변경').selectOption('READ');await page.getByText('저장됨',{exact:true}).first().waitFor();
 await page.getByRole('link',{name:'← 목록으로 돌아가기',exact:true}).click();assert.ok(page.url().includes('FIRST_SAVED'));
 await page.goto(base+'/stats?'+query);await page.locator('.stats-kpis').waitFor();assert.match(await page.locator('.stats-kpis a').nth(1).innerText(),/현재 읽음/);const updated=await api('/stats?'+query);assert.ok(updated.read>=1);checks.push('KPI -> same-filter list -> detail -> read -> back; current stats refreshed');
 await page.getByText('날짜별 수치를 표로 보기',{exact:true}).click();assert.equal(await page.locator('tbody tr').count(),1);assert.match(await page.locator('tbody').innerText(),new RegExp(String(overview.total)+'건'));
 await page.locator('.stats-run a').first().click();await page.locator('.result-card').first().waitFor();assert.ok(page.url().includes('runId='));checks.push('Accessible text table and history result links');
 await page.goto(base+'/stats?'+query);await page.locator('.stats-kpis').waitFor();await page.setViewportSize({width:390,height:844});await page.screenshot({path:out+'/stats-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);checks.push('390px mobile: no horizontal overflow');
 await page.getByLabel('시작일',{exact:true}).fill('2025-01-01');await page.getByLabel('종료일',{exact:true}).fill('2025-01-02');await page.getByRole('button',{name:'조회하기',exact:true}).click();await page.getByText('이 기간에 처음 저장한 자료가 없습니다',{exact:true}).waitFor();assert.match(await page.locator('.stats-kpis').innerText(),/0%/);checks.push('Empty range has 0 denominator and helpful empty state');
 await page.route('**/api/stats?*',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({code:'TEST',message:'합성 장애'})}));await page.reload();await page.getByText('통계를 불러오지 못했습니다',{exact:true}).waitFor();await page.unroute('**/api/stats?*');await page.getByRole('button',{name:'다시 시도',exact:true}).click();await page.getByText('이 기간에 처음 저장한 자료가 없습니다',{exact:true}).waitFor();checks.push('Request failure and explicit retry recover');
 assert.deepEqual(errors,[]);await fs.writeFile(out+'/results.json',JSON.stringify({checks,pageErrors:errors},null,2));console.log(JSON.stringify({checks,pageErrors:errors},null,2));
}finally{await browser.close();}
