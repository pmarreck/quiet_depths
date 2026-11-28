module Sim.Combat exposing (Combat, Gun, aimGunAt, chargeAltitude, fireDeckGun, firingBearing, launchHostileTorpedo, launchTorpedo, restoreIncomingRun, updateCombat)

{-| The boat's weapons and what fights around it: firing a torpedo at a
contact or the deck gun at a bearing, an enemy's torpedo at a report, and
each moment of combat, in the TypeScript's order: air support, aircraft,
torpedoes, gun rounds and ship damage. Fictional combat tuning; positions are
meters and gun aim is compass bearing and elevation.
-}

import Sim.Acoustics as Acoustics
import Sim.AirSupport as AirSupport
import Sim.AircraftFlight as AircraftFlight
import Sim.BoatSensors as BoatSensors
import Sim.ColdWatch as ColdWatch
import Sim.CombatGeometry as Geometry
import Sim.Contact exposing (Contact)
import Sim.Equipment as Equipment
import Sim.FleetTheater as FleetTheater
import Sim.GunRounds as GunRounds
import Sim.HullDesign as HullDesign
import Sim.HunterReports as Reports exposing (Track)
import Sim.InvalidNumber as InvalidNumber
import Sim.Math as M
import Sim.Mechanics as Mechanics exposing (LogKind(..))
import Sim.MessWatch as MessWatch
import Sim.Ordnance exposing (Blast, GunOwner(..))
import Sim.Ship exposing (Ship)
import Sim.ShipDamage as ShipDamage
import Sim.Status as Status
import Sim.SurfaceMotion as SurfaceMotion exposing (Pose)
import Sim.Systems as Systems
import Sim.Torpedo as Torpedo exposing (Owner(..))
import Sim.TorpedoRun as TorpedoRun
import Sim.TorpedoStrike exposing (Firing)
import Sim.TorpedoTubes as TorpedoTubes exposing (Tube(..))
import Sim.TrackEstimates as TrackEstimates
import Sim.VehicleStatus as VehicleStatus
import Sim.Vessel exposing (Kind(..))


reloadSeconds : Float
reloadSeconds =
    20


type alias Gun =
    { ammo : Float, cooldown : Float, shots : Float, angle : Float, elevation : Float }


{-| The patrol fields combat reads and writes: a torpedo run's, and the
contacts, tubes, deck gun and the crew's quiet watch.
-}
type alias Combat s p n =
    Firing
        { s
            | contacts : List Contact
            , tubeReadyAt : { port_ : Float, starboard : Float }
            , gun : Gun
            , gunLoudUntil : Maybe Float
            , crewQuietUntil : Float
            , runSetting : Float
        }
        p
        n


orZero : Maybe Float -> Float
orZero value =
    case value of
        Just v ->
            if M.truthy v then
                v

            else
                0

        Nothing ->
            0


{-| Where a falling bomb or sinking charge is: an aircraft's bomb falls
through the air first, then both sink at a steady rate to their fuse depth.
-}
chargeAltitude : Blast -> Float
chargeAltitude charge =
    if charge.exploded then
        negate charge.depth

    else
        let
            elapsed : Float
            elapsed =
                M.clamp 0 charge.totalDelay (charge.totalDelay - charge.delay)

            air : Float
            air =
                orZero charge.airTime
        in
        if M.truthy air && elapsed < air then
            orZero charge.airHeight * (1 - (elapsed / air) ^ 2)

        else
            let
                sinking : Float
                sinking =
                    negate charge.depth * M.clamp 0 1 ((elapsed - air) / M.max 0.001 (charge.totalDelay - air))
            in
            if M.truthy sinking then
                sinking

            else
                0


{-| The bearing to fire on: to the contact's estimated position when it has
a fix, else its measured bearing.
-}
firingBearing : { s | time : Float, x : Float, y : Float } -> Contact -> Float
firingBearing s contact =
    case contact.fix |> Maybe.andThen (\_ -> TrackEstimates.estimate contact s.time) of
        Just estimate ->
            Mechanics.bearing s estimate

        Nothing ->
            contact.bearing


{-| A torpedo from the next ready tube at a contact that is not friendly or a
known neutral, from no deeper than 100 m. It holds its gyro course out to the
contact's estimated range (half its run when only a bearing is known), and a
target within 3.5 km learns of it: seriously when it is within the run.
`sea` is the conditions the boat's pose rides on.
-}
launchTorpedo : SurfaceMotion.Sea e -> String -> Combat s p n -> ( Bool, Combat s p n )
launchTorpedo sea id s =
    let
        tube : Maybe Tube
        tube =
            (TorpedoTubes.tubes { time = s.time, torps = s.torps, portReadyAt = s.tubeReadyAt.port_, starboardReadyAt = s.tubeReadyAt.starboard }).next
    in
    case ( List.filter (\v -> v.id == id) s.contacts |> List.head, tube ) of
        ( Just c, Just ready ) ->
            let
                condition : Float
                condition =
                    Equipment.operatingFraction s.systems.tubes
            in
            if c.side == Just Sim.Vessel.Friendly || (c.identified == Just True && c.military /= Just True) || s.status /= Status.Patrol || 100 < s.depth || not (M.truthy condition) then
                ( False, s )

            else
                ( True, fire sea c ready condition s )

        _ ->
            ( False, s )


