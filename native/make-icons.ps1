# Rebuild the fixed product artwork. Company/report artwork is user content.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot
$web = Join-Path $root 'public/product-icons'
$windows = Join-Path $PSScriptRoot 'windows'
New-Item -ItemType Directory -Force $web,$windows | Out-Null

function Brush($hex) { [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml($hex)) }
function Polygon($canvas,$brush,[int[]]$coords) {
  $points = for ($i=0; $i -lt $coords.Length; $i+=2) { [Drawing.Point]::new($coords[$i],$coords[$i+1]) }
  $canvas.FillPolygon($brush,[Drawing.Point[]]$points)
}
$navy=Brush '#142857'
$blue=Brush '#254989'
$cream=Brush '#fff4d7'
$red=Brush '#ce353c'
$gold=Brush '#efbe62'
function Render-Badge($kind,$size) {
  $image=[Drawing.Bitmap]::new($size,$size)
  $g=[Drawing.Graphics]::FromImage($image)
  $g.SmoothingMode='AntiAlias'
  $g.ScaleTransform($size/512.0,$size/512.0)
  $g.Clear($navy.Color)
  $g.FillEllipse($gold,64,64,384,384)
  $g.FillEllipse($cream,73,73,366,366)
  $g.FillEllipse($blue,86,86,340,340)
  if ($kind -eq 'home') {
    Polygon $g $cream @(143,233,256,142,369,233,354,252,256,175,158,252)
    Polygon $g $cream @(174,251,256,188,338,251,338,331,174,331)
    $g.FillRectangle($red,228,265,56,68)
    $g.FillRectangle($blue,188,254,22,22)
    $g.FillRectangle($blue,302,254,22,22)
    Polygon $g $gold @(206,351,242,374,305,321,318,336,244,398,194,365)
  } else {
    Polygon $g $gold @(256,131,367,191,256,251,145,191)
    Polygon $g $cream @(145,204,249,261,249,379,145,321)
    Polygon $g $red @(263,261,367,204,367,321,263,379)
    Polygon $g $blue @(193,163,211,153,318,211,301,221)
    Polygon $g $gold @(300,241,319,231,319,271,300,281)
  }
  $stream=[IO.MemoryStream]::new()
  $image.Save($stream,[Drawing.Imaging.ImageFormat]::Png)
  $bytes=$stream.ToArray()
  $stream.Dispose(); $g.Dispose(); $image.Dispose()
  return ,$bytes
}
foreach ($size in 32,180,192,512) {
  [IO.File]::WriteAllBytes((Join-Path $web "home-$size.png"),(Render-Badge home $size))
}
foreach ($kind in 'home','package') {
  $sizes=16,32,48,64,128,256
  $stream=[IO.MemoryStream]::new()
  $writer=[IO.BinaryWriter]::new($stream)
  $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
  $offset=6+16*$sizes.Count
  $images=foreach ($size in $sizes) {
    $bytes=Render-Badge $kind $size
    $writer.Write([byte]($size % 256)); $writer.Write([byte]($size % 256))
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]32)
    $writer.Write([uint32]$bytes.Length); $writer.Write([uint32]$offset)
    $offset+=$bytes.Length
    ,$bytes
  }
  foreach ($bytes in $images) { $writer.Write([byte[]]$bytes) }
  [IO.File]::WriteAllBytes((Join-Path $windows "$kind.ico"),$stream.ToArray())
  $writer.Dispose(); $stream.Dispose()
}
