# Local preview server for the Saytik site (no Node.js / Python needed).
#   powershell -ExecutionPolicy Bypass -File serve.ps1 [port]
# Serves static files from this folder only.

param([int]$Port = 8080)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$types = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".json" = "application/json; charset=utf-8"
  ".md"   = "text/plain; charset=utf-8"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Saytik site: http://localhost:$Port/   (Ctrl+C to stop)" -ForegroundColor Cyan

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $path = $ctx.Request.Url.AbsolutePath.TrimStart("/")
  if (-not $path) { $path = "index.html" }

  $file = Join-Path $root ($path -replace "/", "\")
  if (Test-Path $file -PathType Container) { $file = Join-Path $file "index.html" }

  $resp = $ctx.Response
  if (Test-Path $file -PathType Leaf) {
    $ext = [System.IO.Path]::GetExtension($file).ToLower()
    if ($types.ContainsKey($ext)) { $resp.ContentType = $types[$ext] }
    else { $resp.ContentType = "application/octet-stream" }
    $bytes = [System.IO.File]::ReadAllBytes($file)
    $resp.ContentLength64 = $bytes.Length
    $resp.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $resp.StatusCode = 404
    $body = [System.Text.Encoding]::UTF8.GetBytes("404 - not found")
    $resp.ContentType = "text/plain; charset=utf-8"
    $resp.ContentLength64 = $body.Length
    $resp.OutputStream.Write($body, 0, $body.Length)
  }
  $resp.Close()
}