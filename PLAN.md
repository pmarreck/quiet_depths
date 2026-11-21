# PLAN

Completed work and QA evidence are in the [plan log](docs/PLAN_LOG.md).

## Elm migration

- [ ] Move mission and patrol rules to Elm with seeded replay, objective and save compatibility checks.
- [ ] Move simulation and the rest of the game UI to Elm in stages while retaining adapters for Three.js, Web Audio and browser persistence.

## Future features

- [ ] Explore co-op patrols across devices, including shared crew roles and who hosts the mission.
- [ ] Add portable patrol export and import using compressed Base64 and an explicitly versioned save schema.
