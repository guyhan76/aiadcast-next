[CmdletBinding()]
param(
    [string]$Bundle = (Join-Path $PSScriptRoot 'app-release.aab'),
    [string]$KeyDirectory = (Join-Path ([Environment]::GetFolderPath('UserProfile')) 'aiadcast-play-upload'),
    [switch]$CreateKey
)
$ErrorActionPreference = 'Stop'
foreach ($tool in @('java', 'keytool', 'jarsigner')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Install JDK 17 or newer and add its bin folder to PATH ($tool)." }
}
$bundlePath = (Resolve-Path -LiteralPath $Bundle).Path
$output = [IO.Path]::Combine([IO.Path]::GetDirectoryName($bundlePath), 'aiadcast-play-signed.aab')
if (Test-Path -LiteralPath $output) { throw "Output already exists: $output" }
$store = Join-Path $KeyDirectory 'upload.p12'
$cert = Join-Path $KeyDirectory 'upload-certificate.der'
$alias = 'aiadcast-upload'
if ($CreateKey) {
    if ((Test-Path -LiteralPath $store) -or (Test-Path -LiteralPath $cert)) { throw 'Key material already exists. Run without -CreateKey to reuse the original key.' }
    [IO.Directory]::CreateDirectory($KeyDirectory) | Out-Null
    & keytool -genkeypair -keystore $store -storetype PKCS12 -alias $alias -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=aiadcast Upload, O=Sellup Labs, C=KR'
    if ($LASTEXITCODE -ne 0) { throw 'Key creation did not complete.' }
}
if (-not (Test-Path -LiteralPath $store)) { throw 'For first use on the company PC, run with -CreateKey.' }
if (-not (Test-Path -LiteralPath $cert)) {
    & keytool -exportcert -alias $alias -keystore $store -file $cert
    if ($LASTEXITCODE -ne 0) { throw 'Public certificate export failed.' }
}
$temp = Join-Path ([IO.Path]::GetDirectoryName($output)) ([Guid]::NewGuid().ToString() + '.aab')
try {
    & jarsigner -keystore $store -signedjar $temp $bundlePath $alias
    if ($LASTEXITCODE -ne 0) { throw 'Bundle signing failed.' }
    & java (Join-Path $PSScriptRoot 'VerifyBundle.java') $temp $cert
    if ($LASTEXITCODE -ne 0) { throw 'Bundle verification failed.' }
    [IO.File]::Move($temp, $output)
    Write-Output "Verified release bundle: $output"
    Write-Output "Public upload certificate: $cert"
    Write-Output "Back up $store and its password separately under company control."
} finally {
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp }
}
