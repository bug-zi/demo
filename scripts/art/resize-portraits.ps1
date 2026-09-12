<#
Resizes generated portraits (out/art-raw/<Batch>/*.png) into
public/assets/art/portraits/<name>.png at the given square size.
Usage:
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/art/resize-portraits.ps1 -Batch a1-portraits [-Size 512] [-Names shengren,chefan]
#>
param(
  [Parameter(Mandatory = $true)][string]$Batch,
  [int]$Size = 512,
  [string]$Names = ''
)
Add-Type -AssemblyName System.Drawing
$srcDir = Join-Path $PSScriptRoot "..\..\out\art-raw\$Batch"
$dstDir = Join-Path $PSScriptRoot "..\..\public\assets\art\portraits"
if (-not (Test-Path $srcDir)) { Write-Error "source dir not found: $srcDir"; exit 1 }
New-Item -ItemType Directory -Force -Path $dstDir | Out-Null
$files = Get-ChildItem -Path (Join-Path $srcDir '*.png')
if ($Names -ne '') {
  $want = $Names -split ','
  $files = $files | Where-Object { $want -contains $_.BaseName }
}
if (-not $files) { Write-Error 'no matching png files'; exit 1 }
foreach ($f in $files) {
  $img = [System.Drawing.Image]::FromFile($f.FullName)
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($img, 0, 0, $Size, $Size)
  $dst = Join-Path $dstDir ($f.BaseName + '.png')
  $bmp.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $img.Dispose()
  '{0} -> {1} ({2} KB)' -f $f.Name, $dst, [math]::Round((Get-Item $dst).Length / 1KB)
}
