# Create format/size variants of the mascot without changing its artwork.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$taskMaster = Join-Path $taskRoot 'static\capybara-mascot.png'
$taskIcons = Join-Path $taskRoot 'assets\icons'
$taskAndroid = Join-Path $taskRoot 'platforms\android\app\src\main\res\drawable-nodpi'
New-Item -ItemType Directory -Path $taskIcons, $taskAndroid -Force | Out-Null
Add-Type -AssemblyName System.Drawing
$taskImage = [System.Drawing.Image]::FromFile($taskMaster)
try {
    foreach ($taskSize in @(16, 32, 48, 64, 128, 256, 512, 1024)) {
        $taskBitmap = [System.Drawing.Bitmap]::new($taskSize, $taskSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $taskGraphics = [System.Drawing.Graphics]::FromImage($taskBitmap)
        try {
            $taskGraphics.Clear([System.Drawing.Color]::Transparent)
            $taskGraphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
            $taskGraphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $taskGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $taskGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $taskScale = [Math]::Min($taskSize / $taskImage.Width, $taskSize / $taskImage.Height)
            $taskWidth = [int][Math]::Round($taskImage.Width * $taskScale)
            $taskHeight = [int][Math]::Round($taskImage.Height * $taskScale)
            $taskRectangle = [System.Drawing.Rectangle]::new([int](($taskSize - $taskWidth) / 2), [int](($taskSize - $taskHeight) / 2), $taskWidth, $taskHeight)
            $taskGraphics.DrawImage($taskImage, $taskRectangle)
            $taskBitmap.Save((Join-Path $taskIcons "capybara-$taskSize.png"), [System.Drawing.Imaging.ImageFormat]::Png)
        } finally {
            $taskGraphics.Dispose()
            $taskBitmap.Dispose()
        }
    }
} finally {
    $taskImage.Dispose()
}
Copy-Item -LiteralPath (Join-Path $taskIcons 'capybara-64.png') -Destination (Join-Path $taskRoot 'static\capybara-64.png') -Force
Copy-Item -LiteralPath (Join-Path $taskIcons 'capybara-512.png') -Destination (Join-Path $taskAndroid 'capybara_foreground.png') -Force
