# RNNoise noise suppression plugin

`librnnoise_ladspa.so` is the LADSPA build of **noise-suppression-for-voice** by Werman, v1.22,
taken unmodified from the official release `linux-rnnoise.zip` (`ladspa/librnnoise_ladspa.so`):
https://github.com/werman/noise-suppression-for-voice/releases/tag/v1.22

SHA-256: `240234d4f3e0a3a5b34be93cac1215248e9446c3b799e6bfa29f9328fd5a90e4`

It is licensed under the GNU GPL v3 (see `LICENSE` in this folder); its source code is at the
link above. It is based on RNNoise by Jean-Marc Valin (Xiph.Org, BSD licence).

D-Connect does not link against it: on Linux, during calls taken on the PC, D-Connect asks
PulseAudio to load it (`module-ladspa-sink`) to clean up the laptop microphone.
