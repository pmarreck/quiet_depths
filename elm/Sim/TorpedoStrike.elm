module Sim.TorpedoStrike exposing (Firing, torpedoStrike)

{-| A torpedo striking: the first hull it enters along this moment's run, the
boat's for an enemy torpedo or any ship afloat, takes the detonation. The
boat takes a heavy hit; the carrier registers a direct hit and raises the
alarm; an enemy torpedo sinks any other ship it strikes, and the boat's
torpedo does too unless the damage setting spares it.
-}

import Dict exposing (Dict)
import PatrolMission exposing (Mission)
import Sim.Acoustics as Acoustics
import Sim.AirSupport as AirSupport exposing (AirSupport, Aircraft)
import Sim.Boat exposing (Limits, Systems)
import Sim.Carrier as Carrier
import Sim.Coast exposing (Coastline)
import Sim.ColdWatch as ColdWatch
import Sim.CombatGeometry as Geometry
import Sim.Debrief as Debrief
import Sim.Drone exposing (Drone)
import Sim.InvalidNumber exposing (InvalidNumber)
import Sim.Math as M
import Sim.Mechanics exposing (LogEntry)
import Sim.Ordnance exposing (Aloft, Blast, Round)
import Sim.PatrolReports as PatrolReports exposing (Report)
import Sim.ReplayEvents as Replay
import Sim.Ship exposing (Ship)
import Sim.Sound exposing (Sound)
import Sim.Status exposing (Status)
import Sim.Systems as Systems exposing (Difficulty, Impact)
import Sim.Torpedo as Torpedo exposing (Owner(..), Torpedo)
import Sim.Vessel exposing (Kind(..), Side(..), SurfaceShip(..))


{-| The patrol fields a torpedo run reads and writes: the boat's, which a
strike can damage, the air support a strike on the carrier scrambles, and
the ships, torpedoes and reports.
-}
type alias Firing s p n =
    { s
        | status : Status
        , time : Float
        , rng : Int
        , difficulty : Maybe Difficulty
        , x : Float
        , y : Float
        , depth : Float
        , heading : Float
        , pitch : Float
        , roll : Maybe Float
        , speed : Float
        , systems : Systems
        , repairLimits : Limits
        , hull : Float
        , outerHull : Float
        , flood : Float
        , shock : Float
        , fuel : Float
        , fuelLeak : Float
        , battery : Float
        , scope : Bool
        , scopeTravel : Maybe Float
        , torps : Int
        , cookoff : Bool
        , collisionHits : Dict String Float
        , drone : Drone
        , chart : Maybe Coastline
        , impacts : List Impact
        , weaponSequence : Int
        , events : List LogEntry
        , debrief : List Debrief.Entry
        , acoustics : List Sound
        , soundSequence : Int
        , replay : List Replay.Marked
        , invalid : List InvalidNumber
        , mission : Mission
        , patrol : { p | seed : Float }
        , ships : List Ship
        , aircraft : List Aircraft
        , airSupport : AirSupport
        , blasts : List Blast
        , gunRounds : List Round
        , noisemaker : Maybe { n | x : Float, y : Float, time : Float }
        , projectiles : List Torpedo
        , reports : List Report
    }


{-| What a torpedo's run this moment entered first, and how far along it.
-}
type Struck
    = TheBoat
    | AShip Int Ship


setShip : Int -> Ship -> Firing s p n -> Firing s p n
setShip i ship s =
    { s
        | ships =
            List.indexedMap
                (\j v ->
                    if j == i then
                        ship

                    else
                        v
                )
                s.ships
    }


