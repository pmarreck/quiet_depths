module Sim.HostileTracks exposing (Attacks, Charge, Hunting, Noisemaker, Senses, Shell, Tuning, pursueAndAttack, reportHunterState, updateHostileTrack)

{-| A hostile ship's hunt for the player: whether it sees or hears the boat,
or is fooled by a noisemaker, how alert that leaves it, the debrief lines as
it tracks, searches or breaks off, and its attack once in range: an escort's
guns or depth charges, a submarine's torpedo. The TypeScript changes the ship
in place; here each function takes the ship and returns it with the state.
The patrol owns how a depth charge and a torpedo enter the water, so those
are functions the caller supplies.
-}

import Sim.Acoustics as Acoustics
import Sim.Boat exposing (Systems)
import Sim.Debrief as Debrief
import Sim.HunterReports as Reports exposing (Track)
import Sim.InvalidNumber exposing (InvalidNumber)
import Sim.Math as M
import Sim.Mechanics as Mechanics exposing (LogEntry, LogKind(..))
import Sim.Periscope as Periscope
import Sim.PowerPlant exposing (EngineMode(..))
import Sim.SeabedRest as SeabedRest
import Sim.Ship exposing (Pursuit(..), Ship)
import Sim.Sound exposing (Sound)
import Sim.Systems as Systems
import Sim.Text as Text
import Sim.Vessel exposing (Kind(..), SurfaceShip(..))


type alias Noisemaker =
    { x : Float, y : Float, depth : Float, heading : Float, speed : Float, time : Float }


type alias Shell =
    { id : Int, x : Float, y : Float, depth : Float, delay : Float, fromX : Float, fromY : Float, total : Float, hit : Maybe Bool }


type alias Charge =
    { x : Float, y : Float, depth : Float, delay : Float }


{-| What the weather allows: how far a submarine can be seen, and how stormy
the sea is (0 to 1).
-}
type alias Senses =
    { subVisualRange : Float, storm : Float }


{-| The difficulty settings the hunt reads; each defaults to 1 when missing.
-}
type alias Tuning d =
    { d | pursuit : Maybe Float, depthStealth : Maybe Float, detection : Maybe Float }


{-| The patrol fields the hunt reads and writes.
-}
type alias Hunting w d =
    { w
        | x : Float
        , y : Float
        , depth : Float
        , heading : Float
        , speed : Float
        , targetSpeed : Float
        , time : Float
        , rng : Int
        , difficulty : Maybe (Tuning d)
        , systems : Systems
        , scope : Bool
        , scopeTravel : Maybe Float
        , noise : Float
        , bottomed : Bool
        , noisemaker : Maybe Noisemaker
        , engine : EngineMode
        , events : List LogEntry
        , debrief : List Debrief.Entry
        , shells : List Shell
        , soundSequence : Int
        , acoustics : List Sound
        , invalid : List InvalidNumber
    }


setting : (Tuning d -> Maybe Float) -> Hunting w d -> Float
setting field s =
    Maybe.andThen field s.difficulty |> Maybe.withDefault 1


