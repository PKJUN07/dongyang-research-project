param(
    [switch]$NoBrowser,
    [ValidateRange(1024,65535)][int]$BackendPort = 18089,
    [ValidateRange(1024,65535)][int]$FrontendPort = 5179
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$backendUrl = "http://127.0.0.1:$BackendPort"
$frontendUrl = "http://127.0.0.1:$FrontendPort"
$ollamaUrl = 'http://127.0.0.1:11434'
$jobs = @()

function Start-ServiceJob($name, $directory, $command, [string[]]$arguments) {
    $log = Join-Path $PSScriptRoot "$name.log"
    Write-Host "$name 시작 중... ($log)"
    Start-Job -Name $name -ArgumentList $directory, $command, $arguments, $log -ScriptBlock {
        param($directory, $command, $arguments, $log)
        Set-Location -LiteralPath $directory
        & $command @arguments *> $log
        if ($command -eq 'wsl.exe' -and $LASTEXITCODE -ne 0) {
            # On WSL boot, systemd may already own Ollama's port. A system service
            # alone does not keep WSL awake, so hold a client until the launcher exits.
            & wsl.exe --exec ollama list *> $null
            while ($LASTEXITCODE -eq 0) { & wsl.exe --exec sleep 30 }
        }
    }
}

function Wait-Service($test, $job, $seconds) {
    $end = [DateTime]::UtcNow.AddSeconds($seconds)
    do {
        if (& $test) { return }
        if ($job.State -ne 'Running') { break }
        Start-Sleep -Milliseconds 500
    } while ([DateTime]::UtcNow -lt $end)
    throw "$($job.Name) 시작을 확인할 수 없습니다. 로그를 확인하세요: $(Join-Path $PSScriptRoot ($job.Name + '.log'))"
}

function Test-Backend($url) {
    try {
        $health = Invoke-RestMethod "$url/api/health" -TimeoutSec 2
        return $health.status -eq 'UP' -and $health.service -eq 'research-board-backend'
    } catch { return $false }
}

function Test-Frontend {
    try {
        $page = Invoke-WebRequest "$frontendUrl/search" -UseBasicParsing -TimeoutSec 2
        return $page.Content -match '<title>ResearchBoard' -and (Test-Backend $frontendUrl)
    } catch { return $false }
}

function Test-Ollama {
    try {
        $tags = Invoke-RestMethod "$ollamaUrl/api/tags" -TimeoutSec 2
        return $tags.models -is [array]
    } catch { return $false }
}

function Assert-PortFree($port) {
    $probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port)
    try {
        $probe.ExclusiveAddressUse = $true
        $probe.Start()
    } catch {
        throw "포트 $port 사용 중입니다. 해당 포트를 사용하는 프로그램을 확인하세요."
    } finally { $probe.Stop() }
}

function Set-Jdk {
    $javac = Get-Command javac.exe -ErrorAction SilentlyContinue
    $homes = @($env:JAVA_HOME)
    if ($javac) { $homes += Split-Path -Parent (Split-Path -Parent $javac.Source) }
    $homes += (Get-ChildItem "$env:ProgramFiles\Eclipse Adoptium","$env:ProgramFiles\Java" -Directory -ErrorAction SilentlyContinue).FullName
    foreach ($jdk in $homes) {
        if ($jdk -and (Test-Path -LiteralPath "$jdk\bin\javac.exe") -and (Test-Path -LiteralPath "$jdk\release")) {
            if ((Get-Content -LiteralPath "$jdk\release" -Raw) -match '(?m)^JAVA_VERSION="(\d+)' -and [int]$Matches[1] -ge 21) {
                $env:JAVA_HOME = $jdk
                $env:Path = "$jdk\bin;$env:Path"
                return
            }
        }
    }
    throw 'JDK 21 이상을 설치한 뒤 다시 실행하세요.'
}

