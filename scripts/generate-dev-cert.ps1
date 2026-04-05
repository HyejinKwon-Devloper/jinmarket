param(
  [string]$Password = $(if ($env:DEV_HTTPS_PFX_PASSPHRASE) { $env:DEV_HTTPS_PFX_PASSPHRASE } else { "jinmarket-local" }),
  [string]$DevHost = $(if ($env:DEV_HOST) { $env:DEV_HOST } else { "jinmarket.test" })
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$certDir = Join-Path $repoRoot "certificates"
$pfxPath = Join-Path $certDir "localhost-dev.pfx"
$cerPath = Join-Path $certDir "localhost-dev.cer"
$friendlyName = "Jinmarket Local Dev"

New-Item -ItemType Directory -Force -Path $certDir | Out-Null

$certificate = Get-ChildItem Cert:\CurrentUser\My |
  Where-Object {
    $_.FriendlyName -eq $friendlyName -and
    $_.Subject -eq "CN=$DevHost" -and
    $_.NotAfter -gt (Get-Date).AddDays(7)
  } |
  Sort-Object NotAfter -Descending |
  Select-Object -First 1

if (-not $certificate) {
  $certificate = New-SelfSignedCertificate `
    -Subject "CN=$DevHost" `
    -FriendlyName $friendlyName `
    -DnsName @($DevHost, "localhost") `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -HashAlgorithm "SHA256" `
    -KeyExportPolicy Exportable `
    -NotAfter (Get-Date).AddYears(3) `
    -Type SSLServerAuthentication
}

$securePassword = ConvertTo-SecureString -String $Password -AsPlainText -Force

Export-PfxCertificate -Cert $certificate -FilePath $pfxPath -Password $securePassword -Force | Out-Null
Export-Certificate -Cert $certificate -FilePath $cerPath -Force | Out-Null

$isTrusted = Get-ChildItem Cert:\CurrentUser\Root |
  Where-Object { $_.Thumbprint -eq $certificate.Thumbprint } |
  Select-Object -First 1

if (-not $isTrusted) {
  Import-Certificate -FilePath $cerPath -CertStoreLocation "Cert:\CurrentUser\Root" | Out-Null
}

Write-Host "Created dev certificate:"
Write-Host "  PFX: $pfxPath"
Write-Host "  CER: $cerPath"
Write-Host "  Hosts: $DevHost, localhost"
Write-Host "If your browser was open, restart it before testing Threads OAuth."
