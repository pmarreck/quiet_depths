# Mutant lists

Each `.mutants` file is one mutation check from the port of the simulation
to Elm, recorded as it was run: variable settings, then one line per mutant,

    m FILE PERL-SUBSTITUTION LABEL "TEST FILES"

Run one or more with `scripts/mutate.sh LIST...` (each mutant against the
committed HEAD, in a disposable worktree), or check that every mutant still
applies exactly once with `scripts/mutate.sh --dry LIST...`.

A name with a number after it (`tick2`, `tick3`) is a rerun of the first
list's survivors after new tests, sometimes with patterns updated for code
that had changed. The results and the commits each list was written against
are in `docs/plan_context/simulation-to-elm.md`. Later changes to the code
make some patterns stop applying; the dry run names them, and a list is
brought up to date by writing a new one, as `async3` follows `async2`.
