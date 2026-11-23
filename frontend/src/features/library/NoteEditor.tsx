import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, request } from '../../api/client';
import type { Note } from '../../api/client';
type Draft = { text: string; version: number };
export function NoteEditor({ documentId }: { documentId: number }) {
  const query = useQuery({ queryKey: ['note', documentId], queryFn: ({ signal }) => request<Note>(`/documents/${documentId}/note`, undefined, signal), retry: false });
  return <section className="note-editor"><h3>내 메모</h3>
    {query.isPending && <p>메모 조회 중…</p>}
    {query.isError && <p role="alert">메모 조회 실패. 임시 입력은 이 탭에 유지됩니다. <button onClick={() => { void query.refetch(); }}>다시 조회</button></p>}
    {query.data && <Editor key={documentId} documentId={documentId} note={query.data} />}
  </section>;
}
function Editor({ documentId, note }: { documentId: number; note: Note }) {
  const cache = useQueryClient();
  const storageKey = `researchboard:note-draft:${documentId}`;
  const [draft, setDraft] = useState<Draft | null>(() => {
    try { const v = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null'); return v && typeof v.text === 'string' && Number.isSafeInteger(v.version) && v.version >= 0 ? v : null; } catch { return null; }
  });
  const [pending, setPending] = useState(false);
  const saveLock = useRef(false);
  const [message, setMessage] = useState('');
  const [conflict, setConflict] = useState<Note | null>(null);
  const [conflictNeeded, setConflictNeeded] = useState(false);
  const [recovery, setRecovery] = useState('');
  const [storageError, setStorageError] = useState(false);
  function change(next: Draft | null) {
    setDraft(next);
    try { if (next) sessionStorage.setItem(storageKey, JSON.stringify(next)); else sessionStorage.removeItem(storageKey); setStorageError(false); } catch { setStorageError(true); }
  }
  useEffect(() => {
    if (!draft && !pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draft, pending]);
  async function compare() {
    try { setConflict(await request<Note>(`/documents/${documentId}/note`)); }
    catch { setMessage('서버 메모 조회에 실패했습니다. 내 입력을 유지했습니다. 비교를 다시 시도하세요.'); }
  }
  async function save(version = draft?.version) {
    if (!draft || version === undefined || saveLock.current) return;
    saveLock.current = true;
    const submitted = { text: draft.text, version }; setPending(true); setMessage('저장 중…');
    try {
      const result = await request<Note>(`/documents/${documentId}/note`, submitted, undefined, 'PUT');
      await cache.cancelQueries({ queryKey: ['note', documentId] });
      cache.setQueryData(['note', documentId], result);
      change(null); setConflict(null); setConflictNeeded(false); setMessage('서버에 저장됨');
    } catch (error) {
      setMessage(`저장 실패: ${error instanceof Error ? error.message : '연결을 확인하세요.'} 내 입력은 유지됩니다.`);
      if (error instanceof ApiError && error.code === 'NOTE_VERSION_CONFLICT') { setConflictNeeded(true); await compare(); }
    } finally { saveLock.current = false; setPending(false); }
  }
  return <>
    <label htmlFor={`note-${documentId}`}>일반 텍스트 메모 (최대 20,000자)</label>
    <textarea id={`note-${documentId}`} rows={8} maxLength={20000} disabled={pending} value={draft?.text ?? note.text} onChange={e => { change({ text: e.target.value, version: draft?.version ?? note.version }); setMessage('변경됨 · 저장 버튼을 눌러 주세요.'); }} />
    <p role="status">{message || (draft ? '이 탭의 미저장 입력을 복원했습니다.' : note.version ? '서버 저장 메모' : '아직 저장한 메모가 없습니다.')} ({(draft?.text ?? note.text).length.toLocaleString()}자)</p>
    <button disabled={!draft || pending || conflictNeeded} onClick={() => { void save(); }}>메모 저장</button>
    {storageError && <p role="alert">브라우저 임시 보관을 사용할 수 없습니다. 페이지를 떠나기 전에 입력을 복사하거나 서버에 저장하세요.</p>}
    {conflictNeeded && <section className="note-conflict" aria-label="메모 충돌 해결">
      <h4>다른 탭의 메모와 충돌했습니다</h4><p>위 입력은 그대로 유지했습니다. 서버 내용을 확인한 뒤 저장할 내용을 선택하세요.</p>
      <button disabled={pending} onClick={() => { void compare(); }}>서버 메모 다시 비교</button>
      {conflict && <><p>서버 버전 {conflict.version}</p><pre>{conflict.text || '(빈 메모)'}</pre>
        <button disabled={pending} onClick={() => { void save(conflict.version); }}>내 입력으로 저장 (서버 내용 교체)</button>
        <button disabled={pending} onClick={() => { setRecovery(draft?.text ?? ''); cache.setQueryData(['note', documentId], conflict); change(null); setConflictNeeded(false); setConflict(null); setMessage('서버 메모를 선택했습니다. 이전 입력은 아래에서 복사할 수 있습니다.'); }}>서버 메모 사용</button></>}
    </section>}
    {recovery && <details><summary>선택 전 내 입력</summary><pre>{recovery}</pre></details>}
  </>;
}
