# ResearchBoard

관심 주제와 검색어를 입력하면 Java 백엔드가 웹 자료를 수집·저장합니다. 그 다음 로컬 LLM(Ollama)이 자료별로 근거가 연결된 요약을 만듭니다. 이렇게 모은 자료를 보관·읽음·메모·통계로 다시 찾아보는 개인용 로컬 웹앱입니다.

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

- 기본 검색 모드는 합성 테스트(`fake`)입니다. 외부 검색 호출 없이 합성 결과만 만듭니다.
- 합성 자료는 목록에서 기본으로 숨겨집니다. 화면의 "테스트 자료 포함"으로 볼 수 있습니다.
- Ollama가 꺼져 있어도 검색·원문·보관·메모는 그대로 쓸 수 있습니다.

## 실행 방법 (Windows)

프로젝트 폴더에서 **[Start-ResearchBoard.bat](Start-ResearchBoard.bat)** 를 더블클릭하세요. Ollama(Windows 또는 기본 WSL 배포판), 백엔드, 프론트엔드를 준비하고 검색 화면을 기본 브라우저에서 엽니다. 이미 실행 중인 서비스는 재사용합니다. 사용을 마치면 실행 창에서 **Enter**를 눌러 이 창에서 시작한 서비스를 종료하세요.

첫 실행에는 아래 준비물이 필요합니다. 프론트엔드는 설치된 Vite를 사용합니다. Vite가 없고 빌드 결과와 Python이 있으면 바로 실행하며, 그 외에는 `npm ci`로 패키지를 설치합니다. 기본 DB는 `runtime/research.db`이고, 다른 DB나 AI 모델은 `RESEARCH_DB_PATH`, `RESEARCH_AI_MODEL` 환경변수로 지정할 수 있습니다. 시작 오류의 상세 로그는 `runtime` 폴더에 저장됩니다.

### 준비물
- JDK 21 이상. 예: `winget install EclipseAdoptium.Temurin.21.JDK`
- Node.js 22.12 이상 또는 Python 3. Python은 npm 없이 빌드 결과를 띄울 때 씁니다.
- Ollama와 모델 1개. 개발 PC(VRAM 12GB)에서는 `qwen3-vl:8b-instruct`로 검증했습니다.

### 수동 실행 1. 백엔드 (포트 18089)
```powershell
# Java가 PATH에 없을 때만 실행
$jdk = (Get-ChildItem 'C:\Program Files\Eclipse Adoptium','C:\Program Files\Java' -Directory -Filter 'jdk-2*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1).FullName
$env:JAVA_HOME = $jdk; $env:Path = "$jdk\bin;$env:Path"

cd backend
$env:RESEARCH_PROVIDER = 'fake'
$env:EXTERNAL_SEARCH_APPROVED = 'false'
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