{-| Whether the torpedo struck along its run from `from` to where it is now;
a strike stops it at the point of impact and ends its run.
-}
torpedoStrike : Torpedo -> Aloft -> Firing s p n -> ( Bool, Torpedo, Firing s p n )
torpedoStrike p from s =
    let
        to : Aloft
        to =
            { x = p.x, y = p.y, altitude = negate p.depth }

        boatHit : Maybe ( Struck, Float )
        boatHit =
            case p.owner of
                EnemyTorpedo _ ->
                    Geometry.shipHit from to { x = s.x, y = s.y, heading = s.heading, sinkDepth = 0, depth = Just s.depth } (Just Submarine)
                        |> Maybe.map (Tuple.pair TheBoat)

                PlayerTorpedo ->
                    Nothing

        nearer : ( Int, Ship ) -> Maybe ( Struck, Float ) -> Maybe ( Struck, Float )
        nearer ( i, ship ) found =
            if ship.hull <= 0 then
                found

            else
                case Geometry.shipHit from to { x = ship.x, y = ship.y, heading = ship.heading, sinkDepth = orZero ship.sinkDepth, depth = ship.depth } (Just ship.kind) of
                    Just t ->
                        if t < (Maybe.map Tuple.second found |> Maybe.withDefault (1 / 0)) then
                            Just ( AShip i ship, t )

                        else
                            found

                    Nothing ->
                        found
    in
    case List.foldl nearer boatHit (List.indexedMap Tuple.pair s.ships) of
        Nothing ->
            ( False, p, s )

        Just ( struck, fraction ) ->
            let
                stopped : Torpedo
                stopped =
                    { p
                        | x = from.x + (p.x - from.x) * fraction
                        , y = from.y + (p.y - from.y) * fraction
                        , depth = negate from.altitude + (p.depth + from.altitude) * fraction
                        , age = Torpedo.torpedoLife
                    }

                event : Replay.ReplayEvent
                event =
                    { kind = Replay.Torpedo
                    , point = { x = stopped.x, y = stopped.y, depth = stopped.depth }
                    , heading = Just stopped.heading
                    , target =
                        case struck of
                            AShip _ ship ->
                                Just ship.id

                            TheBoat ->
                                Nothing
                    , shot = Just (toFloat stopped.id)
                    , enemy =
                        case struck of
                            AShip _ _ ->
                                Just (stopped.owner /= PlayerTorpedo)

                            TheBoat ->
                                Just False
                    }

                announced : Firing s p n
                announced =
                    { s | impacts = s.impacts ++ [ { id = stopped.id, x = stopped.x, y = stopped.y, altitude = negate stopped.depth, time = s.time, kind = "torpedo" } ] }
                        |> Systems.emitWith (\sound -> { sound | ownHit = Just (stopped.owner == PlayerTorpedo) })
                            { kind = Acoustics.Detonation, x = stopped.x, y = stopped.y, depth = Just stopped.depth, altitude = Nothing, power = 1 }
                        |> Replay.mark event
            in
            ( True, stopped, struckBy stopped struck announced )


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


struckBy : Torpedo -> Struck -> Firing s p n -> Firing s p n
struckBy p struck s =
    case struck of
        TheBoat ->
            s
                |> Systems.hurt 36 "Torpedo struck the hull. Damage control responding." Nothing (Just { x = p.x, y = p.y, depth = p.depth })
                |> Systems.addDebrief "An incoming torpedo struck your sub."

        AShip i ship ->
            if ship.kind == Surface Carrier then
                carrierStruck p i ship s

            else
                case p.owner of
                    EnemyTorpedo _ ->
                        setShip i { ship | hull = M.max 0 (ship.hull - 100) } s

                    PlayerTorpedo ->
                        let
                            sunk : Ship
                            sunk =
                                { ship | playerDamaged = Just True, hull = M.max 0 (ship.hull - 100 * 2 ^ (Maybe.andThen .damage s.difficulty |> Maybe.withDefault 0)) }
                        in
                        if sunk.military == Just True then
                            setShip i sunk s
                                |> Systems.addDebrief
                                    ("Your torpedo struck "
                                        ++ (if sunk.side == Just Friendly then
                                                "the friendly "

                                            else
                                                ""
                                           )
                                        ++ sunk.name
                                        ++ "."
                                    )

                        else
                            let
                                ( recorded, marked ) =
                                    PatrolReports.recordCivilianHit
                                        (if p.diverted && p.intended /= Just sunk.id then
                                            "A decoy diverted your torpedo before it acquired and struck the neutral " ++ sunk.name ++ "."

                                         else
                                            "Your torpedo struck the neutral " ++ sunk.name ++ "."
                                        )
                                        s
                                        sunk
                            in
                            setShip i marked recorded


{-| A direct hit on the carrier, which raises the alarm; the boat's torpedo
also tells her escort where the boat is. A carrier always carries her hits,
flooding and disabled flag, so their defaults never apply.
-}
carrierStruck : Torpedo -> Int -> Ship -> Firing s p n -> Firing s p n
carrierStruck p i ship s =
    let
        hit : { directHits : Int, hull : Float, flood : Float, disabled : Bool, speed : Float }
        hit =
            Carrier.registerCarrierHit
                { directHits = floor (Maybe.withDefault 0 ship.directHits)
                , hull = ship.hull
                , flood = Maybe.withDefault 0 ship.flood
                , disabled = Maybe.withDefault False ship.disabled
                , speed = ship.speed
                }

        registered : Ship
        registered =
            { ship
                | directHits = Just (toFloat hit.directHits)
                , hull = hit.hull
                , flood = Just hit.flood
                , disabled =
                    if hit.disabled then
                        Just True

                    else
                        ship.disabled
                , speed = hit.speed
            }

        alarmed : Firing s p n
        alarmed =
            AirSupport.raiseCarrierAlarm registered (setShip i registered s)
    in
    case p.owner of
        PlayerTorpedo ->
            let
                current : Ship
                current =
                    List.drop i alarmed.ships |> List.head |> Maybe.withDefault registered

                signaled : Ship
                signaled =
                    ColdWatch.playerSignal True Nothing alarmed current
            in
            setShip i { signaled | playerDamaged = Just True } alarmed
                |> Systems.addDebrief ("Your torpedo struck " ++ signaled.name ++ " (direct hit " ++ String.fromInt hit.directHits ++ ").")

        EnemyTorpedo _ ->
            alarmed
