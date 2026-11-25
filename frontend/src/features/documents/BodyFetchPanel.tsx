import { useId, useRef, useState } from 'react';
import { ExtractionReasonText } from './ExtractionReasonText';
import { MIN_MANUAL, useBodyAcquire } from './bodyAcquire';

/** 원문에서 복사한 본문을 붙여 넣는 작은 양식. 저장되면 AI 요약이 본문 기반으로 바뀐다. */
export function ManualBodyForm({ manual, onDone }: { manual: ReturnType<typeof useBodyAcquire>['manual']; onDone?: () => void }) {
  const [text, setText] = useState('');
  const fieldId = useId();
  const length = text.trim().length;
  return <form className="manual-body" onSubmit={event => { event.preventDefault(); if (length >= MIN_MANUAL) manual.mutate(text, { onSuccess: () => { setText(''); onDone?.(); } }); }}>
    <label htmlFor={fieldId}>원문 본문 붙여넣기</label>
    <textarea id={fieldId} rows={7} maxLength={100000} value={text} onChange={event => setText(event.target.value)}
      placeholder="원문 페이지에서 본문을 복사해 붙여 넣으세요. 메뉴·광고·댓글은 빼면 요약이 더 정확합니다." />
    <div className="manual-body-actions">
      <span className="form-help">{length.toLocaleString()}자 · {MIN_MANUAL}자 이상 필요 · 이 컴퓨터의 DB에만 저장되고 AI 분석은 로컬 모델이 합니다.</span>
      <button type="submit" disabled={length < MIN_MANUAL || manual.isPending}>{manual.isPending ? '저장 중…' : '본문으로 저장'}</button>
    </div>
    {manual.isError && <p role="alert" className="det-inline-alert">{manual.error.message}</p>}
  </form>;
}

export function BodyFetchPanel({ id, available, characters = 0 }: { id: number; available: boolean; characters?: number }) {
  const { status, fetchBody, manual } = useBodyAcquire(id, !available);
  const submitting = useRef(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  function submit() { if (submitting.current) return; submitting.current = true; fetchBody.mutate(undefined, { onSettled: () => { submitting.current = false; } }); }
  if (available) return <p className="form-help">공개 본문 {characters.toLocaleString()}자를 확보했습니다. AI 요약에서도 본문을 사용할 수 있습니다. 아래 영역을 스크롤하면 끝까지 읽을 수 있습니다.</p>;
  const s = status.data;
  return <div className="body-fetch-panel"><p>현재는 본문을 읽지 않은 검색 발췌문만 있습니다. 본문을 확보하면 AI가 원문 전체 맥락으로 요약합니다.</p>
    {status.isPending && <p role="status">본문 수집 가능 여부를 확인하고 있습니다.</p>}
    {s?.available ? <p>본문이 이미 확보되었습니다. <button onClick={() => void status.refetch()}>본문 정보 새로 불러오기</button></p>
      : s?.canFetch ? <><p>{s.reason === 'READY_TO_SCRAPE' ? '수집 정책에 등록되지 않은 출처라 Serper 본문 추출로 공개 본문을 가져옵니다(오늘의 Serper 호출 1회 사용).' : '이 페이지는 수집 대상으로 검토되었습니다.'}</p>
        <button disabled={fetchBody.isPending} onClick={submit}>{fetchBody.isPending ? '본문 가져오는 중…' : '공개 본문 가져오기'}</button></>
      : s && <p>이 출처는 자동 본문 수집을 사용할 수 없습니다. 원문에서 본문을 복사해 붙여 넣으면 본문 기반으로 요약할 수 있습니다.</p>}
    {status.isError && <p role="alert">본문 수집 상태를 확인하지 못했습니다. <button onClick={() => void status.refetch()}>다시 확인</button></p>}
    {fetchBody.isError && <p role="alert">본문을 가져오지 못했습니다. {fetchBody.error.message}</p>}
    {fetchBody.data && !['SUCCESS', 'EXISTS'].includes(fetchBody.data.status) && <div role="alert">
      <p>{fetchBody.data.status === 'BLOCKED' ? '이 페이지의 본문 접근이 제한되었습니다.' : fetchBody.data.status === 'FAILED' ? '본문 추출에 실패했습니다.' : '페이지에서 읽을 수 있는 본문을 찾지 못했습니다.'} 아래에서 본문을 직접 붙여 넣을 수 있습니다.</p>
      {fetchBody.data.reason && <p className="form-help"><ExtractionReasonText reason={fetchBody.data.reason} /></p>}
    </div>}
    {s && s.canPaste !== false && (pasteOpen
      ? <ManualBodyForm manual={manual} onDone={() => setPasteOpen(false)} />
      : <button type="button" className="button-secondary" onClick={() => setPasteOpen(true)}>본문 직접 붙여넣기</button>)}
  </div>;
}
