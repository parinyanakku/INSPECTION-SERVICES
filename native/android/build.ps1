param([ValidateRange(1,2100000000)][int]$BuildNumber=1, [switch]$Release)
$ErrorActionPreference='Stop'
$sdk=$env:ANDROID_HOME
if (!$sdk) { throw 'Set ANDROID_HOME to an Android SDK with platform 35 and build-tools 35.0.0.' }
$tools=Join-Path $sdk 'build-tools/35.0.0'
$platform=Join-Path $sdk 'platforms/android-35/android.jar'
$out=Join-Path $PSScriptRoot '../../build/native/android'
$work=Join-Path $out ([guid]::NewGuid().ToString())
$res=Join-Path $work 'res'
$drawable=Join-Path $res 'drawable-nodpi'
$classes=Join-Path $work 'classes'
$dex=Join-Path $work 'dex'
$null=New-Item -ItemType Directory -Force $drawable,$classes,$dex
Copy-Item (Join-Path $PSScriptRoot '../../public/product-icons/home-192.png') (Join-Path $drawable 'home.png')

function Run-Tool([string]$tool, [string[]]$arguments) {
  & $tool @arguments
  if ($LASTEXITCODE) { throw "$tool failed ($LASTEXITCODE)" }
}
$resources=Join-Path $work 'resources.zip'
$unsigned=Join-Path $work 'unsigned.apk'
$aligned=Join-Path $work 'aligned.apk'
$exe=if ($IsWindows) {'.exe'} else {''}
$script=if ($IsWindows) {'.bat'} else {''}
Run-Tool "$tools/aapt2$exe" @('compile','--dir',$res,'-o',$resources)
Run-Tool "$tools/aapt2$exe" @('link','-o',$unsigned,'-I',$platform,'--manifest',"$PSScriptRoot/AndroidManifest.xml",'--min-sdk-version','23','--target-sdk-version','35','--version-code',"$BuildNumber",'--version-name',"1.0.$BuildNumber",$resources)
Run-Tool javac @('--release','8','-classpath',$platform,'-d',$classes,"$PSScriptRoot/Launcher.java")
Run-Tool "$tools/d8$script" @('--lib',$platform,'--min-api','23','--output',$dex,"$classes/com/teaminspectionproelite/inspection/Launcher.class")
Run-Tool jar @('uf',$unsigned,'-C',$dex,'classes.dex')
Run-Tool "$tools/zipalign$exe" @('-f','4',$unsigned,$aligned)
if ($Release) {
  $key=$env:PROELITE_KEYSTORE
  $alias=$env:PROELITE_KEY_ALIAS
  if (!$key -or !$alias -or !$env:PROELITE_STORE_PASSWORD -or !$env:PROELITE_KEY_PASSWORD) { throw 'Release signing credentials required' }
  $outputName='ProElite-Inspection.apk'
} else {
  $key=Join-Path $work 'test.p12'
  $alias='test'
  $env:PROELITE_TEST_PASSWORD=[guid]::NewGuid().ToString()
  Run-Tool keytool @('-genkeypair','-keystore',$key,'-storetype','PKCS12','-storepass:env','PROELITE_TEST_PASSWORD','-alias',$alias,'-keyalg','RSA','-keysize','2048','-validity','30','-dname','CN=ProElite Build Test')
  $outputName='ProElite-Inspection-test.apk'
}
$apk=Join-Path $out $outputName
$storePass=if ($Release) {'env:PROELITE_STORE_PASSWORD'} else {'env:PROELITE_TEST_PASSWORD'}
$keyPass=if ($Release) {'env:PROELITE_KEY_PASSWORD'} else {'env:PROELITE_TEST_PASSWORD'}
Run-Tool "$tools/apksigner$script" @('sign','--ks',$key,'--ks-key-alias',$alias,'--ks-pass',$storePass,'--key-pass',$keyPass,'--out',$apk,$aligned)
Run-Tool "$tools/apksigner$script" @('verify','--verbose','--print-certs',$apk)
Get-FileHash $apk
