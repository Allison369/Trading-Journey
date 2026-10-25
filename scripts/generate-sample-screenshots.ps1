# Draws the sample trade screenshots used by the local (offline) store.
#
# These are illustrations, not market data. Each one is a synthetic price path
# that starts at the sample trade's entry and ends at its exit, annotated the
# way a journal screenshot would be, and stamped SAMPLE so it can never be
# mistaken for the user's own chart.
#
#   apps/web/public/samples/eurusd-5m.png
#   apps/web/public/samples/gbpusd-15m.png
#   apps/web/public/samples/xauusd-1h.png
#   apps/web/public/samples/eurusd-daily-review.png
#   apps/web/public/samples/gbpusd-rule-break.png
#
# Usage: powershell -ExecutionPolicy Bypass -File scripts/generate-sample-screenshots.ps1
#
# ---------------------------------------------------------------------------
# THIS FILE MUST KEEP ITS UTF-8 BOM
#
# Windows PowerShell 5.1 reads a .ps1 as ANSI unless it starts with a UTF-8
# BOM. Without the BOM every non-ASCII byte is mangled, and the damage is
# silent: an em-dash can decode into a stray double quote, which ends the
# string literal and swallows the rest of the file (the script then appears to
# run "successfully" while quietly skipping every call after it), and a middle
# dot decodes into mojibake that ends up printed in the chart subtitle.
#
# If an editor strips the BOM, put it back:
#
#   node -e "const f=require('fs');const p='scripts/generate-sample-screenshots.ps1';const t=f.readFileSync(p,'utf8');f.writeFileSync(p,t.charCodeAt(0)===0xFEFF?t:'\uFEFF'+t,'utf8')"
# ---------------------------------------------------------------------------

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

# Fail loudly rather than silently mangling the output.
$selfBytes = [System.IO.File]::ReadAllBytes($PSCommandPath)
if ($selfBytes.Length -lt 3 -or $selfBytes[0] -ne 0xEF -or $selfBytes[1] -ne 0xBB -or $selfBytes[2] -ne 0xBF) {
    throw "This script has lost its UTF-8 BOM. Windows PowerShell would decode it as ANSI and corrupt the output. See the note at the top of the file."
}

$script:written = @{}

$repoRoot = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $repoRoot "apps\web\public\samples"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# --- palette ---------------------------------------------------------------
function C([int]$r, [int]$g, [int]$b, [int]$a = 255) {
    return [System.Drawing.Color]::FromArgb($a, $r, $g, $b)
}

$bg      = C 14 16 19
$panel   = C 20 23 28
$grid    = C 27 32 40
$axis    = C 111 120 133
$text    = C 230 232 236
$muted   = C 152 161 174
$up      = C 46 190 122
$down    = C 229 72 77
$entry   = C 110 139 255
$exit    = C 242 163 58
$stamp   = C 74 82 96

$W = 1280
$H = 800

$left = 40
$right = 1120          # price labels sit to the right of this
$top = 118
$bottom = 636
$volTop = 660
$volBottom = 720

