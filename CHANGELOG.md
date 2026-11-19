# Changes

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
