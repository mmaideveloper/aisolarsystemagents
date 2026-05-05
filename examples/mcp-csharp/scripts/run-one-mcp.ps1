param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [string]$Project,

    [Parameter(Mandatory = $true)]
    [string]$Url,

    [Parameter(Mandatory = $true)]
    [string]$LogFile
)

$ErrorActionPreference = "Stop"

$logDirectory = Split-Path -Parent $LogFile
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

$host.UI.RawUI.WindowTitle = "$Name - MCP Server"

$env:ASPNETCORE_URLS = $Url
$env:ASPNETCORE_ENVIRONMENT = "Development"
$env:DOTNET_ENVIRONMENT = "Development"

"Starting $Name on $Url" | Tee-Object -FilePath $LogFile
"" | Tee-Object -FilePath $LogFile -Append
& dotnet run --project $Project *>&1 | Tee-Object -FilePath $LogFile
exit $LASTEXITCODE
