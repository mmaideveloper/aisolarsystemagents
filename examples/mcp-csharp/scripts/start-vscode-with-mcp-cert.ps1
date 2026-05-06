$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..\..\..\..")
$rootCa = Resolve-Path (Join-Path $repoRoot ".certs\solaragents-local-root-ca.pem")

$env:NODE_EXTRA_CA_CERTS = $rootCa.Path

code $repoRoot.Path
