$dest = "D:\Pictures"
if (!(Test-Path $dest)) {
    New-Item -ItemType Directory -Path $dest | Out-Null
}

$folders = @(
    "C:\Users\Lenovo\Downloads",
    "C:\Users\Lenovo\Documents",
    "C:\Users\Lenovo\Desktop",
    "C:\Users\Lenovo\Pictures"
)
$extensions = @("*.jpg", "*.jpeg", "*.png", "*.gif", "*.bmp", "*.webp", "*.heic", "*.tiff")

$moved = 0
$totalSize = 0

foreach ($folder in $folders) {
    if (Test-Path $folder) {
        $files = Get-ChildItem -Path $folder -Include $extensions -Recurse -File -ErrorAction SilentlyContinue
        foreach ($file in $files) {
            $target = Join-Path $dest $file.Name
            
            # ถ้ามีชื่อซ้ำ ให้เติมตัวเลข
            $counter = 1
            while (Test-Path $target) {
                $newName = "$($file.BaseName)_$counter$($file.Extension)"
                $target = Join-Path $dest $newName
                $counter++
            }
            
            try {
                $totalSize += $file.Length
                Move-Item -Path $file.FullName -Destination $target -Force -ErrorAction Stop
                $moved++
            } catch {
                Write-Host "Failed to move: $($file.FullName)"
            }
        }
    }
}

$mb = [math]::Round($totalSize / 1MB, 2)
Write-Host "Moved $moved images ($mb MB) to $dest"
