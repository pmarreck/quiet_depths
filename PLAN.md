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

## Environment and sound

- [x] Show total water depth and hull-offset clearance prominently.
- [x] Share weather and day/night parameters across optics, detection and rendering.
- [x] Add configurable patrol conditions, weather fronts, rougher storm seas, cloud cover, night lights and periscope wash.
- [x] Emit located lightning and compute moving-listener thunder arrival through air or air/water paths.
- [x] Apply depth-dependent thunder muffling and distance/bearing-dependent engine audio.
- [x] Model sinking depth charges, their pressure fronts, nearby damage and spatial blast audio.
- [x] Preserve old saves and retain heard-sound history.
- [x] Pass the Nix build and 47 automated checks.
- [x] Complete browser checks for soundings, conditions, thunder and explosion audio routing.
- [x] Prepare the source and static output for private publication and artifact packaging.

Environment browser evidence: inspected clear daylight, night running lights and rainy storm seas; observed a continuing patrol change from Dusk to Night. The soundings strip reported 230m water depth and 213m below the keel at 12m reference depth. WebAudio created five nearby engine sources. Distinct storm events produced a 14.894s surface thunder path with a 3200Hz cutoff and a 5.837s submerged path with a 665Hz cutoff. Those events had different source locations; the depth comparison is established by the independent model checks, not that pair of observations. An intentional exposed/pinging patrol provoked charge patterns and nearby blast damage; the final acoustic receipt was a blast with a 0.036s travel time and strong near-field gain. The patrol was lost at 3m 43s. No browser errors or warnings were logged. Sound routing and timing were checked; the mix was not independently auditioned or calibrated. Transient lightning sources and thunder arrivals were verified through the simulation and browser event state; a bolt screenshot is not used as an acceptance oracle.

Earlier deferred design choices, some addressed below: campaign progression, variable mission layouts, calibrated acoustic propagation and temperature layers, crew specialties and repair choices, full conning-tower binoculars, and a balance pass based on actual play sessions. Nuclear propulsion remains excluded because it removes the recharge vulnerability at the center of the design.


## Rescue and vehicle systems

- [x] Reproduce missing drone collision, range, deeper launch and charging rules with failing checks.
- [x] Add capsule collisions including boat pitch, finite drone range/battery and mission-permanent loss.
- [x] Add damaged drone mobility/buoyancy/camera, charge pressure damage, onboard repair and ship-powered charging.
- [x] Add ballast dynamics, planes, flooding weight, pumps, subsystem condition and crew-dependent repair.
- [x] Add three complete mission types, survivor assessment/casualties, crew return, scanning/photography and finds.
- [x] Render detailed hull/control surfaces, propeller/cavitation, rescue hatch/divers/launches and marine life.
- [x] Add conning tower, mast loss, shallow collision/ram damage, gunfire and shell impacts.
- [x] Improve lightning visibility, flash cues and the air/water sound-range distinction.
- [x] Preserve muted startup and verify no audio device opens before a user enables Sound.
- [x] Finish final browser visual checks and prepare the private update's build output.

Rules evidence: automated rescue runs use normal waypoint, heading, speed and depth controls, then complete only after assessment, survivor transfer and rescue-team recovery. Conservation checks cover both rescue types across 16 seeds each, including empty casualties. Capsule distances are compared against Three.js nearest-segment geometry across headings and pitches. No subjective audio audition is included in this update’s final browser checks; those sessions stay muted.

Final browser evidence: a rescue returned 13 survivors, and a separate empty casualty completed assessment and team recovery. A paused drone snapshot shows 3 aboard / 5 awaiting transfer, a diver swimming beside the wreck, seabed life and a fish in the live rendered scene. The drone operated at 104 m with an 18 m link and onboard condition readouts. A storm snapshot shows an actual lightning channel from the conning tower; three delayed thunder receipts accumulated with Sound OFF. Daylight tower inspection showed the hull below the bridge, and requesting a dive blanked the feed with the surface-only message. No browser errors or warnings were logged in these checks. The final Nix gate passes 74 checks and builds the complete static output. Difficulty, subjective sound quality and historical calibration remain playtesting work.

