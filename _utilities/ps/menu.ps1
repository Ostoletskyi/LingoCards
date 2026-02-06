param(
  [Parameter(Mandatory=$true)][string]$Root,
  [Parameter(Mandatory=$true)]
  [ValidateSet("filemap_create","filemap_check","contracts_test","backup_create","backup_restore","server_run","repo_init","i18n_audit")]
  [string]$Action
)

. "$PSScriptRoot\_lib\common.ps1"

$ROOT = Resolve-ProjectRoot -Root $Root

Write-Info "Action: $Action"
Write-Info "Root  : $ROOT"
Write-Host ""

switch ($Action) {
  "filemap_create"   { & "$PSScriptRoot\filemap_create.ps1"   -Root $ROOT }
  "filemap_check"    { & "$PSScriptRoot\filemap_check.ps1"    -Root $ROOT }
  "contracts_test"   { & "$PSScriptRoot\contracts_test.ps1"   -Root $ROOT }
  "backup_create"    { & "$PSScriptRoot\backup_create.ps1"    -Root $ROOT }
  "backup_restore"   { & "$PSScriptRoot\backup_restore.ps1"   -Root $ROOT }
  "server_run"       { & "$PSScriptRoot\server_run.ps1"       -Root $ROOT }
  "repo_init"        { & "$PSScriptRoot\repo_init.ps1"        -Root $ROOT }
  "i18n_audit"       { & "$PSScriptRoot\i18n_audit.ps1"       -Root $ROOT }
}