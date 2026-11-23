import { useId, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { safeLink } from '../../api/client';
import type { ReadingState } from '../../api/client';
import { DocumentTopics } from './DocumentTopics';
import { readingStatusLabel, useReadingMutation, useReadingState } from './useReading';

function ActionButton({ icon, active, children, ...rest }: { icon: string; active?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={`det-action${active ? ' det-action-on' : ''}`} {...rest}>
    <span className="det-action-icon" aria-hidden="true">{icon}</span><span>{children}</span>
  </button>;
}

/** 상세 오른쪽 '이 자료에서 할 일' 카드. 모든 버튼은 실제 PATCH(읽기 상태)·PUT/DELETE(주제 연결)를 보낸다. */
export function DocumentActions({ documentId, url, synthetic }: { documentId: number; url: string; synthetic: boolean }) {
  const state = useReadingState(documentId);
  const update = useReadingMutation(documentId);
  const [topicsOpen, setTopicsOpen] = useState(false);
  const titleId = useId();
  const topicsId = useId();
  const reading = state.data;
  const busy = update.isPending;
  const summary = reading ? [readingStatusLabel[reading.readStatus], reading.saved ? '보관됨' : '보관 안 됨', reading.favorite && '즐겨찾기', reading.readLater && '나중에 읽기'].filter(Boolean).join(' · ') : '';
  return <section className="card det-actions" aria-label="읽기와 보관 설정">
    <h2 className="card-title" id={titleId}>이 자료에서 할 일</h2>
    {!reading ? <p role="status" className="det-actions-state">{state.isError ? '읽기 상태 조회 실패' : '읽기 상태 조회 중…'}{state.isError && <button className="button-secondary" onClick={() => { void state.refetch(); }}>다시 조회</button>}</p> : <>
      <div className="det-action-list" role="group" aria-labelledby={titleId}>
        {reading.readStatus === 'READ'
          ? <ActionButton icon="↺" disabled={busy} onClick={() => update.mutate({ readStatus: 'UNREAD' })}>읽지 않음으로 되돌리기</ActionButton>
          : <ActionButton icon="✓" disabled={busy} onClick={() => update.mutate({ readStatus: 'READ' })}>읽음으로 표시</ActionButton>}
        <ActionButton icon="◷" active={reading.readLater} disabled={busy} onClick={() => update.mutate({ readLater: !reading.readLater })}>{reading.readLater ? '나중에 읽기 해제' : '나중에 읽기'}</ActionButton>
        <ActionButton icon={reading.favorite ? '★' : '☆'} active={reading.favorite} disabled={busy} onClick={() => update.mutate({ favorite: !reading.favorite })}>{reading.favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}</ActionButton>
        <ActionButton icon={reading.saved ? '▣' : '□'} active={reading.saved} disabled={busy} onClick={() => update.mutate({ saved: !reading.saved })}>{reading.saved ? '보관 해제' : '내 보관함에 담기'}</ActionButton>
        <ActionButton icon="☰" aria-expanded={topicsOpen} aria-controls={topicsId} onClick={() => setTopicsOpen(open => !open)}>주제 보관함 변경</ActionButton>
        <div id={topicsId} className="det-topics-panel" hidden={!topicsOpen}>{topicsOpen && <DocumentTopics documentId={documentId} />}</div>
        {safeLink(url) && <a className="det-action" href={url} target="_blank" rel="noopener noreferrer"><span className="det-action-icon" aria-hidden="true">↗</span><span>원문 열기</span></a>}
      </div>
      <label className="det-status-select">읽기 상태 직접 선택<select aria-label="읽기 상태 변경" disabled={busy} value={reading.readStatus} onChange={e => update.mutate({ readStatus: e.target.value as ReadingState['readStatus'] })}><option value="UNREAD">읽지 않음</option><option value="READING">읽는 중</option><option value="READ">읽음</option></select></label>
      <p className="det-actions-state" role="status">{busy ? '변경 저장 중…' : `현재: ${summary}${update.isSuccess ? ' · 저장됨' : ''}`}</p>
    </>}
    {update.isError && <p className="det-inline-alert" role="alert">저장 실패: {update.error.message} 기존 상태를 유지했습니다. <button className="button-secondary" disabled={busy} onClick={() => update.mutate(update.variables)}>같은 변경 재시도</button></p>}
    <Link className="text-link det-library-link" to={synthetic ? '/library?includeSynthetic=true' : '/library'}>읽기 보관함 열기 →</Link>
  </section>;
}
