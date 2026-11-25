import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, useIsMutating } from '@tanstack/react-query';
import { request, ApiError } from '../../api/client';
import { latestValidJob, meaningfulLimitations, parseAiResult, useAiHealth } from '../../api/queries';
import type { AiJobs } from '../../api/queries';
import { Notice, Skeleton } from '../../components/ui';
import { formatKstDateTime } from '../../lib/format';
import { ManualBodyForm } from './BodyFetchPanel';
import { fetchFailureText, useBodyAcquire } from './bodyAcquire';
import { ExtractionReasonText } from './ExtractionReasonText';

const labels: Record<string,string> = { QUEUED:'분석 대기 중', RUNNING:'로컬 AI 분석 중', SUCCEEDED:'분석 완료', FAILED:'분석 실패', CANCELLED:'취소됨' };
const reasons:Record<string,string>={INSUFFICIENT_DETAIL:'본문에 비해 요약 내용이 부족해 게시하지 않았습니다. 다시 요청하세요.',AI_NOT_RUNNING:'Ollama가 실행되지 않았거나 연결할 수 없습니다. Ollama를 실행한 뒤 연결 상태를 다시 확인하세요.',AI_UNAVAILABLE:'로컬 AI에 연결하지 못했습니다. Ollama 실행 상태를 확인하세요.',MODEL_MISSING:'설정된 모델이 설치되어 있지 않습니다. 설치된 모델과 서버 설정을 확인하세요.',AI_TIMEOUT:'모델 응답 대기 시간을 초과했습니다. 잠시 후 다시 요청하세요.',AI_SERVICE_ERROR:'로컬 모델이 요청을 처리하지 못했습니다. 모델 상태와 메모리를 확인하세요.',AI_INVALID_JSON:'모델의 응답 형식이 올바르지 않아 요약을 표시하지 않았습니다.',AI_INVALID_RESPONSE:'로컬 AI 서버의 응답을 확인할 수 없습니다.',INVALID_SCHEMA:'모델이 요약 구조를 지키지 않아 결과를 표시하지 않았습니다.',INVALID_EVIDENCE:'입력에 없는 근거를 반환하여 결과를 표시하지 않았습니다.',NO_VALID_EVIDENCE:'확인할 수 있는 근거가 없어 결과를 표시하지 않았습니다.',INCOMPLETE_OUTPUT:'모델 응답이 끝까지 생성되지 않았습니다. 다시 시도할 수 있습니다.',AI_DISABLED:'서버에서 AI 분석을 비활성화한 상태입니다.',INTERRUPTED:'서버가 재시작되어 분석이 중단됐습니다. 다시 요청하세요.'};
const boxTitles = ['핵심 주장', '직접 근거', '한계', '추가 확인 필요'];