fire : SurfaceMotion.Sea e -> Contact -> Tube -> Float -> Combat s p n -> Combat s p n
fire sea c ready condition s0 =
    let
        tubeSide : Float
        tubeSide =
            if ready == Port then
                -1

            else
                1

        readyAt : { port_ : Float, starboard : Float }
        readyAt =
            if ready == Port then
                { port_ = s0.time + reloadSeconds / condition, starboard = s0.tubeReadyAt.starboard }

            else
                { port_ = s0.tubeReadyAt.port_, starboard = s0.time + reloadSeconds / condition }

        s : Combat s p n
        s =
            { s0 | tubeReadyAt = readyAt, torps = s0.torps - 1 }

        pose : Pose
        pose =
            BoatSensors.boatSurfacePose s sea s.time

        origin : SurfaceMotion.Point
        origin =
            SurfaceMotion.boatPoint pose { side = tubeSide * HullDesign.design.tubeSide, down = HullDesign.design.tubeDown, forward = HullDesign.design.tubeForward }

        heading : Float
        heading =
            firingBearing s c

        depth : Float
        depth =
            if c.kind == Just Submarine then
                Maybe.withDefault s.depth c.depthEstimate

            else
                Torpedo.surfaceRunDepth

        runOut : Float
        runOut =
            case c.fix |> Maybe.andThen (\_ -> TrackEstimates.estimate c s.time) of
                Just estimate ->
                    M.min s.runSetting (Mechanics.distance origin estimate)

                Nothing ->
                    M.min s.runSetting (s.runSetting / 2)

        ( _, launched ) =
            Torpedo.putTorpedoInWater PlayerTorpedo origin heading depth (\p -> { p | intended = Just c.id, heading = pose.heading, pitch = pose.pitch, tubeSide = tubeSide, runOut = runOut }) s

        warned : Combat s p n
        warned =
            { launched
                | ships =
                    List.map
                        (\v ->
                            if v.id == c.id && Mechanics.distance launched v < 3500 then
                                ColdWatch.playerSignal (M.notLess (launched.runSetting + 50) (Mechanics.distance origin v)) (Just { x = launched.x, y = launched.y }) launched v

                            else
                                v
                        )
                        launched.ships
            }
    in
    warned
        |> MessWatch.recordLocalLaunch warned
        |> Systems.launchNoise warned (Just warned.depth) True
        |> Mechanics.log ("Tube away. Bearing " ++ String.fromInt (round heading) ++ ". Seeker arms after its run-out.") Warning


{-| An enemy submarine fires at a report from alternate tubes, aimed with
scatter that grows with range and the report's age, at the reported depth
give or take.
-}
launchHostileTorpedo : Ship -> Track -> Combat s p n -> ( Ship, Combat s p n )
launchHostileTorpedo ship track s0 =
    let
        range : Float
        range =
            Mechanics.distance ship track

        tubeSide : Float
        tubeSide =
            if ship.lastTubeSide == Just 1 then
                -1

            else
                1

        origin : SurfaceMotion.Point
        origin =
            SurfaceMotion.boatPoint
                { x = ship.x, y = ship.y, heading = ship.heading, depth = Maybe.withDefault 0 ship.depth, pitch = orZero ship.pitch, roll = orZero ship.roll }
                { side = tubeSide * HullDesign.design.tubeSide, down = HullDesign.design.tubeDown, forward = HullDesign.design.tubeForward }

        ( aim, s1 ) =
            Reports.scatterAim (12 + range * 0.04 + track.age) track s0

        ( r, s2 ) =
            Systems.draw s1

        depth : Float
        depth =
            M.clamp Torpedo.surfaceRunDepth 220 (track.depth + (r - 0.5) * (4 + track.age * 0.25))

        ( _, s3 ) =
            Torpedo.putTorpedoInWater (EnemyTorpedo { launcher = Just ship.id, aim = Just aim }) origin (Mechanics.bearing origin aim) depth (\p -> { p | heading = ship.heading, tubeSide = tubeSide }) s2
    in
    ( { ship | lastTubeSide = Just tubeSide }
    , s3
        |> MessWatch.recordLocalLaunch ship
        |> Systems.launchNoise ship ship.depth False
        |> Systems.addDebrief (ship.name ++ " fired a torpedo at a reported contact.")
    )


{-| Old saves kept only an incoming torpedo's blast point and countdown: the
run is rebuilt along the bearing from the nearest submarine, if any.
-}
restoreIncomingRun : { b | x : Float, y : Float, depth : Float, delay : Float } -> Combat s p n -> Combat s p n
restoreIncomingRun blast s =
    let
        source : Maybe Ship
        source =
            s.ships
                |> List.filter (\v -> v.kind == Submarine)
                |> List.sortBy (\v -> Mechanics.distance v blast)
                |> List.head

        heading : Float
        heading =
            Maybe.map (\v -> Mechanics.bearing v blast) source |> Maybe.withDefault 0

        remaining : Float
        remaining =
            Torpedo.torpedoSpeed * M.max 0 blast.delay

        origin : SurfaceMotion.Point
        origin =
            { x = blast.x - remaining * sin (Mechanics.rad heading), y = blast.y - remaining * cos (Mechanics.rad heading), depth = blast.depth }
    in
    Torpedo.putTorpedoInWater (EnemyTorpedo { launcher = Maybe.map .id source, aim = Just { x = blast.x, y = blast.y } }) origin heading blast.depth (\p -> { p | age = Torpedo.armingTime }) s
        |> Tuple.second


