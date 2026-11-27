# ResearchBoard

관심 주제와 검색어를 입력하면 Java 백엔드가 웹 자료를 수집·저장합니다. 그 다음 로컬 LLM(Ollama)이 자료별로 근거가 연결된 요약을 만듭니다. 이렇게 모은 자료를 보관·읽음·메모·통계로 다시 찾아보는 개인용 로컬 웹앱입니다.

## Windows에서 바로 실행하기

프로젝트 폴더에서 **`Start-ResearchBoard.bat`를 더블클릭**하세요. 실행기가 Ollama, 백엔드, 프론트엔드를 준비하고 기본 브라우저에서 [검색 화면](http://127.0.0.1:5179/search)을 엽니다. 이미 켜진 서비스는 재사용합니다.

- **처음 실행할 때** GitHub에서 저장소 전체를 내려받으세요. ZIP으로 받았다면 압축을 푼 뒤 배치 파일을 실행하세요. 실행기가 JDK 21 이상, Node.js 22.12 이상, Ollama와 AI 모델을 확인하고, 없으면 winget으로 자동 설치합니다(이미 설치되어 있으면 확인만 합니다). 설치 중 관리자 권한(UAC) 확인 창이 뜰 수 있습니다. 첫 실행에는 프로그램·모델(수 GB)·프로젝트 의존성을 내려받느라 시간이 걸릴 수 있습니다.
- **AI 요약을 쓸 때** 실행기가 Windows 또는 기본 WSL 배포판의 Ollama를 찾고, 없으면 Windows용 Ollama를 설치한 뒤 기본 모델 `qwen3-vl:8b-instruct`를 내려받습니다. 다른 모델을 쓰려면 `RESEARCH_AI_MODEL`에 설치한 모델 이름을 지정하세요. Ollama를 사용할 수 없어도 검색·보관·메모는 쓸 수 있습니다.
- **사용을 마칠 때** 실행 창에서 **Enter**를 누르세요. 이 창이 시작한 서비스가 종료됩니다.

## 구성

- 프론트엔드: React + Vite + TypeScript (`frontend/`)
- 백엔드: Spring Boot + SQLite (`backend/`)
- AI: 로컬 Ollama. 외부 유료 AI로 데이터를 보내지 않습니다.

## 주요 화면

| 메뉴 | 경로 | 기능 |
|---|---|---|
| 검색·수집 | `/search` | 관심 주제 선택·생성, 새 검색. 검색 세션의 처리 단계, 발견·신규·기존·중복 건수, 수집 기록, 결과 목록 |
| 리서치 피드 | `/feed` | 출처 유형별 탭(공식/사용자/기타/읽지 않음). 나중에 읽기·즐겨찾기 토글, 자료별 AI 분석 요약, AI 주제 브리프(자료 요약 모음) |
| 주제 분석 | `/stats` | 기간·주제별 검색 횟수, 원시 수집, 신규, 중복, 읽음 비율. 일별 자료 흐름 차트, 자료 유형 비율, 출처·AI 상태, 검색 이력 |
| 읽기 보관함 | `/library` | 주제별 보관 카드, 읽지 않음·나중에 읽기·즐겨찾기 필터, 정렬, 보관 해제 |
| 자료 상세 | `/documents/:id` | 검색 요약·공개 본문, AI 구조화 요약(핵심 주장·직접 근거·한계·추론 경계), 읽기·보관·주제 연결, 메모 |
| (보조) | `/documents`, `/brief` | 전체 수집 자료 목록, 분석 완료 자료를 최대 5개까지 묶는 자료 요약 모음 |

- 검색은 Serper 실제 검색만 사용합니다. 예전의 합성 테스트(`fake`) 모드와 테스트 자료는 폐기되었으며, 기존 DB에 남아 있던 합성 자료도 첫 실행 시 자동으로 삭제됩니다.
- `SERPER_API_KEY`가 없으면 실행기가 처음 한 번 키를 물어보고 이 PC의 사용자 환경 변수에 저장합니다(저장소에는 넣지 않습니다). 키가 있으면 실행기가 외부 검색 승인과 검토된 출처 정책을 함께 켭니다.
- Serper 호출 상한은 **하루(한국 시간) 200회**가 기본이며 자정에 다시 채워집니다(`MAX_PROVIDER_ATTEMPTS`). 검색 1회는 결과 페이지를 최대 5개(약 50건)까지 이어 받고(`SERPER_PAGES`, 1~5), 페이지마다 1회씩 차감합니다.
- 원문 본문은 검색할 때 자동으로 확보합니다. 순서: 검토된 출처 직접 요청 → robots.txt가 허용하는 공개 페이지 직접 요청(무료, `PUBLIC_FETCH_ENABLED`) → 상위 결과 최대 10건 Serper 본문 추출(`SERPER_SCRAPE_PER_SEARCH`, 1건당 호출 1회). 검색 발췌문도 본문도 없는 결과는 저장하지 않습니다.
- 본문이 아직 없는 자료는 리서치 피드의 **AI 분석하기** 버튼이나 자료 상세에서 본문 확보를 다시 시도한 뒤 바로 분석합니다. 자동 확보가 안 되면 원문 본문을 붙여 넣을 수 있고, 그래도 없으면 같은 자료의 발췌문을 모두 합쳐 간단 정리합니다.
- 자료 요약 모음은 고른 자료끼리 **공통점 / 차이·고유 내용 / 원문 확인 필요**로 나눠 다시 정리하며, 질문을 적으면 근거가 있는 답만 보여 줍니다. 모든 문장은 근거 자료 번호와 원래 주장·인용으로 되짚을 수 있습니다.

## 실행 설정과 로그

- 기본 DB는 `runtime/research.db`입니다. 다른 DB를 열려면 실행 전에 `RESEARCH_DB_PATH`에 해당 파일의 절대 경로를 지정하세요.
- 프론트엔드는 Vite로 띄우며, 패키지가 없으면 `npm ci`로 설치합니다. Node.js를 준비하지 못했을 때만 `frontend/dist`와 Python 3로 빌드 결과를 띄웁니다.
- 서비스 시작에 실패하면 실행 창에 표시된 로그 파일을 확인하세요. 실행기가 시작한 서비스의 로그는 `runtime/Backend.log`, `runtime/Frontend.log`, `runtime/Ollama.log`에 기록됩니다.

<details>
<summary>개발용 수동 실행 명령 보기</summary>

JDK 21은 Windows에서 `winget install EclipseAdoptium.Temurin.21.JDK`로 설치할 수 있습니다.

### 수동 실행 1. 백엔드 (포트 18089)
```powershell
# Java가 PATH에 없을 때만 실행
$jdk = (Get-ChildItem 'C:\Program Files\Eclipse Adoptium','C:\Program Files\Java' -Directory -Filter 'jdk-2*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1).FullName
$env:JAVA_HOME = $jdk; $env:Path = "$jdk\bin;$env:Path"

cd backend
$env:SERPER_API_KEY = '<Serper 키>'   # 실제 검색에 필요
$env:EXTERNAL_SEARCH_APPROVED = 'true'
$env:RESEARCH_DB_PATH = "$PWD\..\runtime\research.db"
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.arguments=--server.port=18089 --research.ai-model=qwen3-vl:8b-instruct --research.ai-timeout-seconds=300"
```
`Tomcat started on port 18089`가 보이면 준비된 것입니다. 상태 확인 주소: http://127.0.0.1:18089/api/health

### 수동 실행 2. 프론트엔드 (포트 5179)
**방법 A: npm 개발 서버**
```powershell
cd frontend
npm.cmd ci
$env:RESEARCH_API_TARGET = 'http://127.0.0.1:18089'
npm.cmd run dev -- --host 127.0.0.1 --port 5179 --strictPort
```
PowerShell에서는 `npm` 대신 `npm.cmd`를 쓰세요. 실행 정책 때문에 `npm.ps1`이 막힐 수 있습니다.

**방법 B: npm 없이 빌드 결과 실행** (`frontend/dist`가 있을 때)
```powershell
python runtime\serve_frontend.py 5179 http://127.0.0.1:18089
```

브라우저에서 http://127.0.0.1:5179/search 를 엽니다.

### 수동 실행 3. 로컬 AI (Ollama)
Ollama가 실행 중이어야 AI 요약을 쓸 수 있습니다. WSL에 설치했다면 다음으로 켭니다.
```powershell
wsl -e ollama serve
```
`address already in use` 오류가 나오면 이미 실행 중이라는 뜻입니다. 백엔드를 재시작하지 않아도 연결 상태가 자동으로 다시 확인됩니다.

</details>

### 실제 웹 검색 (선택)
실제 검색은 Serper API 키, 승인 설정, 누적 호출 상한이 필요합니다. 자세한 내용은 [backend/README.md](backend/README.md)와 [실행 안내](docs/week9-runbook.md)를 참고하세요.

## 빌드·검사
```powershell
cd frontend; npm.cmd run build; npm.cmd run lint
cd ..\backend; .\mvnw.cmd test
```

## 참고 문서
- 화면 참고 이미지: [docs/img](docs/img)
- 구현 설계서: `docs/2026-09-14_리서치보드_화면컴포넌트_API_구현설계서.docx`
- 10~12주차 구현·검증: [docs/week10-12-verification.md](docs/week10-12-verification.md)
