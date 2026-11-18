# Quiet Depths prototype

The design centers on uncertainty: observation should improve a player's picture while exposing the boat. Short patrols should have a clear objective and an extraction, with simple helm orders and time compression for transit.

- [x] Browser-native, locally vendored rendering and fonts, no runtime services.
- [x] Four stations: periscope, sonar, chart, inspection drone.
- [x] Fixed-step simulation, resources, detection, pursuit and depth charges.
- [x] Acoustic torpedoes with ambiguous target acquisition and neutral consequences.
- [x] Shared procedural bathymetry for navigation, terrain and collisions.
- [x] Three objective types and extraction; local save and resume.
- [x] Nix build with blocking simulation and JavaScript syntax checks.
- [x] Browser verification of reconnaissance, extraction, sonar and chart.
- [x] Verify drone deploy/recovery and save/resume in the browser.
- [x] Prepare source and static deployment output for private publication.

Initial prototype evidence: a reconnaissance patrol returned to extraction in 13m 52s of simulated time with both photos and full hull health. A separate exposed patrol provoked escort pursuit, depth charges and flooding while its drone was deployed; the drone returned successfully. Save/resume preserved its remote state. Sound activation and all four stations ran without browser error or warning logs. That version passed 16 simulation checks and JavaScript syntax checks. Historical fidelity, difficulty balance, mobile touch ergonomics and audio mix quality have not been independently validated.

## Control and legibility corrections

- [x] Fully blank and inert periscope/drone feeds while offline.
- [x] A fixed-ahead drone camera with bounded acceleration, turning and depth changes.
- [x] Shared WASD and Space/C requested orders, with actual/requested ticks and readouts.
- [x] Hull-relative periscope rotation and upright camera orientation at every bearing.
- [x] Central pause guards for physical inputs and actions, with Esc to pause and F for photographs.
- [x] Cursor-anchored chart zoom, drag pan, recentering and click-only waypoint placement.
- [x] Heading-up sonar geometry and relative contact bearings.
- [x] Larger typography: 16px body, 14px controls, 12px secondary metadata.
- [x] Extraction requires both the pickup area and surfacing; legacy saves migrate.
- [x] Complete the submerged-arrival / surfaced-pickup browser check.
- [x] Prepare the corrected source and static output for private publication and artifact packaging.

Correction evidence: a full reconnaissance patrol arrived at pickup at 90 meters without completing, then surfaced and completed in 14m 56s of simulated time with both photographs and full hull health. Browser checks confirmed opaque inactive feeds, ignored inactive periscope dragging/zooming, an upright rearward camera, a scope that turns with its hull while preserving relative angle, actual/requested keyboard orders, a fixed-ahead drone camera, drone recovery, paused command guards, heading-up sonar, chart pan/zoom/recenter, and 16px body / 14px helm and contact text without horizontal overflow at the tested desktop viewport. No browser errors or warnings were logged. The Nix build passes 27 checks, including a sweep of 720 camera headings against Three.js matrices, chart coordinate invariants, pause guards, inertia/time-batching invariance, and old-save migration.

Future design choices, outside this prototype: campaign progression, variable weather and mission layouts, richer acoustic propagation, crew specialties and repair choices, detailed periscope waves, more audio layers, full conning-tower binoculars, and a balance pass based on actual play sessions. Nuclear propulsion remains excluded because it removes the recharge vulnerability at the center of the design.
