# 개발 환경 확인

확인일: 2026-09-21

| 도구 | 확인 결과 | 1주차 판단 |
| --- | --- | --- |
| Java | Temurin OpenJDK 25.0.1 LTS | 프로젝트 소스 수준은 Java 21로 고정. Spring Boot 4.1.1 공식 범위 17~26 안에 포함 |
| Node.js | v22.17.0 | Vite 8 요구 조건인 22.12 이상 충족 |
| npm | 실행 실패, 사용자 AppData의 `npm-cli.js` 누락 | 전역 npm 복구 필요. 기존 `node_modules`의 로컬 실행 파일로 빌드 검증 가능 |
| Git | 2.50.0.windows.1 | 사용 가능. 현재 상위 프로젝트에는 `.git`이 없음 |
| Maven | 명령 없음 | 프로젝트는 Maven 구조로 작성. 빌드 검증에는 Maven 3.6.3 이상 또는 Wrapper 추가 필요 |
| Ollama | 명령 없음 | 10주차 전 설치·모델 용량·라이선스 확인 필요. 1주차 화면 실행에는 불필요 |

## 선택 버전

- Spring Boot 4.1.1
- Java source level 21
- SQLite JDBC 3.53.4.0
- React 19.2.8
- React Router 7.18.4
- TanStack Query 5.103.1
- Vite 8.3.0
- TypeScript 6.0.2

## 공식 호환성 근거

- Spring Boot 4.1.1은 Java 17 이상, Java 26 이하를 지원하고 Maven 3.6.3 이상을 요구한다: https://docs.spring.io/spring-boot/system-requirements.html
- Vite는 Node.js 20.19 이상 또는 22.12 이상을 요구한다: https://vite.dev/guide/
- SQLite JDBC 최신 검토 버전과 사용 예시: https://github.com/xerial/sqlite-jdbc

## 보완 작업

1. Maven Wrapper를 추가하거나 Maven 3.6.3 이상을 설치해 백엔드 테스트를 실행한다.
2. 전역 npm 설치 경로를 복구한다. 복구 전에는 프로젝트 로컬 `tsc`, `vite`, `eslint` 실행 파일을 사용한다.
3. Windows를 우선 개발 환경으로 유지하고 WSL 도구와 localhost를 혼용하지 않는다.
4. Ollama는 AI 분석 주차 전까지 설치하지 않아도 된다.
