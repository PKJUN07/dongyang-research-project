import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {request} from '../../api/client';
import {useRef} from 'react';
export function BodyFetchPanel({id,available,characters=0}:{id:number;available:boolean;characters?:number}){
 const cache=useQueryClient();
 const submitting=useRef(false);
 const status=useQuery({queryKey:['body-status',id],queryFn:({signal})=>request<{available:boolean;canFetch:boolean;reason:string}>(`/ai/documents/${id}/body-status`,undefined,signal),enabled:!available,retry:false});
 const fetchBody=useMutation({mutationKey:['body-fetch',id],mutationFn:()=>request<{status:string;characters:number;reason:string}>(`/ai/documents/${id}/body`,{}),onSuccess:async()=>{await Promise.all(['document','saved-documents','ai','body-status'].map(key=>cache.invalidateQueries({queryKey:[key]})));},onSettled:()=>{submitting.current=false;},retry:false});
 function submit(){if(submitting.current)return;submitting.current=true;fetchBody.mutate();}
 if(available)return <p className="form-help">공개 본문 {characters.toLocaleString()}자를 확보했습니다. AI 요약에서도 본문을 사용할 수 있습니다. 아래 영역을 스크롤하면 끝까지 읽을 수 있습니다.</p>;
 return <div className="body-fetch-panel"><p>현재는 본문을 읽지 않은 검색 발췌문만 있습니다.</p>
 {status.isPending&&<p role="status">본문 수집 가능 여부를 확인하고 있습니다.</p>}
 {status.data?.available?<p>본문이 이미 확보되었습니다. <button onClick={()=>void cache.invalidateQueries({queryKey:['document']})}>본문 정보 새로 불러오기</button></p>:status.data?.canFetch?<><p>이 페이지는 수집 대상으로 검토되었습니다. 공개 본문을 가져오면 더 자세한 요약을 요청할 수 있습니다.</p><button disabled={fetchBody.isPending} onClick={submit}>{fetchBody.isPending?'본문 확인 중…':'공개 본문 가져오기'}</button></>:status.data&&<p>이 출처는 자동 본문 수집 대상으로 검토되지 않았습니다. 원문 링크에서 내용을 확인하세요.</p>}
 {status.isError&&<p role="alert">본문 수집 상태를 확인하지 못했습니다. <button onClick={()=>void status.refetch()}>다시 확인</button></p>}
 {fetchBody.isError&&<p role="alert">본문을 가져오지 못했습니다. {fetchBody.error.message}</p>}
 {fetchBody.data&&!['SUCCESS','EXISTS'].includes(fetchBody.data.status)&&<div role="alert">
  <p>{fetchBody.data.status === 'BLOCKED' ? '이 페이지의 본문 접근이 제한되었습니다. 원문 링크를 이용하세요.' : fetchBody.data.status === 'FAILED' ? '본문 추출에 실패했습니다. 다시 가져오거나 원문 링크를 이용하세요.' : '페이지에서 읽을 수 있는 본문을 찾지 못했습니다. 원문 링크를 이용하세요.'}</p>
  {fetchBody.data.reason && <details><summary>본문 수집 오류 정보</summary><p>{fetchBody.data.reason}</p></details>}
 </div>}
 </div>;
}
