import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from '../../api/client';
import type { ReadingState } from '../../api/client';
export function ReadingControls({ documentId }: { documentId: number }) {
  const cache = useQueryClient();
  const state = useQuery({ queryKey: ['reading', documentId], queryFn: ({ signal }) => request<ReadingState>(`/documents/${documentId}/reading`, undefined, signal), retry: false });
  const update = useMutation({
    mutationFn: (patch: Partial<ReadingState>) => request<ReadingState>(`/documents/${documentId}/reading`, patch, undefined, 'PATCH'),
    onSuccess: async data => {
      await cache.cancelQueries({ queryKey: ['reading', documentId] });
      cache.setQueryData(['reading', documentId], data);
      await Promise.all(['saved-documents', 'document', 'stats'].map(key => cache.invalidateQueries({ queryKey: [key] })));
    }, retry: false,
  });
  if (!state.data) return <p role="status">{state.isError ? '읽기 상태 조회 실패' : '읽기 상태 조회 중'}{state.isError && <button onClick={() => { void state.refetch(); }}>다시 조회</button>}</p>;
  const reading = state.data;
  return <section className="reading-section" aria-label="읽기와 보관 설정">
    <div className="reading-controls">
      <label>읽기 상태<select aria-label="읽기 상태 변경" disabled={update.isPending} value={reading.readStatus} onChange={e => update.mutate({ readStatus: e.target.value as ReadingState['readStatus'] })}><option value="UNREAD">읽지 않음</option><option value="READING">읽는 중</option><option value="READ">읽음</option></select></label>
      <button disabled={update.isPending} aria-pressed={reading.saved} onClick={() => update.mutate({ saved: !reading.saved })}>{reading.saved ? '보관 해제' : '내 보관함에 담기'}</button>
      <button disabled={update.isPending} aria-pressed={reading.favorite} onClick={() => update.mutate({ favorite: !reading.favorite })}>{reading.favorite ? '즐겨찾기 해제' : '즐겨찾기'}</button>
      <button disabled={update.isPending} aria-pressed={reading.readLater} onClick={() => update.mutate({ readLater: !reading.readLater })}>{reading.readLater ? '나중에 읽기 해제' : '나중에 읽기'}</button>
    </div>
    <p className="save-feedback" role="status">{update.isPending ? '변경 저장 중…' : update.isSuccess ? '저장됨' : ''}</p>
    {update.isError && <p role="alert">저장 실패: {update.error.message} <button disabled={update.isPending} onClick={() => update.mutate(update.variables)}>같은 변경 재시도</button></p>}
  </section>;
}
