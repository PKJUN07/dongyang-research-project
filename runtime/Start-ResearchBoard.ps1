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

function Update-SessionPath {
    # winget으로 설치한 프로그램의 PATH를 이 창에서도 바로 쓰도록 레지스트리 값을 다시 읽는다.
    $env:Path = (@([Environment]::GetEnvironmentVariable('Path','Machine'), [Environment]::GetEnvironmentVariable('Path','User'), $env:Path) | Where-Object { $_ }) -join ';'
}

function Install-Dependency($id, $name) {
    if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
        throw "$name 이(가) 없고 winget도 찾을 수 없습니다. Microsoft Store에서 '앱 설치 관리자'를 설치하거나 $name 을(를) 직접 설치한 뒤 다시 실행하세요."
    }
    Write-Host "$name 설치 중... (winget: $id)"
    & winget.exe install --id $id --exact --silent --accept-source-agreements --accept-package-agreements
    $code = $LASTEXITCODE
    Update-SessionPath
    if ($code -ne 0) { Write-Warning "winget 종료 코드 $code. 설치 결과를 다시 확인합니다." }
}

function Find-Jdk {
    $javac = Get-Command javac.exe -ErrorAction SilentlyContinue
    $homes = @($env:JAVA_HOME)
    if ($javac) { $homes += Split-Path -Parent (Split-Path -Parent $javac.Source) }
    $homes += (Get-ChildItem "$env:ProgramFiles\Eclipse Adoptium","$env:ProgramFiles\Java","$env:ProgramFiles\Microsoft" -Directory -ErrorAction SilentlyContinue).FullName
    foreach ($jdk in $homes) {
        if ($jdk -and (Test-Path -LiteralPath "$jdk\bin\javac.exe") -and (Test-Path -LiteralPath "$jdk\release")) {
            if ((Get-Content -LiteralPath "$jdk\release" -Raw) -match '(?m)^JAVA_VERSION="(\d+)' -and [int]$Matches[1] -ge 21) { return $jdk }
        }
    }
}

function Set-Jdk {
    $jdk = Find-Jdk
    if (-not $jdk) {
        Install-Dependency 'EclipseAdoptium.Temurin.21.JDK' 'JDK 21'
        $jdk = Find-Jdk
    }
    if (-not $jdk) { throw 'JDK 21 이상을 설치하지 못했습니다. 직접 설치한 뒤 다시 실행하세요.' }
    Write-Host "JDK 확인: $jdk"
    $env:JAVA_HOME = $jdk
    $env:Path = "$jdk\bin;$env:Path"
}

function Test-Node {
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $node -or -not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { return $false }
    $text = (& $node.Source --version) -replace '^v', ''
    $version = $null
    return [version]::TryParse($text, [ref]$version) -and $version -ge [version]'22.12.0'
}

function Set-Node {
    if (-not (Test-Node)) {
        Install-Dependency 'OpenJS.NodeJS.LTS' 'Node.js LTS'
        if (-not (Test-Node)) { throw '프론트엔드 실행에 필요한 Node.js 22.12 이상을 설치하지 못했습니다. 직접 설치한 뒤 다시 실행하세요.' }
    }
    Write-Host "Node.js 확인: $(& node.exe --version)"
}

function Get-OllamaCommand {
    # 반환값: 실행 파일과 앞에 붙일 인수. 찾지 못하면 $null.
    $cli = Get-Command ollama.exe -ErrorAction SilentlyContinue
    if ($cli) { return ,@($cli.Source) }
    $local = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
    if (Test-Path -LiteralPath $local) { return ,@($local) }
    if (Get-Command wsl.exe -ErrorAction SilentlyContinue) {
        # WSL 배포판이 없으면 wsl.exe가 오류를 내므로, 그 경우는 'WSL에 Ollama 없음'으로 본다.
        $ErrorActionPreference = 'Continue'
        try {
            & wsl.exe --exec sh -c 'command -v ollama' *> $null
            if ($LASTEXITCODE -eq 0) { return ,@('wsl.exe','--exec','ollama') }
        } catch { }
    }
}

function Set-SerperKey {
    # 키는 저장소에 넣지 않고 이 PC의 사용자 환경 변수에만 저장한다.
    if (-not $env:SERPER_API_KEY) {
        $saved = [Environment]::GetEnvironmentVariable('SERPER_API_KEY','User')
        if (-not $saved) { $saved = [Environment]::GetEnvironmentVariable('SERPER_API_KEY','Machine') }
        if ($saved) { $env:SERPER_API_KEY = $saved }
    }
    if ($env:SERPER_API_KEY) { Write-Host 'Serper API 키 확인: 설정됨'; return }
    Write-Host 'Serper API 키가 없습니다. 실제 검색에 필요합니다(https://serper.dev 에서 발급).'
    $key = "$(Read-Host 'Serper API 키를 붙여 넣고 Enter (건너뛰려면 그냥 Enter)')".Trim()
    if ($key) {
        [Environment]::SetEnvironmentVariable('SERPER_API_KEY', $key, 'User')
        $env:SERPER_API_KEY = $key
        Write-Host 'Serper API 키를 이 PC의 사용자 환경 변수에 저장했습니다. 다음부터는 묻지 않습니다.'
    } else { Write-Warning 'Serper API 키 없이 시작합니다. 새 검색은 할 수 없고 저장된 자료만 볼 수 있습니다.' }
}

