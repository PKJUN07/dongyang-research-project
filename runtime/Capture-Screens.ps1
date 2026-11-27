param(
    [ValidateRange(1024,65535)][int]$BackendPort = 18089,
    [ValidateRange(1024,65535)][int]$FrontendPort = 5179
)
# 실행 중인 ResearchBoard의 실제 화면을 Microsoft Edge(헤드리스)로 캡처한다.
# 먼저 Start-ResearchBoard.bat으로 앱을 켜 두고, 실제 검색·AI 분석·요약 모음을 한 번 이상 해 둔 뒤 실행한다.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$api = "http://127.0.0.1:$BackendPort/api"
$web = "http://127.0.0.1:$FrontendPort"
$out = Join-Path $root 'docs\최종발표\화면캡처-실제'

$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") |
    Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $edge) { throw 'Microsoft Edge를 찾지 못했습니다.' }
try { Invoke-RestMethod "$api/health" -TimeoutSec 3 | Out-Null } catch { throw "백엔드($api)에 연결할 수 없습니다. 먼저 Start-ResearchBoard.bat을 실행하세요." }
try { Invoke-WebRequest "$web/search" -UseBasicParsing -TimeoutSec 3 | Out-Null } catch { throw "화면($web)에 연결할 수 없습니다. 먼저 Start-ResearchBoard.bat을 실행하세요." }
New-Item -ItemType Directory -Force -Path $out | Out-Null

# 캡처할 대상: 최근 검색, AI 분석을 마친(가능하면 본문이 있는) 자료, 최근 요약 모음
$runId = $null
try { $history = Invoke-RestMethod "$api/stats/history?page=0"; if ($history.items.Count -gt 0) { $runId = $history.items[0].id } } catch {}
$docs = (Invoke-RestMethod "$api/documents?size=50&sort=FETCHED_DESC").items
$docId = $null
if ($docs.Count -gt 0) {
    $ids = ($docs | ForEach-Object { $_.documentId }) -join ','
    $ready = Invoke-RestMethod "$api/ai/readiness?ids=$ids"
    $analyzed = $docs | Where-Object { $ready.($_.documentId.ToString()) -eq 'READY' }
    $pick = ($analyzed | Where-Object { $_.contentText } | Select-Object -First 1)
    if (-not $pick) { $pick = $analyzed | Select-Object -First 1 }
    if (-not $pick) { $pick = $docs | Select-Object -First 1 }
    $docId = $pick.documentId
}
$briefId = $null
try { $briefId = (Invoke-RestMethod "$api/ai/briefs/latest").briefId } catch {}

$pages = [ordered]@{
    '01-search'  = if ($runId) { "/search?runId=$runId" } else { '/search' }
    '02-feed'    = '/feed'
    '03-detail'  = if ($docId) { "/documents/$docId" } else { $null }
    '04-brief'   = if ($briefId) { "/brief?briefId=$briefId" } else { $null }
    '05-stats'   = '/stats'
    '06-library' = '/library'
}
$captureProfile = Join-Path $env:TEMP 'researchboard-capture'
foreach ($name in $pages.Keys) {
    $path = $pages[$name]
    if (-not $path) { Write-Warning "$name 건너뜀: 캡처할 자료가 없습니다."; continue }
    foreach ($size in @(@{ suffix = ''; h = 1000 }, @{ suffix = '-long'; h = 2400 })) {
        $file = Join-Path $out ($name + $size.suffix + '.png')
        $edgeArgs = @('--headless=new', '--disable-gpu', '--hide-scrollbars', "--user-data-dir=$captureProfile", '--force-device-scale-factor=2',
            "--window-size=1440,$($size.h)", '--virtual-time-budget=10000', "--screenshot=$file", "$web$path")
        & $edge @edgeArgs 2>$null | Out-Null
        if (Test-Path -LiteralPath $file) { Write-Host "캡처: $file" } else { Write-Warning "$name 캡처 실패" }
    }
}
Write-Host ''
Write-Host "완료. 폴더: $out"
Write-Host '이 폴더의 PNG 파일을 Claude에게 보내거나, 아래 명령으로 GitHub에 올려 주세요.'
Write-Host '  git add docs/최종발표/화면캡처-실제'
Write-Host '  git commit -m "실제 화면 캡처"'
Write-Host '  git push'
