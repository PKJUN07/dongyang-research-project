param([string]$BaseUrl = 'http://127.0.0.1:8080', [string]$ReceiptPath = '')
$ErrorActionPreference = 'Stop'
$uri = [uri]$BaseUrl
if ($uri.Scheme -ne 'http' -or $uri.Host -notin @('localhost', '127.0.0.1') -or $uri.AbsolutePath -ne '/') {
    throw 'BaseUrl은 로컬 백엔드의 루트 주소여야 합니다.'
}
$BaseUrl = $BaseUrl.TrimEnd('/')
if ([string]::IsNullOrWhiteSpace($ReceiptPath)) {
    $ReceiptPath = Join-Path $PSScriptRoot 'data/approved-search-smoke.json'
}
$ReceiptPath = [System.IO.Path]::GetFullPath($ReceiptPath)
$receiptDirectory = [System.IO.Path]::GetDirectoryName($ReceiptPath)
[System.IO.Directory]::CreateDirectory($receiptDirectory) | Out-Null
$config = Invoke-RestMethod -Uri "$BaseUrl/api/config"
if ($config.provider -ne 'SERPER' -or $config.synthetic) { throw '승인된 SERPER 서버가 아닙니다. 합성 응답을 실제 검색 성공으로 기록하지 않습니다.' }

# Persist keys before any external search. Re-running this script reuses each request.
if (Test-Path -LiteralPath $ReceiptPath) {
    $receipt = Get-Content -LiteralPath $ReceiptPath -Raw | ConvertFrom-Json
    if ($receipt.baseUrl -ne $BaseUrl) { throw '기존 스모크 서버 주소와 다릅니다. 기존 기록을 보존한 채 설정을 확인하세요.' }
} else {
    $receipt = [pscustomobject]@{ baseUrl = $BaseUrl; createdAt = [DateTimeOffset]::Now.ToString('o'); topicId = 0; tests = @(
        [pscustomobject]@{ query = '애슐리 퀸즈'; requestKey = [guid]::NewGuid().ToString(); runId = 0; result = $null },
        [pscustomobject]@{ query = '클로드'; requestKey = [guid]::NewGuid().ToString(); runId = 0; result = $null }
    ) }
    $stream = [System.IO.File]::Open($ReceiptPath, 'CreateNew', 'Write', 'None')
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes(($receipt | ConvertTo-Json -Depth 12))
        $stream.Write($bytes, 0, $bytes.Length)
    } finally { $stream.Dispose() }
}
function Save-Receipt {
    $receipt | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $ReceiptPath -Encoding utf8
}
if ($receipt.topicId -eq 0) {
    $body = @{ name = '승인된 실제 검색 스모크'; query = '애슐리 퀸즈' } | ConvertTo-Json
    $topic = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/topics" -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
    $receipt.topicId = $topic.id
    Save-Receipt
}
foreach ($test in $receipt.tests) {
    $started = [DateTimeOffset]::Now
    $body = @{ topicId = $receipt.topicId; query = $test.query; requestKey = $test.requestKey } | ConvertTo-Json
    $accepted = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/search-sessions" -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
    $test.runId = $accepted.runId
    Save-Receipt
    $run = $accepted
    $deadline = [DateTimeOffset]::Now.AddMinutes(3)
    while ($run.status -in @('QUEUED', 'RUNNING')) {
        if ([DateTimeOffset]::Now -gt $deadline) { throw '검색 작업 대기 시간이 초과됐습니다. 재실행 시 동일 요청 키로 조회합니다.' }
        Start-Sleep -Milliseconds 500
        $run = Invoke-RestMethod -Uri "$BaseUrl/api/search-sessions/$($test.runId)"
    }
    $results = Invoke-RestMethod -Uri "$BaseUrl/api/search-sessions/$($test.runId)/results"
    $test.result = [pscustomobject]@{ status = $run.status; errorCode = $run.errorCode; count = $results.totalElements; observedAt = [DateTimeOffset]::Now.ToString('o'); elapsedMs = ([DateTimeOffset]::Now - $started).TotalMilliseconds; items = $results.items }
    Save-Receipt
    Write-Output "$($test.query): $($run.status), 결과 $($results.totalElements)건"
    if ($run.status -eq 'FAILED') { throw "검색 실패 코드: $($run.errorCode). 원인을 확인하기 전 다음 검색을 실행하지 않습니다." }
}
Write-Output "검증 기록: $ReceiptPath"
Write-Output '계정 대시보드의 실제 무료 크레딧 차감은 별도로 확인해 기록하세요.'
