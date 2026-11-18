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

Browser evidence: a reconnaissance patrol returned to extraction in 13m 52s of simulated time with both photos and full hull health. A separate exposed patrol provoked escort pursuit, depth charges and flooding while its drone was deployed; the drone returned successfully. Save/resume preserved its remote state. Sound activation and all four stations ran without browser error or warning logs. The Nix build passes 16 simulation checks and JavaScript syntax checks. Historical fidelity, difficulty balance, mobile touch ergonomics and audio mix quality have not been independently validated.

Future design choices, outside this prototype: campaign progression, variable weather and mission layouts, richer acoustic propagation, crew specialties and repair choices, detailed periscope waves, more audio layers, full conning-tower binoculars, and a balance pass based on actual play sessions. Nuclear propulsion remains excluded because it removes the recharge vulnerability at the center of the design.
