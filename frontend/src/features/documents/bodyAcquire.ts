/** 자료 본문 확보(자동 가져오기·직접 붙여넣기) 상태와 요청. 공개 본문 탭과 AI 요약 패널이 함께 쓴다. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from '../../api/client';

export type BodyStatus = { available: boolean; characters: number; canFetch: boolean; canScrape?: boolean; canPaste?: boolean; reason: string };
export type BodyFetchResult = { status: string; characters: number; reason?: string };
export const MIN_MANUAL = 200;

/**
 * 본문 확보 상태와 두 가지 확보 방법(자동 가져오기·직접 붙여넣기). 공개 본문 탭과 AI 요약 패널이 함께 쓴다.
 * 자동 가져오기는 서버가 승인된 출처 직접 요청 → Serper 본문 추출 순서로 시도한다.
 */
export function useBodyAcquire(id: number, enabled = true) {
  const cache = useQueryClient();
  const refresh = () => Promise.all(['document', 'saved-documents', 'ai', 'body-status'].map(key => cache.invalidateQueries({ queryKey: [key] })));
  const status = useQuery({ queryKey: ['body-status', id], queryFn: ({ signal }) => request<BodyStatus>(`/ai/documents/${id}/body-status`, undefined, signal), enabled, retry: false });
  const fetchBody = useMutation({ mutationKey: ['body-fetch', id], mutationFn: () => request<BodyFetchResult>(`/ai/documents/${id}/body`, {}), onSuccess: refresh, retry: false });
  const manual = useMutation({ mutationKey: ['body-fetch', id], mutationFn: (text: string) => request<BodyFetchResult>(`/ai/documents/${id}/body/manual`, { text }), onSuccess: refresh, retry: false });
  return { status, fetchBody, manual };
}

export function fetchFailureText(result: BodyFetchResult) {
  return result.status === 'BLOCKED' ? '이 페이지의 본문 접근이 제한되었습니다.'
    : result.status === 'FAILED' ? '본문을 가져오지 못했습니다.'
    : '페이지에서 읽을 수 있는 본문을 찾지 못했습니다.';
}

