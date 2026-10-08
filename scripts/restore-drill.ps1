param(
  [Parameter(Mandatory=$true)][string]$BackupFile,
  [Parameter(Mandatory=$true)][string]$TargetDatabaseUrl
)
$ErrorActionPreference = 'Stop'
if (!(Test-Path -LiteralPath $BackupFile)) { throw 'Backup file does not exist.' }
$uri = [Uri]$TargetDatabaseUrl
$databaseName = $uri.AbsolutePath.Trim('/')
if ($databaseName -notmatch '(restore|drill|staging|test)') { throw 'Restore drills are restricted to a database whose name contains restore, drill, staging, or test.' }
$pgRestore = Get-Command pg_restore -ErrorAction Stop
$psql = Get-Command psql -ErrorAction Stop
& $pgRestore.Source --clean --if-exists --no-owner --no-acl --dbname=$TargetDatabaseUrl $BackupFile
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL restore failed.' }
$required = @('Organization','User','Customer','CatalogItem','RFQ','Quote','QuoteEvent','FollowUp','Subscription','AuditLog')
foreach ($table in $required) {
  $count = & $psql.Source $TargetDatabaseUrl --tuples-only --no-align --command="SELECT COUNT(*) FROM \"$table\";"
  if ($LASTEXITCODE -ne 0 -or $count -notmatch '^\d+$') { throw "Restore verification failed for $table." }
  Write-Output "$table=$count"
}
Write-Output 'RESTORE_DRILL_PASSED'
