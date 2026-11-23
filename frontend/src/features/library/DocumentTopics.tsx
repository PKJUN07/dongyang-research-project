import { useMutation, useQueryClient } from '@tanstack/react-query';
import { request } from '../../api/client';
import { useTopics } from '../../api/queries';
import { topicColor } from '../../lib/format';
import { useDocumentTopicIds } from './useReading';

export function DocumentTopics({ documentId }: { documentId: number }) {
  const cache = useQueryClient();
  const topics = useTopics();
  const links = useDocumentTopicIds(documentId);
  const change = useMutation({ mutationFn: ({ id, linked }: { id: number; linked: boolean }) => request<number[]>(`/documents/${documentId}/topics/${id}`, undefined, undefined, linked ? 'PUT' : 'DELETE'), onSuccess: async data => {
    await cache.cancelQueries({ queryKey: ['document-topics', documentId] }); cache.setQueryData(['document-topics', documentId], data);
    await cache.invalidateQueries({ queryKey: ['saved-documents'] });
    await cache.invalidateQueries({ queryKey: ['stats'] });
  }, retry: false });
  return <fieldset className="document-topics"><legend>자료의 주제 연결</legend><p>여러 주제를 선택할 수 있습니다. 연결을 해제해도 자료와 메모는 유지됩니다.</p>
    {(topics.isPending || links.isPending) && !(topics.isError || links.isError) && <p role="status">주제 연결 조회 중…</p>}
    {(topics.isError || links.isError) && <p role="alert">주제 조회 실패 <button className="button-secondary" onClick={() => { void topics.refetch(); void links.refetch(); }}>다시 조회</button></p>}
    {topics.data && links.data && !topics.data.length && <p>아직 만든 주제가 없습니다. 검색 화면에서 관심 주제를 만들 수 있습니다.</p>}
    {topics.data && links.data && topics.data.map(t => <label key={t.id}><input type="checkbox" disabled={change.isPending} checked={links.data.includes(t.id)} onChange={e => change.mutate({ id: t.id, linked: e.target.checked })} /><span className="topic-dot" style={{ background: topicColor(t.id) }} aria-hidden="true" />{t.name}</label>)}
    <p role="status" className="visually-hidden">{change.isPending ? '주제 연결 저장 중' : ''}</p>
    {change.isError && <p role="alert">변경 실패. 기존 연결을 유지했습니다. {change.error.message}</p>}
  </fieldset>;
}
