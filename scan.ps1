$sizes = @{}
Get-ChildItem -Path C:\Users\Lenovo -Directory -Force -ErrorAction SilentlyContinue | ForEach-Object {
    $sum = (Get-ChildItem $_.FullName -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
    $sizes[$_.FullName] = [math]::Round($sum/1GB, 2)
}
$sizes.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 10 | Format-Table -AutoSize
