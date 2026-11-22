# PLAN

Completed work and QA evidence are in the [plan log](docs/PLAN_LOG.md).

## Elm migration

- [ ] Move mission and patrol rules to Elm with seeded replay, objective and save compatibility checks.
- [ ] Move simulation and the remaining game UI to Elm in stages, preserving existing patrol saves.
- [ ] Migrate remaining first-party browser code to strict TypeScript, including the Three.js, Web Audio and persistence adapters.

## Future features

- [ ] Explore co-op patrols across devices, including shared crew roles and who hosts the mission.
- [ ] Add portable patrol export and import using compressed Base64 and an explicitly versioned save schema.
