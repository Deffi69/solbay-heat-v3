# SOLBAY HEAT

An original open-world crime game built for the make.fun **gta6-01** bounty ("Make GTA 6").
Everything in it — the city of Solbay, Reno Vale, Marisol Cruz, Piper Lang, the Corsairs,
Club Azahar, every vehicle, sign and synth note — was invented for this game. No assets,
names, art or music from any commercial game.

## The game

A sun-soaked coastal city of nine-by-nine streets: towers downtown, palms and a boardwalk
pier along the beach, a marina, a harbour warehouse district and an airfield. Cross it on
foot or by car — any car. Traffic circulates the grid, pedestrians stroll the sidewalks,
and the Solbay PD answers a five-star wanted system with routed pursuit AI, ramming and
gunfire.

- **Story**: five missions — *First Wheels*, *Borrowed Shine*, *Corsair Static*,
  *Hot Cargo*, *Solbay Goodbye* — with dialogue, a stolen gold coupe, a pier shootout,
  a timed cargo run under a three-star wanted level and a four-star escape to the runway.
- **Side jobs**: taxi fares and parcel rushes from the green ranks, paid by distance and time.
- **Systems**: stealable cars with witnesses, wanted heat that cools out of sight, a busted
  meter, hospital and fines, combat (pistol and fists, headshots count), a live circular
  minimap, a full HUD, synthesised engine/siren/music audio, and a localStorage save with
  Continue on the title screen.

## Play it

```sh
node serve.ts          # serves game/ at http://localhost:8080
```

Open the address in desktop Chrome. Keyboard and mouse: WASD to move/drive, mouse to look
(click the view to lock it), **E** to enter or steal a car and to talk, click to shoot,
**F** to punch, **R** to reload, **Shift** to sprint/boost, **Space** to jump/handbrake,
**C** camera, **P** pause, **M** mute.

## Layout

- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to the output directory
  and writes `dossier.json` with `vendor/makefun-game.ts` (the kit's library, unchanged).
- `game/` — the game itself: plain static files, no build step, no network requests.
  `game/vendor/three.module.min.js` is three.js r160 (MIT), vendored as a minified build.
  `game/src/` holds the game's own source, one job per file: `world` (the city), `vehicles`
  (cars and traffic), `pedestrians`, `player`, `police` (wanted + pursuit), `combat`,
  `missions` (story and side jobs), `hud` (HUD and minimap), `audio` (synth sound),
  `input`, `save`, `config`, `random`, `shots` (screenshot staging) and `main` (the conductor).
- `screenshots/` — four screenshots of the game itself, staged with the `?shot=` scenes in
  `game/src/shots.js` and listed in `shots.json`.

## License

MIT — see `LICENSE`.