/** 'AI 구조화 요약' 패널 + 'AI 추론 경계' 안내. 요청·취소·재시도·오류 사유·stale·연결 확인은 기존 규칙 그대로. */
export function AiPanel({id,bodyAvailable=false}:{id:number;bodyAvailable?:boolean}) {
 const cache=useQueryClient();const key=['ai',id];
 const fetchingBody=useIsMutating({mutationKey:['body-fetch',id]})>0;
 const health=useAiHealth();
 const body=useBodyAcquire(id,!bodyAvailable);const [pasteOpen,setPasteOpen]=useState(false);
 const jobs=useQuery({queryKey:key,queryFn:({signal})=>request<AiJobs>(`/ai/documents/${id}`,undefined,signal),retry:false,refetchInterval:q=>q.state.data?.jobs.some(j=>['QUEUED','RUNNING'].includes(j.status))?1500:false});
 const action=useMutation({mutationFn:(cancel?:number)=>request<{jobId?:number;reused?:boolean;cancelled?:boolean}>(cancel?`/ai/jobs/${cancel}/cancel`:`/ai/documents/${id}`,{}),onSuccess:()=>cache.invalidateQueries({queryKey:key}),onSettled:()=>{void cache.invalidateQueries({queryKey:['ai-health']});void cache.invalidateQueries({queryKey:['ai','readiness']});},retry:false});
 // 본문 확보 → 분석을 한 번에: 본문을 얻으면 곧바로 본문 기반 요약을 요청하고, 실패하면 붙여넣기 양식을 연다.
 const acquireThenAnalyze=()=>body.fetchBody.mutate(undefined,{onSuccess:r=>{if(['SUCCESS','EXISTS'].includes(r.status))action.mutate(undefined);else setPasteOpen(true);},onError:()=>setPasteOpen(true)});
 const canAcquire=!bodyAvailable&&Boolean(body.status.data?.canFetch);
 const canPaste=!bodyAvailable&&body.status.data?.canPaste!==false&&Boolean(body.status.data);
 const list=jobs.data?.jobs??[];
 const current=list[0],valid=latestValidJob(list);const active=list.find(j=>['QUEUED','RUNNING'].includes(j.status));const busy=Boolean(active);
 const result=parseAiResult(valid?.result_json);
 const shown=valid&&result?{job:valid,result}:undefined;
 const limitations=shown?meaningfulLimitations(shown.result.limitations):[];
 const available=Boolean(health.data?.available);
 const healthText=health.isPending?'로컬 AI 연결 확인 중…':available?`로컬 모델 연결됨 · ${health.data?.model}`:reasons[health.data?.code??'AI_UNAVAILABLE']??'로컬 AI 연결을 확인할 수 없습니다.';
 // stale=false면 서버가 같은 입력·모델의 기존 결과를 재사용하므로(POST 응답 reused) 버튼에서 미리 알린다.
 const upToDate=Boolean(shown&&!shown.job.stale);
 const reused=action.isSuccess&&action.variables===undefined&&action.data?.reused===true&&!busy;
 const buttonText=fetchingBody?'본문 가져오는 중…':busy?'분석 진행 중…':upToDate?'최신 요약 있음 · 다시 요청하면 기존 결과 사용':valid?.stale?'현재 자료로 다시 요약':current?.status==='FAILED'?'AI 요약 다시 시도':bodyAvailable?'본문 기반으로 요약하기':canAcquire?'본문 확보 후 요약하기':'검색 발췌문으로 간단 정리';
 const preserved=shown&&current&&current.id!==shown.job.id&&['FAILED','CANCELLED'].includes(current.status);
 const badge=shown?`${shown.job.model} · AI 생성`:busy?'분석 중':jobs.isPending?'확인 중':'미분석';
 return <div className="det-ai-wrap">
 <section id={`ai-summary-${id}`} className="det-ai" aria-label="AI 요약">
  <div className="det-ai-head"><h2>AI 구조화 요약</h2><span className={`det-ai-badge${shown?'':' det-ai-badge-muted'}`}>{badge}</span></div>
  <p className="det-ai-intro">본문을 확보하면 여러 구간의 핵심 내용과 근거를 정리합니다. 긴 본문은 일부 구간을 선별하므로 원문 전체를 대체하지 않습니다. 본문이 없으면 이 자료가 검색에 잡힌 발췌문들을 모아 간단히 정리합니다. 내 메모는 AI에 보내지 않습니다.</p>
  <div className="ai-health det-ai-health" role="status"><span className={`det-dot ${available?'det-dot-ok':health.isPending?'det-dot-muted':'det-dot-warn'}`} aria-hidden="true"/><span className="det-ai-health-text">{healthText}</span><button className="button-secondary" disabled={health.isFetching} onClick={()=>{void health.refetch();void jobs.refetch();}}>연결 상태 다시 확인</button></div>
  {!jobs.isPending&&jobs.data&&!jobs.data.inputAvailable&&<p className="source-limit-note">분석할 본문이나 검색 요약이 없습니다. 원문 링크로 확인하세요.</p>}
  {!bodyAvailable&&<div className="det-ai-scope" role="note">
   <p><strong>본문 미확보</strong> · 지금 요약하면 검색 발췌문만 사용해 원문 전체 맥락이 빠집니다.{canAcquire?' ‘본문 확보 후 요약하기’로 본문을 먼저 가져오세요.':canPaste?' 자동 수집이 안 되는 출처라 원문 본문을 붙여 넣으면 본문 기반으로 요약합니다.':''}</p>
   {body.fetchBody.data&&!['SUCCESS','EXISTS'].includes(body.fetchBody.data.status)&&<p className="form-help" role="alert">{fetchFailureText(body.fetchBody.data)} {body.fetchBody.data.reason&&<ExtractionReasonText reason={body.fetchBody.data.reason}/>} 본문을 직접 붙여 넣을 수 있습니다.</p>}
   {body.fetchBody.isError&&<p className="form-help" role="alert">본문을 가져오지 못했습니다. {body.fetchBody.error.message}</p>}
   {canPaste&&(pasteOpen?<ManualBodyForm manual={body.manual} onDone={()=>{setPasteOpen(false);action.mutate(undefined);}}/>:<button type="button" className="button-quiet" onClick={()=>setPasteOpen(true)}>본문 직접 붙여넣기</button>)}
  </div>}
  <div className="det-ai-actions">
   <button disabled={!available||!jobs.data?.inputAvailable||busy||action.isPending||fetchingBody} onClick={()=>canAcquire&&!upToDate?acquireThenAnalyze():action.mutate(undefined)}>{buttonText}</button>
   {canAcquire&&!busy&&<button className="button-secondary" disabled={!available||!jobs.data?.inputAvailable||action.isPending||fetchingBody} onClick={()=>action.mutate(undefined)}>발췌문으로만 간단 정리</button>}
   {active&&<button className="button-secondary" disabled={action.isPending} onClick={()=>action.mutate(active.id)}>분석 취소</button>}
   <p className="det-ai-status" role="status">{reused?'같은 입력과 모델로 만든 기존 결과를 다시 사용했습니다(새로 생성하지 않음).':<>{current&&labels[current.status]}{current?.error_code&&` · ${reasons[current.error_code]??'분석을 완료하지 못했습니다. 다시 시도해 주세요.'}`}</>}</p>
  </div>
  {!available&&!health.isPending&&<p className="form-help">로컬 AI에 연결되면 요청 버튼이 활성화됩니다. 원문·검색 요약·메모는 연결과 관계없이 이용할 수 있습니다.</p>}
  {current?.error_code&&<details className="det-ai-details"><summary>오류 정보</summary><p>{current.error_code}</p></details>}
  {preserved&&<p className="form-help">기존에 성공한 요약은 보존됩니다.</p>}
  {(jobs.isError||action.isError)&&<p className="det-inline-alert" role="alert">{action.error instanceof ApiError?(reasons[action.error.code]??action.error.message):'분석 정보를 불러오지 못했습니다.'} 원문과 메모는 계속 이용할 수 있습니다. <button className="button-secondary" onClick={()=>{void health.refetch();void jobs.refetch();}}>다시 확인</button></p>}
  {jobs.isPending?<><p className="visually-hidden" role="status">AI 분석 기록 조회 중</p><Skeleton lines={4}/></>:busy&&!shown?<div className="det-ai-progress">
   <p className="det-ai-wait">이 환경에서는 최대 5분 동안 응답을 기다립니다. 모델을 처음 불러올 때 시간이 더 걸릴 수 있습니다. 취소하면 결과 저장을 중단하며 모델 계산은 잠시 더 이어질 수 있습니다.</p>
   <div className="det-ai-grid" aria-hidden="true">{boxTitles.map(t=><div key={t} className="det-ai-box det-ai-box-pending"><h3>{t}</h3><Skeleton lines={4}/></div>)}</div>
  </div>:shown?<>
   {busy&&<p className="det-ai-wait">이 환경에서는 최대 5분 동안 응답을 기다립니다. 모델을 처음 불러올 때 시간이 더 걸릴 수 있습니다. 취소하면 결과 저장을 중단하며 모델 계산은 잠시 더 이어질 수 있습니다.</p>}
   {shown.job.input_type==='SNIPPET'&&<p className="det-ai-snippet-badge"><span>검색 발췌 기반 간단 정리</span>{bodyAvailable?'본문을 확보했습니다. ‘현재 자료로 다시 요약’을 누르면 본문 기반으로 바뀝니다.':'원문 전체 맥락은 반영되지 않았습니다. 위에서 본문을 확보하면 본문 기반으로 다시 요약할 수 있습니다.'}</p>}
   <div className="det-ai-grid">
    <section className="det-ai-box" aria-label="핵심 주장"><h3>핵심 주장</h3><p>{shown.result.summary}</p>
     {shown.result.claims.length>0&&<ol className="det-claims">{shown.result.claims.map((c,i)=><li key={i}>{c.text} <a className="det-evidence-ref" href={`#ai-evidence-${id}-${i}`}>[근거 {i+1}]</a></li>)}</ol>}
    </section>
    <section className="det-ai-box" aria-label="직접 근거"><h3>직접 근거</h3>
     {shown.result.claims.length?shown.result.claims.map((c,i)=><figure key={i} className="det-quote"><figcaption>[근거 {i+1}]</figcaption><blockquote id={`ai-evidence-${id}-${i}`} tabIndex={-1}>{c.quote}</blockquote></figure>):<p className="det-ai-muted">모델이 직접 인용한 근거가 없습니다.</p>}
    </section>
    <section className="det-ai-box" aria-label="한계"><h3>한계</h3>
     {limitations.length?<ul>{limitations.map((t,i)=><li key={i}>{t}</li>)}</ul>:<p className="det-ai-muted">내용상 특별한 한계가 제시되지 않았습니다.</p>}
    </section>
    <section className="det-ai-box" aria-label="추가 확인 필요"><h3>추가 확인 필요</h3>
     {shown.job.stale&&<p className="det-stale" role="alert">현재 자료 또는 요약 기준과 다른 이전 분석입니다. 본문을 새로 확보했다면 다시 요약해 주세요.</p>}
     {shown.job.input_type!=='SNIPPET'&&<p><strong>공개 본문 기반 정리</strong> · 선별한 본문 구간만 사용했습니다.</p>}
     <p>인용 일치는 자동 확인했지만, 인용이 주장을 실제로 지지하는지는 원문 문맥에서 직접 확인하세요.</p>
     <p className="det-ai-meta">{shown.job.model} · {formatKstDateTime(shown.job.created_at)} · 구조 v1 · 현재 프롬프트 {jobs.data?.promptVersion}</p>
    </section>
   </div>
  </>:<div className="det-ai-empty">
   <p className="det-ai-empty-title">{busy?'로컬 AI가 분석하고 있습니다':current?.status==='FAILED'?'표시할 분석 결과가 없습니다':'아직 AI 분석 전입니다'}</p>
   <p>{busy?'결과가 준비되면 이 자리에 핵심 주장·직접 근거·한계·추가 확인 사항이 나뉘어 표시됩니다.':available?'위 버튼으로 구조화 요약을 요청하면 핵심 주장·직접 근거·한계·추가 확인 사항으로 나눠 표시합니다.':'Ollama 연결을 확인한 뒤 요청할 수 있습니다. 그동안 원문 정보와 검색 요약은 그대로 읽을 수 있습니다.'}</p>
   <ul className="det-ai-empty-grid" aria-label="분석 후 표시될 항목">{boxTitles.map(t=><li key={t}>{t}</li>)}</ul>
  </div>}
 </section>
 {busy&&!shown&&<div aria-hidden="true"><Notice title="AI 추론 경계"><p>분석이 끝나면 원문이 직접 말하지 않은 AI의 해석을 여기에 따로 표시합니다.</p><Skeleton lines={1}/></Notice></div>}
 {shown&&<Notice title="AI 추론 경계">{shown.result.inferences.length?<><p>아래 내용은 원문이 직접 말하지 않은 AI의 해석입니다. 원문 주장과 구분해 읽으세요.</p><ul>{shown.result.inferences.map((t,i)=><li key={i}>{t}</li>)}</ul></>:<p>별도 추론이 없습니다.</p>}</Notice>}
 </div>;
}
