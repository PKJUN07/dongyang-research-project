import {useState} from 'react';
import {useQuery,useMutation} from '@tanstack/react-query';
import {Link,useSearchParams} from 'react-router-dom';
import {request,sourceLabel} from '../../api/client';
import type {ResultPage} from '../../api/client';
export default function BriefPage(){
 const [ids,setIds]=useState<number[]>([]);
 const [includeSynthetic,setIncludeSynthetic]=useState(false);
 const [params,setParams]=useSearchParams();
 const briefId=Number(params.get('briefId'));
 const docs=useQuery({queryKey:['saved-documents','brief',includeSynthetic],queryFn:()=>request<ResultPage>('/documents?size=100&sort=FETCHED_DESC'+(includeSynthetic?'':'&synthetic=false'))});
 const visibleIds=docs.data?.items.map(d=>d.documentId)??[];
 const status=useQuery({queryKey:['ai','readiness',visibleIds.join(',')],enabled:visibleIds.length>0,queryFn:({signal})=>request<Record<string,string>>('/ai/readiness?ids='+visibleIds.join(','),undefined,signal),retry:false,refetchInterval:q=>Object.values(q.state.data??{}).includes('RUNNING')?2000:false});
 const ready=ids.length>0&&ids.every(id=>visibleIds.includes(id)&&status.data?.[id]==='READY');
 const labels:Record<string,string>={READY:'분석 완료',RUNNING:'분석 중',STALE:'재분석 필요',NOT_ANALYZED:'미분석',FAILED:'분석 재시도 필요'};
 type Entry={documentId:number;title:string;sourceType:keyof typeof sourceLabel;analysis:{result_json:string;input_type:string}};
 const snapshot=useQuery({queryKey:['brief',briefId],enabled:Number.isSafeInteger(briefId)&&briefId>0,queryFn:({signal})=>request<{briefId:number;snapshot:Entry[]}>('/ai/briefs/'+briefId,undefined,signal),retry:false});
 const create=useMutation({mutationFn:()=>request<{briefId:number;documents:Entry[]}>('/ai/briefs',ids),onSuccess:result=>setParams({briefId:String(result.briefId)}),retry:false});
 return <section className="page-shell"><h1>자료 요약 모음</h1><p>최신 AI 분석을 완료한 자료를 최대 5개 선택하세요. 출처별 요약을 함께 보되 서로 다른 시점·제품·의견을 하나의 사실로 합치지 않습니다.</p>
 {docs.isPending&&<p role="status">자료를 불러오는 중…</p>}{docs.isError&&<p role="alert">자료 조회 실패 <button onClick={()=>void docs.refetch()}>다시 시도</button></p>}
 <label className="check-filter"><input type="checkbox" checked={includeSynthetic} onChange={e=>{setIncludeSynthetic(e.target.checked);setIds([]);}}/>테스트 자료 포함</label>
 <fieldset className="brief-selection"><legend>최근 수집 자료 중 선택 ({ids.length}/5)</legend>{docs.data?.items.map(d=><div className="brief-selection-row" key={d.documentId}><label><input type="checkbox" disabled={status.data?.[d.documentId]!=='READY'||(!ids.includes(d.documentId)&&ids.length>=5)} checked={ids.includes(d.documentId)} onChange={e=>setIds(e.target.checked?[...ids,d.documentId]:ids.filter(x=>x!==d.documentId))}/>{d.title}</label><span className="tag">{labels[status.data?.[d.documentId]??'']??'분석 상태 확인 중'}</span> <Link to={`/documents/${d.documentId}?returnTo=%2Fbrief`}>{status.data?.[d.documentId]==='READY'?'분석·출처 확인 →':'상세에서 분석하기 →'}</Link></div>)}</fieldset>
 {status.isError&&<p role="alert">분석 상태를 불러오지 못했습니다. <button onClick={()=>void status.refetch()}>상태 다시 확인</button></p>}
 {!docs.isPending&&!docs.data?.items.length&&<p>표시할 자료가 없습니다. <Link to="/documents">수집 자료 둘러보기 →</Link></p>}
 {docs.data&&visibleIds.length>0&&status.data&&!Object.values(status.data).includes('READY')&&<p className="notice">아직 분석을 완료한 자료가 없습니다. 위의 ‘상세에서 분석하기’를 누른 뒤 AI 요약을 먼저 완료하세요.</p>}
 <button disabled={!ready||create.isPending} onClick={()=>create.mutate()}>선택한 자료 요약 모으기</button>{create.isError&&<p role="alert">{create.error.message}</p>}
 {snapshot.isError&&<p role="alert">{snapshot.error.message} <button onClick={()=>void snapshot.refetch()}>모음 다시 불러오기</button></p>}
 {snapshot.data&&<section aria-label="자료 요약 모음 결과"><h2>저장된 요약 모음 #{snapshot.data.briefId}</h2><p>생성 시점의 분석·근거 스냅샷입니다.</p>{snapshot.data.snapshot.map(d=>{const r=JSON.parse(d.analysis.result_json) as {summary:string;claims:{text:string;quote:string}[]};return <article className="content-panel" key={d.documentId}><h3>{sourceLabel[d.sourceType]} · {d.title}</h3><p>{d.analysis.input_type==='SNIPPET'?'검색 요약 기반':'본문 기반'}</p><p>{r.summary}</p>{r.claims.map((c,i)=><p key={i}>{c.text}<br/><q>{c.quote}</q> <Link to={`/documents/${d.documentId}?returnTo=${encodeURIComponent('/brief?briefId='+briefId)}`}>출처·근거 확인 →</Link></p>)}</article>;})}</section>}
 </section>;
}
