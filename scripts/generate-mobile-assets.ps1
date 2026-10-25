# Generates the mobile app's brand images from the traced logo mark.
#
# The mark itself is traced from the supplied logo by scripts/trace-mark.mjs,
# which writes apps/mobile/assets/brand-mark-points.json. Nothing here eyeballs
# the shape: the tile, corner radius and cut-out glyph all come from that file.
#
#   apps/mobile/assets/icon.png            1024x1024  launcher icon (cream + ink tile)
#   apps/mobile/assets/adaptive-icon.png   1024x1024  Android adaptive foreground (transparent)
#   apps/mobile/assets/splash-icon.png     1024x1024  splash mark + wordmark (transparent)
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/generate-mobile-assets.ps1

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $repoRoot "apps\mobile\assets"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# --- tokens, sampled from the supplied logo --------------------------------
$cream = [System.Drawing.Color]::FromArgb(255, 250, 251, 248)  # #FAFBF8
$ink = [System.Drawing.Color]::FromArgb(255, 20, 20, 18)       # #141412

$sans = "Segoe UI"
$sansSemi = "Segoe UI Semibold"

# --- the traced mark -------------------------------------------------------

$spec = Get-Content (Join-Path $outDir "brand-mark-points.json") -Raw | ConvertFrom-Json
$unit = [single]$spec.size
$radius = [single]$spec.radius
$loops = @($spec.loops)

function New-Bitmap {
    param([int]$size, [bool]$background)
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $bmp.SetResolution(144, 144)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
    if ($background) {
        $g.Clear($cream)
    } else {
        $g.Clear([System.Drawing.Color]::Transparent)
    }
    return @{ Bitmap = $bmp; Graphics = $g }
}

# The mark path: rounded tile with the traced glyph punched out. Filling with
# FillMode.Alternate leaves the glyph transparent, so whatever sits behind the
# PNG (cream icon background, adaptive background layer, splash background)
# shows through the cut-out.
function New-MarkPath {
    param([single]$size, [single]$ox, [single]$oy)

    $scale = $size / $unit
    $r = $radius * $scale
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.FillMode = [System.Drawing.Drawing2D.FillMode]::Alternate

    $path.AddArc($ox, $oy, 2 * $r, 2 * $r, 180, 90)
    $path.AddArc($ox + $size - 2 * $r, $oy, 2 * $r, 2 * $r, 270, 90)
    $path.AddArc($ox + $size - 2 * $r, $oy + $size - 2 * $r, 2 * $r, 2 * $r, 0, 90)
    $path.AddArc($ox, $oy + $size - 2 * $r, 2 * $r, 2 * $r, 90, 90)
    $path.CloseFigure()

    foreach ($loop in $loops) {
        $points = New-Object System.Drawing.PointF[] $loop.Count
        for ($i = 0; $i -lt $loop.Count; $i++) {
            $points[$i] = New-Object System.Drawing.PointF(
                [single]($ox + [single]$loop[$i][0] * $scale),
                [single]($oy + [single]$loop[$i][1] * $scale)
            )
        }
        $path.AddPolygon($points)
    }

    return $path
}

function Draw-Mark {
    param($g, [single]$size, [single]$cx, [single]$cy)
    $path = New-MarkPath $size ($cx - $size / 2) ($cy - $size / 2)
    $brush = New-Object System.Drawing.SolidBrush $ink
    $g.FillPath($brush, $path)
    $brush.Dispose()
    $path.Dispose()
}

# Letter-spaced text, drawn glyph by glyph (System.Drawing has no tracking).
function Draw-TrackedText {
    param($g, [string]$text, $font, $brush, [single]$centerX, [single]$top, [single]$tracking)
    $widths = @()
    $total = 0.0
    foreach ($ch in $text.ToCharArray()) {
        $s = [string]$ch
        $w = $g.MeasureString($s, $font).Width
        $widths += $w
        $total += $w + $tracking
    }
    $total -= $tracking
    $x = $centerX - $total / 2
    for ($i = 0; $i -lt $text.Length; $i++) {
        $g.DrawString([string]$text[$i], $font, $brush, $x, $top)
        $x += $widths[$i] + $tracking
    }
    return $total
}

# --- launcher icon ---------------------------------------------------------
# Cream field with the ink tile at 62.5%; the launcher supplies its own mask.
$icon = New-Bitmap 1024 $true
Draw-Mark $icon.Graphics 640 512 512
$icon.Bitmap.Save((Join-Path $outDir "icon.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$icon.Graphics.Dispose(); $icon.Bitmap.Dispose()

# --- adaptive icon foreground ---------------------------------------------
# 58.6% keeps the tile inside the 66% safe zone Android guarantees.
$fg = New-Bitmap 1024 $false
Draw-Mark $fg.Graphics 600 512 512
$fg.Bitmap.Save((Join-Path $outDir "adaptive-icon.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$fg.Graphics.Dispose(); $fg.Bitmap.Dispose()

# --- splash screen ---------------------------------------------------------
# Android 12 draws the splash icon inside a circle that only guarantees the
# central 66.7% of the image (288 dp icon, 192 dp safe zone). Everything below
# stays inside that circle's 341 px radius from (512, 512), so the wordmark is
# never cropped. On older Android the same file is shown whole at
# splash.imageWidth, which is why it is composed as one lockup.
$splash = New-Bitmap 1024 $false
Draw-Mark $splash.Graphics 210 512 356

$brush = New-Object System.Drawing.SolidBrush $ink
$font = New-Object System.Drawing.Font($sansSemi, 78, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
Draw-TrackedText $splash.Graphics "TradeVault" $font $brush 512 546 -1.4 | Out-Null
$font.Dispose()

$captionFont = New-Object System.Drawing.Font($sans, 23, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$captionBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(150, 20, 20, 18))
Draw-TrackedText $splash.Graphics "TRADING JOURNAL" $captionFont $captionBrush 512 668 6.2 | Out-Null
$captionBrush.Dispose(); $captionFont.Dispose(); $brush.Dispose()

$splash.Bitmap.Save((Join-Path $outDir "splash-icon.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$splash.Graphics.Dispose(); $splash.Bitmap.Dispose()

Get-ChildItem $outDir -Filter *.png | ForEach-Object {
    "wrote {0}  ({1:N0} bytes)" -f $_.Name, $_.Length
}
