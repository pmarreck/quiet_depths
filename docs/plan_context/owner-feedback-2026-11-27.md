# Owner feedback, 2026-11-27

Ten requests from a playtest session, numbered as the owner gave them. Each
section records the request, the working interpretation, and any assumption or
open question. The order of work is in [PLAN.md](../../PLAN.md).

## 8. Torpedo veers away from a selected target

**Request.** A torpedo fired at Ironwood, selected in Contacts and about 2 km
ahead, turned left and followed something else. Earlier patrols showed the same
failure to lock.

**Evidence.** The owner exported the patrol shortly after launch (Seek and
Destroy: Convoy, seed 267421161, patrol time 331 s). At export the torpedo had
run 1,021 m of its 2,860 m limit. `intended` is `cobalt` (Ironwood) and
`orderedHeading` is 345°, close to the bearing of the convoy. Ironwood is about
2.7 km from the sub. The torpedo has `lock: null`, has been in its search
pattern for 38.5 s of its 42.5 s life (`searchDirection: -1`, a left-hand
circle) and is heading 161°, back toward the sub's track. The earliest retained
path point already shows it heading southwest. The working hypothesis is that
the search pattern begins a few seconds after launch instead of after a run out
along the ordered heading to the target's expected range. This is unverified.

**Plan.** Debug from the save before changing behavior. Write a regression that
fails on r83, fix the cause, and confirm the regression passes.

## 1. Install Game only where installation is supported

**Request.** Show Install Game only on PWA-capable devices, not on desktop.

**Assumption.** Show the button on iOS and iPadOS Safari, or when a touch-first
browser offers installation, and only when the game is not already running as
an installed app. Hide it on desktop even though desktop Chromium can install
web apps. The update link stays visible everywhere.

## 2. Hide keyboard-only hints and settings on touch devices

**Request.** Keyboard hints such as “press Esc”, the shortcut remapping UI and
its options should not appear on mobile.

**Assumption.** Treat a device with no fine pointer and no hover as
touch-only. Hide key hints and the remapping section there, and reveal them if
a hardware key press arrives (an iPad with a keyboard). The Settings dialog
also holds the inverted vertical ROV steering option, which applies to touch.
Keep Settings available on touch with only that option, and rename the
briefing’s “Keyboard settings” entry accordingly.

## 5. Offer to end the mission at extraction

**Request.** Entering the extraction area surfaced before completing the
objective asks “End mission?”, so a player out of torpedoes or badly damaged can
finish.

**Assumption.** Ask once per entry into the circle. Declining keeps the patrol
running and the prompt returns only after leaving and re-entering. Missions
that already succeed by extraction (Sub Hunt) are unaffected.

**Decision (2026-11-27).** Partial credit: an early end is a partial success
when some measurable part of the objective was met, otherwise a failure. A
partial success is distinct from a full success in the service record. Each
captain’s record tracks partial successes separately, and each counts as half
a success toward service stars (one star per five successes). The half-credit
accounting is tracked but not displayed. Each mission needs its own partial
rule, which belongs with the objective in the Elm mission definition.

**Open before implementation.** The owner reviews the per-mission partial
rules. Draft rules, not yet approved: at least one required photograph (A
quiet observation), at least one of the three transports (Convoy),
irreversible flooding started on Solstice (Big Kahuna), at least one survivor
aboard (both rescues), half the scan time or one ROV photograph (survey), and
half the required tracking time (Just passing through). A single-target
interception with no sinking is a failure. Check how Tiebreaker, Wolf in the
Henhouse and Sneaky Seamen use extraction before drafting their rules. Also
confirm how the debrief labels a partial success.

## 6, 7, 4 and 10. Desktop helm redesign

**Requests.**

- 6: On widescreen, the helm takes too much vertical space on Sonar, Chart,
  Tower, Deck Gun and Photos. Make the helm usable only on the Periscope tab,
  renamed Periscope & Controls. Keep it visible on the ROV tab, where it steers
  the ROV.
