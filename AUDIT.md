# Audit Report — `claude/strategic-placement-mechanics-7trMx`

**Commit:** c5ee9bb — "Overhaul game to strategic placement mechanics"
**File:** index.html (single-file HTML/CSS/JS game)
**Auditor:** Claude | **Date:** 2026-02-24

---

## 1. Audit Verdict: Unsafe

The commit contains a **critical runtime crash** that halts the game loop on the first frame, plus several high-severity logic errors that cause incorrect game state when the crash path is bypassed.

---

## 2. Issues (ordered by severity)

### ISSUE 1 — Critical: Artillery button `textContent` destroys child DOM element, causing TypeError crash

**File:** index.html:1193–1199
**Risk:** Game loop halts on the first frame.

The artillery button at line 118 contains a child `<div>` with `id="cd-arty"`:

```html
<button id="btn-arty">Artillery (50)<div class="cd-bar" id="cd-arty"></div></button>
```

In `updateUI()` (called every frame), both branches of the artillery cooldown check use `artyBtn.textContent = ...` (lines 1193 and 1197). Setting `textContent` on a DOM node **replaces all child nodes** with a single text node, destroying the `cd-arty` element. Immediately after, lines 1195 and 1199 call:

```js
document.getElementById('cd-arty').style.width = ...;
```

Since `cd-arty` was just removed from the DOM, `getElementById` returns `null`, and accessing `.style` on `null` throws an uncaught `TypeError`.

Because `updateUI()` is called at line 1262 inside `gameLoop()`, and `requestAnimationFrame(gameLoop)` at line 1263 is never reached after the throw, **the game loop permanently halts after one frame**.

**On first frame:** `G.artilleryCooldown` is initialized to `0` (line 220), so the `else` branch (line 1196) executes, triggering the crash immediately.

**Why it matters:** The game is non-functional. No gameplay occurs.

**Corrective action:** Use `artyBtn.innerHTML` or `artyBtn.firstChild.textContent` to update only the text node without destroying the `cd-bar` child. Alternatively, restructure to use a separate `<span>` for the label text.

---

### ISSUE 2 — High: Player artillery deducts resources without re-checking balance

**File:** index.html:489–490
**Risk:** Player resources can go negative.

When the player triggers artillery, `triggerArtillery()` (line 518) validates `G.resources.blue >= 50` and sets `G.artilleryPending = true`. However, the actual deduction at line 490 in the click handler:

```js
G.resources.blue -= 50;
```

does **not** re-validate that resources are still >= 50. If the player spends resources on unit placements between triggering artillery and clicking the target, resources go negative.

**Why it matters:** Negative resources break the resource display (shows negative numbers) and violate the game's economic constraints. Players could exploit this to get a free artillery strike.

**Corrective action:** Add `if (G.resources.blue < 50) { G.artilleryPending = false; log('Not enough resources.'); return; }` before the deduction at line 490.

---

### ISSUE 3 — High: AI artillery uses stale resource variable, can drive resources negative

**File:** index.html:623, 696–700
**Risk:** AI resources go negative.

`const r = G.resources.red` is captured at line 623, at the top of `updateAI()`. The AI may then spawn a unit via `spawnUnitAt()` at line 690, which deducts from `G.resources.red`. The artillery check at line 696 tests `r >= 50` using the **stale** pre-spawn value.

Example: AI has 75 resources. `r = 75`. AI spawns a tank (cost 70), so `G.resources.red = 5`. Check `r >= 50` passes (75 >= 50). Line 700 deducts: `G.resources.red = 5 - 50 = -45`.

**Why it matters:** Negative AI resources mean the AI effectively gets free units and artillery until resources regenerate back to positive, creating an unfair advantage.

**Corrective action:** Replace `r >= 50` at line 696 with `G.resources.red >= 50`.

---

### ISSUE 4 — High: AI artillery logic is gated behind unrelated early returns

**File:** index.html:629–633, 696
**Risk:** AI artillery almost never fires.

