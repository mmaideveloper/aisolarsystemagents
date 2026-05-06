param(
    [string]$GatewayUrl = "https://localhost:6001",
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
        BindUrl = ""
    },
    @{
        Name = "SmartRoomMcp"
        Project = Join-Path $exampleRoot "src/SmartRoomMcp/SmartRoomMcp.csproj"
        Url = $SmartRoomUrl
        BindUrl = $SmartRoomUrl
    },
    @{
        Name = "SmartIdentityMcp"
        Project = Join-Path $exampleRoot "src/SmartIdentityMcp/SmartIdentityMcp.csproj"
        Url = $SmartIdentityUrl
        BindUrl = $SmartIdentityUrl
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

function Get-PortOwner {
    param([string]$Url)

    $uri = [Uri]$Url
    $port = Get-UrlPort -Url $Url
    $connection = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalAddress -eq "127.0.0.1" -or $_.LocalAddress -eq "::1" -or $_.LocalAddress -eq "0.0.0.0" -or $_.LocalAddress -eq "::" } |
        Select-Object -First 1

    if (-not $connection) {
        return $null
    }

    $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
    [pscustomobject]@{
        Url = $Url
        Port = $port
        ProcessId = $connection.OwningProcess
        ProcessName = $process.ProcessName
        Path = $process.Path
    }
}

function Assert-PortsAvailable {
    param([object[]]$Servers)

    foreach ($server in $Servers) {
        $owner = Get-PortOwner -Url $server.Url
        if ($owner) {
            throw "$($server.Name) cannot start because port $($owner.Port) is already in use by PID $($owner.ProcessId) ($($owner.ProcessName)): $($owner.Path)"
        }
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
        [string]$Url,
        [string]$BindUrl
    )

    $logFile = Join-Path $logRoot "$Name.log"
    if (Test-Path -LiteralPath $logFile) {
        Remove-Item -LiteralPath $logFile -Force
    }

    $arguments = @(
        "-NoExit",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        $childRunner,
        "-Name",
        $Name,
        "-Project",
        $Project
    )

    if (-not [string]::IsNullOrWhiteSpace($BindUrl)) {
        $arguments += @("-Url", $BindUrl)
    }

    $arguments += @("-LogFile", $logFile)

    $process = Start-Process `
        -FilePath "powershell.exe" `
        -ArgumentList $arguments `
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
    Assert-PortsAvailable -Servers $servers

    foreach ($server in $servers) {
        $started = Start-McpServer -Name $server.Name -Project $server.Project -Url $server.Url -BindUrl $server.BindUrl
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