## 1972 combat, replay and public release

- [x] Write failing patrol/model tests and independent combat acceptance tests before implementation.
- [x] Research period hull, cabled television ROV and attack aircraft; retain the explicitly fictional DU ammunition exception.
- [x] Add a compact hull-colored propeller and a tapered hull with sail planes.
- [x] Randomize all six mission types and preserve seed/requirements through saves.
- [x] Add periscope bow reference, center-on-bow and turn-to-view orders.
- [x] Carry torpedoes in every mission and add independent acoustic steering, depth tracking and surface wakes.
- [x] Add finite deck-gun rounds, swept projectile hits, tracers, waterline flooding and aircraft targets.
- [x] Add island air-support preparation, runway takeoff, physical travel, last-report search, strafing and delayed ordnance.
- [x] Add aircraft engine attenuation and falling-bomb rendering; derive cavitation from the actual propeller radius.
- [x] Add mobile drawers, chart zoom buttons and shared held touch/keyboard input with cancellation.
- [x] Pass the canonical Nix build with 98 tests and JavaScript syntax checks.
- [x] Verify gun gating/ammunition, revised hull, touch layout and air-support warning in the browser; verify aircraft travel/combat through independent rule checks.
- [x] Publish the exact tested source to the public repository and Nix-gated GitHub Pages.
- [x] Update the private staging Site and package a portable source/build archive.

TDD evidence: the first combat/patrol gate failed before the combat, hull-design and held-input modules existed. Independent combat tests cover swept aim/elevation, flooding, seeker choices, aircraft launch/travel, deep quiet evasion, damage and save continuity. Three later regressions failed before the aircraft sound, bomb altitude and shared propeller-radius corrections. The original geometry, rescue, environment, pause and save checks remain required.

Browser checks so far: at 393 x 852, the interface has no horizontal overflow and six 44-pixel touch helm targets. Holding Faster changes requested speed while actual speed follows; releasing stops the held state. Pausing clears held inputs and disables all touch orders. Dragging the scope changes its relative bearing; Turn Boat to View changes the requested heading while preserving the sight bearing as the boat turns. Selecting the identified military contact and launching reduced stock from six to five; the status progressed to SONAR TRACK. The aircraft warning counted down rather than spawning an attacker on detection. Audio stayed OFF and no audio context opened. Hardware iPhone/Safari and subjective audio quality remain unverified.

Final local QA: the ROV viewed the tapered hull, sail planes and compact matching propeller at a 46 m link. Its inspection light was increased after the first view was too dark. Surface gun input reduced ammunition from 240 to 237, while a submerged gun view was blank and inert. The final mobile pass confirmed 14 px touch-button text, 44 px targets, 12 px secondary readouts, a working collapsible ALIGN menu, drawer dismissal and no horizontal overflow. Only the focused silhouette receives a scope label. A browser-discovered missing menu element was reproduced by a new mechanically discovered HTML/control check, which failed before correction. The final gate passes 98 tests. The current browser document has no error/warning logs after that fix; earlier error logs are retained in the browser session history. No claim is made of an on-device Safari test, subjective audio audition, or a visually observed complete aircraft attack pass in this QA session.

Publication evidence: the first public release commit, 7fe8e4d4300d0354bbc721a326ecc8e9b0947568, passed the complete Nix gate and deployed through [GitHub Actions](https://github.com/pmarreck/quiet_depths/actions/runs/44469110996). The public game at https://pmarreck.github.io/quiet_depths/ opened and began a seeded patrol at the mobile breakpoint with Sound OFF. No errors or warnings from the public origin appeared in the captured browser logs. The existing staging Site was updated while preserving its owner-private audience. A portable archive includes source, vendored dependencies, tests, the executable test entry point and prebuilt static output. Later documentation-only completion commits use the same publication gate.
