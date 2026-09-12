# Kills only the chrome-devtools-mcp automation Chrome instances (not the user's own browser).
Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
  Where-Object { $_.CommandLine -like '*chrome-devtools-mcp*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Write-Output 'mcp chrome killed'
