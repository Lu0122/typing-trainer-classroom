$ErrorActionPreference = 'Stop'

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$packageDir = Join-Path $projectRoot 'output/packages'
$packagePath = Join-Path $packageDir ("打字软件-源码拷贝版-{0}.zip" -f (Get-Date -Format 'yyyyMMdd'))
$rootFiles = @(
  '.env', '.env.example', '.gitignore', 'README.md',
  'package.json', 'package-lock.json', 'vite.config.js', 'start-server.bat',
  'scripts/package-source.ps1'
)
$sourceDirs = @('frontend', 'backend', 'public', 'docs')

Push-Location $projectRoot
try {
  if (-not (Test-Path -LiteralPath '.env' -PathType Leaf)) {
    throw '缺少 .env。请先从 .env.example 复制并填写配置，再打包。'
  }
  $files = @($rootFiles)
  foreach ($directory in $sourceDirs) {
    $directoryPath = Join-Path $projectRoot $directory
    if (-not (Test-Path -LiteralPath $directoryPath -PathType Container)) { throw "缺少源码目录：$directory" }
    foreach ($file in Get-ChildItem -LiteralPath $directoryPath -Recurse -File) {
      $relative = $file.FullName.Substring($projectRoot.Length + 1).Replace('\', '/')
      if ($relative -eq 'public/index.html' -or $relative -match '^public/assets/[^/]+\.(js|css)$' -or $relative -match '\.log$') { continue }
      $files += $relative
    }
  }
  $files = @($files | Sort-Object -Unique)
  New-Item -ItemType Directory -Path $packageDir -Force | Out-Null
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $fileStream = [IO.File]::Open($packagePath, [IO.FileMode]::Create, [IO.FileAccess]::Write)
  $archive = [IO.Compression.ZipArchive]::new($fileStream, [IO.Compression.ZipArchiveMode]::Create, $false)
  try {
    foreach ($relative in $files) {
      $fullPath = [IO.Path]::GetFullPath((Join-Path $projectRoot $relative))
      if (-not $fullPath.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "文件超出项目目录：$relative"
      }
      if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) { throw "文件不存在：$relative" }
      $entry = $archive.CreateEntry(($relative -replace '\\', '/'), [IO.Compression.CompressionLevel]::Optimal)
      $source = [IO.File]::OpenRead($fullPath)
      $target = $entry.Open()
      try { $source.CopyTo($target) } finally { $target.Dispose(); $source.Dispose() }
    }
  } finally { $archive.Dispose(); $fileStream.Dispose() }

  $check = [IO.Compression.ZipFile]::OpenRead($packagePath)
  try {
    $names = @($check.Entries | ForEach-Object FullName)
    $missing = @($files | Where-Object { ($_ -replace '\\', '/') -notin $names })
    $unexpected = @($names | Where-Object { $_ -match '(^|/)(data|node_modules|output|\.git)/|\.log$|^public/assets/[^/]+\.(js|css)$' })
    if ($missing.Count -or $unexpected.Count) { throw '打包校验失败：存在缺失文件或不应包含的文件。' }
    Write-Output ("打包完成：{0}（{1} 个文件）" -f $packagePath, $names.Count)
  } finally { $check.Dispose() }
} finally {
  Pop-Location
}
