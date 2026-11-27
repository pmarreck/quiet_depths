# Quiet Depths

You command SS-214, a fictional diesel-electric submarine in the North Atlantic in 1972. A sound off the port bow might be a merchant, an escort, or another sub. Listening can give you a bearing. Getting a better look can also give away your position. What you know, what the crew suspects, and what actually happened can be three different stories by the time you reach the debrief.

**[Play Quiet Depths in your browser](https://pmarreck.github.io/quiet_depths/)**. Sound starts off. The game is single-player, runs locally, and can be installed for offline play. WebGL draws the ocean views. The chart and sonar also work when WebGL is unavailable.

[Patrols](#patrols) · [Helm and power](#helm-and-power) · [Sonar, chart and optics](#sonar-chart-and-optics) · [Encounters](#encounters-and-enemy-knowledge) · [Weapons](#weapons-and-air-support) · [Damage](#damage-and-survival) · [Orbit and ROV](#orbit-replay-and-the-rov) · [Weather and sound](#weather-sea-life-and-sound) · [Mobile](#mobile-controls-and-offline-play) · [Saves and service records](#captains-service-records-and-portable-saves) · [Build](#building-and-verifying-the-game)

## Your first patrol

1. Enter your name after **Captain**, or leave the field blank to use the suggested name. Pick a mission and read **Your First Orders** immediately below the mission choices. Each mission card gives an estimated play time.
2. Choose starting weather, time of day, difficulty, and realism. **Longer mission** moves the action outside initial sonar range. Copy the seed if you want to play these starting conditions again, then choose **Begin Mission**. Closing the briefing leaves you in the lobby unless you already have a patrol underway.
3. Open **Mission** for progress, **Sub** for your condition, and **Contacts** for the crew’s observations. Gold helm marks show what you ordered. White marks show what the sub is actually doing. Turn on **Sound** to hear engines, weather, crew and distant events.
4. Use 5× or 20× time for transit. New contacts and attacks can return time to 1×. Check the ship’s clock and the elapsed patrol timer separately. A full day on the ship’s calendar takes 48 patrol minutes. **Esc** pauses the simulation. You can still inspect the chart while paused.
5. Most missions end when you complete the objective and surface at the marked extraction point. The objective panel tells you when extraction is open. The debrief reveals events that the crew could only guess at during play.

## Patrols

The seed controls starting positions, traffic, objectives and weather choices. A standard patrol has a 30-patrol-minute window. **Longer mission** adds a transit and search area, changes the time estimate on every mission card, and gives an extended 90-minute window after the protected transit. In time-sensitive rescue and fleet scenarios, there is an approach period before casualties or fighting begin. The dashed search areas on the chart represent the briefing’s estimates.

| Mission | Your orders |
| --- | --- |
| **A quiet observation** | Photograph the briefed number of distinct merchant silhouettes through the periscope, then extract. An exposure can enter Photos even if its framing earns no mission credit. |
| **The long way home** | Identify the designated military freighter, sink it and return. Civilian traffic shares the area. |
| **Seek and Destroy: Convoy** | Sink the three military transports and extract. The escort has company on some seeds, including a possible submarine. |
| **Seek and Destroy: Sub** | One or sometimes two hostile subs are in the area. Survival and extraction win the mission. You can withdraw with no kills or stay for submarine commendations. |
| **Big Kahuna** | Find fleet carrier *Solstice* and her escort. Two direct torpedo hits start irreversible flooding. Additional hits shorten the time she stays afloat. The carrier has its own flight deck. Return to extraction. |
| **Sneaky Seamen** | Cross from Gate A to Gate B through an expectant convoy patrol with at least one sub. Crossing the far gate at any depth completes the mission. |
| **Just passing through** | Quietly accumulate the required tracking time near the convoy, then bring the intelligence home. |
| **Someone is still knocking** | Reach a disabled submarine, hold station while divers assess it and recover survivors, then bring the rescue team home. |
| **A light in the swell** | Surface alongside a sinking research ship. Rescue launches shuttle survivors across until the casualty goes under. |
| **What the sea remembers** | Survey the wreck with slow submarine passes or take three ROV photographs from different sides. Findings can include a ship’s bell, records, ceramics or trade coins. |
| **Tiebreaker** | Enter an active battle between two fleets, each with three ships and a sub. Give the friendly NPC fleet a two-vessel lead. Your own hull is excluded. Once extraction opens, you can keep assisting or leave. Clearance stays open even if the balance shifts. |
| **Wolf in the Henhouse** | *Plover* is already a wreck. A friendly convoy is hunting the sub that sank her. Decode a signal lamp for a clue, or use your own sensors. Sinking the hunter ends the mission immediately. Losing two more convoy vessels ends it in failure. |

**Rescue.** Use **Plot Approach** for the transit, or bring the sub alongside yourself and choose **Start Rescue Here**. For undersea rescue, hold 30–75 m away, within 5 m of the assigned depth, at 0.6 kn or less. Surface rescue needs 30–85 m of separation at the surface and the same low speed. Allow 22 patrol seconds for assessment, nine seconds per transfer and nine more for the team to return. The initial survivor count is unknown. Casualties can die while you travel, and some sites have nobody left alive.

**Wreck survey.** “Collect 45 seconds of close sonar scanning” means passing within 100 m horizontally and 32 m vertically at 0.5–3 kn. The submarine records progress automatically. Short passes add together. The photographic route needs three views at least 55° apart. If the ROV breaks after two photos, you keep those exposures and can finish with the submarine’s scan.

## Helm and power

Heading, depth and speed are orders to a helmsman. A new compass heading needs water flowing past the rudder. At all stop, the ticker explains why the sub holds its heading. Going astern reverses the simulated rudder so a port order still turns the bow to port. Ballast changes buoyancy even while stationary. With forward momentum the dive planes pitch the hull and change depth faster. Floodwater, equipment condition and water depth matter.

**Ahead Full**, **Ahead Silent**, **All Stop** and **Astern Full** sit beside the desktop throttle. On a compact screen, tap **Speed ▾**. Ahead Silent selects electric power, engages silent running and requests up to three knots. The full orders release silent running on the selected engine. All Stop lets the hull coast down. The slider supports intermediate settings and snaps near zero. The actual speed depends on the power plant, depth and damage.

| Healthy power setting | Surface | Snorkeling | Battery behavior |
| --- | ---: | ---: | --- |
| Electric | 16 kn | 16 kn | Draws from the battery and also works below snorkel depth. |
| Diesel, Charge | 18.5 kn while charging | 9 kn while charging | Refills the bank. As it fills, more generator output goes to the drive motor. |
| Diesel, Drive | 20.5 kn | 13 kn | Sends generator power to propulsion and suspends main battery charging. |
| Diesel, Battery assist | Up to 22 kn | Up to 17 kn | Draws on the battery when demand exceeds generator output. An empty or offline bank leaves generator drive available. |

Diesel needs air at 14 m or shallower. Instruments, lights and pumps draw power even when stopped. Propulsion load rises roughly with speed cubed, so extra knots cost disproportionately more energy per mile. The watch warns below 20% and 10% battery. The critical warning keeps the red beacon lit until charge rises above 10%. Fuel remaining aboard can give you a chance to restore diesel power after the battery runs flat.

## Sonar, chart and optics

| Station | What you can learn |
| --- | --- |
| **Bearings** | Passive hydrophones hear direction. On the heading-up plot, a dashed spoke is a bearing without a range fix. The trace below reads from bow around starboard, stern and port, back to bow. A peak indicates sound from that direction. The range selector steps between 1.5, 3 and 6 km. |
| **Active Ping** | A return can add range and classification to a contact. A later return can refine its motion. Transmitting carries a chance of being heard. A search ping from another vessel can give your listeners a bearing to the sender. |
| **Scribbler** | The bright dot writes a strip of seabed across the top. Older returns move down, port to the left. The two inner ticks bracket a magnified view beneath the keel. A wreck can produce a bright hull, deck fittings and an acoustic shadow. Speed changes stretch the strip and turns change its shape. |
| **Painter** | The dot sweeps the sector ahead one elevation at a time. A moving object can look distorted because different parts were sampled at different times. |
| **Chart** | An unclassified contact gets a stable code such as A1. A bearing, measured fix, visual identification or friendly report can improve it. The estimate ages between observations and its uncertainty grows. Ship and submarine contacts have different symbols. The separate exact-location option can reveal known enemies. |
| **Periscope and tower** | Raise the scope at 15 m or shallower. The mast takes three patrol seconds to travel fully. You can watch it retract into the sail in Orbit. Lowering it reduces its visual signature. The scope reaches 24×. **Center on Bow** aligns the optics and **Turn Sub to View** orders the hull toward the sight bearing. The open tower needs a surfaced sub and its binoculars reach 48×. Damaged optics, waves, fog and darkness affect what you can identify or photograph. |

**Imaging while doing something else.** Each imager has its own **Start scan** switch. Both can run together and continue through station changes and Orbit. Other stations show which instrument is transmitting. Survey covers a wider area with coarser detail. Detail covers less ground, refreshes faster and is easier for nearby game contacts to notice. Pausing freezes the simulation. Sonar damage can interrupt a scan. Its switch retains your order through repair.

At all stop the Scribbler stays on and holds the paper in place. Moving ahead or astern feeds it again. Scroll the wheel or slide two fingers to review earlier lines while new ones accumulate. Marks show ship-clock minutes and approximate age. **Live** returns to the writing head. **Clear** erases the displayed profile without switching it off. Manual checkpoints and file transfers made during play include the paper. The smaller automatic continue save retains the transmitter settings.

**Friendly signal lamps.** In Wolf in the Henhouse, surface close enough for the convoy to hail you. Keep the named ship in the periscope or tower view to read its flashing lamp. The copying percentage advances by complete letters. Look away and the letters already copied survive until the telegram repeats. A full telegram plots the sender’s estimate. A matching passive contact may get a tentative identification. In Wolf and Tiebreaker, a friendly ship can also send a recent contact report with position, course, speed and depth. Night improves readability and fog reduces it. The hail suggests a reading distance for current conditions. [International Morse code](https://www.itu.int/rec/R-REC-M.1677-1-200910-I/en)

**Reconnaissance and Photos.** Select a 10 km square on the chart to request a classified satellite pass. A request made deep queues for uplink at 15 m or shallower. Two exposures estimate motion. Processing and reception take time, and a deep receiver holds the transfer below 30 m. Daylight can identify surface ships. Night plates show running lights, cloud obscures parts of the square, and storms can block the request. The chart dates the fix to the exposure, so it may already be old when you receive it. Photos holds up to 24 periscope, ROV and satellite images within its storage budget.

## Encounters and enemy knowledge

A searcher can have a clue, search a reported area, establish a track and eventually lose it. A report records what was observed at the time. Hunters project from that report between observations, so their search can continue after the player has left the area. Depending on the mission settings, the status line can reveal **Suspicious**, **Searching** or **Under pursuit**. Turn off **Show enemy suspicion and detection** to play using the crew’s evidence. **Enemy pursuit persistence** controls how long a search lasts.

Once per twelve hours of ship time there are independent chances of a friendly sub, hostile sub, friendly surface traffic and hostile surface traffic. Any combination can appear, including none. A passing captain’s temperament influences whether they withdraw, threaten, escalate or fight. A challenge can take the form of a close approach, a conspicuous ping, warning fire or a short-running torpedo. Damage can prompt retreat. On December 25 and January 1, general hostile tendency is reduced by 75%. Missions with an assigned hunter or ongoing battle retain their own scenario behavior.

Tiebreaker’s two NPC fleets can fight and sink one another while you watch. Friendly briefing areas are prior information and remain on the chart. Observations can refine affiliation. Friendly surface ships carry forked blue pennants and hostile ones orange pennants in that scenario. Passing friendly vessels elsewhere can aid a threatened ally.

Mission setup also lets you adjust the damage advantage, your detectability, ping detection chance and the effect of depth. Enemy aircraft, the satellite, the ROV, chart omniscience, Orbit, instant replay and replays of enemy events have separate controls.

## Weapons and air support

| Game system | What happens in the patrol |
| --- | --- |
| **Bow torpedo tubes** | All twelve mission types start with six torpedoes. Port and starboard tubes start loaded and reload independently. Two shots can leave in quick succession. A healthy tube takes 20 patrol seconds to reload. Contacts shows each timer, ammunition, the selected contact and a maximum-run slider for the next shot. |
| **Torpedoes in the water** | A torpedo is a moving 3D object. The appropriate bow door opens at the sub’s actual depth. The torpedo clears the bow along the tube axis before easing into its climb or descent. It then holds the firing bearing out to the plotted range, listening as it goes, and circles to search only if it gets there without a return. A shot at a bearing with no range runs half its maximum distance first. Look for twin counter-rotating propellers, a bubble trail, a faint expanding sonar pulse and a receding wake near the surface. The simulated seeker can lose a contact, circle, reacquire a different contact, strike a decoy or reach its run limit and shut down. Incoming and outgoing shots share the water with other vessels. |
| **Hearing a launch** | A heard launch gives the crew a bearing and a status report. A ping can identify an incoming torpedo and show a numbered **T**, depth, speed and range. A second observation can establish course. Subsequent audible seeker pulses update the track. The beacon and ticker can report a likely inbound track with an ETA in patrol time and real seconds at the current compression. |
| **Noisemakers** | The player has three expendable noisemakers. Enemy submarines also carry a limited supply. Diversion is uncertain. The physical shot continues after it loses its original target. |
| **Deck gun** | The surfaced gun station has its own sight, aim controls, ammunition and condition. It carries 240 rounds with a visible tracer every fifth round. Gunfire can damage ships and aircraft. Diving closes the gun sight. |
| **Ship fire and depth charges** | Escorts can fire, ram or drop charges using their available reports. Shell spread increases with distance. A charge enters the water, sinks and detonates. A splash can be heard. The pressure front takes time to reach the sub or ROV and can damage either independently. Close explosions flash, throw spray or underwater bubbles, and shake the view. |
| **Aircraft** | Island aircraft scramble from Greybank and fly to the search area. A carrier can launch one to three fighters much sooner. Each plane carries **one depth bomb per flight** and can also strafe visible surface targets. Several bombs can come from a multi-plane flight. Engines, sightings and Captain’s Log reports can announce an approaching search. The aircraft status clears when the flight finishes. |

An explosion may be heard well before the crew knows what it hit. A foundering ship lists and settles by one end. Metal can creak on the way down. A submerged hull collapse can produce **Possible implosion heard**. A small cross on the chart marks a probable wreck. A later visit can reveal the damaged hull on the seafloor. The debrief identifies what actually happened, including friendly or civilian strikes. A disciplinary stamp can appear alongside a successful objective.

## Damage and survival

Open **Sub** to see each system’s current condition and repair ceiling. Engines, fuel feed, battery, drive motor, propeller, rudder, ballast, dive planes, air systems, sonar, optics, tubes, deck gun and crew can lose capability. The part of the sub struck influences which systems take damage. Hulls push one another apart on contact. Wrecks and the seabed can also cause damage.

- **Equipment wear.** Each hit to a subsystem reduces its remaining repair ceiling by 15%. Two hits take a 100% ceiling to 85%, then 72.25%. Most equipment stops working below 20%. A repair team can bring a surviving part back online if its ceiling permits. At zero condition the part is lost for the patrol. Injured surviving crew can still make slower emergency repairs.
- **Visible failures.** A damaged sonar loses range and gains weak readings and cracks. A flooded periscope blurs both the view and its exposures. Battery and tank damage reduce usable capacity. Fuel leaks can start a fire. A severe bow hit carries a small chance of an ammunition cookoff.
- **Flooding and pressure.** Outer hull plating stays damaged for the patrol. Repair crews can reinforce internal bulkheads, seal leaks and pump the bilge. Both hull conditions affect the depth limit, initially 220 m. Flooding weighs down the hull and escaping bubbles can be seen outside. Over the limit, leaks may develop. More than 12% beyond it triggers a critical alarm. Sustained exposure there raises the chance of implosion.
- **The watch.** The ticker calls out less than 20 m under the keel. The rotating red beacon signals critical battery, pressure danger, serious repair work or a likely incoming torpedo. Its rising alert tone sounds on entry and is quieter under silent running.

## Orbit, replay and the ROV

**Orbit** is the deliberately impossible camera. Press **V** or choose **Orbit** and swing around your own sub. You can watch the rudder answer the helm, the hull pitch in a swell, bubbles thin behind the propeller, the yellow ROV at the end of its cable, or a torpedo slip past. Drag to orbit and zoom with the wheel, touch gestures or +/−. The patrol and its sonar keep running. **Pause** holds time for a closer look. **Exit view** or **Esc** takes you back. Orbit defaults on and can be disabled in the briefing for a more restricted view.

**Instant replay** pauses the live patrol and plays the preceding five patrol seconds from an external camera. The framing follows the objects involved in an impact, grounding or qualifying torpedo near miss. You can rotate, zoom and exit early. Replays work independently of Orbit. A second checkbox includes enemy events such as hits, implosions and the final moments of a sinking ship.

**The ROV** is a physical inspection vehicle with a camera, lamps, thrusters, onboard battery and a control tether. Deploy at 3 kn or less and 280 m or shallower. Its 100 m cable limit is measured in three dimensions. Running out of cable or battery can lose it for the patrol. A range strip, low-battery warning and recall control remain available when you return to the sub. The sub keeps its own helm orders while you pilot the drone. Slow down for recovery at the side hatch. Docking recharges the ROV and repairs recoverable parts. A damaged camera can lose video while the remote helm still works.

## Weather, sea life and sound

The ship’s watch reads UTC in 24-hour time on a seed-chosen date in 1972. Dawn, dusk, cloud and moonlight affect what you can see. The moon follows that year’s historical phases. Look for its reflection beneath a low moon, or sunlight shimmering through a break in the clouds. The sky’s apparent path is approximate. Optional changing weather blends one front into the next. Early fog can hide a ship’s hull while its running lights are still visible. Storms bring rain, scope wash and occasional lightning that can strike an exposed vessel. [NASA lunar phase tables](https://eclipse.gsfc.nasa.gov/phase/phases1901.html)

In calm water, about the top quarter of the surfaced hull shows. Swell lifts the bow and stern at different times. The tower, periscope and deck-gun cameras ride that motion, which fades near maximum periscope depth. When the sub moves ahead, two arms of foam spread from the point where the bow breaks the surface. If only the periscope is exposed, it leaves a finer V of its own. If a spinning propeller breaks the surface, it throws spray. Below the waves, you can see shafts of sunlight fade with depth. [NOAA on light in the ocean](https://oceanservice.noaa.gov/facts/light_travel.html)

Greybank and the central reef are landmarks. The seed shapes the outer islands, banks and mainland coast. The chart, soundings and 3D views use the same seabed. The ROV’s lamps bring out sand ripples, gravel, shell fragments, tube sponges, kelp and octopuses on sloping ground. Schools of fish scatter around the hull. Sharks and a swimming humpback share the water. Suspended bubbles and the stream behind the screw make slow movement easier to see.

Turn **Sound** on and change stations during a storm. Rain, waves and thunder are louder on the open tower or gun deck. Lightning has a location, so thunder arrives later and its arrival depends on where you are. A deep listener hears a more muffled rumble. Distant underwater explosions, hull creaks and possible implosions carry better inside the sub. Engine and aircraft sounds change as their sources move. [NOAA on sound in water](https://oceanservice.noaa.gov/facts/sound.html)

At interior stations the crew keeps its own routine. There may be snoring between midnight and 06:00, eggs or coffee at breakfast, another coffee break in the afternoon, and conversation at lunch or dinner. On a quiet evening between 19:00 and 23:00 the radio occasionally plays a ten-second excerpt from one of eight original songs made with Suno. It fades in and out over one second at each end and skips the last two songs played. At lights-out you might hear a goodnight. Christmas and New Year have their own greetings.

Battle stations, nearby hostiles, a recent nearby launch, flooding or outstanding repairable damage can interrupt that routine. The combat patrols flagged for action stations suppress the mess, music and bedtime chatter throughout. The crew can still report a hit or leak, sometimes in a whisper, or react to a distant noise. The recordings and music ship with the game and play offline.

## Mobile controls and offline play

On a narrow phone the helm sits under the scene. Hold **Port**, **Starboard**, **Rise** or **Dive** to change an order. Tap a numeric readout to enter an exact value. The throttle’s thumb shows the order and its light tick shows actual speed. **Mission**, **Contacts** and **Sub** open sheets so you can consult them without leaving your station. The watch strip includes the clock and the current depth limit. Wider tablet and unfolded Duo layouts move the helm beside the view. Dialogs account for the closed portrait camera area. These layouts have browser viewport checks. Physical iPhone Duo and standalone Safari behavior still benefit from on-device playtesting.

<img src="docs/screenshots/mobile-v6.jpg" width="280" alt="Portrait helm below a periscope view, with heading, depth and throttle controls">

| Station or action | Touch or mouse | Default keyboard |
| --- | --- | --- |
| Change station | Choose a station tab | **1–7** select periscope, sonar, chart, ROV, tower, deck gun and Photos |
| Sub helm | Hold a helm control or adjust the throttle | **W/S** throttle, **A/D** port or starboard, **Space/C** rise or dive |
| Optics | Drag to look, pinch or slide two fingers vertically to zoom | **P** raise or lower scope, **F** photograph |
| Chart | Drag to pan, tap to set a waypoint, wheel or use two fingers to zoom. **Center Sub** resumes following. | **3** opens the chart |
| Sonar | Tap a range on Bearings or change range with two fingers. Scroll the Scribbler’s paper with two fingers or the wheel. | **G** active ping, **R** silent running |
| ROV | Drag to turn or pitch. Use the thrust slider for ahead or astern and **All Stop** to hover. | **W/S** pitch, **A/D** turn, **↑/↓** thrust, **Space** all-stop |
| Deck gun | Drag to aim and hold **Fire** | Hold **J** to fire |
| Orbit and replay | Drag to rotate. Wheel, pinch or slide two fingers to zoom. Use the on-screen exit. | **V** toggles Orbit. **Esc** exits an external view or pauses/resumes a normal patrol. |

Open **Settings** to rebind shortcuts, restore their defaults, or invert vertical ROV steering for both keyboard and touch. On a touch-only phone or tablet, keyboard hints and shortcut remapping stay hidden until you press a key on a hardware keyboard. Preferences persist in the browser.

On a phone or tablet, choose **Install game** in the briefing. Desktop browsers offer installation from their own menus. On an iPhone or iPad, open the game in Safari, choose **Share → Add to Home Screen**, then enable **Open as Web App** if offered. Give the game one complete online load to cache its assets for offline use. The **Quiet Depths** logo shows the build number. A new build downloads in the background. Reopen the game or choose **Check for update** in the briefing to switch versions with your patrol saves intact. Older installations can use the [update page](https://pmarreck.github.io/quiet_depths/update.html).

## Captains, service records and portable saves

Enter your name in the briefing, or sail with the suggested captain. The game can come up with names like *Mabel Wobblefin*. Your title stays **Captain**. The briefing shows completed, successful and failed patrols for the selected name and for all captains on this device. A captain earns **one service star for every five successes**. The debrief shows the award. The service record also keeps lifetime totals for ships and submarines sunk, including the number of two-submarine patrols. A submarine kill earns a commendation, and two in one patrol earn a distinct commendation. Loading a checkpoint or rereading the debrief counts the same patrol once. Beginning a fresh patrol with a previously played seed creates a new entry when it ends. Earlier versions recorded kills and commendations, so their old totals survive, but earlier wins and losses cannot be reconstructed.

Select the **Quiet Depths** logo during a patrol to find and copy its seed. **Use this setup** restores the original mission, seed, starting conditions and difficulty to the briefing. Choose **Begin Mission** to play that beginning again. To resume at the moment you left, use **Continue**, load a slot, or import a patrol file.

Open **Save slots and transfers** in the briefing. There are six manual checkpoints, separate from automatic Continue. Each occupied slot shows its mission, elapsed time, seed and a submarine portrait when WebGL is available. A manual checkpoint includes the station settings and sonar paper when saved from a live patrol. Saving over an occupied slot asks for confirmation.

| What you want to take with you | How to save and restore it |
| --- | --- |
| **One patrol** | Choose **Export current patrol** while underway, or **Export** on an occupied slot. On the other device, choose **Import** on any slot, select the file and then **Load**. An occupied destination asks before replacing its checkpoint. Example file `Captain_Rita_Bilge-What_the_sea_remembers.qdsave.json`. |
| **The entire game** | Choose **Export entire game**. On the destination device choose **Import entire game**, select the file and confirm replacement. This brings across the current patrol or lobby, six slots and previews, pending mission setup and seed, service records, photos, controls, difficulty and recent radio history. Example filename: `Captain_Rita_Bilge.qdstate.json`. |

Both formats are versioned, cleartext JSON. A live snapshot includes the patrol clock and random state, selected station, pause and time-compression settings, camera controls and recorded sonar sheets. Replay footage accumulates again as the restored patrol runs. Whole-game import replaces this game’s data in the destination browser. Export the destination’s existing game first if you want to keep both. The game stores checkpoints in IndexedDB and the automatic save and preferences in browser local storage. Files travel only when you download or import them.

## Building and verifying the game

Quiet Depths is a static site. Elm owns the mission definitions, briefing controls, engine telegraph and sonar tab UI. Strict TypeScript handles parts of the simulation and browser adapters, alongside the remaining JavaScript. Elm and TypeScript compile to JavaScript. The shipped game uses WebGL through vendored Three.js and Web Audio. It has no WebAssembly runtime or server-side game process. It runs without an account or tracking.

Nix with flakes is required. The pinned toolchain builds on x86-64 and ARM64 Linux, including Linux under WSL, and Apple silicon macOS. Each target produces the browser game.

```sh
./build          # Build with Nix and link the site at result/
./test           # Run the complete Nix gate and verify the installed site
./run            # Build and preview at http://127.0.0.1:4173
./run --about    # Show release version, build revision and preview platform
```

The build compiles optimized Elm, checks strict TypeScript, checks JavaScript syntax and runs the Node simulation and interface tests. The install check verifies offline asset coverage and build identity. The preview serves the Nix output directly. Any static web server can serve that directory. The tracked `dist/` directory is a staging snapshot. [Build definition](flake.nix) · [Verification entry point](test)

To change a mission, edit the Elm catalog. Run `nix build .#patrol-catalog --print-out-paths --no-link` and copy the printed store file to `typescript/mission-catalog.ts`. The simulation and Node tests read that generated table. The build verifies it against the optimized Elm exporter. [Elm mission catalog](elm/PatrolMission.elm) · [Generated table](typescript/mission-catalog.ts) · [Migration plan](PLAN.md)

A build from clean, complete Git history records its version, full commit and `rN-abcdef` revision in `build-provenance.json` when built via the project scripts. The briefing shows `rN` and exposes the full identifier in its tooltip. GitHub Actions checks that the tested artifact matches the exact push to `yolo` before publishing it to Pages. Pull requests run the same build. [Pages workflow](.github/workflows/pages.yml)

The test suite also checks how contact-list work grows with the number of rows. Run `./big_o` to compare measurements on the same hardware over time. It uses an existing history directory, defaulting to `$XDG_STATE_HOME/performance-history` or `~/.local/state/performance-history`. Override that directory with `PERFORMANCE_HISTORY_URL`. The first measurement for a hardware cohort is reviewed before becoming its baseline. [Performance workload](profiling.json)

## Historical notes and dedication

SS-214 is a fictional 1972 design. Its tapered hull, sail planes and single screw draw from the Barbel class. The 1961 commissioning booklet for HMCS *Grilse* describes generators and batteries powering propulsion separately or together, the historical basis for the game’s battery-assist switch. Quiet Depths sets its own power curves and speeds. Television-equipped cabled underwater vehicles already existed in the CURV program. [Naval History and Heritage Command on *Barbel*](https://www.history.navy.mil/research/histories/ship-histories/danfs/b/barbel-ii.html) · [HMCS *Grilse* commissioning booklet](https://www.forposterityssake.ca/RCN-DOCS/RCND0207.pdf) · [Naval Undersea Museum vehicle history](https://navalunderseamuseum.org/wp-content/uploads/2026/02/NUM_2019_013_010_NOSCvehicleHistory_OCR.pdf)

Solstice’s angled deck takes inspiration from USS *Midway*. Carrier jets borrow the silhouette of the F-4 Phantom II and island aircraft that of the A-4 Skyhawk. The sub’s retained deck gun and its ammunition, the simplified seekers and the classified satellite-photo relay are game design choices. Near-real-time electronic reconnaissance came later in the decade. Orbit and instant replay are there for players who want to see what happened outside the pressure hull. [Midway Museum on the angled deck](https://www.midway.org/blog/midways-angled-deck) · [Phantom II](https://www.history.navy.mil/content/history/museums/nnam/explore/collections/aircraft/f/f-4n-phantom-ii.html) · [Skyhawk](https://www.history.navy.mil/content/history/museums/nnam/explore/collections/aircraft/a/a-4-skyhawk.html) · [NRO reconnaissance history](https://www.nro.gov/Portals/135/documents/news/press/2021/2021-06-60th%20Anniversary%20Declassification_11162021.pdf)

Quiet Depths is dedicated to **Harry Holder**, the developer’s favorite teacher. He taught seventh-grade social studies and introduced him to the 1980s submarine game that inspired this one. [GATO](https://en.wikipedia.org/wiki/Gato_%28video_game%29)

## License

Quiet Depths’ original code and assets are source-available under the PolyForm Noncommercial License 1.0.0. Commercial use requires a separate license from the copyright holder. [License](LICENSE)

Third-party components retain their own licenses. Three.js 0.170.0 uses the MIT license. The vendored DM Sans, IBM Plex Mono and Libre Caslon Display fonts include their SIL Open Font Licenses. The site build also includes the Elm package licenses.
