# Quiet Depths

A browser submarine game about incomplete information and calculated exposure. A fictional diesel-electric boat in 1968, six mission types, and no omniscient enemy map.

## Build and run

Nix is the canonical build. The complete verification entry point is `./test`, which runs `nix build`. The build runs the simulation tests and produces the static site. Nix flakes must be enabled. On Windows, run through a Nix-enabled WSL distribution.

```sh
./test
nix develop --command node scripts/serve.mjs
```

For development preview, copy the Nix build output into `dist/` first (`mkdir -p dist && cp -r result/. dist/`). The preview listens on `http://127.0.0.1:4173`. Any static web server can serve the built output. There are no runtime services or package installation steps.

## Play

Choose reconnaissance, interception, passive surveillance, undersea rescue, surface rescue, or wreck survey. Photograph silhouettes, intercept a military freighter, or quietly collect traffic intelligence. Complete the task, return to the chart's extraction circle, and surface to 1 meter or less for pickup. The patrol window is 30 simulated minutes. Use 5× and 20× for transit; new contacts and attacks return time to 1×. Esc pauses; progress autosaves in this browser's local storage.

- **1–5**: periscope, sonar, chart, drone, conning tower.
- **P**: raise/lower scope at 15 meters or less. Drag to pan; scroll to zoom.
- **F**: photograph a merchant within five degrees of the reticle. Separate silhouettes require separate framing.
- **G**: active sonar. Range information also exposes you.
- **R**: silent running, limited to 3 knots.
- **W/S**: increase/decrease requested speed of the vehicle under control, including astern.
- **A/D**: turn requested heading left/right. Actual heading follows with a bounded turn rate.
- **Space/C**: change requested depth toward the surface/deeper. Actual depth follows gradually.
- **Esc**: pause or resume. Physical camera movement, helm orders, sonar pings, weapons, repairs and drone deployment are blocked while paused. Station selection and chart inspection remain available.
- **Drone**: deploy at 280 meters or less and 3 knots or less. Stay within 100 meters in three dimensions; exceeding the radius or exhausting the drone battery loses it for this patrol. A 10% alarm warns you to return. Its camera is fixed dead ahead; the same keyboard and helm controls pilot the drone while its station is selected. Recall before its battery runs out. The submarine keeps its own orders.
- **Periscope**: angle is relative to the submarine, so turning the hull turns the view. Inactive optics are fully blank and cannot rotate or zoom. A stowed/lost drone also has no view.
- **Sonar**: heading-up, with relative contact bearings and a rotating north indicator. True bearings remain available through navigation and the periscope.
- Drag the chart to pan and use the wheel to zoom around the cursor. Click without dragging to order a waypoint. Requested depth stays under your control; Center Boat restores following.

The helm shows white actual ticks and gold requested ticks for heading, depth and speed. Its numeric readouts identify both values. The interface uses 16-pixel body text, 14-pixel controls and 12-pixel secondary metadata, with reflow on smaller displays. Existing patrol saves migrate to the new control fields.

Diesel runs above 14 meters, charging air and battery but making noise. Electric runs submerged and consumes finite battery and oxygen. The boat can hit generated bathymetry or exceed 220-meter test depth. Pursuing escorts drop delayed charge patterns. Repairs take time and battery. Acoustic torpedoes may acquire the wrong ship; identified neutrals are protected by the UI, but a seeker can still stray.

## Weather, soundings and sound

New patrols let you select dawn, day, dusk or night, plus clear, cloudy, rain or storm conditions. Changing weather fronts are optional. The environmental sky clock completes a day in 48 simulated minutes, independently of the patrol's elapsed-time counter. Fronts change every five simulated minutes and blend over 75 seconds. Night and storms reduce optical identification and the distance at which escorts can spot an unlit submarine. Running lights remain visible farther than dark hull silhouettes. Heavy weather masks some near-surface passive sound; deeper water reduces that masking.

The renderer and simulation share the same wave components and weather parameters. Storms increase wave height, speed, ship motion, rain and occasional periscope wash. Daylight, cloud cover, sun/moon direction, stars, running lights and lightning respond to the environmental state. The seafloor strip shows total water depth and space beneath the submarine's keel, five meters below its pressure-depth reference. Pitch increases the boat’s vertical hull extent. The drone uses its own position and a 0.7-meter collision radius. Shallow clearance is highlighted.

Enable Sound for continuous nearby engine/propeller noise, panned relative to the submarine's heading and attenuated by three-dimensional distance. Engine pitch follows vessel kind and speed. Thunder, torpedo detonations and charge explosions are located events with emission times. Their wavefronts are checked against the moving listener, and already-heard events are saved to prevent replay after loading.