The artillery check at line 696 is placed at the end of `updateAI()`, **after** three early-return gates:
- Line 629: `aiThinkTimer < 2000` → return (fires once every ~2s)
- Line 632: `aiDeployCd > 0` → return
- Line 633: `countSupply >= supplyCap` → return

Combined with `G.frameCount % 600 === 0` (approximately once every 10 seconds at 60fps), the artillery code only executes when all of these conditions align simultaneously. The probability of `frameCount % 600 === 0` coinciding with the 2-second think window and no deploy cooldown is extremely low.

**Why it matters:** The AI effectively never uses artillery, removing a key mechanic from the opponent and making the game unbalanced in the player's favor.

**Corrective action:** Move the AI artillery check before the early returns at line 632–633, or into a separate function called unconditionally (but still respecting its own independent cooldown).

---

### ISSUE 5 — Medium: Unit hard cap silently destroys oldest player units

**File:** index.html:1231–1233

```js
if (G.units.length > 100) {
  G.units = G.units.slice(G.units.length - 100);
}
```

When total units exceed 100, this discards the **oldest** units (beginning of the array). Since units are appended via `push()`, early-placed player units are the most likely to be culled. There is no notification, no resource refund, and no distinction between player and AI units.

**Why it matters:** Player units that cost resources silently vanish, causing confusion and breaking strategic planning. The player has no way to know why their units disappeared.

**Corrective action:** Either increase the cap, add a warning, or preferentially cull units more intelligently (e.g., avoid culling player units, or cull the lowest-HP units).

---

### ISSUE 6 — Medium: Frontline smoothing is frame-rate dependent

**File:** index.html:728

```js
G.frontline[lane] += (target - G.frontline[lane]) * 0.04;
```

The smoothing factor `0.04` is applied per frame, not scaled by `dt`. At 60fps, this gives ~2.4 units of movement per second toward the target. At 30fps, it gives ~1.2. At 144fps, ~5.76. The frontline will converge at different rates depending on the player's display refresh rate.

**Why it matters:** Game balance around territory control is inconsistent across hardware. Players with higher refresh rates see faster frontline shifts.

**Corrective action:** Replace the fixed factor with a dt-scaled exponential decay, e.g.:
`G.frontline[lane] += (target - G.frontline[lane]) * (1 - Math.pow(0.96, dt / 16.67))`.

---

### ISSUE 7 — Low: AI artillery timing is frame-rate dependent

**File:** index.html:696

`G.frameCount % 600` triggers differently at different frame rates. At 60fps this is ~10s, at 30fps ~20s, at 144fps ~4.2s.

**Why it matters:** Minor — AI artillery is already effectively non-functional due to Issue 4. If Issue 4 is fixed, this becomes a real balance inconsistency.

**Corrective action:** Replace frame-count-based timing with a dedicated elapsed-time accumulator.

---

## 3. Recommended Immediate Fixes

| Priority | Issue | Action |
|----------|-------|--------|
| **P0** | #1 — textContent crash | Replace `artyBtn.textContent = ...` with a method that preserves child nodes (e.g., update only the first text node, or wrap label text in a `<span>`) |
| **P1** | #2 — Player artillery resource check | Add resource >= 50 guard before deduction at line 490 |
| **P1** | #3 — AI stale resource variable | Use `G.resources.red` instead of cached `r` at line 696 |
| **P1** | #4 — AI artillery unreachable | Move AI artillery to execute independently of unit-spawn early-return gates |

Issues #5–#7 are deferrable but should be addressed before the game is considered balanced or shippable.

---

## 4. Audit Confidence: High

**Reason:** Single-file application with no external dependencies, no async I/O, no build step. All logic is self-contained and fully inspectable. The critical crash (Issue #1) is deterministic and occurs on every execution — it requires no special conditions to reproduce. Issues #2–#4 are traced through straightforward control flow analysis. No ambiguity in the findings.
