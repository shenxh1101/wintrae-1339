Add-Type -AssemblyName System.Drawing

$iconDir = Join-Path $PSScriptRoot "icons"
if (-not (Test-Path $iconDir)) {
    New-Item -ItemType Directory -Path $iconDir | Out-Null
}

$sizes = @(16, 48, 128)

foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    $rectF = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Rectangle(0, 0, $size, $size)),
        [System.Drawing.Color]::FromArgb(99, 102, 241),
        [System.Drawing.Color]::FromArgb(139, 92, 246),
        45
    )

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $r = [int]($size * 0.2)
    $path.AddArc(0, 0, $r * 2, $r * 2, 180, 90)
    $path.AddArc($size - $r * 2, 0, $r * 2, $r * 2, 270, 90)
    $path.AddArc($size - $r * 2, $size - $r * 2, $r * 2, $r * 2, 0, 90)
    $path.AddArc(0, $size - $r * 2, $r * 2, $r * 2, 90, 90)
    $path.CloseFigure()

    $g.FillPath($brush, $path)

    $fontSize = [float]($size * 0.55)
    $font = New-Object System.Drawing.Font("Arial", $fontSize, [System.Drawing.FontStyle]::Bold)
    $textFormat = New-Object System.Drawing.StringFormat
    $textFormat.Alignment = [System.Drawing.StringAlignment]::Center
    $textFormat.LineAlignment = [System.Drawing.StringAlignment]::Center

    $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $g.DrawString("N", $font, $textBrush, $rectF, $textFormat)

    $outputPath = Join-Path $iconDir "icon$size.png"
    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Created: $outputPath"
}

Write-Host "All icons generated successfully!"