{-| One tick of a ship's senses. Returns the ship, with its report and
alert updated, and the track it is pursuing, if any.
-}
updateHostileTrack : Senses -> Float -> Hunting w d -> Ship -> ( Ship, Maybe Track )
updateHostileTrack senses dt s ship =
    let
        range : Float
        range =
            Mechanics.distance s ship

        deepSub : Bool
        deepSub =
            ship.kind == Submarine && (Maybe.map (\d -> 15 < d) ship.depth |> Maybe.withDefault False)

        visual : Float
        visual =
            if deepSub then
                0

            else
                let
                    mast : Float
                    mast =
                        if s.depth <= 15 && 0 < s.systems.periscope then
                            Periscope.scopeExtension s

                        else
                            0

                    exposure : Float
                    exposure =
                        if s.depth < 3 then
                            90 + 5 * mast

                        else
                            23 * mast
                in
                M.clamp 0 1 (1 - range / senses.subVisualRange) * exposure

        noise : Float
        noise =
            s.noise * (1 - 0.45 * setting .depthStealth s * M.clamp 0 1 (s.depth / 120))

        acoustic : Float
        acoustic =
            M.clamp 0 1 (1 - range / 5500)
                * noise
                * 0.7
                * (1 - senses.storm * 0.38 * M.exp (negate s.depth / 70))
                * SeabedRest.restingStealth s.bottomed (M.max (M.abs s.speed) (M.abs s.targetSpeed))

        sensitivity : Float
        sensitivity =
            setting .detection s

        canSee : Bool
        canSee =
            M.notLess (visual * sensitivity) 9

        decoy : Maybe ( Noisemaker, Float )
        decoy =
            Maybe.map (\n -> ( n, Mechanics.distance ship n )) s.noisemaker

        fooledBy : Maybe Noisemaker
        fooledBy =
            case decoy of
                Just ( n, decoyRange ) ->
                    if not canSee && decoyRange < 1050 && s.time - n.time <= 32 && (acoustic * sensitivity < 8 || decoyRange < range * 0.65) then
                        Just n

                    else
                        Nothing

                Nothing ->
                    Nothing

        reported : Ship
        reported =
            case fooledBy of
                Just n ->
                    { ship
                        | report = Just { x = n.x, y = n.y, depth = n.depth, heading = n.heading, speed = n.speed, time = s.time, reason = Just "noisemaker" }
                        , alert = M.clamp 0 100 (ship.alert + dt * 1.35)
                    }

                Nothing ->
                    let
                        heard : Bool
                        heard =
                            M.notLess (acoustic * sensitivity) 8

                        observed : Bool
                        observed =
                            canSee || heard

                        refresh : Bool
                        refresh =
                            case ship.report of
                                Nothing ->
                                    True

                                Just r ->
                                    M.notLess (s.time - r.time) 2 || r.reason == Just "noisemaker"

                        withReport : Ship
                        withReport =
                            if observed && refresh then
                                { ship | report = Just (Reports.playerReport s |> (\r -> { r | reason = Just (reason canSee s) })) }

                            else
                                ship

                        gain : Float
                        gain =
                            if observed then
                                (visual + acoustic) * sensitivity * 0.06

                            else
                                0
                    in
                    { withReport | alert = M.clamp 0 100 (withReport.alert + dt * (gain - 0.65 / setting .pursuit s)) }
    in
    case reported.report of
        Just r ->
            if Reports.searchDuration s < s.time - r.time || reported.alert <= 42 then
                ( reported, Nothing )

            else
                ( reported, Just (Reports.projectedReport s.time 0 r) )

        Nothing ->
            ( reported, Nothing )


reason : Bool -> Hunting w d -> String
reason canSee s =
    if canSee then
        if s.depth < 3 then
            "surfaced hull"

        else
            "raised periscope"

    else if s.engine == Diesel && s.depth <= 14 then
        "diesel noise"

    else
        "propulsion noise"


{-| Records in the debrief when a hunter detects, reacquires, loses, is
decoyed from, or gives up on the boat; giving up restores its patrol speed.
-}
reportHunterState : Ship -> Maybe Track -> { s | time : Float, debrief : List Debrief.Entry } -> ( Ship, { s | time : Float, debrief : List Debrief.Entry } )
reportHunterState ship track s =
    let
        status : Maybe Pursuit
        status =
            Maybe.map
                (\t ->
                    if t.reason == Just "noisemaker" then
                        Decoy

                    else if 4 < t.age then
                        Searching

                    else
                        Tracking
                )
                track
    in
    if ship.tracking == status then
        ( ship, s )

    else
        let
            name : String
            name =
                if ship.kind == Submarine then
                    "An enemy submarine"

                else
                    ship.name

            line : String
            line =
                case ( status, track ) of
                    ( Just Tracking, Just t ) ->
                        name
                            ++ (if ship.tracking == Nothing then
                                    " detected"

                                else
                                    " reacquired"
                               )
                            ++ " you by "
                            ++ (case t.reason of
                                    Just r ->
                                        if String.isEmpty r then
                                            "a sonar ping"

                                        else
                                            r

                                    Nothing ->
                                        "a sonar ping"
                               )
                            ++ "."

                    ( Just Searching, Just t ) ->
                        name ++ " lost contact and searched along your last observed course of " ++ String.fromInt (round t.heading) ++ "° at " ++ Text.toFixed 1 (M.abs t.speed) ++ " kn."

                    ( Just Decoy, _ ) ->
                        name ++ " followed the noisemaker."

                    _ ->
                        name ++ " broke off pursuit."

            resumed : Ship
            resumed =
                case ( status, ship.patrolSpeed ) of
                    ( Nothing, Just patrol ) ->
                        { ship | speed = patrol, patrolSpeed = Nothing }

                    _ ->
                        ship
        in
        ( { resumed | tracking = status }, { s | debrief = Debrief.add s.time line s.debrief } )


