param(
  [Parameter(Mandatory=$true)][string]$DatabaseUrl,
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\backups')
)
$ErrorActionPreference = 'Stop'
$pgDump = Get-Command pg_dump -ErrorAction Stop
$resolved = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $resolved | Out-Null
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$target = Join-Path $resolved "quoteflow-$stamp.dump"
& $pgDump.Source --format=custom --no-owner --no-acl --file=$target $DatabaseUrl
if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $target)) { throw 'PostgreSQL backup failed.' }
$hash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
$manifest = [ordered]@{ createdAt=(Get-Date).ToUniversalTime().ToString('o'); file=(Split-Path $target -Leaf); sha256=$hash; format='pg_dump custom'; encryptedAtRest='storage-provider-responsibility' }
$manifest | ConvertTo-Json | Set-Content -LiteralPath "$target.manifest.json" -Encoding utf8
Write-Output $target