Acoustic travel uses approximate constant speeds of 340 m/s in air and 1500 m/s in seawater, following [NOAA's sound reference](https://oceanservice.noaa.gov/facts/sound.html). Surface thunder uses direct three-dimensional air travel. Submerged thunder uses the minimum-time two-segment path through a flat air/water interface, found by a bounded numerical search. Thunder is represented by an effective point 65% of the way up the visible lightning channel. Its gain and low-pass cutoff decrease with listener depth, including while a rumble is already playing. Wavefront timing uses simulated seconds, so time compression also compresses flash-to-thunder delays.

Depth charges have a location, fuse depth and sinking interval. On detonation they emit an underwater pressure front. Nearby damage and sound occur when that front reaches the submarine. The drone can see sinking canisters and expanding underwater blast bubbles. Explosions get quieter and more filtered with distance; their propagation is distinct from air-origin thunder. The audio is procedural, with bounded effect voices and a master compressor.

This is a game approximation: no temperature/salinity profiles, full lightning-channel acoustics, sea-interface wave refraction, multipath echoes or calibrated sound-pressure levels. Unit checks compare the interface-path solver against an independent exhaustive search and verify attenuation, moving-listener arrival, charge timing and save round trips. The browser checks verify rendering and WebAudio scheduling/graph activity; subjective mix quality still needs listening-based playtesting.

## Rescue, survey and vehicle consequences

Undersea Rescue puts a disabled submarine on the reef shelf. Plot Approach sets a nearby waypoint, rescue depth and 3-knot transit, then stops. Hold 30–75 meters away, within five meters of the stated rescue depth, and at 0.6 knots or less. Divers leave the bottom hatch, assess the casualty for 22 seconds and transfer a survivor every nine seconds. The awaiting count starts as a question mark, then resolves. After the last transfer, hold another nine seconds for the team’s return. Some casualties have no survivors; time can reduce those remaining. An optional hostile patrol adds pressure.

Surface Rescue needs 30–85 meters of separation, surface depth under one meter, and the same low speed. Rescue launches shuttle survivors aboard. The casualty gradually settles and goes under after roughly eleven minutes, ending further transfers. A detected surfaced boat can draw delayed shellfire from escorts within 2.6 km. Escorts pursue and may ram shallow hulls. Raised periscopes passing under another vessel can be sheared away.

Wreck Survey accepts 45 seconds of close scanning at 0.5–3 knots, within 100 meters horizontally and 32 meters vertically, or three drone photographs from sides at least 55 degrees apart. Aim within 32 degrees of the wreck and stay within 85 meters for photographs. Findings include a ship’s bell, navigation records, ceramics or trade coins. These are mission rewards and flavor, not an inventory economy. The chart marks the reported site and the deployed drone, while hostile positions remain uncertain.

The drone collides with hulls, wrecks and the seabed. Impacts damage its integrity, thrusters, buoyancy and camera; a collision with your own boat can also damage plating. Charge pressure fronts reach the drone independently of their arrival at the submarine. Camera damage cracks the image, mobility damage reduces speed/turning, and buoyancy damage makes depth holding harder. Docking below 3 knots recharges at 0.32 percentage points per second and repairs at a crew-dependent rate. Charging uses boat battery unless diesel supplies power. Lost drones stay lost until a new patrol. Inspection shows fish schools, sharks, a whale and seabed octopuses, plus rescue divers, carried survivors and surface launches.

Requested depth drives gradual ballast changes and dive-plane deflection. Buoyancy moves an all-stop boat; planes add speed-dependent lift, while accumulated floodwater adds weight. Engine, propeller, air/scrubbers, ballast, planes, rudder, sonar, periscope and repair crew have separate condition. Damage control uses battery, pumps water, seals leaks and repairs recoverable systems. Injured crew work more slowly. Inflow above pump capacity fills compartments and can overwhelm buoyancy. Severe shocks can rarely detonate a stored torpedo. A sheared periscope cannot be repaired during a patrol; the conning tower remains available when fully surfaced and blanks as soon as you dive.

The detailed boat has a five-blade rotating propeller, shaft, forward/aft planes, stern rudder, deck fittings, masts and a hinged rescue hatch. Propeller RPM follows signed boat speed. Vapor particles and additional acoustic noise depend on a local cavitation number using ambient/hydrostatic pressure, vapor pressure, advance speed and blade rotational speed, following [MIT 2.611 Cavitation Notes](https://www.ocw.mit.edu/courses/2-611-marine-power-and-propulsion-fall-2006/b5483b7eff2776524737db0929227a26_04cavitation.pdf). Blade loading, RPM gearing and bubble appearance are tuned fictional parameters, so this is not a calibrated real-vessel cavitation threshold.

Lightning bolts have branched geometry, a short display hold so time compression does not skip them, and a bearing/range cue for off-screen flashes. Thunder still follows the located emission and moving-listener travel calculation. Low-frequency traffic carries farther underwater than in air in the game’s attenuation model. Sound starts OFF on every page load and requires an explicit click to open the audio device. Audio routing can be checked without playing sound in the browser; subjective mix quality remains a playtesting task.

## Prototype boundaries

Single-player, procedural waves and terrain, approximate acoustic detection, simplified repairs, and synthesized audio. No crew interior or nuclear propulsion. The freely controlled inspection ROV is a deliberate historical liberty. Passive contacts reveal bearings; visual observations and active pings store aging position estimates. The chart never renders live hostile positions. It shows your submarine symbol for navigation; an underwater exterior boat view is available through the drone. The surfaced conning tower lets you look down at your deck.

The simulation is independent of rendering, runs in bounded substeps, and saves its random seed and environmental state. The tests include time-step batching invariance, state serialization round trips, optics/detection effects, wave amplitude, acoustics and control guards. These checks cover rules, not game balance or historical accuracy. Browser playtesting is still needed to tune difficulty and pacing.

Three.js 0.170.0 is vendored under its MIT license. DM Sans, IBM Plex Mono, and Libre Caslon Display are vendored under their included SIL Open Font Licenses. The built game makes no external requests. No accounts, tracking, multiplayer, or backend.
