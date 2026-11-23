# 설치·실행·종료 안내 (9주차, 2026-11-09)

이 앱은 이 PC에서 실행하는 개인용 웹앱이다. Java 서버와 웹 서버를 각각 실행한다. 읽기·보관·메모·통계는 AI 없이 동작한다. 새 실제 검색에는 인터넷·서버 키·별도 승인이 필요하다. 기본 fake 모드는 외부 요청 없이 합성 결과만 만든다.

## 새 폴더에서 준비

JDK 21 이상 호환 버전과 Node/npm을 준비한다. 검증 환경: Temurin25.0.1, Node22.17.0. 프로젝트 소스의 backend/frontend/docs를 새 작업 폴더에 복사한다. 기존 node_modules, target, data, .env, 개인 DB와 키는 복사하지 않는다. Maven/npm 캐시를 사용할 수 있으며 첫 의존성 설치에는 인터넷이 필요하다.

backend 터미널:

```powershell
cd 'C:\작업폴더\backend'
.\mvnw.cmd test package
$env:RESEARCH_PROVIDER='fake'
$env:EXTERNAL_SEARCH_APPROVED='false'
$env:SOURCE_POLICY_PATH=''
$env:RESEARCH_DB_PATH='C:\작업폴더\runtime\research.db'
java -jar target/research-board-backend-0.0.1-SNAPSHOT.jar --server.port=18089
```

다른 터미널에서 frontend 실행:

```powershell
cd 'C:\작업폴더\frontend'
npm ci
npm run build
npm run lint
$env:RESEARCH_API_TARGET='http://127.0.0.1:18089'
npm run dev -- --host 127.0.0.1 --port 5179 --strictPort
```

[상태 확인](http://127.0.0.1:18089/api/health)과 [웹 열기](http://127.0.0.1:5179/search). 주소가 사용 중이면 다른 포트를 선택하고 프록시 주소도 맞춘다. 실행 중인 다른 프로젝트를 종료하지 않는다. DB는 지정한 절대 경로에 생성되고 같은 경로로 재실행하면 기존 기록이 열린다. 프론트의 RESEARCH_API_TARGET은 Vite 시작 전에 설정한다.

## 첫 사용과 실패 복구

1. ‘새 관심 주제 만들기’를 펼쳐 주제명과 기본 검색어를 저장한다.
2. ‘자료 검색’을 누른다. 합성 모드라는 안내를 확인한다. 처리 중에는 검색 버튼이 잠긴다.
3. 결과 제목/상세 링크를 열어 검색 요약과 출처 근거를 확인한다. 본문을 확보하지 못한 경우 원문 링크를 이용한다.
4. 보관하기, 메모 입력 후 ‘메모 저장’, 읽음 상태를 선택한다. ‘저장됨’ 또는 실패 안내를 확인한다.
5. 읽기 보관함에서 다시 찾고 통계에서 현재 상태를 확인한다. 통계의 기간은 처음 저장한 날짜·한국 시간 기준이다.
6. `테스트:실패` 검색은 합성 실패다. 실패 화면의 보관함 링크를 눌러 이전 기록을 확인할 수 있다.

저장이 지연되면 완료 또는 실패 안내가 나올 때까지 기다린다. DB 잠금은 입력을 유지하며 잠시 후 다시 저장할 수 있다. 다른 탭의 메모와 충돌하면 두 내용을 비교한 뒤 선택한다. 네트워크 요청이 실패하면 ‘다시 시도’를 사용한다. 외부 인터넷이 끊겨도 로컬 서버가 실행 중이면 저장된 자료를 볼 수 있지만 새 실제 검색은 수행할 수 없다. 로컬 서버 자체가 종료되면 웹은 데이터를 불러올 수 없다.

## 종료·재시작

각 실행 터미널에서 Ctrl+C로 종료하고 프로세스가 끝날 때까지 기다린다. 같은 RESEARCH_DB_PATH와 포트로 다시 실행한다. 새로고침 후 주제·보관함·메모·통계가 유지되는지 확인한다. DB가 사용 중이라는 이유로 파일을 삭제하지 않는다.

실행 중 SQLite는 WAL을 사용하므로 .db 하나만 복사하지 않는다. 백업은 SQLite backup API 또는 정상 종료 뒤 검증된 전체 복사 방식으로 만든다. 원본 덮어쓰기 전에 별도 경로에서 무결성과 기록을 확인한다. 자세한 백업·복구 종합 검증은 12주차 범위다.

## 현재 사용자 미리보기

기존 주소는 [5178](http://127.0.0.1:5178/search)→18088이다. DB는 `C:/Users/USER/Documents/ChatGPT/동미대 리서치 보드/output/week7-preview.db`를 이어 사용한다. 이 DB의 사용자 기록은 backend/data 원본 DB에 자동 반영되지 않는다. 원본8080 서버와 혼동하지 않는다. 실제 Serper 추가 호출과 예산 초기화는 이번 작업에 포함되지 않는다.
