param([string]$DbPath = '', [int]$Port = 8080, [ValidateRange(1,10000)][int]$MaximumAttempts = 200)
$ErrorActionPreference = 'Stop'
$keyWasPrompted = $false
if ([string]::IsNullOrWhiteSpace($env:SERPER_API_KEY)) {
    $secureKey = Read-Host 'Serper API 키를 입력하세요 (화면에 표시되지 않음)' -AsSecureString
    try { $env:SERPER_API_KEY = [System.Net.NetworkCredential]::new('', $secureKey).Password }
    finally { $secureKey.Dispose() }
    if ([string]::IsNullOrWhiteSpace($env:SERPER_API_KEY)) { throw 'API 키를 입력하지 않았습니다.' }
    $keyWasPrompted = $true
}
if ($Port -lt 1024 -or $Port -gt 65535) { throw '유효한 로컬 포트를 지정하세요.' }
$env:RESEARCH_PROVIDER = 'serper'
$env:EXTERNAL_SEARCH_APPROVED = 'true'
$env:MAX_PROVIDER_ATTEMPTS = [string]$MaximumAttempts
$env:SERVER_PORT = [string]$Port
if (-not [string]::IsNullOrWhiteSpace($DbPath)) { $env:RESEARCH_DB_PATH = $DbPath }
if ([string]::IsNullOrWhiteSpace($env:SOURCE_POLICY_PATH)) {
    $reviewedPolicy = Join-Path (Split-Path -Parent $PSScriptRoot) 'docs/source-policy.reviewed.json'
    if (Test-Path -LiteralPath $reviewedPolicy -PathType Leaf) { $env:SOURCE_POLICY_PATH = $reviewedPolicy }
}
Push-Location -LiteralPath $PSScriptRoot
try { & (Join-Path $PSScriptRoot 'mvnw.cmd') spring-boot:run }
finally {
    Pop-Location
    if ($keyWasPrompted) { Remove-Item -LiteralPath 'Env:SERPER_API_KEY' }
}
