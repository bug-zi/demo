<#
Finishes a generated art asset into its deployable form:
scales (cover-crop, never stretch), optional circular alpha mask (badges),
optional centered rect clear (frame hollow-center fallback), PNG/JPEG out.
Usage:
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/art/finish-art.ps1 ^
    -Src out/art-raw/<batch>/<name>.png -Dst public/assets/art/<...> [-Width 1440 -Height 900] [-Jpg] [-CircleMask] [-CenterClearPct 0.6]
#>
param(
  [Parameter(Mandatory = $true)][string]$Src,
  [Parameter(Mandatory = $true)][string]$Dst,
  [int]$Width = 512,
  [int]$Height = 0,
  [switch]$Jpg,
  [switch]$CircleMask,
  [switch]$KeyWhite,
  [double]$CenterClearPct = 0
)
Add-Type -AssemblyName System.Drawing
if (-not (Test-Path $Src)) { Write-Error "src not found: $Src"; exit 1 }
if ($Height -le 0) { $Height = $Width }
$dstDir = Split-Path -Parent $Dst
if ($dstDir) { New-Item -ItemType Directory -Force -Path $dstDir | Out-Null }
$img = [System.Drawing.Image]::FromFile((Resolve-Path $Src).Path)
$bmp = New-Object System.Drawing.Bitmap($Width, $Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

$srcAspect = $img.Width / $img.Height
$dstAspect = $Width / $Height
if ($srcAspect -gt $dstAspect) {
  $cropW = [int]($img.Height * $dstAspect); $cropH = $img.Height
} else {
  $cropW = $img.Width; $cropH = [int]($img.Width / $dstAspect)
}
$srcRect = New-Object System.Drawing.Rectangle([int](($img.Width - $cropW) / 2), [int](($img.Height - $cropH) / 2), $cropW, $cropH)
$dstRect = New-Object System.Drawing.Rectangle(0, 0, $Width, $Height)
$g.DrawImage($img, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

if ($CenterClearPct -gt 0) {
  $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $cw = [int]($Width * $CenterClearPct); $ch = [int]($Height * $CenterClearPct)
  $g.FillRectangle([System.Drawing.Brushes]::Transparent, [int](($Width - $cw) / 2), [int](($Height - $ch) / 2), $cw, $ch)
}
if ($CircleMask) {
  $outside = New-Object System.Drawing.Region((New-Object System.Drawing.Rectangle(0, 0, $Width, $Height)))
  $ellipse = New-Object System.Drawing.Drawing2D.GraphicsPath
  $ellipse.AddEllipse(0, 0, $Width, $Height)
  $outside.Exclude($ellipse)
  $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $g.FillRegion([System.Drawing.Brushes]::Transparent, $outside)
}
if ($KeyWhite) {
  $rect = New-Object System.Drawing.Rectangle(0, 0, $Width, $Height)
  $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $len = $data.Stride * $Height
  $bytes = New-Object byte[] $len
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $len)
  for ($i = 0; $i -lt $len; $i += 4) {
    if ($bytes[$i] -ge 236 -and $bytes[$i + 1] -ge 236 -and $bytes[$i + 2] -ge 236) { $bytes[$i + 3] = 0 }
  }
  [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $data.Scan0, $len)
  $bmp.UnlockBits($data)
}

if ($Jpg) {
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
  $ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
  $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]82)
  $bmp.Save($Dst, $codec, $ep)
} else {
  $bmp.Save($Dst, [System.Drawing.Imaging.ImageFormat]::Png)
}
$g.Dispose(); $bmp.Dispose(); $img.Dispose()
'{0} -> {1} ({2} KB)' -f (Split-Path -Leaf $Src), $Dst, [math]::Round((Get-Item $Dst).Length / 1KB)