{-| How the patrol puts a depth charge and a hostile torpedo in the water;
the torpedo launcher also updates the ship that fired.
-}
type alias Attacks w d =
    { dropCharge : Charge -> Hunting w d -> Hunting w d
    , launchTorpedo : Ship -> Track -> Hunting w d -> ( Ship, Hunting w d )
    }


{-| A hunter closes on its track and, in range and with its attack timer run
down, fires: an escort's guns at a surfaced target, a submarine's torpedo,
or an escort's depth charge.
-}
pursueAndAttack : Float -> Attacks w d -> Track -> Ship -> Hunting w d -> ( Ship, Hunting w d )
pursueAndAttack dt attacks track ship s =
    let
        closing : Ship
        closing =
            { ship
                | patrolSpeed = Just (Maybe.withDefault ship.speed ship.patrolSpeed)
                , heading = M.remainder (ship.heading + M.clamp (negate dt * 2.5) (dt * 2.5) (Mechanics.delta (Mechanics.bearing ship track) ship.heading) + 360) 360
                , speed =
                    if ship.kind == Surface Escort then
                        15

                    else
                        8
            }

        range : Float
        range =
            Mechanics.distance closing track

        guns : Bool
        guns =
            closing.kind == Surface Escort && track.depth <= 2

        reach : Float
        reach =
            if guns then
                2600

            else if closing.kind == Submarine then
                2300

            else
                420
    in
    if closing.alert <= 55 || M.notLess range reach then
        ( closing, s )

    else
        let
            timed : Ship
            timed =
                { closing | attack = closing.attack - dt }
        in
        if 0 < timed.attack then
            ( timed, s )

        else
            fire attacks track range guns { timed | lastAttackAt = Just s.time } s


fire : Attacks w d -> Track -> Float -> Bool -> Ship -> Hunting w d -> ( Ship, Hunting w d )
fire attacks track range guns ship s =
    case ( ship.report, guns, ship.kind ) of
        ( Just report, True, _ ) ->
            let
                delay : Float
                delay =
                    1.5 + range / 550

                ( point, aimed ) =
                    Reports.scatterAim (25 + range * 0.065 + track.age * 0.6) (Reports.projectedReport s.time delay report) s

                shell : Shell
                shell =
                    { id = aimed.soundSequence, x = point.x, y = point.y, depth = 0, delay = delay, fromX = ship.x, fromY = ship.y, total = delay, hit = Nothing }
            in
            ( { ship | attack = 12 }
            , { aimed | shells = aimed.shells ++ [ shell ], soundSequence = aimed.soundSequence + 1 }
                |> Systems.emit { kind = Acoustics.Gunfire, x = ship.x, y = ship.y, depth = Nothing, altitude = Just 12, power = 1 }
                |> Mechanics.log "Escort firing. Shells incoming. Dive or return fire." Damage
            )

        ( _, _, Submarine ) ->
            attacks.launchTorpedo { ship | attack = 35 } track s

        ( Just report, False, _ ) ->
            let
                ( r, drawn ) =
                    Systems.draw s

                depth : Float
                depth =
                    M.clamp 0 220 (track.depth + (r - 0.5) * (12 + track.age * 0.35))

                delay : Float
                delay =
                    M.max 4 (depth / 4.5)

                ( point, aimed ) =
                    Reports.scatterAim (70 + range * 0.48 + track.age * 1.4) (Reports.projectedReport s.time delay report) drawn
            in
            ( { ship | attack = 35 }
            , attacks.dropCharge { x = point.x, y = point.y, depth = depth, delay = delay } aimed
                |> Systems.addDebrief (ship.name ++ " dropped a depth charge.")
            )

        ( Nothing, _, _ ) ->
            ( ship, s )
