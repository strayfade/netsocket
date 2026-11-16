<#
.SYNOPSIS
    Minimal serial terminal for the netsocket Zigbee coordinator.

.DESCRIPTION
    Speaks the line protocol directly over .NET's SerialPort, so it needs no
    Python, no PlatformIO monitor and no extra packages. Every full line you type
    is sent to the board; everything the board prints is echoed.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File tools/zbterm.ps1 -Port COM7

.EXAMPLE
    # list the ports Windows has
    powershell -ExecutionPolicy Bypass -File tools/zbterm.ps1 -ListPorts
#>
[CmdletBinding()]
param(
    [string]$Port = "COM3",
    [int]$Baud = 115200,
    [switch]$ListPorts
)

$ErrorActionPreference = "Stop"

if ($ListPorts) {
    Get-WmiObject Win32_SerialPort | Select-Object DeviceID, Description | Format-Table -AutoSize
    return
}

$sp = New-Object System.IO.Ports.SerialPort $Port, $Baud, [System.IO.Ports.Parity]::None, 8, [System.IO.Ports.StopBits]::One
$sp.NewLine = "`n"
$sp.ReadTimeout = 100
$sp.DtrEnable = $true
$sp.RtsEnable = $true

try {
    $sp.Open()
} catch {
    Write-Error "Could not open $Port : $($_.Exception.Message)"
    return
}

Write-Host "connected to $Port at $Baud. Type commands, Enter sends, Ctrl+C quits." -ForegroundColor Cyan

$buffer = New-Object System.Text.StringBuilder

try {
    while ($true) {
        # Drain whatever the board has sent.
        try {
            while ($sp.BytesToRead -gt 0) {
                $chunk = $sp.ReadExisting()
                Write-Host -NoNewline $chunk
            }
        } catch [System.TimeoutException] {
            # nothing to read
        }

        # Handle local typing.
        while ([Console]::KeyAvailable) {
            $key = [Console]::ReadKey($true)

            switch ($key.Key) {
                "Enter" {
                    $line = $buffer.ToString()
                    $buffer.Clear() | Out-Null
                    Write-Host ""
                    $sp.WriteLine($line)
                }
                "Backspace" {
                    if ($buffer.Length -gt 0) {
                        $buffer.Length = $buffer.Length - 1
                        Write-Host -NoNewline "`b `b"
                    }
                }
                "Escape" {
                    $buffer.Clear() | Out-Null
                    Write-Host ""
                }
                default {
                    if (-not [char]::IsControl($key.KeyChar)) {
                        $buffer.Append($key.KeyChar) | Out-Null
                        Write-Host -NoNewline $key.KeyChar
                    }
                }
            }
        }

        Start-Sleep -Milliseconds 20
    }
}
finally {
    if ($sp.IsOpen) {
        $sp.Close()
    }
    $sp.Dispose()
}
