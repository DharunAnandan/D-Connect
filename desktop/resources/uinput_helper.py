#!/usr/bin/env python3
# D-Connect virtual mouse + keyboard through /dev/uinput (works on Wayland and X11).
# Reads JSON lines on stdin:
#   {"t":"move","dx":3,"dy":-2}  {"t":"btn","b":"left","s":"click|down|up"}
#   {"t":"scroll","dy":-120,"dx":0}  (hi-res units, 120 = one notch)
#   {"t":"key","k":"enter"}  {"t":"combo","k":["leftctrl","v"]}  {"t":"text","s":"hello"}
import fcntl, json, os, struct, sys, time

UI_SET_EVBIT, UI_SET_KEYBIT, UI_SET_RELBIT = 0x40045564, 0x40045565, 0x40045566
UI_DEV_SETUP, UI_DEV_CREATE, UI_DEV_DESTROY = 0x405C5503, 0x5501, 0x5502
EV_SYN, EV_KEY, EV_REL = 0, 1, 2
REL_X, REL_Y, REL_HWHEEL, REL_WHEEL, REL_WHEEL_HI_RES, REL_HWHEEL_HI_RES = 0, 1, 6, 8, 11, 12
BTN = {"left": 0x110, "right": 0x111, "middle": 0x112}

KEYS = {
    "esc": 1, "backspace": 14, "tab": 15, "enter": 28, "space": 57, "leftctrl": 29, "leftshift": 42,
    "leftalt": 56, "leftmeta": 125, "capslock": 58, "up": 103, "left": 105, "right": 106, "down": 108,
    "home": 102, "end": 107, "pageup": 104, "pagedown": 109, "insert": 110, "delete": 111,
    "mute": 113, "volumedown": 114, "volumeup": 115, "playpause": 164, "nextsong": 163,
    "previoussong": 165, "stopcd": 166, "print": 99, "brightnessdown": 224, "brightnessup": 225,
    "minus": 12, "equal": 13, "leftbrace": 26, "rightbrace": 27, "semicolon": 39, "apostrophe": 40,
    "grave": 41, "backslash": 43, "comma": 51, "dot": 52, "slash": 53,
}
for i, c in enumerate("1234567890"):
    KEYS[c] = 2 + i
for c, code in zip("qwertyuiop", range(16, 26)):
    KEYS[c] = code
for c, code in zip("asdfghjkl", range(30, 39)):
    KEYS[c] = code
for c, code in zip("zxcvbnm", range(44, 51)):
    KEYS[c] = code
for i in range(1, 11):
    KEYS[f"f{i}"] = 58 + i
KEYS["f11"], KEYS["f12"] = 87, 88

PLAIN = {" ": "space", "\n": "enter", "\t": "tab", "-": "minus", "=": "equal", "[": "leftbrace",
         "]": "rightbrace", ";": "semicolon", "'": "apostrophe", "`": "grave", "\\": "backslash",
         ",": "comma", ".": "dot", "/": "slash"}
SHIFTED = {"!": "1", "@": "2", "#": "3", "$": "4", "%": "5", "^": "6", "&": "7", "*": "8", "(": "9",
           ")": "0", "_": "minus", "+": "equal", "{": "leftbrace", "}": "rightbrace", ":": "semicolon",
           '"': "apostrophe", "~": "grave", "|": "backslash", "<": "comma", ">": "dot", "?": "slash"}

fd = os.open("/dev/uinput", os.O_WRONLY | os.O_NONBLOCK)
for ev in (EV_KEY, EV_REL):
    fcntl.ioctl(fd, UI_SET_EVBIT, ev)
for code in list(KEYS.values()) + list(BTN.values()):
    fcntl.ioctl(fd, UI_SET_KEYBIT, code)
for rel in (REL_X, REL_Y, REL_WHEEL, REL_HWHEEL, REL_WHEEL_HI_RES, REL_HWHEEL_HI_RES):
    fcntl.ioctl(fd, UI_SET_RELBIT, rel)
setup = struct.pack("HHHH80sI", 0x06, 0x1D6C, 0x0D01, 1, b"D-Connect Remote", 0)
fcntl.ioctl(fd, UI_DEV_SETUP, setup)
fcntl.ioctl(fd, UI_DEV_CREATE)
time.sleep(0.3)  # let the compositor pick the device up


def emit(t, code, value):
    os.write(fd, struct.pack("llHHi", 0, 0, t, code, value))


def syn():
    emit(EV_SYN, 0, 0)


def tap(code):
    emit(EV_KEY, code, 1); syn()
    emit(EV_KEY, code, 0); syn()


acc = {"v": 0, "h": 0}


def handle(m):
    t = m.get("t")
    if t == "move":
        emit(EV_REL, REL_X, int(m.get("dx", 0)))
        emit(EV_REL, REL_Y, int(m.get("dy", 0)))
        syn()
    elif t == "btn":
        code = BTN.get(m.get("b", "left"), BTN["left"])
        s = m.get("s", "click")
        if s in ("down", "click"):
            emit(EV_KEY, code, 1); syn()
        if s in ("up", "click"):
            emit(EV_KEY, code, 0); syn()
    elif t == "scroll":
        for axis, hi, lo, key in (("dy", REL_WHEEL_HI_RES, REL_WHEEL, "v"), ("dx", REL_HWHEEL_HI_RES, REL_HWHEEL, "h")):
            val = int(m.get(axis, 0))
            if not val:
                continue
            emit(EV_REL, hi, val)
            acc[key] += val
            notches = int(acc[key] / 120)
            if notches:
                emit(EV_REL, lo, notches)
                acc[key] -= notches * 120
        syn()
    elif t == "key":
        code = KEYS.get(m.get("k", ""))
        if code:
            tap(code)
    elif t == "combo":
        codes = [KEYS[k] for k in m.get("k", []) if k in KEYS]
        for c in codes:
            emit(EV_KEY, c, 1); syn()
        for c in reversed(codes):
            emit(EV_KEY, c, 0); syn()
    elif t == "text":
        for ch in m.get("s", ""):
            shift = False
            name = None
            if ch.isascii() and ch.isalpha():
                name, shift = ch.lower(), ch.isupper()
            elif ch.isdigit():
                name = ch
            elif ch in PLAIN:
                name = PLAIN[ch]
            elif ch in SHIFTED:
                name, shift = SHIFTED[ch], True
            if not name:
                continue
            if shift:
                emit(EV_KEY, KEYS["leftshift"], 1); syn()
            tap(KEYS[name])
            if shift:
                emit(EV_KEY, KEYS["leftshift"], 0); syn()
            time.sleep(0.004)


print("ready", flush=True)
try:
    for line in sys.stdin:
        try:
            handle(json.loads(line))
        except Exception as e:  # one bad message never kills the device
            print("err", e, file=sys.stderr, flush=True)
finally:
    fcntl.ioctl(fd, UI_DEV_DESTROY)
    os.close(fd)
