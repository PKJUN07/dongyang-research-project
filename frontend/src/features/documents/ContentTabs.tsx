import { useState } from 'react';
import { extractionLabel, safeLink } from '../../api/client';
import type { DocumentResult } from '../../api/client';
import { BodyFetchPanel } from './BodyFetchPanel';
export function ContentTabs({ item }: { item: DocumentResult }) {
  const [selected, setSelected] = useState<'snippet' | 'body'>('snippet');
  const shortened = /(?:\.{3}|…)\s*$/.test(item.snippet ?? '');
  return <section className="content-tabs"><div role="group" aria-label="표시할 자료 내용"><button aria-pressed={selected === 'snippet'} onClick={() => setSelected('snippet')}>검색 요약</button><button aria-pressed={selected === 'body'} onClick={() => setSelected('body')}>{item.synthetic ? '합성 시험 본문' : '공개 본문'}</button></div>
    <div className="content-panel source-content">{selected === 'snippet' ? <><h3>검색 제공자가 전달한 요약</h3><p className="document-body">{item.snippet || '검색 제공자가 요약을 제공하지 않았습니다.'}</p>{shortened&&<p className="source-limit-note">검색 제공자가 일부 내용만 전달해 요약이 ‘…’로 끝납니다. 화면에서 숨긴 문장은 없으며, 이어지는 내용은 원문에서 확인할 수 있습니다.</p>}<p className="form-help">검색 결과의 발췌문이며, 원문 전체나 AI 요약이 아닙니다.</p>{item.contentText&&<button className="button-secondary" onClick={()=>setSelected('body')}>확보한 본문 {item.contentText.length.toLocaleString()}자 보기</button>}{safeLink(item.url)&&<a className="text-link" href={item.url} target="_blank" rel="noopener noreferrer">원문에서 전체 내용 확인 ↗</a>}</> : <><h3>{item.synthetic ? '합성 시험 본문' : '공개 본문'}</h3><p>{extractionLabel[item.extractionStatus]}</p>{item.extractionReason&&<details><summary>본문 수집 상태 정보</summary><p>{item.extractionReason}</p></details>}<BodyFetchPanel id={item.documentId} available={Boolean(item.contentText)} characters={item.contentText?.length??0}/>{item.contentText ? <p className="document-body full-source-text" tabIndex={0} aria-label="확보한 공개 본문">{item.contentText}</p> : <p className="source-limit-note">저장된 본문이 없습니다. 검색 요약 탭 또는 원문 링크를 확인하세요.</p>}{safeLink(item.url)&&<a className="text-link" href={item.url} target="_blank" rel="noopener noreferrer">원문에서 전체 내용 확인 ↗</a>}<p className="form-help">본문 요청 시각: {item.fetchedAt ?? '미수집'} · 분류 확인: {item.classifiedAt ?? '미확인'}</p></>}</div>
  </section>;
}
