# Number Royale

A browser FPS number battle royale (desktop + mobile). No weapons and no skills: every player has a **4-digit code** above their head. Spot an enemy's code, memorize it, and type the numbers correctly to eliminate them. Pure speed and memory!

> Phase 1: **Bot Mode** (you + 49 bots). Real Player mode (X login + multiplayer) is phase 2 — the menu button already exists as "Coming soon", it is not active and there is no fake multiplayer.

## Menu
Compact hub: the main screen shows only **NUMBER ROYALE** plus 4 buttons — PLAY WITH BOTS, PLAY WITH REAL PLAYERS, CHARACTER, INFO. Everything fits at 100% zoom, no scrolling needed.
- **PLAY WITH BOTS** → SELECT MAP (☀️ DAY / 🌙 NIGHT) → SELECT DIFFICULTY (EASY / MEDIUM / HARD) → SELECT GRAPHICS (AUTO / LOW / HIGH) → match starts.
- **PLAY WITH REAL PLAYERS** → same map + difficulty + graphics flow, then a "Coming soon — X login required" notice (phase 2, not faked).
- **CHARACTER** → your skin picker (Rookie/Gold/Flame/Rainbow) and the KILL REWARDS panel (8 accessories, lock states, next-reward progress, tap each unlocked accessory to equip/unequip it).
- **INFO** → collapsible sections: how to play, map, items, kill rewards, minimap, announcements, PC & mobile controls.
Every sub-screen has a ← BACK button. Each screen shows only its own options.

## How to play

- **Third-person view:** your own Steve-style blocky character is visible — square head with pixel-art face (eyes + smile), hair, colored shirt/pants — identified by a white ring at its feet (no floating code label above your head — memorize it during the 5s countdown). WASD/joystick movement turns the character to face the direction it is actually running, while the camera smoothly settles behind it. The camera pulls in when a wall or container blocks it.
- **PC:** mouse auto-locks when the match starts • move the **mouse to look** (FPS-style: smoothed, pitch-clamped, pointer-lock; WASD moves relative to the camera) • `ESC` releases, click to re-lock • `SHIFT` to sprint • `SPACE` to jump • type `0-9` to enter codes • `Backspace` to delete • mouse sensitivity slider in INFO • after death: drone cam — `WASD`/arrows to pan, mouse wheel to zoom
- **Mobile:** phones must be in **LANDSCAPE** — portrait shows a rotate prompt and pauses the match • left joystick to move • drag the right side of the screen to rotate the camera • `JUMP` button • on-screen number keypad • tap the minimap to collapse/expand it (smaller on phones)

## Death & kill presentation (v21)

