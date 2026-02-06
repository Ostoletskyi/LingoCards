# start_ps_server.ps1
$ErrorActionPreference = "Stop"

# Project root = два уровня вверх от ...\_utilities\ps
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location -LiteralPath $ProjectRoot

$Port = 8080
$Prefix = "http://127.0.0.1:$Port/"

Write-Host "Serving from: $ProjectRoot"
Write-Host "Index exists: $((Test-Path (Join-Path $ProjectRoot 'index.html')))"
Write-Host "Serving at: $Prefix  (Ctrl+C to stop)"
Write-Host ""

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($Prefix)
$listener.Start()

function Get-ContentType([string]$filePath) {
    switch ([System.IO.Path]::GetExtension($filePath).ToLowerInvariant()) {
        ".html" { return "text/html; charset=utf-8" }
        ".js"   { return "application/javascript; charset=utf-8" }
        ".css"  { return "text/css; charset=utf-8" }
        ".png"  { return "image/png" }
        ".jpg"  { return "image/jpeg" }
        ".jpeg" { return "image/jpeg" }
        ".webp" { return "image/webp" }
        ".json" { return "application/json; charset=utf-8" }
        ".ttf"  { return "font/ttf" }
        ".woff" { return "font/woff" }
        ".woff2"{ return "font/woff2" }
        ".svg"  { return "image/svg+xml; charset=utf-8" }
        default { return "application/octet-stream" }
    }
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()

        $path = $context.Request.Url.AbsolutePath.TrimStart("/")
        if ([string]::IsNullOrWhiteSpace($path)) { $path = "index.html" }

        # Безопасность: запрещаем выход из корня через ..\
        $safePath = $path -replace "/", "\"
        if ($safePath.Contains("..")) {
            $context.Response.StatusCode = 400
            $context.Response.OutputStream.Close()
            continue
        }

        $file = Join-Path $ProjectRoot $safePath

        if (Test-Path -LiteralPath $file -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($file)
            $context.Response.StatusCode = 200
            $context.Response.ContentType = Get-ContentType $file
            $context.Response.ContentLength64 = $bytes.Length
            $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
            $context.Response.OutputStream.Close()
        } else {
            $context.Response.StatusCode = 404
            $context.Response.OutputStream.Close()
        }
    }
}
finally {
    if ($listener -and $listener.IsListening) { $listener.Stop() }
    if ($listener) { $listener.Close() }
}
