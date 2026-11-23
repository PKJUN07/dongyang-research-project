/** 읽기 상태(읽음·보관·즐겨찾기·나중에 읽기) 조회와 부분 변경. 목록 행·상세·카드가 같은 규칙을 쓴다. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from '../../api/client';
import type { ReadingState, ReadingStatus } from '../../api/client';

export type ReadingPatch = Partial<Pick<ReadingState, 'readStatus' | 'saved' | 'favorite' | 'readLater'>>;

export const readingStatusLabel: Record<ReadingStatus, string> = { UNREAD: '읽지 않음', READING: '읽는 중', READ: '읽음' };

/** GET /documents/{id}/reading. 기존 키 ['reading', id]. */
export function useReadingState(documentId: number) {
  return useQuery({ queryKey: ['reading', documentId], queryFn: ({ signal }) => request<ReadingState>(`/documents/${documentId}/reading`, undefined, signal), retry: false });
}

/**
 * PATCH /documents/{id}/reading. 전달한 필드만 바꾼다(서버 계약).
 * 낙관적 변경 없이 서버 성공 후 reading 캐시를 갱신하고 saved-documents/document/stats를 무효화한다.
 */
export function useReadingMutation(documentId: number) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (patch: ReadingPatch) => request<ReadingState>(`/documents/${documentId}/reading`, patch, undefined, 'PATCH'),
    onSuccess: async data => {
      await cache.cancelQueries({ queryKey: ['reading', documentId] });
      cache.setQueryData(['reading', documentId], data);
      await Promise.all(['saved-documents', 'document', 'stats'].map(key => cache.invalidateQueries({ queryKey: [key] })));
    },
    retry: false,
  });
}

/** 자료의 주제 연결 목록. 키 ['document-topics', id]는 상세 태그·보관함 행과 공유한다. */
export function useDocumentTopicIds(documentId: number) {
  return useQuery({ queryKey: ['document-topics', documentId], queryFn: ({ signal }) => request<number[]>(`/documents/${documentId}/topics`, undefined, signal), retry: false });
}