- **Kill cam:** when you die, the camera swings to your killer for 4–5s (slow orbit + push-in, killer marked with a pulsing gold ring, "ELIMINATED BY <code>" card) — then it hands off to the drone spectate cam. Zone deaths show a brief "ELIMINATED BY THE ZONE" card instead. Click/tap anytime to skip straight to the drone.
- **Announcer voice:** fixed the old cross-wiring (FIRST BLOOD's banner used to play while "good game" was spoken — `speak()` cancels the previous line, and two lines fired in the same frame). Now exactly ONE spoken line per kill event, always matching the top banner; SUDDEN DEATH also speaks its own line. Voice delivery is deeper and more dramatic (deepest male English voice available, pitch 0.65, rate 0.88). Voice quality still depends on the voices installed in the player's browser/OS.
- **Death sound:** the old "ahhh" could stay silent when the AudioContext was created after the one-shot unlock gesture (it stayed suspended). Now it resumes-and-plays defensively, and the sound itself is a deep, heavy, resigned ~0.9s "Ahhhhhhh" (200→80Hz: sine core + lowpassed sawtooth for throat texture, no vibrato), clearly audible.

## Visuals (v20)

- **Characters:** Steve-style blocky humans are back (v18 look) — square head with pixel-art face (eyes + smile, 16×16 canvas texture), 6 hair colors, colored shirts/pants per character. Accessories (hat, crown, wings, cape, shoes…) re-anchored to the body with per-item equip toggles.
- **Supply drops:** plain wooden crates (v18 style).
- **Auto-fullscreen:** the match requests fullscreen from the SELECT GRAPHICS click (hides the mobile browser address bar); iOS Safari falls back gracefully; fullscreen exits when the match ends.
- **Mobile perf:** dynamic resolution on touch devices — pixel ratio steps down (2 → 1.5 → 1.25 → 1) when FPS sags below ~45, back up when it recovers; LOW quality also halves clouds and hides the sun glow sprite.

## Visuals (v16 polish)

- **Sky:** gradient dome (vibrant blue → warm horizon by day, dark starry gradient at night), a visible glowing sun disc, and blocky voxel clouds drifting slowly (one instanced draw call).
- **Ground:** lush two-tone grass canvas texture with dirt patches; park has instanced grass tufts and wildflowers (HIGH quality only — skipped on LOW/mobile).
- **Colors:** punchier saturated containers, blue water-tower tank with red roof, warmer golden sunlight + stronger hemisphere bounce, warm-orange zone ring.
- Night mode keeps its lamp-lit look; the dome swaps to the night gradient and the sun hides.

## Difficulty (Play with Bots)

Pick your level after pressing **PLAY WITH BOTS** (MEDIUM is the default):

| Level | Bot reaction | Bot typing per digit | Bot speed | Notes |
|---|---|---|---|---|
| EASY | 1.4–2.2s | 0.9–1.3s | 0.82× | Bots sometimes fumble and lose their progress. ~5–8s of being watched before you die. |
| MEDIUM | 0.8–1.4s | 0.6–0.9s | 0.93× | Rare fumbles. ~3.5–5s before you die while visible. |
| HARD | 0.4–0.9s | 0.35–0.6s | 1.0× | The original ruthless bots. No mercy. |

Fairness rules on every level: bots cannot type for the first **3 seconds after GO** (spawn grace), spawn points are spread out and kept out of direct line of sight, and a small **DETECTED** badge under the minimap fills up (▮▮▮▯) as a bot gets closer to finishing your code — break line of sight to stop them.
- A code only eliminates an enemy you are currently looking at, or one you saw within the last **5 seconds** (memory window)
- Wrong code / enemy not seen: buffer cleared + input locked for **0.8 seconds** (anti brute-force)
- If a bot is typing your code, a small **DETECTED** badge appears under the minimap — break line of sight to stop them
- Before the match starts there is a **5-second countdown** to memorize your own code
- The safe zone keeps shrinking. Outside the zone you have 5 seconds to get back before being eliminated
- Win = be the last one standing out of 50

### Drop items (LOVE + DECOY + CONFUSE + MIMIC)

Random item drops spawn around the map (~3 active at a time). **Supply drops** fall every **15 seconds** (the first one lands right at GO) with a light beacon everyone can see — each contains 2–3 items. Player and bots both pick items up by walking over them. About 22% of spawned items are **🎭 MIMICS** — traps that look IDENTICAL to a real item (same icon, same ring color) but scramble the PICKER'S OWN code when grabbed. Bots fall for them too.

- **❤️ LOVE shield:** makes you immune to ONE code-kill attempt. A small ❤️ floats next to your head so everyone can see it. If someone types your code while shielded, the kill is blocked, the shield is consumed, and the attacker is told "IMMUNE" and briefly locked out. Non-stackable (one at a time). Does NOT protect from zone damage.
- **🔀 DECOY:** instantly re-randomizes your 4-digit code (always unique among living players). A notification shows the new code immediately. Bots mid-typing your old code fumble and lose their progress.
- **💥 CONFUSE:** instantly scrambles the NEAREST living enemy's code. Fizzles harmlessly if no enemies remain.

### Kill announcements

Big celebratory center-screen banners for YOUR kills (queued, max 2 at a time, auto-fade): the match's very first kill is announced as **🩸 FIRST BLOOD!**; per-life streak tiers escalate **GOOD GAME!!! → DOUBLE KILL!! → TRIPLE KILL!!! → RAMPAGE!!!! → UNSTOPPABLE!!!!! → LEGENDARY!!!!!!**; plus **😤 REVENGE!** (kill the bot that killed you last) and **🎯 LONG SHOT!** (kill from >40m). Bots only get small kill-feed lines — the big screen is yours.

### Minimap

A small canvas map in the top-left corner (~10fps redraw): your position + facing arrow, the zone circle with the next shrink target (dashed), generic item dots (types never revealed — mimics included), pulsing supply-drop beacons, and enemies — but ONLY enemies you can currently see (same angle + line-of-sight rules as the 3D view, no wallhack). Works on mobile too.

### Day / Night map select

After PLAY WITH BOTS you pick the map: **☀️ DAY** or **🌙 NIGHT**, then the difficulty. Night mode: dark sky with stars, dimmed ambient, warm glowing lamps everywhere (every lamp post + building interiors carry real point lights) — and enemy code labels fade out ~15% sooner (subtle, not punishing). Gameplay is otherwise identical.

### Kill streaks

Consecutive kills without dying build a streak. At **3+ kills** you go **🔥 ON FIRE** — a flame visual and a kill-feed hype line. Purely cosmetic, no power bonus. Dying resets the streak.

### Sudden death

When **5 or fewer players** remain, SUDDEN DEATH triggers: the zone collapses steadily (slow enough that a sprinting player can stay inside) and every living player's code label starts blinking. The 5-second memory window still works exactly the same.

### Spectate (drone cam)

Dying no longer dumps you to a static screen — you enter **spectate mode** with a free **drone camera**: a tilted top-down view you can pan anywhere on the map. `WASD` / arrow keys pan, mouse wheel zooms (on mobile: one-finger drag to pan, pinch to zoom). The drone can't leave the map and zoom is clamped so code labels stay readable without clipping through buildings. A **FOLLOW LEADER** toggle glides the drone after the kill leader. Your placement (`#N of 50`) is shown; EXIT returns to the menu.

### Bot personalities

Every bot gets a personality at spawn (~40/30/30 mix), affecting movement decisions only — typing skill still follows the difficulty level:

- **AGGRESSIVE:** seeks the nearest visible enemy and closes distance
- **CAMPER:** holes up inside buildings (ground or upper floor), engaging only visible enemies
- **HUNTER:** prioritizes seeking items and supply drops

### Bot movement AI (v17)

Bots move like humans, not bumper cars:

- **Whisker avoidance:** staggered clearance probes ahead/left/right — when blocked, bots steer toward the clearer side instead of pushing into walls
- **Stuck recovery:** if a bot barely moves for ~1.5s while trying to, it picks a fresh heading, hops, and takes over its route briefly
- **No idle-freeze:** every bot always has an order (roam / hunt / loot / patrol); campers patrol their hideout and rotate buildings instead of standing still
- **Jumping:** bots hop low obstacles (crate lips, curbs, stair edges) when a probe detects them, plus occasional natural hops
- **Close combat:** aggressive bots circle-strafe their prey while typing instead of freezing in place

Difficulty tuning (reaction time, typing speed, mistake rate, speed multiplier) is unchanged — only the movement behavior was fixed.

### Unlockable skins

Wins are tracked in `localStorage`. Unlock cosmetic character colors: **Gold** (1 win), **Flame** (5 wins), **Rainbow** (10 wins, animated hue). Pick your skin from the menu — locked ones show their requirement.

### Lifetime kill rewards (player-only accessories)

Your total kills across ALL matches are tracked in `localStorage` (`nr_unlocks.totalKills`). Hit a tier and the accessory equips on your character (mid-match, with a "🎁 REWARD UNLOCKED" banner) — all equipped accessories stack visually. Tap any unlocked accessory in the KILL REWARDS menu panel to equip/unequip it individually. Bots never get accessories.

- 👟 **SHOES** (10 kills), 🎩 **HAT** (15), 👕 **SHIRT** (25), 🧥 **JACKET** (35)
- 👑 **GOLDEN CROWN** (50), 🪽 **WINGS** (75), 🌈 **RAINBOW TRAIL** (100, particle trail while moving), 🦸 **CAPE** (150)

The panel shows your total kills, each reward's unlock state, and progress to the next one ("7 kills to 🎩 HAT").

### Night lighting

At night every one of the 10 buildings gets an entrance lamp and both roads get lamp posts — and since v22 **every** lamp carries a real point light with the park-lamp spec (0xffc37a, intensity 40, distance 30, decay 1.7), so all lamps illuminate their surroundings, not just themselves. Building interiors are lamp-lit too (one ceiling lamp per building; the five two-story buildings also on LOW). Light budget — HIGH: 4 park + 22 lamp posts + 10 interior = 36 point lights; LOW tier (mobile): 2 park + 6 key lamp posts + 5 two-story interiors = 13.

### Crashed airplane landmark

A wrecked airplane in the south-east quadrant: broken two-piece fuselage (nose buried), detached wing stuck in the ground, tail section, scattered debris, scorched ground decal, and drifting smoke. Full collision + line-of-sight blocking — a real landmark with cover.

## Features

- 50 smaller blocky Roblox/Minecraft-style characters with unique colors and codes (canvas sprites above enemies' heads; your own head has no label — just a white locator ring)
- Large 240×240 map packed with cover: **five two-story buildings you can enter** (doorway, stairs, windowed upper floor — hide inside, peek through windows), container yards and stacks in every quadrant, 5 single-story warehouses/huts with doorways, a central park with lawn, fountain, trees, benches and lamps, wrecked cars on the roads, a **crashed airplane** in the south-east (landmark with smoke + scorch mark), a water tower, maze walls, crate clusters, barriers, roads, perimeter wall
- Bots at three difficulties (see above): they fight each other, chase targets, camp, hunt items, climb stairs, and type codes with varied reaction speeds
- Kill feed, alive counter, elimination banner, crosshair hit marker, WebAudio sound effects
- Shrinking safe zone (battle royale pressure) + sudden death endgame
- Lightweight performance: Lambert materials, no heavy shadows, capped pixel ratio, staggered bot perception — mobile friendly
- **Auto graphics quality:** phones default to LOW, desktop to HIGH — chosen on the SELECT GRAPHICS screen right after difficulty (both bot and real-player flows). The choice applies to the next match, no reload needed. LOW keeps full HD resolution and antialiasing, but uses emissive-only night lamps (2 real point lights), no plane smoke, fewer trail particles, slightly closer fog. Sound: announcer voice for your kill announcements, a short disappointed "ahhh" when you die, master 🔊/🔇 toggle in **INFO → Sound** (saved in this browser).

## Run locally

Requires Node.js 18+.

```bash
npm install
npm run dev      # open http://localhost:5173
```

Production build:

```bash
npm run build
npm run preview
```

## Deploy

The `npm run build` output (`dist/` folder) is a static website — host it on Vercel, Netlify, or Cloudflare Pages. Bot mode runs 100% in the browser, no server needed.

## Structure

```
index.html      HTML entry
src/main.js     All game logic (Three.js): map, characters, bot AI, zone, HUD, input
src/style.css   Menu, HUD, and touch control styling
```

## Phase 2 roadmap (not built yet)

- X login (OAuth) for Real Player mode
- WebSocket multiplayer server (matchmaking, minimum 5 players, server-authoritative code validation)
- Client on Vercel/Netlify, game server on an always-online host (Railway/Render/Fly/VPS)

## Notes

- All assets are procedural (no external image/font files); sounds are generated with WebAudio.
- "Number Royale" is a working title, easy to rename in `index.html` and `src/main.js`.
