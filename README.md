# Quiet Depths

A browser submarine game about incomplete information and calculated exposure. A fictional diesel-electric boat in 1968, three short patrols, and no omniscient enemy map.

## Build and run

Nix is the canonical build. The complete verification entry point is `./test`, which runs `nix build`. The build runs the simulation tests and produces the static site. Nix flakes must be enabled. On Windows, run through a Nix-enabled WSL distribution.

```sh
./test
nix develop --command node scripts/serve.mjs
```

For development preview, copy the Nix build output into `dist/` first (`mkdir -p dist && cp -r result/. dist/`). The preview listens on `http://127.0.0.1:4173`. Any static web server can serve the built output. There are no runtime services or package installation steps.

## Play

Choose reconnaissance, interception, or passive surveillance. Photograph silhouettes, intercept a military freighter, or quietly collect traffic intelligence. Complete the task and return to the chart's extraction circle. The patrol window is 30 simulated minutes. Use 5× and 20× for transit; new contacts and attacks return time to 1×. Space pauses; progress autosaves in this browser's local storage.

- **1–4**: periscope, sonar, chart, drone.
- **P**: raise/lower scope at 15 meters or less. Drag to pan; scroll to zoom.
- **C**: photograph a merchant within five degrees of the reticle. Separate silhouettes require separate framing.
- **G**: active sonar. Range information also exposes you.
- **R**: silent running, limited to 3 knots.
- **Drone**: deploy at 80 meters or less; W/S move, A/D turn, Q/E descend/ascend. Recall before its battery runs out.
- Click the chart to order a waypoint. Ordered depth stays under your control.

Diesel runs above 14 meters, charging air and battery but making noise. Electric runs submerged and consumes finite battery and oxygen. The boat can hit generated bathymetry or exceed 220-meter test depth. Pursuing escorts drop delayed charge patterns. Repairs take time and battery. Acoustic torpedoes may acquire the wrong ship; identified neutrals are protected by the UI, but a seeker can still stray.

## Prototype boundaries

Single-player, procedural waves and terrain, approximate acoustic detection, simplified repairs, and synthesized audio. No crew interior or nuclear propulsion. The freely controlled inspection ROV is a deliberate historical liberty. Passive contacts reveal bearings; visual observations and active pings store aging position estimates. The chart never renders live hostile positions. It shows your submarine symbol for navigation; an exterior 3D boat view is available only through the drone.

The simulation is independent of rendering, runs in fixed substeps, and saves its random seed with state. The tests include time-step batching invariance and state serialization round trips. These checks cover rules, not game balance or historical accuracy. Browser playtesting is still needed to tune difficulty and pacing.

Three.js 0.170.0 is vendored under its MIT license. DM Sans, IBM Plex Mono, and Libre Caslon Display are vendored under their included SIL Open Font Licenses. The built game makes no external requests. No accounts, tracking, multiplayer, or backend.
