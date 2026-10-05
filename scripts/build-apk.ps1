# Gera o APK localmente (requer Android Studio instalado: JDK 21 + Android SDK).
# Uso:  .\scripts\build-apk.ps1 -ServerUrl https://sua-escola.onrender.com
#       .\scripts\build-apk.ps1 -ServerUrl http://192.168.0.10:3000 -AllowHttp   (teste na rede local)
param(
  [Parameter(Mandatory = $true)][string]$ServerUrl,
  [switch]$AllowHttp
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

if (-not $env:ANDROID_HOME -and (Test-Path "$env:LOCALAPPDATA\Android\Sdk")) { $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk" }
if (-not $env:JAVA_HOME -and (Test-Path "C:\Program Files\Android\Android Studio\jbr")) { $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr" }
if (-not $env:ANDROID_HOME) { throw 'Android SDK não encontrado. Instale o Android Studio (https://developer.android.com/studio).' }
if (-not $AllowHttp -and -not $ServerUrl.StartsWith('https://')) { throw 'Use um endereço HTTPS, ou -AllowHttp para testes na rede local.' }

$env:ESCOLA_SERVER_URL = $ServerUrl
$env:ESCOLA_ALLOW_HTTP = if ($AllowHttp) { '1' } else { '0' }

Push-Location $root
try {
  npm run build -w web
  Push-Location web
  npx cap sync android
  Push-Location android
  .\gradlew.bat assembleDebug
  Pop-Location; Pop-Location
  $apk = Join-Path $root 'web\android\app\build\outputs\apk\debug\app-debug.apk'
  Copy-Item $apk (Join-Path $root 'escola-plus.apk') -Force
  Write-Host "`nAPK pronto: $(Join-Path $root 'escola-plus.apk')" -ForegroundColor Green
  Write-Host 'Envie para o celular e abra o arquivo (permita "instalar apps desconhecidos").'
} finally { Pop-Location }
