# Builds brand-preview.html: the launcher icon, adaptive icon and splash screen
# rendered inside phone frames, with the source PNGs inlined as data URIs so the
# file can be opened from anywhere.
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/generate-brand-preview.ps1

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$assetDir = Join-Path $repoRoot "apps\mobile\assets"
$outFile = Join-Path $repoRoot "brand-preview.html"

function Get-DataUri {
    param([string]$path)
    $bytes = [System.IO.File]::ReadAllBytes($path)
    return "data:image/png;base64," + [Convert]::ToBase64String($bytes)
}

$icon = Get-DataUri (Join-Path $assetDir "icon.png")
$adaptive = Get-DataUri (Join-Path $assetDir "adaptive-icon.png")
$splash = Get-DataUri (Join-Path $assetDir "splash-icon.png")

$iconKb = [math]::Round((Get-Item (Join-Path $assetDir "icon.png")).Length / 1KB)
$adaptiveKb = [math]::Round((Get-Item (Join-Path $assetDir "adaptive-icon.png")).Length / 1KB)
$splashKb = [math]::Round((Get-Item (Join-Path $assetDir "splash-icon.png")).Length / 1KB)

$html = @'
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>TradeVault — icon &amp; splash</title>
<style>
  :root {
    --bg: #0a0a0a;
    --panel: #111112;
    --line: #232324;
    --text: #f2f2f0;
    --muted: #8b8b88;
    --pearl: #f8f8f8;
    --silver: #9a9ea2;
    font-synthesis: none;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: radial-gradient(120% 70% at 50% -10%, #17171a 0%, var(--bg) 55%);
    color: var(--text);
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    -webkit-font-smoothing: antialiased;
    padding: 48px 32px 72px;
  }
  header { max-width: 1180px; margin: 0 auto 44px; }
  .eyebrow {
    font-size: 11px; letter-spacing: .22em; text-transform: uppercase;
    color: var(--muted); margin: 0 0 14px;
  }
  h1 { font-size: 34px; font-weight: 300; letter-spacing: -.01em; margin: 0 0 12px; }
  h1 strong { font-weight: 600; }
  header p { color: var(--muted); max-width: 640px; line-height: 1.6; font-size: 14px; margin: 0; }
  .row {
    display: flex; flex-wrap: wrap; gap: 44px; justify-content: center;
    max-width: 1180px; margin: 0 auto; align-items: flex-start;
  }
  figure { margin: 0; }
  figcaption {
    margin-top: 18px; text-align: center; font-size: 12px;
    letter-spacing: .14em; text-transform: uppercase; color: var(--muted);
  }
  figcaption b { display: block; color: var(--text); font-weight: 500; letter-spacing: .04em;
    text-transform: none; font-size: 14px; margin-bottom: 4px; }

  /* --- phone --- */
  .phone {
    width: 318px; height: 660px; border-radius: 52px; padding: 10px;
    background: linear-gradient(160deg, #2a2a2d, #101012 45%, #26262a);
    box-shadow: 0 40px 90px -30px #000, 0 0 0 1px #000 inset;
    position: relative;
  }
  .screen {
    width: 100%; height: 100%; border-radius: 43px; overflow: hidden;
    background: #000; position: relative; display: flex; flex-direction: column;
  }
  .statusbar {
    display: flex; justify-content: space-between; align-items: center;
    padding: 12px 22px 0; font-size: 11px; color: #dcdcdc; letter-spacing: .04em;
  }
  .statusbar .right { display: flex; gap: 5px; }
  .statusbar i { display: block; width: 12px; height: 8px; border-radius: 2px; background: #bdbdbd; opacity: .8; }

  /* --- home screen --- */
  .home { padding: 26px 20px; flex: 1; }
  .clock { text-align: center; color: #e9e9e9; font-weight: 300; }
  .clock .time { font-size: 46px; letter-spacing: -.03em; line-height: 1; }
  .clock .date { font-size: 11px; color: #9d9d9d; letter-spacing: .16em; text-transform: uppercase; margin-top: 8px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px 16px; margin-top: 46px; }
  .app { text-align: center; }
  .tile {
    width: 54px; height: 54px; margin: 0 auto 8px; border-radius: 15px;
    background: linear-gradient(150deg, #1e1e21, #121214);
    border: 1px solid #2a2a2d;
  }
  .app span { font-size: 9.5px; color: #c9c9c9; letter-spacing: .01em; }
  .tile.real { border: 0; padding: 0; overflow: hidden; }
  .tile.real img { width: 100%; height: 100%; display: block; }
  .dock {
    margin: 22px 14px 14px; padding: 12px 16px; border-radius: 30px;
    background: rgba(255,255,255,.07); backdrop-filter: blur(12px);
    display: flex; justify-content: space-between;
  }
  .dock .tile { width: 46px; height: 46px; border-radius: 13px; margin: 0; }

  /* --- splash --- */
  .splash {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    background: #000; padding-bottom: 40px;
  }
  .splash img { width: 228px; height: 228px; display: block; }
  .splash .hint { position: absolute; bottom: 26px; font-size: 9.5px; letter-spacing: .2em;
    text-transform: uppercase; color: #3c3c3c; }

  /* --- masks --- */
  .masks { width: 318px; }
  .card {
    background: var(--panel); border: 1px solid var(--line); border-radius: 20px;
    padding: 22px; margin-bottom: 16px;
  }
  .card h2 { font-size: 11px; letter-spacing: .18em; text-transform: uppercase;
    color: var(--muted); font-weight: 500; margin: 0 0 18px; }
  .shapes { display: flex; gap: 22px; align-items: flex-end; }
  .shape { text-align: center; }
  .shape .box { width: 84px; height: 84px; overflow: hidden; background: #000; }
  .shape .box img { width: 100%; height: 100%; }
  .circle { border-radius: 50%; }
  .squircle { border-radius: 26%; }
  .round { border-radius: 18px; }
  .shape small { display: block; margin-top: 10px; font-size: 10px; color: var(--muted); }
  .sizes { display: flex; gap: 20px; align-items: flex-end; }
  .sizes img { display: block; background: #000; }
  .sizes .s48 { width: 48px; height: 48px; border-radius: 12px; }
  .sizes .s72 { width: 72px; height: 72px; border-radius: 18px; }
  .sizes .s96 { width: 96px; height: 96px; border-radius: 24px; }
  .tokens { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px 18px; }
  .token { display: flex; align-items: center; gap: 10px; font-size: 11px; color: var(--muted); }
  .swatch { width: 26px; height: 26px; border-radius: 8px; border: 1px solid #2b2b2e; flex: none; }
  .token code { color: var(--text); font-size: 11px; letter-spacing: .02em; }
  footer { max-width: 1180px; margin: 54px auto 0; color: var(--muted); font-size: 12px; line-height: 1.7; }
  footer code { color: #cfcfcd; }
</style>
</head>
<body>
  <header>
    <p class="eyebrow">TradeVault · Android brand assets</p>
    <h1>Icon &amp; <strong>splash</strong></h1>
    <p>Black canvas, a silver pearl vault dial with a soft halo, thin light type.
       Everything below is the real PNG set that will be compiled into the APK —
       no mock drawings.</p>
  </header>

  <div class="row">
    <figure>
      <div class="phone">
        <div class="screen">
          <div class="statusbar"><span>9:41</span><span class="right"><i></i><i></i><i></i></span></div>
          <div class="home">
            <div class="clock">
              <div class="time">9:41</div>
              <div class="date">Tuesday, October 22</div>
            </div>
            <div class="grid">
              <div class="app"><div class="tile"></div><span>Notes</span></div>
              <div class="app"><div class="tile"></div><span>Bank</span></div>
              <div class="app"><div class="tile"></div><span>Mail</span></div>
              <div class="app"><div class="tile"></div><span>Calc</span></div>
              <div class="app"><div class="tile real"><img src="__ICON__" alt="" /></div><span>TradeVault</span></div>
              <div class="app"><div class="tile"></div><span>Charts</span></div>
              <div class="app"><div class="tile"></div><span>Files</span></div>
              <div class="app"><div class="tile"></div><span>News</span></div>
            </div>
          </div>
          <div class="dock">
            <div class="tile"></div><div class="tile"></div><div class="tile"></div><div class="tile"></div>
          </div>
        </div>
      </div>
      <figcaption><b>Launcher</b>home screen, 54 dp</figcaption>
    </figure>

    <figure>
      <div class="phone">
        <div class="screen">
          <div class="statusbar" style="position:absolute;left:0;right:0;top:0;z-index:2">
            <span>9:41</span><span class="right"><i></i><i></i><i></i></span>
          </div>
          <div class="splash">
            <img src="__SPLASH__" alt="TradeVault" />
            <span class="hint">loading</span>
          </div>
        </div>
      </div>
      <figcaption><b>Splash</b>black, 240 dp lockup</figcaption>
    </figure>

    <div class="masks">
      <div class="card">
        <h2>Adaptive icon · mask safe</h2>
        <div class="shapes">
          <div class="shape">
            <div class="box circle"><img src="__ADAPTIVE__" alt="" /></div>
            <small>circle</small>
          </div>
          <div class="shape">
            <div class="box squircle"><img src="__ADAPTIVE__" alt="" /></div>
            <small>squircle</small>
          </div>
          <div class="shape">
            <div class="box round"><img src="__ADAPTIVE__" alt="" /></div>
            <small>rounded</small>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>Android 12 splash · circle safe</h2>
        <div class="shapes">
          <div class="shape">
            <div class="box circle" style="width:132px;height:132px">
              <img src="__SPLASH__" alt="" style="width:100%;height:100%" />
            </div>
            <small>192 / 288 dp</small>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>Legibility</h2>
        <div class="sizes">
          <img class="s96" src="__ICON__" alt="" />
          <img class="s72" src="__ICON__" alt="" />
          <img class="s48" src="__ICON__" alt="" />
        </div>
      </div>

      <div class="card">
        <h2>Palette, sampled from the reference</h2>
        <div class="tokens">
          <div class="token"><span class="swatch" style="background:#000000"></span><code>#000000</code> canvas</div>
          <div class="token"><span class="swatch" style="background:#f8f8f8"></span><code>#F8F8F8</code> pearl</div>
          <div class="token"><span class="swatch" style="background:#9a9ea2"></span><code>#9A9EA2</code> silver</div>
          <div class="token"><span class="swatch" style="background:#60656a"></span><code>#60656A</code> steel</div>
          <div class="token"><span class="swatch" style="background:#b8b8b8"></span><code>#B8B8B8</code> text dim</div>
          <div class="token"><span class="swatch" style="background:#232324"></span><code>#232324</code> line</div>
        </div>
      </div>
    </div>
  </div>

  <footer>
    Assets: <code>apps/mobile/assets/icon.png</code> (__ICONKB__ KB, 1024²),
    <code>adaptive-icon.png</code> (__ADAPTIVEKB__ KB, 1024², transparent),
    <code>splash-icon.png</code> (__SPLASHKB__ KB, 1024², transparent).
    Regenerate with <code>scripts/generate-mobile-assets.ps1</code>; this page with
    <code>scripts/generate-brand-preview.ps1</code>.
  </footer>
</body>
</html>
'@

$html = $html.Replace("__ICON__", $icon).
    Replace("__ADAPTIVE__", $adaptive).
    Replace("__SPLASH__", $splash).
    Replace("__ICONKB__", "$iconKb").
    Replace("__ADAPTIVEKB__", "$adaptiveKb").
    Replace("__SPLASHKB__", "$splashKb")

[System.IO.File]::WriteAllText($outFile, $html, (New-Object System.Text.UTF8Encoding($false)))
"wrote $outFile ({0:N0} KB)" -f ((Get-Item $outFile).Length / 1KB)
