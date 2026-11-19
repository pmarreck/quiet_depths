# Changes

## 0.6.0

- Replace the phone layout with a fixed helm, vertical speed slider, compact status, exact-order sheets and station actions below the scene. Keep a visible Sound OFF/ON label, resource access and touch sonar ping.
- Preserve contact buttons and gun target options across telemetry updates, fixing missed selections. Assign stable contact codes and share surfaced eligibility across gun and tower/status views.
- Preserve the existing patrol/library when the initial briefing is opened, hidden or closed before you choose to start or resume.
- Clear casualty scenery between mission types, fixing a renderer exception that froze a patrol started after rescue or survey.
- Route ROV recall through a deterministic hull-clearance path, including a surfaced moving boat, without bypassing collisions. Attach and animate its cable and show global deployment, range and condition-aware outrun warnings.
- Replace pitched flower-like blades with compact gray helical screw geometry and refine period-inspired stern planes and rudders.
- Increase chart zoom to 128×, scope magnification to 24× and binoculars to 12×. Add sea-driven optical sway and keep sonar labels readable in short viewports.
- Add screen cracks, a red wash, rising bubbles and mute-respecting implosion audio on loss.
- Add the approved fictional 1972 classified orbital prototype: 10 km chart tasking, overpass warmup, two exposures, weather/night limits, depth-limited staged transmission and a long cooldown.
- Keep timestamped surface fixes, measured velocity, growing uncertainty and firing bearings independent of the live target position. Freeze camera pixels at the shutter even when immediately switching stations. Archive bounded real scene photographs and frozen monochrome recon plates across patrols/reloads.

Validation: the canonical Nix gate passes 181 tests, syntax checks and the static build. Regression tests were observed failing before their fixes. Independent vehicle acceptance covers 96 recovery scenarios. Browser evidence and device/audio limitations are recorded in PLAN.md.

## 0.5.0

- Set patrols in 1972, with a researched tapered hull, compact dark propeller, sail planes and period-style cabled television ROV. Retain fictional DU explosive gun ammunition by design.
- Randomize mission layouts, extraction, target names and requirements with replayable seeds and random starting conditions. Carry six torpedoes in every mission.
- Add explicit periscope/bow bearing, center-on-bow and turn-boat-to-sight orders.
- Add physically traveling gun rounds, finite ammunition, tracers, aimable aircraft, waterline flooding and gradual sinking.
- Give torpedoes independent acoustic steering, depth tracking, ambiguous acquisition and shallow surface wakes.
- Add delayed island air support, runway takeoff, travel, last-known-position searches, strafing, falling/sinking bombs and spatial engine sound.
- Add a mobile layout, mission/weapons drawers, held touch helm/fire controls and chart zoom buttons. Preserve muted startup.
- Publish through a GitHub Pages workflow gated by the canonical Nix test/build entry point.

Validation: tests were introduced before the implementation, including independently authored combat acceptance tests. The Nix gate covers 98 tests, JavaScript syntax and the static build. Browser observations and remaining device limitations are recorded in PLAN.md.

## 0.4.0

- Add solid drone/hull/wreck collisions, a 100 m three-dimensional control radius, deeper launch limits, finite drone battery, 10% warning, permanent mission loss, onboard charging and repairs, and functional drone damage.
- Add undersea rescue, surface rescue and wreck survey missions with marked approaches, timed work, unknown survivor counts, casualties, team recovery and flavored finds.
- Render rescue divers and carried survivors, rescue launches, wrecks, schools of fish, sharks, a whale and octopuses.
- Add ballast/plane vertical dynamics, floodwater weight, independent subsystem damage, reduced repair capacity from crew injury, rare torpedo cookoff, periscope loss, escort shellfire and shallow-hull ramming.
- Add an open conning-tower station with vertical look, a five-blade rotating propeller, animated control surfaces, an opening rescue hatch and depth-dependent cavitation particles/noise.
- Improve visible lightning geometry and display duration, add flash bearing/range cues, and strengthen the thunder mix while retaining delayed propagation. Sound remains off until explicitly enabled.
- Preserve previous patrols through subsystem/save migration. Keep every mission tied to an explicit completion rule.

Validation: Nix build gates simulation, camera geometry, capsule geometry against Three.js, resource and survivor conservation, complete route-driven rescue, damage consequences, acoustic timing, old saves, muted startup and JavaScript syntax. The rules are game approximations, with no calibrated acoustic or historical-accuracy claim.

## 0.3.0

- Add prominent water depth and below-keel clearance, including the hull offset and shallow-water warnings. The drone station shows its own bottom clearance.
- Add selectable dawn/day/dusk/night, optional changing weather fronts, and clear/cloudy/rain/storm starting conditions.
- Couple lighting, running lights, clouds, rain, wave height/speed and visual detection range to one environmental state. Storms can wash over the scope.
- Add located lightning with delayed thunder. Air and water paths use different sound speeds; underwater thunder is quieter and more muffled with depth, including its ongoing tail.
- Add continuous ship-engine voices with distance attenuation and stereo bearing.
- Model sinking depth charges, underwater detonation bubbles, and a traveling pressure front that triggers nearby damage and spatial explosion audio.
- Preserve environmental state, pending sounds and heard events in saves; migrate older patrols.
- Generate wave slopes analytically from the shared component definitions and use a local procedural cloud texture to keep rendering lighter.

Validation: Nix build and 47 checks, including independent interface-path search, sound travel and attenuation, moving-listener arrival, weather/detection effects, all starting-time presets, waves, legacy saves and existing regressions. Browser checks cover the day/night cycle, weather scenes, soundings, engine sources, thunder scheduling and blast routing. No calibrated acoustics or subjective audio-quality claim.

## 0.2.0

- Blank and disable inactive periscope/drone feeds instead of dimming live scenes.
- Use one requested/actual helm model for the submarine and drone. W/S change requested speed, A/D heading, and Space/C depth; motion follows bounded acceleration, turn and depth rates.
- Keep the drone camera fixed ahead. Its helm shows direction, speed and depth.
- Make periscope angle relative to the hull; keep the horizon upright at every bearing.
- Show white actual ticks and gold requested ticks with numeric readouts.
- Block physical orders and mission actions while paused. Esc pauses; F photographs. Chart inspection and station selection remain available.
- Add cursor-anchored chart zoom, drag pan, and Center Boat. Dragging does not plot a route.
- Make sonar heading-up with relative contact bearings and a north reference.
- Require surfacing inside the extraction circle. Return time compression to 1× at pickup and waypoint arrival.
- Increase body text to 16px, controls to 14px, and secondary metadata to 12px.
- Migrate existing patrol saves without discarding progress.

Validation: Nix build and 27 checks; browser verification of camera, input, pause, chart, drone and surfaced-pickup behavior. Balance, historical fidelity and the full range of devices remain prototype work.
