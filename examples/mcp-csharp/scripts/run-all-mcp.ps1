param(
    [string]$GatewayUrl = "http://localhost:5080",
    [string]$SmartRoomUrl = "http://localhost:5081",
    [string]$SmartIdentityUrl = "http://localhost:5082",
    [int]$StartupTimeoutSeconds = 30
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$exampleRoot = Split-Path -Parent $scriptRoot
$logRoot = Join-Path $exampleRoot ".logs"
$childRunner = Join-Path $scriptRoot "run-one-mcp.ps1"

New-Item -ItemType Directory -Force -Path $logRoot | Out-Null

if (-not (Test-Path -LiteralPath $childRunner)) {
    throw "Child runner not found: $childRunner"
}

$servers = @(
    @{
        Name = "MainGateway"
        Project = Join-Path $exampleRoot "src/MainGateway/MainGateway.csproj"
        Url = $GatewayUrl
    },
    @{
        Name = "SmartRoomMcp"
        Project = Join-Path $exampleRoot "src/SmartRoomMcp/SmartRoomMcp.csproj"
        Url = $SmartRoomUrl
    },
    @{
        Name = "SmartIdentityMcp"
        Project = Join-Path $exampleRoot "src/SmartIdentityMcp/SmartIdentityMcp.csproj"
        Url = $SmartIdentityUrl
    }
)

foreach ($server in $servers) {
    if (-not (Test-Path -LiteralPath $server.Project)) {
        throw "Project not found: $($server.Project)"
    }
}

$processes = New-Object System.Collections.Generic.List[object]

function Get-UrlPort {
    param([string]$Url)

    $uri = [Uri]$Url
    if ($uri.IsDefaultPort) {
        if ($uri.Scheme -eq "https") {
            return 443
        }
        return 80
    }
    $uri.Port
}

function Test-TcpPort {
    param(
        [string]$HostName,
        [int]$Port
    )

    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $connectTask = $client.ConnectAsync($HostName, $Port)
        if (-not $connectTask.Wait(500)) {
            return $false
        }
        return $client.Connected
    }
    catch {
        return $false
    }
    finally {
        $client.Dispose()
    }
}

function Wait-McpServer {
    param(
        [object]$Entry,
        [int]$TimeoutSeconds
    )

    $uri = [Uri]$Entry.Url
    $port = Get-UrlPort -Url $Entry.Url
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    while ((Get-Date) -lt $deadline) {
        if ($Entry.Process.HasExited) {
            $lastLogLines = Get-LastLogLines -LogFile $Entry.LogFile
            throw "$($Entry.Name) exited with code $($Entry.Process.ExitCode).$([Environment]::NewLine)$lastLogLines"
        }

        if (Test-TcpPort -HostName $uri.Host -Port $port) {
            return
        }

        Start-Sleep -Milliseconds 250
    }

    $lastLogLines = Get-LastLogLines -LogFile $Entry.LogFile
    throw "$($Entry.Name) did not listen on $($Entry.Url) within $TimeoutSeconds seconds.$([Environment]::NewLine)$lastLogLines"
}

function Get-LastLogLines {
    param([string]$LogFile)

    if (-not (Test-Path -LiteralPath $LogFile)) {
        return "No log file created: $LogFile"
    }

    $lines = Get-Content -LiteralPath $LogFile -Tail 40
    if (-not $lines) {
        return "Log file is empty: $LogFile"
    }

    "Last lines from $LogFile$([Environment]::NewLine)" + ($lines -join [Environment]::NewLine)
}

function Start-McpServer {
    param(
        [string]$Name,
        [string]$Project,
        [string]$Url
    )

    $logFile = Join-Path $logRoot "$Name.log"
    if (Test-Path -LiteralPath $logFile) {
        Remove-Item -LiteralPath $logFile -Force
    }

    $process = Start-Process `
        -FilePath "powershell.exe" `
        -ArgumentList @(
            "-NoExit",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            $childRunner,
            "-Name",
            $Name,
            "-Project",
            $Project,
            "-Url",
            $Url,
            "-LogFile",
            $logFile
        ) `
        -WorkingDirectory $exampleRoot `
        -WindowStyle Normal `
        -PassThru

    [pscustomobject]@{
        Name = $Name
        Url = $Url
        LogFile = $logFile
        Process = $process
    }
}

try {
    foreach ($server in $servers) {
        $started = Start-McpServer -Name $server.Name -Project $server.Project -Url $server.Url
        $processes.Add($started)
        Write-Host "Started $($started.Name) on $($started.Url) (PID $($started.Process.Id))"
    }

    foreach ($entry in $processes) {
        Wait-McpServer -Entry $entry -TimeoutSeconds $StartupTimeoutSeconds
        Write-Host "$($entry.Name) is listening on $($entry.Url)"
    }

    Write-Host ""
    Write-Host "MCP endpoints:"
    Write-Host "  Gateway:       $GatewayUrl/mcp"
    Write-Host "  SmartRoom:     $SmartRoomUrl/mcp"
    Write-Host "  SmartIdentity: $SmartIdentityUrl/mcp"
    Write-Host ""
    Write-Host "Press Ctrl+C to stop all MCP servers."

    while ($true) {
        foreach ($entry in $processes) {
            if ($entry.Process.HasExited) {
                $lastLogLines = Get-LastLogLines -LogFile $entry.LogFile
                throw "$($entry.Name) exited with code $($entry.Process.ExitCode).$([Environment]::NewLine)$lastLogLines"
            }
        }
        Start-Sleep -Seconds 1
    }
}
finally {
    Write-Host ""
    Write-Host "Stopping MCP servers..."

    foreach ($entry in $processes) {
        if ($entry.Process -and -not $entry.Process.HasExited) {
            Write-Host "Stopping $($entry.Name) (PID $($entry.Process.Id))"
            & taskkill.exe /PID $entry.Process.Id /T /F | Out-Null
            $entry.Process.WaitForExit()
        }
        if ($entry.Process) {
            $entry.Process.Dispose()
        }
    }
}
