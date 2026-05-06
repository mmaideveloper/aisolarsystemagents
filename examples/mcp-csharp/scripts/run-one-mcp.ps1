param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [string]$Project,

    [Parameter(Mandatory = $false)]
    [string]$Url,

    [Parameter(Mandatory = $true)]
    [string]$LogFile
)

$ErrorActionPreference = "Stop"

$logDirectory = Split-Path -Parent $LogFile
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

$host.UI.RawUI.WindowTitle = "$Name - MCP Server"

if (-not [string]::IsNullOrWhiteSpace($Url)) {
    $env:ASPNETCORE_URLS = $Url
}
else {
    Remove-Item Env:\ASPNETCORE_URLS -ErrorAction SilentlyContinue
}
$env:ASPNETCORE_ENVIRONMENT = "Development"
$env:DOTNET_ENVIRONMENT = "Development"

if (-not [string]::IsNullOrWhiteSpace($Url)) {
    "Starting $Name on $Url" | Tee-Object -FilePath $LogFile
}
else {
    "Starting $Name with application-configured endpoints" | Tee-Object -FilePath $LogFile
}
"" | Tee-Object -FilePath $LogFile -Append
& dotnet run --project $Project *>&1 | Tee-Object -FilePath $LogFile
exit $LASTEXITCODE
