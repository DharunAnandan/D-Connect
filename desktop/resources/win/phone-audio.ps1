# D-Connect: play the phone's music on this PC (Windows 10 2004+ / 11), as a Bluetooth speaker.
# Uses Windows' own AudioPlaybackConnection. Argument: part of the phone's Bluetooth name.
# Prints one status line ("open", "no-device", "denied: ..."), then stays until stdin closes or
# a "stop" line arrives; closing it ends the connection.
param([string]$Phone = '')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Audio.AudioPlaybackConnection, Windows.Media.Audio, ContentType = WindowsRuntime]
$null = [Windows.Devices.Enumeration.DeviceInformation, Windows.Devices.Enumeration, ContentType = WindowsRuntime]

# WinRT async -> wait for the result
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
function Await($op, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $null = $task.Wait(-1)
  $task.Result
}
$asTaskAction = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' } | Select-Object -First 1
function AwaitAction($op) { $null = $asTaskAction.Invoke($null, @($op)).Wait(-1) }

try {
  $selector = [Windows.Media.Audio.AudioPlaybackConnection]::GetDeviceSelector()
  $devices = Await ([Windows.Devices.Enumeration.DeviceInformation]::FindAllAsync($selector)) ([Windows.Devices.Enumeration.DeviceInformationCollection])
  $device = $devices | Where-Object { $Phone -and $_.Name -like "*$Phone*" } | Select-Object -First 1
  if (-not $device -and $devices.Count -eq 1) { $device = $devices[0] }
  if (-not $device) { [Console]::Out.WriteLine('no-device'); exit 0 }
  $conn = [Windows.Media.Audio.AudioPlaybackConnection]::TryCreateFromId($device.Id)
  if (-not $conn) { [Console]::Out.WriteLine('no-device'); exit 0 }
  AwaitAction ($conn.StartAsync())
  $result = Await ($conn.OpenAsync()) ([Windows.Media.Audio.AudioPlaybackConnectionOpenResult])
  if ($result.Status -ne [Windows.Media.Audio.AudioPlaybackConnectionOpenResultStatus]::Success) {
    [Console]::Out.WriteLine("denied: $($result.Status)"); exit 0
  }
  [Console]::Out.WriteLine('open')
  while ($true) {
    $line = [Console]::In.ReadLine()
    if ($line -eq $null -or $line -eq 'stop') { break }
  }
  $conn.Dispose()
} catch {
  [Console]::Out.WriteLine("denied: $($_.Exception.Message)")
}
