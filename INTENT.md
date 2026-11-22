# Quiet Depths intent

Quiet Depths is a single-player browser submarine game set aboard a fictional diesel-electric submarine in 1972. Its central tradeoff is information versus exposure. Players build an incomplete picture from aging observations, and actions such as raising the periscope or pinging active sonar can expose the sub. Running on diesel makes noise and replenishes resources, which gives the player a reason to risk exposure.

Patrols give players a clear objective and an extraction. Simple helm orders and time compression keep transit manageable. Desktop keyboard and mouse and mobile touch controls support the same patrols. Players can pause and resume from a local save.

The game runs as a standalone static site with vendored assets. Patrol data stays in the browser. Account, tracking, multiplayer, and backend services are outside the prototype’s scope. Nuclear propulsion is also outside scope because it would remove the recharge tradeoff. The setting draws on period technology and uses simplified systems and deliberate fictional exceptions documented in the README.

The Nix gate verifies simulation rules, control guards, and save continuity. Browser playtesting covers the experience of completing and extracting from a patrol, using the controls on small screens, and tuning difficulty, pacing, and the sound mix. The plan log records which checks and playtests have been completed.

See the [README](README.md), [current plan](PLAN.md), and [plan log](docs/PLAN_LOG.md).