- 7: Make all speed controls vertical, and target depth selection too.
- 4 and 10: Replace the heading readout with a round compass. The card rotates
  so the sub’s actual heading always points up. A needle with red and black
  halves adds immersion. Dragging a marker around the rim sets requested
  heading.

**Interpretation.** Items 4 and 10 describe one instrument: a heading-up card
with a fixed lubber mark at the top, a red-and-black needle pointing to north
on the card, a gold requested-heading marker on the rim, and the existing
white/gold actual/ordered convention. Speed runs ahead at the top to astern at
the bottom. Depth runs from the surface at the top to deeper at the bottom.

**Approach.** Build the new helm as an Elm program, extending the staged
migration (the engine telegraph is already Elm). Present a layout mockup for
approval before implementation. Keep keyboard and touch paths working.

**Decision (2026-11-27).** Widescreen only. The phone layout already uses
vertical space well and has a vertical speed control. On widescreen, the other
tabs show a slim read-only strip with actual and ordered heading, depth and
speed.

**Layout decision (2026-11-27).** A compact band below the view. The
periscope view stays full width and grows to about 420 px tall. Below it, a
band of about 190 px holds the compass (about 160 px), short vertical depth
and speed sliders, and propulsion. The ROV tab uses the same band to steer the
ROV. The tab label reads Periscope & Controls on widescreen only.

**Layout principle (owner, 2026-11-27).** The main gameplay view belongs in
the center, with ancillary controls arranged around it rather than pushing it
to one side. In the band, the compass sits centered beneath the view, the
depth slider on one side, the speed slider on the other, and propulsion and
keel readouts toward the outer edges.

## 3. Resting on the seafloor

**Request.** Bottoming should be a strategic, risky option that greatly
reduces detection. Touchdown can cause damage depending on downward speed.
Moving while resting on the bottom slowly increases exterior hull damage.

**Proposed defaults, adjustable after playtesting.** A stopped, bottomed sub is
75% harder to detect passively and gains some clutter protection from active
pings. Touchdown below 0.5 m/s is harmless. Damage rises above that, with
heavy damage near 2 m/s. Speed through the water while bottomed accrues outer
hull damage in proportion to speed. The watch announces touchdown and lift-off.
The existing seabed collision and keel-clearance rules remain the source of
contact.

**As built (2026-11-27), adjustable after playtesting.** Touchdown damage is a
chance that rises linearly from 0 at 0.4 m/s to certain at 2 m/s. Impact speed
is the larger of the descent rate and 0.2 × knots, so running into a bank at
10 kn hits like a 2 m/s landing. Damage is 4 to 22 hull points with severity.
While bottomed, effort is the larger of actual and ordered speed. Above 0.3 kn
of effort, the outer hull wears 0.06 points per knot-second, scaled by the
damage difficulty. At or below 0.3 kn, passive acoustic detection is
multiplied by 0.25 and the chance that a search sweep finds the hull by 0.5.
Lifting more than 1 m off the floor ends the resting state. The old
seafloor test only exercised test-depth damage through seabed contact. It now
proves pressure damage in open water and a hard landing separately.

## 9. TorpedoCam

**Request.** A new unrealism option that requires Orbit. In Orbit, number keys
or on-screen buttons follow any of the player’s torpedoes in the water, or the
sub again.

**Decision (2026-11-27).** In Orbit with TorpedoCam enabled, 1–9 follow the
player’s torpedoes in launch order and 0 returns to the sub. Station hotkeys
work again after leaving Orbit with Esc or V. Touch layouts get on-screen
buttons.

**As built (2026-11-27).** TorpedoCam is a briefing option that requires Orbit
and defaults on, an easily reversed assumption. Following a torpedo starts the
camera at 18 m and allows zooming to 8 m; the sub keeps its 37 m minimum. A
finished shot holds the view on its last position for 4 patrol seconds. Only
the player's torpedoes are offered.
