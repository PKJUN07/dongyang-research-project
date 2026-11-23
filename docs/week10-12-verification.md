# 10~12주차 구현 및 검증 기록

기준일2026-11-09. 기존 9주차 이후 범위를 선행 구현했다. ‘기능 코드 구현’과 ‘최종 납품 게이트 통과’를 구분한다.

## 구현

- 007_ai/008_brief 마이그레이션: 문서별 AI 작업, 입력 스냅샷·해시, 모델, 상태, 결과, 오류, 생성/완료 시각, 요약 모음 스냅샷.
- 로컬 Ollama127.0.0.1:11434, 설치 모델 llama3.2:3b. 모델 다운로드·외부 유료 AI 전송 없음.
- 작업 접수202, 단일 실행, 활성 작업5개 및 실제 큐5개 제한, 자동 재시도0, 동일 입력·모델 성공 결과 재사용, 취소 후 결과 저장 차단, 재시작 시 중단 작업FAILED/INTERRUPTED 처리.
- 입력은 본문 앞8000자 또는 검색 요약 앞2000자. 메모 제외. 제목만으로 분석하지 않음. 모델에 셸/DB/웹 도구 권한 없음.
- 구조화 summary/claims/limitations/inferences. 모델은 근거 구간 번호를 반환하고 서버가 입력 구간을 매핑한다. 존재하지 않는 번호, 빈 주장, 원문에 없는 인용, 형식 오류는 성공 게시하지 않음.
- 화면에 본문/검색요약 기반, 모델, 생성 시각, v1 구조/프롬프트, 오래된 입력 해시 여부, 근거 링크, 한계/추론 표시. 기존 유효 결과 유지. 취소는 결과 게시 중단이며 모델 계산 중단을 보장하지 않음.
- ‘자료 요약 모음’에서 최대5개 문서의 최신 검증 결과를 출처별로 모아 스냅샷 저장. 서로 다른 제품/시점의 내용을 임의로 한 결론으로 합치지 않음. 저장된 모음은 생성 시점 자료이며 원문 변경은 상세에서 확인.

## 확인한 결과

- 기존54건+AiValidationTest4건: 총58건 자동 테스트. 최종 결과는 작업 공간 output/week12-build-final.log.
- 프론트 build/lint 통과. 메모·보관 회귀7그룹, 통계 회귀6그룹 통과(output/week12/regression7 및 regression8).
- 실제 첫 모델 응답2회는 INVALID_EVIDENCE로 거부. 원문 문자열을 자유 생성하는 방식에서 구간 번호 방식으로 보강했다. 거부된 결과를 정상 요약으로 표시하지 않았다.
- SQLite backup API를 이용한 별도 복원에서 모든 테이블 동일 및 integrity_check=ok. output/week12-restore.json. 이 시험은 합성 DB이며 사용자 DB 덮어쓰기 없음.
- 목록 API: Windows/JDK25, localhost, 동시성1, 문서3개, warm-cache30회. 중앙값7.77ms, p95 10.11ms. 대규모 성능이나 AI 생성 지연으로 일반화하지 않는다. output/week12-performance.json.
- 이번 작업 실제 Serper 호출0, 기존 누적 예산 유지.

## 남은 최종 게이트

추가 관측: v2 프롬프트/근거 번호 방식의 실제 모델 job5가 성공했다. 요약문은 비어 있지 않으며 주장3개·원문 구간 연결을 확인했다. 합성 본문1개, 소요68.34초다. 실제 모델 성공·재사용·취소·모음 스냅샷·모바일 UI 자동 검증 통과: output/week12/real-model.json 및 checks.json. 이 한 사례를 전체 품질 평가 완료로 확대하지 않는다.

여러 유형(공식/후기/영문/짧은 검색요약/날짜미상/악성지시)의 사람 품질 평가, AI timeout/메모리부족/중단 복구의 전체 자동 검증, 새 폴더 최종본 설치 재검증 및 최종 발표 자료 갱신이 모두 끝나야 ‘12주차 전체 완료’로 판정한다. 이 문서만으로 완료라고 주장하지 않는다.

참고: [Ollama 공식 구조화 출력](https://ollama.com/blog/structured-outputs). schema 준수는 내용의 사실성이나 주장 지지 여부와 다르다.

## 실행

backend에서 `mvnw.cmd test package` 후 `java -jar target/research-board-backend-v12.jar --server.port=18088`를 실행한다. RESEARCH_DB_PATH는 기존 미리보기 DB 절대 경로를 유지한다. RESEARCH_PROVIDER=fake, EXTERNAL_SEARCH_APPROVED=false로 기존 실제 호출 예산을 보존한다. Ollama가 꺼져도 원문·보관·메모는 이용할 수 있다. 모델 없음은 분석 실패로 표시한다. frontend는 기존 `RESEARCH_API_TARGET=http://127.0.0.1:18088`과5178을 사용한다.
