import { useMutation, useQueryClient } from '@tanstack/react-query';
import { request } from '../../api/client';

type Deleted = { runId: number; removedDocuments: number; keptDocuments: number };

/**
 * 검색 이력 하나를 지우는 버튼. 그 검색에서만 나왔고 손대지 않은 자료는 함께 지우고,
 * 보관·즐겨찾기·읽기 상태·메모·AI 분석이 있는 자료는 남긴다(서버가 판단).
 */
export function DeleteRunButton({ runId, query, active }: { runId: number; query: string; active: boolean }) {
  const cache = useQueryClient();
  const remove = useMutation({
    mutationFn: () => request<Deleted>(`/search-sessions/${runId}`, undefined, undefined, 'DELETE'),
    onSuccess: () => { cache.removeQueries({ queryKey: ['search-run', runId] }); void cache.invalidateQueries(); },
  });
  function confirmDelete() {
    if (remove.isPending) return;
    const ok = window.confirm(`“${query}” 검색 이력을 삭제할까요?\n\n이 검색에서만 나온 자료 중 보관·즐겨찾기·읽기·메모·AI 분석을 하지 않은 자료도 함께 지워집니다. 손댄 자료는 그대로 남습니다.`);
    if (ok) remove.mutate();
  }
  return <>
    <button type="button" className="button-quiet run-delete" disabled={active || remove.isPending} title={active ? '진행 중인 검색은 끝난 뒤에 삭제할 수 있습니다.' : undefined}
      aria-label={`“${query}” 검색 이력 삭제`} onClick={confirmDelete}>{remove.isPending ? '삭제 중…' : '삭제'}</button>
    {remove.isError && <span role="alert" className="run-delete-error">삭제하지 못했습니다. {remove.error.message}</span>}
  </>;
}
