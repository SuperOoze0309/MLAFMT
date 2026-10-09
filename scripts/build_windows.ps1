# Builds versioned release assets; never publishes or changes the root MLAFMT.exe.
[CmdletBinding()]
param(
    [Alias('Python')][string]$PythonPath = 'python',
    [switch]$InstallDependencies,
    [string]$ExpectedVersion = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$taskRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$taskBuild = Join-Path $taskRoot 'build\windows'
$taskDist = Join-Path $taskRoot 'dist\release'

if ($env:OS -ne 'Windows_NT') { throw 'Build on Windows with Python 3.12 x64.' }
& $PythonPath -c "import struct, sys; assert sys.version_info[:2] == (3, 12), 'Use Python 3.12'; assert struct.calcsize('P') == 8, 'Use x64 Python'"
if ($LASTEXITCODE -ne 0) { throw 'Python 3.12 x64 is required.' }

if ($InstallDependencies) {
    & $PythonPath -c "import sys; assert sys.prefix != sys.base_prefix, 'Install dependencies in a virtual environment only'"
    if ($LASTEXITCODE -ne 0) { throw 'Create a virtual environment before using -InstallDependencies.' }
    & $PythonPath -m pip install -r (Join-Path $taskRoot 'requirements-build.txt')
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}
& $PythonPath -m pip check
if ($LASTEXITCODE -ne 0) { throw 'Dependency validation failed.' }

New-Item -ItemType Directory -Path $taskBuild, $taskDist -Force | Out-Null
$taskPrepared = & $PythonPath (Join-Path $PSScriptRoot 'prepare_windows_build.py') --root $taskRoot --output $taskBuild --verify-dependencies
if ($LASTEXITCODE -ne 0) { throw 'Preparing build metadata failed.' }
$taskVersion = ($taskPrepared | Select-Object -Last 1).Trim()
if ($ExpectedVersion -and $taskVersion -ne $ExpectedVersion.TrimStart('v')) {
    throw "Source version $taskVersion does not match expected version $ExpectedVersion."
}

Push-Location -LiteralPath $taskRoot
try {
    $taskArguments = @('-m', 'PyInstaller', '--clean', '--noconfirm', '--onefile', '--windowed',
        '--noupx', '--name', 'MLAFMT', '--collect-all', 'tkinterdnd2',
        '--additional-hooks-dir', (Join-Path $PSScriptRoot 'hooks'),
        '--version-file', (Join-Path $taskBuild 'version-info.txt'),
        '--icon', (Join-Path $taskBuild 'MLAFMT.ico'),
        '--add-data', ((Join-Path $taskBuild 'MLAFMT.ico') + ';.'),
        '--specpath', $taskBuild, '--workpath', (Join-Path $taskBuild 'pyinstaller'),
        '--distpath', $taskDist, (Join-Path $taskRoot 'mla_gui.py'))
    & $PythonPath @taskArguments
    if ($LASTEXITCODE -ne 0) { throw 'PyInstaller failed.' }
} finally {
    Pop-Location
}

$taskExe = Join-Path $taskDist 'MLAFMT.exe'
$taskExeVersion = (Get-Item -LiteralPath $taskExe).VersionInfo.FileVersion
if ($taskExeVersion -ne $taskVersion) { throw "Executable has unexpected version: $taskExeVersion" }
Copy-Item -LiteralPath (Join-Path $taskBuild 'build-info.json') -Destination $taskDist -Force

# Each run stages only the intended files in a fresh directory.
$taskStage = Join-Path $taskBuild ('package-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskStage | Out-Null
foreach ($taskFile in @($taskExe, (Join-Path $taskDist 'build-info.json'),
        (Join-Path $taskRoot 'README.md'), (Join-Path $taskRoot 'CHANGELOG.md'), (Join-Path $taskRoot 'LICENSE'))) {
    Copy-Item -LiteralPath $taskFile -Destination $taskStage
}
$taskZip = Join-Path $taskDist "MLAFMT-v$taskVersion-windows-x64.zip"
Compress-Archive -Path (Join-Path $taskStage '*') -DestinationPath $taskZip -CompressionLevel Optimal -Force
$taskChecksums = foreach ($taskFile in @($taskExe, $taskZip, (Join-Path $taskDist 'build-info.json'))) {
    $taskHash = (Get-FileHash -LiteralPath $taskFile -Algorithm SHA256).Hash.ToLowerInvariant()
    "$taskHash  $([IO.Path]::GetFileName($taskFile))"
}
$taskChecksums | Set-Content -LiteralPath (Join-Path $taskDist 'SHA256SUMS.txt') -Encoding ascii
Write-Output "Release assets ready: $taskDist (v$taskVersion)"
