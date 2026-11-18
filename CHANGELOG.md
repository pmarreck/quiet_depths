# Changes

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