function Wait-Ollama($seconds) {
    $end = [DateTime]::UtcNow.AddSeconds($seconds)
    while ([DateTime]::UtcNow -lt $end) {
        if (Test-Ollama) { return $true }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Assert-OllamaModel($ollamaCommand, $model) {
    $tags = Invoke-RestMethod "$ollamaUrl/api/tags" -TimeoutSec 5
    $names = @($tags.models | ForEach-Object { $_.name })
    $wanted = if ($model -match ':') { @($model) } else { @($model, "${model}:latest") }
    if ($names | Where-Object { $wanted -contains $_ }) { Write-Host "AI 모델 확인: $model"; return }
    Write-Host "AI 모델 $model 을(를) 내려받는 중입니다. 처음 한 번만 필요하며 몇 GB라 시간이 걸릴 수 있습니다..."
    $exe = $ollamaCommand[0]
    $prefix = @($ollamaCommand | Select-Object -Skip 1)
    & $exe @prefix pull $model
    if ($LASTEXITCODE -ne 0) { throw "AI 모델 $model 다운로드 실패 (종료 코드 $LASTEXITCODE)." }
}

$startup = [Threading.Mutex]::new($false, "Local\ResearchBoard-$BackendPort-$FrontendPort-startup")
$locked = $false
try {
    Write-Host 'ResearchBoard를 준비하고 있습니다...'
    try { $locked = $startup.WaitOne(0) } catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { Write-Host '다른 창에서 이미 시작 중입니다.'; return }

    if (-not $env:RESEARCH_AI_MODEL) { $env:RESEARCH_AI_MODEL = 'qwen3-vl:8b-instruct' }
    try {
        $ollamaCommand = Get-OllamaCommand
        if (-not $ollamaCommand -and -not (Test-Ollama)) {
            Install-Dependency 'Ollama.Ollama' 'Ollama'
            $ollamaCommand = Get-OllamaCommand
            if (-not $ollamaCommand) { throw 'Ollama를 설치하지 못했습니다. Windows 또는 WSL에 직접 설치하세요.' }
            # 설치 직후 Ollama 트레이 앱이 서버를 스스로 켤 수 있으므로 잠시 기다린다.
            [void](Wait-Ollama 15)
        }
        if (-not (Test-Ollama)) {
            Assert-PortFree 11434
            $ollama = Start-ServiceJob Ollama $root $ollamaCommand[0] @(@($ollamaCommand | Select-Object -Skip 1) + 'serve')
            $jobs += $ollama
            Wait-Service ${function:Test-Ollama} $ollama 45
        }
        if ($ollamaCommand) { Assert-OllamaModel $ollamaCommand $env:RESEARCH_AI_MODEL }
    } catch { Write-Warning "AI 요약을 준비하지 못했습니다. $($_.Exception.Message)" }

    if (-not (Test-Backend $backendUrl)) {
        Assert-PortFree $BackendPort
        Set-Jdk
        Set-SerperKey
        $env:SERVER_PORT = "$BackendPort"
        if (-not $env:RESEARCH_DB_PATH) { $env:RESEARCH_DB_PATH = Join-Path $PSScriptRoot 'research.db' }
        if (-not $env:RESEARCH_AI_TIMEOUT_SECONDS) { $env:RESEARCH_AI_TIMEOUT_SECONDS = '300' }
        # 합성(fake) 검색 모드는 폐기되었습니다. 예전 설정이 남아 있어도 실제 검색(Serper)으로 시작합니다.
        if ($env:RESEARCH_PROVIDER -eq 'fake') { Remove-Item -LiteralPath 'Env:RESEARCH_PROVIDER' }
        # Serper 키를 설정해 두었다면 외부 검색을 승인된 것으로 보고, 검토된 출처 정책을 사용합니다.
        if ($env:SERPER_API_KEY -and -not $env:EXTERNAL_SEARCH_APPROVED) { $env:EXTERNAL_SEARCH_APPROVED = 'true' }
        if (-not $env:SOURCE_POLICY_PATH) {
            $reviewedPolicy = Join-Path $root 'docs\source-policy.reviewed.json'
            if (Test-Path -LiteralPath $reviewedPolicy -PathType Leaf) { $env:SOURCE_POLICY_PATH = $reviewedPolicy }
        }
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
        # 예전 빌드(dist)는 git pull로 갱신되지 않는다. Node.js를 확인·설치해 항상 소스(Vite)로 띄우고,
        # Node.js를 준비하지 못했을 때만 dist를 쓰며, 소스가 dist보다 새로우면 경고한다.
        $nodeError = $null
        try { Set-Node } catch { $nodeError = $_.Exception.Message }
        if ($nodeError) {
            if (-not ((Test-Path -LiteralPath "$front\dist\index.html") -and $python -and $python.Source -notlike '*\Microsoft\WindowsApps\*')) { throw $nodeError }
            Write-Warning $nodeError
            $built = (Get-Item -LiteralPath "$front\dist\index.html").LastWriteTime
            $newest = (Get-ChildItem -LiteralPath "$front\src" -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime
            if ($newest -gt $built) { Write-Warning '프론트엔드 빌드(frontend\dist)가 소스보다 오래되었습니다. 최신 화면을 보려면 Node.js 22.12 이상을 설치한 뒤 다시 실행하세요.' }
            $frontend = Start-ServiceJob Frontend $PSScriptRoot $python.Source @('serve_frontend.py',"$FrontendPort",$backendUrl)
        } else {
            if (-not (Test-Path -LiteralPath $vite)) {
                Write-Host '프론트엔드 패키지를 설치하고 있습니다...'
                Push-Location -LiteralPath $front
                try {
                    & npm.cmd ci
                    if ($LASTEXITCODE -ne 0) { throw 'npm ci 실패. 위의 설치 오류를 확인하세요.' }
                } finally { Pop-Location }
            } else { Write-Host '프론트엔드 패키지 확인: 설치됨' }
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
