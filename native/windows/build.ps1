param([Parameter(Mandatory)][string]$WixBin, [ValidateRange(1,65535)][int]$BuildNumber=1, [string]$WebViewBin='')
$ErrorActionPreference='Stop'
$WixBin=(Resolve-Path $WixBin).Path
if (!$WebViewBin) { throw 'Supply the extracted Microsoft.Web.WebView2 NuGet package directory.' }
$WebViewBin=(Resolve-Path $WebViewBin).Path
$out=Join-Path $PSScriptRoot '../../build/native/windows'
$null=New-Item -ItemType Directory -Force $out
$out=(Resolve-Path $out).Path
Push-Location $PSScriptRoot
try {
  $launcher=Join-Path $out 'ProElite.exe'
  $obj=Join-Path $out 'Product.wixobj'
  $msi=Join-Path $out 'ProElite-Inspection.msi'
  $core=Join-Path $WebViewBin 'lib/net462/Microsoft.Web.WebView2.Core.dll'
  $forms=Join-Path $WebViewBin 'lib/net462/Microsoft.Web.WebView2.WinForms.dll'
  $loader=Join-Path $WebViewBin 'build/native/x64/WebView2Loader.dll'
  if (!(Test-Path $loader)) { $loader=Join-Path $WebViewBin 'runtimes/win-x64/native/WebView2Loader.dll' }
  foreach ($file in @($core,$forms,$loader)) { if (!(Test-Path $file)) { throw "Missing WebView2 dependency: $file" }; Copy-Item $file $out -Force }
  & "$env:WINDIR/Microsoft.NET/Framework64/v4.0.30319/csc.exe" /nologo /target:winexe /platform:x64 /optimize+ /win32icon:home.ico "/out:$launcher" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll "/reference:$core" "/reference:$forms" Launcher.cs
  if ($LASTEXITCODE) { throw 'Launcher compilation failed' }
  & "$WixBin/candle.exe" -nologo "-dPackageVersion=1.0.$BuildNumber" "-dLauncherFile=$launcher" "-dNativeDir=$out" -out $obj Product.wxs
  if ($LASTEXITCODE) { throw 'WiX compilation failed' }
  & "$WixBin/light.exe" -nologo -sval -ext WixUIExtension -ext WixUtilExtension -out $msi $obj
  if ($LASTEXITCODE) { throw 'MSI linking failed' }
  Get-FileHash $msi
} finally { Pop-Location }
