param([Parameter(Mandatory)][string]$WixBin, [ValidateRange(1,65535)][int]$BuildNumber=1)
$ErrorActionPreference='Stop'
$WixBin=(Resolve-Path $WixBin).Path
$out=Join-Path $PSScriptRoot '../../build/native/windows'
$null=New-Item -ItemType Directory -Force $out
$out=(Resolve-Path $out).Path
Push-Location $PSScriptRoot
try {
  $launcher=Join-Path $out 'ProElite.exe'
  $obj=Join-Path $out 'Product.wixobj'
  $msi=Join-Path $out 'ProElite-Inspection.msi'
  & "$env:WINDIR/Microsoft.NET/Framework64/v4.0.30319/csc.exe" /nologo /target:winexe /optimize+ /win32icon:home.ico "/out:$launcher" /reference:System.Windows.Forms.dll Launcher.cs
  if ($LASTEXITCODE) { throw 'Launcher compilation failed' }
  & "$WixBin/candle.exe" -nologo "-dPackageVersion=1.0.$BuildNumber" "-dLauncherFile=$launcher" -out $obj Product.wxs
  if ($LASTEXITCODE) { throw 'WiX compilation failed' }
  & "$WixBin/light.exe" -nologo -sval -out $msi $obj
  if ($LASTEXITCODE) { throw 'MSI linking failed' }
  Get-FileHash $msi
} finally { Pop-Location }
