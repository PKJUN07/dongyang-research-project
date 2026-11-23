import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from '../../api/client';
import type { Topic } from '../../api/client';
import { ErrorState, LoadingState } from '../../components/AsyncState';
export function TopicPanel({ selectedId, onSelect, disabled }: { selectedId: number; onSelect: (topic: Topic) => void; disabled: boolean }) {
  const client = useQueryClient();
  const topics = useQuery({ queryKey: ['topics'], queryFn: ({ signal }) => request<Topic[]>('/topics', undefined, signal) });
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const create = useMutation({
    mutationFn: () => request<Topic>('/topics', { name: name.trim(), query: query.trim() }),
    onSuccess: topic => { void client.invalidateQueries({ queryKey: ['topics'] }); onSelect(topic); setName(''); setQuery(''); },
  });
  function submit(event: FormEvent) { event.preventDefault(); if (!create.isPending && name.trim() && query.trim()) create.mutate(); }
  if (topics.isPending) return <LoadingState title="관심 주제를 불러오는 중" />;
  if (topics.isError) return <ErrorState title="주제 조회 실패" description={topics.error.message} onRetry={() => { void topics.refetch(); }} />;
  return <section className="search-panel topic-panel" aria-label="관심 주제 관리">
    <label htmlFor="topic-select">관심 주제</label>
    <select id="topic-select" value={selectedId || ''} disabled={disabled} onChange={e => {
      const topic = topics.data.find(t => t.id === Number(e.target.value)); if (topic) onSelect(topic);
    }}><option value="">주제를 선택하세요</option>{topics.data.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
    <details><summary>새 관심 주제 만들기</summary><form onSubmit={submit} className="topic-create">
      <label htmlFor="topic-name">주제명</label><input id="topic-name" maxLength={100} required value={name} onChange={e => setName(e.target.value)} />
      <label htmlFor="topic-query">기본 검색어</label><input id="topic-query" maxLength={200} required value={query} onChange={e => setQuery(e.target.value)} />
      <button disabled={disabled || create.isPending || !name.trim() || !query.trim()}>주제 저장</button>
      {create.isError && <p role="alert">{create.error.message}</p>}
    </form></details>
    {!topics.data.length && <p>주제를 만든 뒤 검색을 시작하세요. 주제는 로컬 DB에 저장됩니다.</p>}
  </section>;
}
