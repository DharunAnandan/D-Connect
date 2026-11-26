# D-Connect sound mixer helper for Windows. Runs once and stays: reads one command per line on
# stdin and answers one JSON line on stdout. Uses Windows' Core Audio (the Volume Mixer's own
# API) through a small C# class compiled at start.
#   list                     -> {"output":{...},"apps":[...]}
#   master <0-100>           set the speaker volume
#   mutemaster <0|1>
#   app <pid> <0-100>        set one app's volume
#   muteapp <pid> <0|1>
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom { }

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  int NotImpl1();
  [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
  [PreserveSig] int OpenPropertyStore(int access, out IntPtr store);
  [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
}

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int RegisterControlChangeNotify(IntPtr notify);
  int UnregisterControlChangeNotify(IntPtr notify);
  int GetChannelCount(out int count);
  int SetMasterVolumeLevel(float level, ref Guid ctx);
  int SetMasterVolumeLevelScalar(float level, ref Guid ctx);
  int GetMasterVolumeLevel(out float level);
  int GetMasterVolumeLevelScalar(out float level);
  int SetChannelVolumeLevel(int ch, float level, ref Guid ctx);
  int SetChannelVolumeLevelScalar(int ch, float level, ref Guid ctx);
  int GetChannelVolumeLevel(int ch, out float level);
  int GetChannelVolumeLevelScalar(int ch, out float level);
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
  int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}

[Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionManager2 {
  int NotImpl1();
  int NotImpl2();
  [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator e);
}

[Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionEnumerator {
  [PreserveSig] int GetCount(out int count);
  [PreserveSig] int GetSession(int i, out IAudioSessionControl2 session);
}

[Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl2 {
  [PreserveSig] int GetState(out int state);
  [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
  int SetDisplayName(string v, Guid ctx);
  int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string p);
  int SetIconPath(string v, Guid ctx);
  int GetGroupingParam(out Guid g);
  int SetGroupingParam(Guid g, Guid ctx);
  int RegisterAudioSessionNotification(IntPtr n);
  int UnregisterAudioSessionNotification(IntPtr n);
  int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
  int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
  [PreserveSig] int GetProcessId(out uint pid);
  [PreserveSig] int IsSystemSoundsSession();
}

[Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISimpleAudioVolume {
  int SetMasterVolume(float level, ref Guid ctx);
  int GetMasterVolume(out float level);
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
  int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}

public static class DcMixer {
  static IMMDevice Speaker() {
    var en = (IMMDeviceEnumerator)new MMDeviceEnumeratorCom();
    IMMDevice dev;
    Marshal.ThrowExceptionForHR(en.GetDefaultAudioEndpoint(0, 1, out dev)); // render, multimedia
    return dev;
  }
  static T Activate<T>(IMMDevice dev) {
    var iid = typeof(T).GUID;
    object o;
    Marshal.ThrowExceptionForHR(dev.Activate(ref iid, 23, IntPtr.Zero, out o));
    return (T)o;
  }
  static IAudioEndpointVolume Master() { return Activate<IAudioEndpointVolume>(Speaker()); }

  static string Esc(string s) {
    var b = new StringBuilder();
    foreach (var c in s ?? "") {
      if (c == '"' || c == '\\') b.Append('\\').Append(c);
      else if (c < 32) b.Append(' ');
      else b.Append(c);
    }
    return b.ToString();
  }

  static List<KeyValuePair<uint, ISimpleAudioVolume>> Sessions() {
    var list = new List<KeyValuePair<uint, ISimpleAudioVolume>>();
    var mgr = Activate<IAudioSessionManager2>(Speaker());
    IAudioSessionEnumerator e;
    Marshal.ThrowExceptionForHR(mgr.GetSessionEnumerator(out e));
    int n; e.GetCount(out n);
    for (int i = 0; i < n; i++) {
      IAudioSessionControl2 s;
      if (e.GetSession(i, out s) != 0 || s == null) continue;
      if (s.IsSystemSoundsSession() == 0) continue; // S_OK means it IS the system sounds
      int state; s.GetState(out state);
      if (state != 1) continue; // only sessions playing now
      uint pid; s.GetProcessId(out pid);
      list.Add(new KeyValuePair<uint, ISimpleAudioVolume>(pid, (ISimpleAudioVolume)s));
    }
    return list;
  }

  public static string List() {
    var m = Master();
    float mv; m.GetMasterVolumeLevelScalar(out mv);
    bool mm; m.GetMute(out mm);
    var sb = new StringBuilder();
    sb.Append("{\"output\":{\"name\":\"default\",\"label\":\"Speakers\",\"volume\":").Append((int)Math.Round(mv * 100)).Append(",\"muted\":").Append(mm ? "true" : "false").Append("},\"apps\":[");
    bool first = true;
    foreach (var kv in Sessions()) {
      string name = "App";
      try { name = System.Diagnostics.Process.GetProcessById((int)kv.Key).ProcessName; } catch { }
      float v; kv.Value.GetMasterVolume(out v);
      bool mu; kv.Value.GetMute(out mu);
      if (!first) sb.Append(',');
      first = false;
      sb.Append("{\"id\":\"").Append(kv.Key).Append("\",\"name\":\"").Append(Esc(name)).Append("\",\"volume\":").Append((int)Math.Round(v * 100)).Append(",\"muted\":").Append(mu ? "true" : "false").Append('}');
    }
    sb.Append("]}");
    return sb.ToString();
  }

  public static void SetMaster(float pct) { var g = Guid.Empty; Master().SetMasterVolumeLevelScalar(Math.Max(0, Math.Min(1, pct / 100f)), ref g); }
  public static void MuteMaster(bool on) { var g = Guid.Empty; Master().SetMute(on, ref g); }
  public static void SetApp(uint pid, float pct) {
    var g = Guid.Empty;
    foreach (var kv in Sessions()) if (kv.Key == pid) kv.Value.SetMasterVolume(Math.Max(0, Math.Min(1, pct / 100f)), ref g);
  }
  public static void MuteApp(uint pid, bool on) {
    var g = Guid.Empty;
    foreach (var kv in Sessions()) if (kv.Key == pid) kv.Value.SetMute(on, ref g);
  }
}
'@

[Console]::Out.WriteLine('{"ready":true}')
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  $p = $line.Trim().Split(' ')
  try {
    switch ($p[0]) {
      'list' { [Console]::Out.WriteLine([DcMixer]::List()) }
      'master' { [DcMixer]::SetMaster([float]$p[1]); [Console]::Out.WriteLine('{"ok":true}') }
      'mutemaster' { [DcMixer]::MuteMaster($p[1] -eq '1'); [Console]::Out.WriteLine('{"ok":true}') }
      'app' { [DcMixer]::SetApp([uint32]$p[1], [float]$p[2]); [Console]::Out.WriteLine('{"ok":true}') }
      'muteapp' { [DcMixer]::MuteApp([uint32]$p[1], $p[2] -eq '1'); [Console]::Out.WriteLine('{"ok":true}') }
      default { [Console]::Out.WriteLine('{"error":"unknown"}') }
    }
  } catch {
    [Console]::Out.WriteLine('{"error":"' + ($_.Exception.Message -replace '"', "'") + '"}')
  }
}
