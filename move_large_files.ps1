$videosDest = "D:\Videos"
$downloadsDest = "D:\LargeDownloads"

if (!(Test-Path $videosDest)) { New-Item -ItemType Directory -Path $videosDest | Out-Null }
if (!(Test-Path $downloadsDest)) { New-Item -ItemType Directory -Path $downloadsDest | Out-Null }

$folders = @(
    "C:\Users\Lenovo\Downloads",
    "C:\Users\Lenovo\Documents",
    "C:\Users\Lenovo\Desktop",
    "C:\Users\Lenovo\Videos"
)

$videoExts = @("*.mp4", "*.mkv", "*.avi", "*.mov", "*.wmv", "*.flv", "*.webm")

$movedVideos = 0
$movedVideosSize = 0
$movedLarge = 0
$movedLargeSize = 0

# 1. ย้ายวิดีโอ
foreach ($folder in $folders) {
    if (Test-Path $folder) {
        $files = Get-ChildItem -Path $folder -Include $videoExts -Recurse -File -ErrorAction SilentlyContinue
        foreach ($file in $files) {
            $target = Join-Path $videosDest $file.Name
            
            $counter = 1
            while (Test-Path $target) {
                $newName = "$($file.BaseName)_$counter$($file.Extension)"
                $target = Join-Path $videosDest $newName
                $counter++
            }
            
            try {
                $movedVideosSize += $file.Length
                Move-Item -Path $file.FullName -Destination $target -Force -ErrorAction Stop
                $movedVideos++
            } catch { }
        }
    }
}

# 2. ย้ายไฟล์ใหญ่ใน Downloads (> 100MB)
$downloadsDir = "C:\Users\Lenovo\Downloads"
if (Test-Path $downloadsDir) {
    $largeFiles = Get-ChildItem -Path $downloadsDir -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.Length -gt 100MB }
    foreach ($file in $largeFiles) {
        $target = Join-Path $downloadsDest $file.Name
        
        $counter = 1
        while (Test-Path $target) {
            $newName = "$($file.BaseName)_$counter$($file.Extension)"
            $target = Join-Path $downloadsDest $newName
            $counter++
        }
        
        try {
            $movedLargeSize += $file.Length
            Move-Item -Path $file.FullName -Destination $target -Force -ErrorAction Stop
            $movedLarge++
        } catch { }
    }
}

$vidMB = [math]::Round($movedVideosSize / 1MB, 2)
$largeMB = [math]::Round($movedLargeSize / 1MB, 2)

Write-Host "Moved $movedVideos videos ($vidMB MB) to $videosDest"
Write-Host "Moved $movedLarge large files ($largeMB MB) to $downloadsDest"