$startup = [Threading.Mutex]::new($false, "Local\ResearchBoard-$BackendPort-$FrontendPort-startup")
$locked = $false
try {
    Write-Host 'ResearchBoard를 준비하고 있습니다...'
    try { $locked = $startup.WaitOne(0) } catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { Write-Host '다른 창에서 이미 시작 중입니다.'; return }

    if (-not (Test-Ollama)) {
        try {
            Assert-PortFree 11434
            $cli = Get-Command ollama.exe -ErrorAction SilentlyContinue
            $localOllama = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
            if ($cli) { $ollama = Start-ServiceJob Ollama $root $cli.Source @('serve') }
            elseif (Test-Path -LiteralPath $localOllama) { $ollama = Start-ServiceJob Ollama $root $localOllama @('serve') }
            elseif (Get-Command wsl.exe -ErrorAction SilentlyContinue) {
                $ollama = Start-ServiceJob Ollama $root 'wsl.exe' @('--exec','ollama','serve')
            } else { throw 'Windows 또는 WSL에 Ollama를 설치하세요.' }
            $jobs += $ollama
            Wait-Service ${function:Test-Ollama} $ollama 45
        } catch { Write-Warning "AI 요약을 준비하지 못했습니다. $($_.Exception.Message)" }
    }

    if (-not (Test-Backend $backendUrl)) {
        Assert-PortFree $BackendPort
        Set-Jdk
        $env:SERVER_PORT = "$BackendPort"
        if (-not $env:RESEARCH_DB_PATH) { $env:RESEARCH_DB_PATH = Join-Path $PSScriptRoot 'research.db' }
        if (-not $env:RESEARCH_AI_MODEL) { $env:RESEARCH_AI_MODEL = 'qwen3-vl:8b-instruct' }
        if (-not $env:RESEARCH_AI_TIMEOUT_SECONDS) { $env:RESEARCH_AI_TIMEOUT_SECONDS = '300' }
        $backend = Start-ServiceJob Backend "$root\backend" '.\mvnw.cmd' @('spring-boot:run')
        $jobs += $backend
        Wait-Service { Test-Backend $backendUrl } $backend 300
    }

    if (-not (Test-Frontend)) {
        Assert-PortFree $FrontendPort
        $front = Join-Path $root 'frontend'
        $vite = Join-Path $front 'node_modules\.bin\vite.cmd'
        $python = Get-Command python.exe -ErrorAction SilentlyContinue
        $env:RESEARCH_API_TARGET = $backendUrl
        if (-not (Test-Path -LiteralPath $vite) -and (Test-Path -LiteralPath "$front\dist\index.html") -and $python -and $python.Source -notlike '*\Microsoft\WindowsApps\*') {
            $frontend = Start-ServiceJob Frontend $PSScriptRoot $python.Source @('serve_frontend.py',"$FrontendPort",$backendUrl)
        } else {
            if (-not (Test-Path -LiteralPath $vite)) {
                if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw '프론트엔드 실행에 필요한 Node.js 22.12 이상을 설치하세요.' }
                Write-Host '프론트엔드 패키지를 설치하고 있습니다...'
                Push-Location -LiteralPath $front
                try {
                    & npm.cmd ci
                    if ($LASTEXITCODE -ne 0) { throw 'npm ci 실패. 위의 설치 오류를 확인하세요.' }
                } finally { Pop-Location }
            }
            $frontend = Start-ServiceJob Frontend $front $vite @('--host','127.0.0.1','--port',"$FrontendPort",'--strictPort')
        }
        $jobs += $frontend
        Wait-Service ${function:Test-Frontend} $frontend 60
    }
    $startup.ReleaseMutex()
    $locked = $false

    $ai = Invoke-RestMethod "$backendUrl/api/ai/health" -TimeoutSec 5
    if ($ai.available) { Write-Host "AI 요약 준비 완료 ($($ai.model))" }
    else { Write-Warning "AI 요약 상태: $($ai.code) ($($ai.model)). 검색과 보관 기능은 사용할 수 있습니다." }
    Write-Host "ResearchBoard 준비 완료  $frontendUrl/search"
    if (-not $NoBrowser) {
        try { Start-Process "$frontendUrl/search" }
        catch { Write-Warning "브라우저에서 직접 $frontendUrl/search 주소를 열어 주세요." }
    }
    if ($jobs | Where-Object State -eq 'Running') {
        [void](Read-Host '사용하는 동안 이 창을 열어 두세요. 종료하려면 Enter를 누르세요')
    }
} finally {
    foreach ($job in $jobs) { Remove-Job -Job $job -Force }
    if ($locked) { $startup.ReleaseMutex() }
    $startup.Dispose()
}