function New-Font([string]$name, [single]$size, [bool]$bold = $false) {
    $style = if ($bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
    return New-Object System.Drawing.Font($name, $size, $style, [System.Drawing.GraphicsUnit]::Pixel)
}

function Draw-Text {
    param($g, [string]$value, [single]$x, [single]$y, [single]$size, $color, [bool]$bold = $false)
    $font = New-Font "Segoe UI" $size $bold
    $brush = New-Object System.Drawing.SolidBrush $color
    $g.DrawString($value, $font, $brush, $x, $y)
    $brush.Dispose()
    $font.Dispose()
}

function Draw-TextRight {
    param($g, [string]$value, [single]$rightX, [single]$y, [single]$size, $color, [bool]$bold = $false)
    $font = New-Font "Segoe UI" $size $bold
    $brush = New-Object System.Drawing.SolidBrush $color
    $width = $g.MeasureString($value, $font).Width
    $g.DrawString($value, $font, $brush, $rightX - $width, $y)
    $brush.Dispose()
    $font.Dispose()
}

# A synthetic OHLC series that begins at the sample entry and ends at the
# sample exit. A detrended random walk supplies the wiggle, so the annotations
# always line up with the candles.
function New-Bars {
    param(
        [int]$count,
        [int]$entryBar,
        [int]$exitBar,
        [double]$entryPrice,
        [double]$exitPrice,
        [double]$noise,
        [int]$seed
    )

    $random = New-Object System.Random $seed
    $walk = New-Object double[] $count
    $w = 0.0
    for ($i = 0; $i -lt $count; $i++) {
        $w += ((($random.NextDouble() - 0.5) * 2.0) * $noise)
        $walk[$i] = $w
    }

    # Pin the wiggle to zero at the entry and the exit, and keep it small
    # outside the trade, so the annotation dots sit exactly on the candles
    # that opened and closed the position.
    $anchors = @(0, $entryBar, $exitBar, ($count - 1))
    $anchored = New-Object double[] $count
    for ($i = 0; $i -lt $count; $i++) {
        $a = 0
        while ($a -lt $anchors.Count - 2 -and $i -gt $anchors[$a + 1]) { $a++ }
        $from = $anchors[$a]
        $to = $anchors[$a + 1]
        $span = [Math]::Max(1, $to - $from)
        $t = ($i - $from) / $span
        $line = $walk[$from] + ($walk[$to] - $walk[$from]) * $t
        $damped = if ($i -lt $entryBar -or $i -gt $exitBar) { 0.35 } else { 1.0 }
        $anchored[$i] = ($walk[$i] - $line) * $damped
    }

    $bars = New-Object System.Collections.ArrayList
    $previousClose = $null

    for ($i = 0; $i -lt $count; $i++) {
        if ($i -le $entryBar) {
            $base = $entryPrice
        } elseif ($i -le $exitBar) {
            $t = ($i - $entryBar) / ($exitBar - $entryBar)
            $base = $entryPrice + ($exitPrice - $entryPrice) * $t
        } else {
            $base = $exitPrice
        }

        $close = $base + $anchored[$i]

        if ($null -eq $previousClose) {
            $open = $close - ($random.NextDouble() - 0.5) * $noise * 1.4
        } else {
            $open = $previousClose
        }

        $wick = $noise * (0.5 + $random.NextDouble())
        $high = [Math]::Max($open, $close) + $wick * $random.NextDouble()
        $low = [Math]::Min($open, $close) - $wick * $random.NextDouble()

        [void]$bars.Add([pscustomobject]@{
            Open = $open; High = $high; Low = $low; Close = $close
            Volume = 0.18 + $random.NextDouble() * 0.82
        })

        $previousClose = $close
    }

    return $bars
}

function New-Chart {
    param(
        [string]$file,
        [string]$symbol,
        [string]$timeframe,
        [string]$market,
        [string]$entryTime,
        [string]$exitTime,
        [double]$entryPrice,
        [double]$exitPrice,
        [int]$digits,
        [double]$noise,
        [int]$seed,
        [string]$caption,
        [double]$changePct
    )

    $bmp = New-Object System.Drawing.Bitmap $W, $H
    $bmp.SetResolution(96, 96)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    $g.Clear($bg)

    $count = 90
    $entryBar = 15
    $exitBar = 75

    # Place the entry and exit at the times recorded on the sample trade, so
    # the axis tells the same story as the journal row.
    $entryDate = [datetime]::ParseExact($entryTime, "HH:mm", $null)
    $exitDate = [datetime]::ParseExact($exitTime, "HH:mm", $null)
    $barMinutes = ($exitDate - $entryDate).TotalMinutes / ($exitBar - $entryBar)
    $startDate = $entryDate.AddMinutes(-$entryBar * $barMinutes)

    $bars = New-Bars -count $count -entryBar $entryBar -exitBar $exitBar `
        -entryPrice $entryPrice -exitPrice $exitPrice -noise $noise -seed $seed

    # Price scale across the visible candles.
    $highs = $bars | ForEach-Object { $_.High }
    $lows = $bars | ForEach-Object { $_.Low }
    $max = ($highs | Measure-Object -Maximum).Maximum
    $min = ($lows | Measure-Object -Minimum).Minimum
    $pad = ($max - $min) * 0.10
    $max += $pad
    $min -= $pad

    $plotW = $right - $left
    $plotH = $bottom - $top
    $slot = $plotW / $count
    $bodyW = [Math]::Max(2.0, $slot * 0.62)

    function X([double]$index) { return $left + ($index + 0.5) * $slot }
    function Y([double]$price) {
        return $top + (($max - $price) / ($max - $min)) * $plotH
    }

    # --- header ------------------------------------------------------------
    Draw-Text $g $symbol $left 26 27 $text $true
    Draw-Text $g "$timeframe  ·  $market" $left 60 13 $muted

    $last = $bars[$count - 1].Close
    Draw-TextRight $g ("{0:N$digits}" -f $last) $right 28 24 $text $true
    $changeColor = if ($changePct -ge 0) { $up } else { $down }
    $arrow = if ($changePct -ge 0) { "+" } else { "" }
    Draw-TextRight $g ("$arrow{0:N2}%  today" -f $changePct) $right 60 13 $changeColor

    # --- grid + price axis --------------------------------------------------
    $gridPen = New-Object System.Drawing.Pen $grid, 1
    for ($i = 0; $i -le 5; $i++) {
        $price = $min + ($max - $min) * ($i / 5)
        $y = Y $price
        $g.DrawLine($gridPen, $left, $y, $right, $y)
        Draw-Text $g ("{0:N$digits}" -f $price) ($right + 12) ($y - 8) 11 $axis
    }
    $g.DrawLine($gridPen, $left, $top, $left, $volBottom)

    # Price axis line
    $axisPen = New-Object System.Drawing.Pen (C 40 46 56), 1
    $g.DrawLine($axisPen, $right, $top, $right, $volBottom)
    $axisPen.Dispose()

    # --- time axis ----------------------------------------------------------
    for ($i = 0; $i -le 6; $i++) {
        $index = [int]($i * ($count - 1) / 6)
        $x = X $index
        $t = $startDate.AddMinutes($index * $barMinutes)
        $label = $t.ToString("HH:mm")
        $font = New-Font "Segoe UI" 10.5
        $brush = New-Object System.Drawing.SolidBrush $axis
        $width = $g.MeasureString($label, $font).Width
        $g.DrawString($label, $font, $brush, $x - $width / 2, $volBottom + 10)
        $brush.Dispose()
        $font.Dispose()
    }

    # --- candles ------------------------------------------------------------
    $upBrush = New-Object System.Drawing.SolidBrush $up
    $downBrush = New-Object System.Drawing.SolidBrush $down
    $upPen = New-Object System.Drawing.Pen $up, 1.2
    $downPen = New-Object System.Drawing.Pen $down, 1.2
    $volUp = New-Object System.Drawing.SolidBrush (C 46 190 122 70)
    $volDown = New-Object System.Drawing.SolidBrush (C 229 72 77 70)

    for ($i = 0; $i -lt $count; $i++) {
        $bar = $bars[$i]
        $x = X $i
        $isUp = $bar.Close -ge $bar.Open
        $pen = if ($isUp) { $upPen } else { $downPen }
        $brush = if ($isUp) { $upBrush } else { $downBrush }

        $g.DrawLine($pen, $x, (Y $bar.High), $x, (Y $bar.Low))

        $openY = Y $bar.Open
        $closeY = Y $bar.Close
        $topY = [Math]::Min($openY, $closeY)
        $height = [Math]::Max(1.4, [Math]::Abs($closeY - $openY))
        $g.FillRectangle($brush, [single]($x - $bodyW / 2), [single]$topY, [single]$bodyW, [single]$height)

        $vHeight = ($volBottom - $volTop) * $bar.Volume
        $vBrush = if ($isUp) { $volUp } else { $volDown }
        $g.FillRectangle($vBrush, [single]($x - $bodyW / 2), [single]($volBottom - $vHeight), [single]$bodyW, [single]$vHeight)
    }

    $upBrush.Dispose(); $downBrush.Dispose(); $upPen.Dispose(); $downPen.Dispose()
    $volUp.Dispose(); $volDown.Dispose()

    # --- trade annotation ---------------------------------------------------
    $entryY = Y $entryPrice
    $exitY = Y $exitPrice
    $entryX = X $entryBar
    $exitX = X $exitBar
    $profit = $exitPrice -ge $entryPrice

    $zoneColor = if ($profit) { C 46 190 122 26 } else { C 229 72 77 26 }
    $zoneBrush = New-Object System.Drawing.SolidBrush $zoneColor
    $zoneTop = [Math]::Min($entryY, $exitY)
    $zoneHeight = [Math]::Max(2.0, [Math]::Abs($entryY - $exitY))
    $g.FillRectangle($zoneBrush, [single]$entryX, [single]$zoneTop, [single]($exitX - $entryX), [single]$zoneHeight)
    $zoneBrush.Dispose()

    $dash = [System.Drawing.Drawing2D.DashStyle]::Dash
    $entryPen = New-Object System.Drawing.Pen $entry, 1.6
    $entryPen.DashStyle = $dash
    $g.DrawLine($entryPen, $entryX, $entryY, $right, $entryY)
    $entryPen.Dispose()

    $exitPen = New-Object System.Drawing.Pen $exit, 1.6
    $exitPen.DashStyle = $dash
    $g.DrawLine($exitPen, $exitX, $exitY, $right, $exitY)
    $exitPen.Dispose()

    # Entry / exit markers on the price line.
    $entryBrush = New-Object System.Drawing.SolidBrush $entry
    $exitBrush = New-Object System.Drawing.SolidBrush $exit
    $g.FillEllipse($entryBrush, [single]($entryX - 4), [single]($entryY - 4), 8, 8)
    $g.FillEllipse($exitBrush, [single]($exitX - 4), [single]($exitY - 4), 8, 8)
    $entryBrush.Dispose(); $exitBrush.Dispose()

    # Labels sit inside the plot, at the right edge.
    $labelBg = New-Object System.Drawing.SolidBrush (C 20 23 28 235)
    $entryText = "ENTRY  {0:N$digits}" -f $entryPrice
    $exitText = "EXIT   {0:N$digits}" -f $exitPrice
    $entryFont = New-Font "Segoe UI" 11 $true
    $entryW = $g.MeasureString($entryText, $entryFont).Width
    $entryH = $g.MeasureString($entryText, $entryFont).Height
    $entryFont.Dispose()

    $entryBoxX = $right - $entryW - 20
    $entryBoxY = $entryY - $entryH - 12
    if ($entryBoxY -lt $top + 4) { $entryBoxY = $entryY + 10 }
    $g.FillRectangle($labelBg, [single]$entryBoxX, [single]$entryBoxY, [single]($entryW + 10), [single]$entryH)
    Draw-Text $g $entryText ($entryBoxX + 5) $entryBoxY 11 $entry $true

    $exitBoxY = $exitY + 10
    if ($exitBoxY -gt $bottom - 24) { $exitBoxY = $exitY - $entryH - 12 }
    $g.FillRectangle($labelBg, [single]$entryBoxX, [single]$exitBoxY, [single]($entryW + 10), [single]$entryH)
    Draw-Text $g $exitText ($entryBoxX + 5) $exitBoxY 11 $exit $true
    $labelBg.Dispose()

    # --- footer -------------------------------------------------------------
    $footerPen = New-Object System.Drawing.Pen $grid, 1
    $g.DrawLine($footerPen, $left, $volTop - 8, $right, $volTop - 8)
    $footerPen.Dispose()

    Draw-Text $g $caption $left 754 12 $muted
    Draw-TextRight $g "SAMPLE SCREENSHOT" $right 754 10 $stamp

    # --- save ---------------------------------------------------------------
    $g.Dispose()
    $path = Join-Path $outDir $file
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()

    $size = (Get-Item $path).Length
    $script:written[$file] = $size
    "wrote {0}  ({1:N0} bytes)" -f $file, $size
}

# A review chart: the same visual language as the trade screenshots, but with
# horizontal levels marked instead of a single entry/exit pair. This is what a
# journal image usually is -- a weekly chart with the levels you were watching,
# or the range you broke a rule inside.
function New-ReviewChart {
    param(
        [string]$file,
        [string]$symbol,
        [string]$timeframe,
        [string]$market,
        [string]$fromTime,
        [int]$barMinutes,
        [double]$startPrice,
        [double]$drift,
        [double]$noise,
        [int]$seed,
        [string]$caption,
        [double]$changePct,
        [double[]]$levelPrices,
        [string[]]$levelLabels,
        [string[]]$levelColors
    )

    # Three parallel arrays rather than one delimited string: PowerShell
    # consumes "|" and "/" before an argument is ever bound, so neither can
    # appear inside an inline value.
    $levels = @()
    for ($li = 0; $li -lt $levelPrices.Count; $li++) {
        $levels += [pscustomobject]@{
            Price  = $levelPrices[$li]
            Label  = $levelLabels[$li]
            Colour = $levelColors[$li]
        }
    }

    $bmp = New-Object System.Drawing.Bitmap $W, $H
    $bmp.SetResolution(96, 96)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    $g.Clear($bg)

    $count = 110
    $random = New-Object System.Random $seed
    $bars = New-Object System.Collections.ArrayList
    $price = $startPrice
    $previousClose = $null

    for ($i = 0; $i -lt $count; $i++) {
        # A gentle drift with a couple of swings, so a weekly chart looks like a
        # week rather than a straight line.
        $swing = [Math]::Sin($i / 11.0) * $noise * 3.2
        $close = $startPrice + $drift * $i + $swing + ($random.NextDouble() - 0.5) * $noise
        $open = if ($null -eq $previousClose) { $close - ($random.NextDouble() - 0.5) * $noise } else { $previousClose }
        $wick = $noise * (0.6 + $random.NextDouble() * 1.4)
        $high = [Math]::Max($open, $close) + $wick * $random.NextDouble()
        $low = [Math]::Min($open, $close) - $wick * $random.NextDouble()

        [void]$bars.Add([pscustomobject]@{
            Open = $open; High = $high; Low = $low; Close = $close
            Volume = 0.18 + $random.NextDouble() * 0.82
        })
        $previousClose = $close
    }

    $digits = if ($startPrice -gt 500) { 2 } else { 5 }

    $highs = $bars | ForEach-Object { $_.High }
    $lows = $bars | ForEach-Object { $_.Low }
    $max = ($highs | Measure-Object -Maximum).Maximum
    $min = ($lows | Measure-Object -Minimum).Minimum
    $pad = ($max - $min) * 0.10
    $max += $pad
    $min -= $pad

    $plotW = $right - $left
    $plotH = $bottom - $top
    $slot = $plotW / $count
    $bodyW = [Math]::Max(2.0, $slot * 0.62)

    function RX([double]$index) { return $left + ($index + 0.5) * $slot }
    function RY([double]$price) {
        return $top + (($max - $price) / ($max - $min)) * $plotH
    }

    Draw-Text $g $symbol $left 26 27 $text $true
    Draw-Text $g "$timeframe  ·  $market" $left 60 13 $muted

    $last = $bars[$count - 1].Close
    Draw-TextRight $g ("{0:N$digits}" -f $last) $right 28 24 $text $true
    $changeColor = if ($changePct -ge 0) { $up } else { $down }
    $arrow = if ($changePct -ge 0) { "+" } else { "" }
    Draw-TextRight $g ("$arrow{0:N2}%  today" -f $changePct) $right 60 13 $changeColor

    $gridPen = New-Object System.Drawing.Pen $grid, 1
    for ($i = 0; $i -le 5; $i++) {
        $level = $min + ($max - $min) * ($i / 5)
        $y = RY $level
        $g.DrawLine($gridPen, $left, $y, $right, $y)
        Draw-Text $g ("{0:N$digits}" -f $level) ($right + 12) ($y - 8) 11 $axis
    }
    $g.DrawLine($gridPen, $left, $top, $left, $volBottom)

    $axisPen = New-Object System.Drawing.Pen (C 40 46 56), 1
    $g.DrawLine($axisPen, $right, $top, $right, $volBottom)
    $axisPen.Dispose()

    $axisDate = [datetime]::ParseExact($fromTime, "HH:mm", $null)
    for ($i = 0; $i -le 6; $i++) {
        $index = [int]($i * ($count - 1) / 6)
        $x = RX $index
        $t = $axisDate.AddMinutes($index * $barMinutes)
        # A weekly chart spans days, so label the day once it rolls over.
        $label = if ($barMinutes -ge 60) { $t.ToString("ddd HH:mm") } else { $t.ToString("HH:mm") }
        $font = New-Font "Segoe UI" 10.5
        $brush = New-Object System.Drawing.SolidBrush $axis
        $width = $g.MeasureString($label, $font).Width
        $g.DrawString($label, $font, $brush, $x - $width / 2, $volBottom + 10)
        $brush.Dispose()
        $font.Dispose()
    }

    $upBrush = New-Object System.Drawing.SolidBrush $up
    $downBrush = New-Object System.Drawing.SolidBrush $down
    $upPen = New-Object System.Drawing.Pen $up, 1.2
    $downPen = New-Object System.Drawing.Pen $down, 1.2
    $volUp = New-Object System.Drawing.SolidBrush (C 46 190 122 70)
    $volDown = New-Object System.Drawing.SolidBrush (C 229 72 77 70)

    for ($i = 0; $i -lt $count; $i++) {
        $bar = $bars[$i]
        $x = RX $i
        $isUp = $bar.Close -ge $bar.Open
        $pen = if ($isUp) { $upPen } else { $downPen }
        $brush = if ($isUp) { $upBrush } else { $downBrush }

        $g.DrawLine($pen, $x, (RY $bar.High), $x, (RY $bar.Low))
        $openY = RY $bar.Open
        $closeY = RY $bar.Close
        $topY = [Math]::Min($openY, $closeY)
        $height = [Math]::Max(1.4, [Math]::Abs($closeY - $openY))
        $g.FillRectangle($brush, [single]($x - $bodyW / 2), [single]$topY, [single]$bodyW, [single]$height)

        $vHeight = ($volBottom - $volTop) * $bar.Volume
        $vBrush = if ($isUp) { $volUp } else { $volDown }
        $g.FillRectangle($vBrush, [single]($x - $bodyW / 2), [single]($volBottom - $vHeight), [single]$bodyW, [single]$vHeight)
    }

    $upBrush.Dispose(); $downBrush.Dispose(); $upPen.Dispose(); $downPen.Dispose()
    $volUp.Dispose(); $volDown.Dispose()

    # --- marked levels ------------------------------------------------------
    # Each entry is "price|label|colour", where colour is up, down, entry or exit.
    $palette = @{ up = $up; down = $down; entry = $entry; exit = $exit }
    $usedTop = $top + 6
    $usedBottom = $bottom - 26

    foreach ($level in $levels) {
        $price = $level.Price
        $label = $level.Label
        $colour = $palette[$level.Colour]
        $y = RY $price
        if ($y -lt $top - 2 -or $y -gt $bottom + 2) { continue }

        $pen = New-Object System.Drawing.Pen $colour, 1.5
        $pen.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash
        $g.DrawLine($pen, $left, $y, $right, $y)
        $pen.Dispose()

        $text = "{0}  {1:N$digits}" -f $label, $price
        $font = New-Font "Segoe UI" 11 $true
        $w = $g.MeasureString($text, $font).Width
        $h = $g.MeasureString($text, $font).Height
        $font.Dispose()

        $boxX = $left + 10
        $boxY = $y - $h - 8
        # Nudge labels away from each other and away from the plot edges.
        if ($boxY -lt $usedTop) { $boxY = $y + 8 }
        if ($boxY -lt $usedTop) { $boxY = $usedTop }
        if ($boxY + $h -gt $usedBottom) { $boxY = $usedBottom - $h }
        $usedTop = $boxY + $h + 3

        $bgBrush = New-Object System.Drawing.SolidBrush (C 20 23 28 235)
        $g.FillRectangle($bgBrush, [single]($boxX - 4), [single]$boxY, [single]($w + 10), [single]$h)
        $bgBrush.Dispose()
        Draw-Text $g $text ($boxX + 1) $boxY 11 $colour $true
    }

    $footerPen = New-Object System.Drawing.Pen $grid, 1
    $g.DrawLine($footerPen, $left, $volTop - 8, $right, $volTop - 8)
    $footerPen.Dispose()

    Draw-Text $g $caption $left 754 12 $muted
    Draw-TextRight $g "SAMPLE SCREENSHOT" $right 754 10 $stamp

    $g.Dispose()
    $path = Join-Path $outDir $file
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()

    $size = (Get-Item $path).Length
    $script:written[$file] = $size
    "wrote {0}  ({1:N0} bytes)" -f $file, $size
}

# T1 — EURUSD long, entry 1.08500 at 08:05, exit 1.09120 at 14:20.
New-Chart -file "eurusd-5m.png" -symbol "EURUSD" -timeframe "5m" -market "Forex" `
    -entryTime "08:05" -exitTime "14:20" `
    -entryPrice 1.08500 -exitPrice 1.09120 -digits 5 -noise 0.00028 -seed 11 `
    -caption "Entry on the retest of the London high; stop under the swing low." `
    -changePct 0.42

# T2 — GBPUSD long that failed, entry 1.26400 at 08:10, exit 1.26050 at 09:05.
New-Chart -file "gbpusd-15m.png" -symbol "GBPUSD" -timeframe "1m" -market "Forex" `
    -entryTime "08:10" -exitTime "09:05" `
    -entryPrice 1.26400 -exitPrice 1.26050 -digits 5 -noise 0.00034 -seed 22 `
    -caption "Breakout that did not follow through; cut when the level was lost." `
    -changePct -0.28

# T3 — XAUUSD short, entry 2035.50 at 14:00, exit 2026.00 at 18:30.
New-Chart -file "xauusd-1h.png" -symbol "XAUUSD" -timeframe "5m" -market "Metals" `
    -entryTime "14:00" -exitTime "18:30" `
    -entryPrice 2035.50 -exitPrice 2026.00 -digits 2 -noise 0.85 -seed 33 `
    -caption "Rejected at the session high; trailed the stop under each lower high." `
    -changePct -0.46

# --- journal images -------------------------------------------------------
# These belong to journal entries, not trades, so they carry levels instead of
# an entry/exit pair: what a review screenshot actually looks like.

# 2 Feb daily entry -- the "Range break, clean execution" day. The Asian range
# and the London high are the two levels the entry note names.
New-ReviewChart -file "eurusd-daily-review.png" -symbol "EURUSD" -timeframe "15m" -market "Forex" `
    -fromTime "07:00" -barMinutes 15 `
    -startPrice 1.08220 -drift 0.000075 -noise 0.00030 -seed 101 `
    -caption "2 Feb — Asian range marked at 07:30, break held above the London high." `
    -changePct 0.64 `
    -levelPrices @(1.08150, 1.08340, 1.08580) `
    -levelLabels @("ASIAN LOW", "ASIAN HIGH", "LONDON HIGH") `
    -levelColors @("entry", "exit", "up")

# 3 Feb daily entry -- the "Chased an entry" day. The range high that failed is
# the level the mistake note refers to.
New-ReviewChart -file "gbpusd-rule-break.png" -symbol "GBPUSD" -timeframe "5m" -market "Forex" `
    -fromTime "07:30" -barMinutes 5 `
    -startPrice 1.26480 -drift -0.000060 -noise 0.00026 -seed 202 `
    -caption "3 Feb — entered before the candle closed; the range high failed to hold." `
    -changePct -0.35 `
    -levelPrices @(1.26620, 1.26300) `
    -levelLabels @("RANGE HIGH", "PLANNED ENTRY") `
    -levelColors @("down", "entry")

# --- size manifest ---------------------------------------------------------
# The sample rows quote the real size of each image, so the gallery can show
# "31 KB - PNG" without anyone having to remember to update a number by hand.
# This file is generated; edit the generator, not the manifest.

$manifestPath = Join-Path $repoRoot "apps\web\src\lib\sampleImageSizes.json"
$manifest = [ordered]@{}
foreach ($name in ($script:written.Keys | Sort-Object)) {
    $manifest[$name] = $script:written[$name]
}

$json = ($manifest | ConvertTo-Json -Depth 4)
# Write it with a BOM too, so the file is unambiguous wherever it is read.
$utf8Bom = New-Object System.Text.UTF8Encoding $true
[System.IO.File]::WriteAllText($manifestPath, $json + "`n", $utf8Bom)

"wrote sampleImageSizes.json ({0} images)" -f $manifest.Count
