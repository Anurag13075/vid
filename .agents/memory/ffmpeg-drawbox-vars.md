---
name: FFmpeg drawbox filter variable names
description: In drawbox, h/w mean the box's own dimensions, not the video size — causes expression errors.
---

## Rule
In FFmpeg `drawbox` filter expressions, always use `ih` (input height) and `iw` (input width) to reference video dimensions. Never use `h` or `w` — those are the box's own height/width parameters.

**Why:** `drawbox=y=h*0.30` fails with "Error when evaluating the expression 'h*0.30'" because `h` is the box's own height (a settable parameter, not a read variable). FFmpeg rejects the circular/undefined reference.

## How to apply
- `drawtext`: `h` and `w` ARE valid (they mean video height/width). No change needed there.
- `drawbox`: Replace every `h*X` or `h-N` in `x=`/`y=` parameters with `ih*X` or `ih-N`. Replace `w*X` or `w-N` with `iw*X` or `iw-N`.
- The `h=` and `w=` *output* parameters of drawbox (setting the box size) should use `ih`/`iw` too if they reference video dimensions.