{-| A round from the deck gun, when surfaced, loaded and off its cooldown:
every fifth is a tracer, the boat is loud for three seconds, and opposing
ships within 6 km come to at least 65 alert. An aim that is not a finite
number is reported and refused.
-}
fireDeckGun : { bearing : Float, elevation : Float } -> Combat s p n -> ( Bool, Combat s p n )
fireDeckGun aim s0 =
    let
        invalid : Float -> Bool
        invalid v =
            isNaN v || isInfinite v
    in
    if invalid aim.bearing || invalid aim.elevation then
        ( False
        , s0
            |> (\s ->
                    if invalid aim.bearing then
                        InvalidNumber.report "fireDeckGun bearing" aim.bearing s

                    else
                        s
               )
            |> (\s ->
                    if invalid aim.elevation then
                        InvalidNumber.report "fireDeckGun elevation" aim.elevation s

                    else
                        s
               )
        )

    else if s0.status /= Status.Patrol || not (VehicleStatus.isSurfaced s0) || s0.gun.ammo <= 0 || 0 < s0.gun.cooldown || not (M.truthy (Equipment.operatingFraction s0.systems.deckgun)) then
        ( False, s0 )

    else
        let
            gun : Gun
            gun =
                s0.gun

            shots : Float
            shots =
                gun.shots + 1

            a : Float
            a =
                Mechanics.rad s0.heading

            b : Float
            b =
                Mechanics.rad aim.bearing

            e : Float
            e =
                Mechanics.rad (M.clamp -15 85 aim.elevation)

            round : Sim.Ordnance.Round
            round =
                { id = s0.weaponSequence
                , owner = PlayerGun
                , x = s0.x + sin a * 16
                , y = s0.y + cos a * 16
                , altitude = 6 - s0.depth
                , vx = sin b * cos e * 600
                , vy = cos b * cos e * 600
                , vz = sin e * 600
                , age = 0
                , tracer = M.isZero (M.remainder shots 5)
                , previous = Nothing
                }

            fired : Combat s p n
            fired =
                { s0
                    | gun = { gun | ammo = gun.ammo - 1, shots = shots, cooldown = 0.25 / Equipment.operatingFraction s0.systems.deckgun }
                    , gunRounds = s0.gunRounds ++ [ round ]
                    , weaponSequence = s0.weaponSequence + 1
                }
                    |> Systems.emit { kind = Acoustics.Gunfire, x = s0.x, y = s0.y, depth = Nothing, altitude = Just 6, power = 0.6 }
        in
        ( True
        , { fired
            | gunLoudUntil = Just (fired.time + 3)
            , ships =
                List.map
                    (\v ->
                        if FleetTheater.isOpponent v && Mechanics.distance fired v < 6000 then
                            { v | alert = M.max v.alert 65 }

                        else
                            v
                    )
                    fired.ships
          }
        )


{-| Trains the deck gun on a point, leading a moving one by the round's
flight time at 600 m/s.
-}
aimGunAt : { x : Float, y : Float, vx : Maybe Float, vy : Maybe Float, altitude : Maybe Float } -> Combat s p n -> Combat s p n
aimGunAt point s =
    let
        a : Float
        a =
            Mechanics.rad s.heading

        mount : { x : Float, y : Float }
        mount =
            { x = s.x + sin a * 16, y = s.y + cos a * 16 }

        d : Float
        d =
            Mechanics.distance mount point

        travel : Float
        travel =
            d / 600

        future : { x : Float, y : Float }
        future =
            { x = point.x + orZero point.vx * travel, y = point.y + orZero point.vy * travel }

        gun : Gun
        gun =
            s.gun
    in
    { s
        | gun =
            { gun
                | angle = Geometry.wrap (Mechanics.bearing mount future - s.heading)
                , elevation = M.clamp -15 85 (atan2 (Maybe.withDefault 2 point.altitude - 6) d * 180 / pi)
            }
    }


{-| One moment of combat; `visibility` is the conditions' range for seeing a
surfaced boat.
-}
updateCombat : { e | subVisualRange : Float } -> Float -> Combat s p n -> Combat s p n
updateCombat visibility dt s =
    let
        gun : Gun
        gun =
            s.gun
    in
    { s | gun = { gun | cooldown = M.max 0 (gun.cooldown - dt) } }
        |> AirSupport.requestSupport
        |> AircraftFlight.updateAircraft visibility dt
        |> TorpedoRun.updateTorpedoes dt
        |> GunRounds.updateRounds dt
        |> ShipDamage.shipDamage dt
