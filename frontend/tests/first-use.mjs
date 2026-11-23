import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(path.join(process.env.RESEARCH_TEST_NODE_MODULES, 'package.json'));
const { chromium } = require('playwright');
const base = process.env.RESEARCH_TEST_URL;
const output = process.env.RESEARCH_TEST_OUTPUT;
const config = await (await fetch(base + '/api/config')).json();
assert.equal(config.provider, 'FAKE');
const browser = await chromium.launch({ channel: 'msedge' });
const checks = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.goto(base);
  const query = page.getByRole('searchbox', { name: '검색어', exact: true });
  const submit = page.getByRole('button', { name: /테스트 검색/ });
  await query.focus();
  const ime = await page.context().newCDPSession(page);
  const posts = [];
  await page.route('**/api/search-sessions', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    posts.push(route.request().postDataJSON());
    if (posts.length === 1) {
      await route.fetch();
      return route.abort();
    }
    return route.continue();
  });
  for (const text of ['ㅎ', '하', '한', '한글']) {
    await ime.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
  }
  await page.keyboard.press('Enter');
  assert.equal(posts.length, 0);
  await ime.send('Input.insertText', { text: '한글' });
  await submit.click();
  await page.getByText(/입력을 유지했습니다/).waitFor();
  await submit.evaluate(button => { button.click(); button.click(); });
  await page.locator('.result-card').first().waitFor();
  assert.equal(posts.length, 2);
  assert.deepEqual(posts[0], posts[1]);
  checks.push('Korean composition, quick search, lost response retry and double click');
  const listUrl = page.url();
  await page.getByRole('link', { name: '자료 상세 보기 →' }).first().click();
  await page.getByRole('link', { name: '원문 열기 ↗' }).waitFor();
  await page.getByRole('button', { name: '합성 시험 본문' }).click();
  await page.getByLabel('확보한 공개 본문').waitFor();
  const reading = page.getByRole('region', { name: '읽기와 보관 설정' });
  await reading.waitFor();
  const remove = reading.getByRole('button', { name: '보관 해제', exact: true });
  if (await remove.count()) await remove.click();
  const saveToLibrary = page.getByRole('button', { name: '내 보관함에 담기', exact: true });
  await saveToLibrary.click({ trial: true });
  await saveToLibrary.press('Enter');
  await page.getByRole('button', { name: '보관 해제' }).waitFor();
  const note = page.getByLabel(/일반 텍스트 메모/);
  const memo = `첫 방문 검증 메모 ${Date.now()}`;
  await note.fill(memo);
  let writes = 0;
  await page.route('**/api/documents/*/note', async route => {
    if (route.request().method() === 'PUT') {
      writes++;
      if (writes === 1) return route.fulfill({ status: 503, body: '<html>temporary error</html>' });
    }
    return route.continue();
  });
  const save = page.getByRole('button', { name: '메모 저장' });
  await save.evaluate(button => { button.click(); button.click(); });
  await page.getByText(/서버가 요청을 처리하지 못했습니다/).waitFor();
  assert.equal(writes, 1);
  assert.equal(await note.inputValue(), memo);
  await save.press('Enter');
  await page.getByText(/서버에 저장됨/).waitFor();
  await page.reload();
  await note.waitFor();
  assert.equal(await note.inputValue(), memo);
  await page.getByRole('link', { name: '← 목록으로', exact: true }).press('Enter');
  assert.equal(page.url(), listUrl);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  checks.push('Mobile detail, body, keyboard save, 503 recovery, reload and return');
  for (const [keyword, message] of [
    ['테스트:0건', '검색 결과가 없습니다.'],
    ['테스트:부분실패', '아래에서 저장된 자료를 먼저 볼 수 있습니다.'],
    ['테스트:실패', '검색을 완료하지 못했습니다'],
  ]) {
    await query.fill(keyword);
    await submit.click();
    await page.getByText(message, { exact: false }).first().waitFor();
  }
  checks.push('Zero, partial and failed search outcomes');
  await page.goto(base + '/search');
  const configPattern = '**/api/config';
  await page.route(configPattern, route => route.fulfill({ json: { ...config, synthetic: false, externalSearchReady: false, searchReason: 'BUDGET_EXHAUSTED', remaining: 0 } }));
  await page.reload();
  await page.getByText(/승인된 누적 검색 횟수를 모두/).waitFor();
  await page.getByRole('link', { name: /기존 자료 보기/ }).waitFor();
  await page.unroute(configPattern);
  await page.route(configPattern, route => route.fulfill({ status: 200, body: '<html>bad response</html>' }));
  await page.reload();
  await page.getByText(/서버 응답 형식을 읽을 수 없습니다/).waitFor();
  await page.unroute(configPattern);
  await page.getByRole('button', { name: '다시 시도', exact: true }).click();
  await submit.waitFor();
  checks.push('Budget exhaustion and invalid response recovery');
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
  await writeFile(path.join(output, 'first-use.json'), JSON.stringify({ checks, listUrl }, null, 2));
  console.log(checks);
} finally {
  await browser.close();
}
