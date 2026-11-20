# PLAN

Completed work and QA evidence are in the [plan log](docs/PLAN_LOG.md).

## Patrol upgrades

- [ ] Base enemy pursuit and weapon aim on dated observations, with greater aim error at longer range (context: docs/plan_context/patrol-upgrades.md).
- [ ] Add a post-patrol debrief explaining detections, enemy searches, evasions, and weapon outcomes (context: docs/plan_context/patrol-upgrades.md).
- [ ] Add mission difficulty and equipment controls, with saved settings and functional enforcement.
- [ ] Add configurable keyboard shortcuts and an opt-in live external orbit camera with desktop and touch controls.
- [ ] Add Seek and Destroy: Sub, convoy encounter variety, submarine track estimates, and persistent commendations and kill totals (context: docs/plan_context/patrol-upgrades.md).
- [ ] Make the game installable on mobile as a PWA (context: docs/plan_context/patrol-upgrades.md).
- [ ] Improve torpedo, depth-charge, blast, and underwater motion effects across stations, and use the finite acoustic decoys in enemy search.
- [ ] Add onboard ambience, music and crew reactions, with quiet mixes during silent running and detection (context: docs/plan_context/patrol-upgrades.md).

## Elm migration

- [ ] Move mission and patrol rules to Elm with seeded replay, objective and save compatibility checks.
- [ ] Move simulation and the rest of the game UI to Elm in stages while retaining adapters for Three.js, Web Audio and browser persistence.
