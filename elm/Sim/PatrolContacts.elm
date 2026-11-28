module Sim.PatrolContacts exposing (Decoying, Photographing, Pinging, decoy, dropDepthCharge, isVisible, photograph, ping)

{-| What the boat does to learn of other ships, and to hide from them: the
periscope's view, the active ping and who hears it, recon photographs, the
noisemaker, and depth charges dropped on her. Contact reports themselves are
Sim.ContactReports.
-}

import PatrolCriteria
import Sim.Acoustics as Acoustics
import Sim.Boat as Boat
import Sim.BoatSensors as BoatSensors
import Sim.Contact exposing (Sighting(..))
import Sim.ContactReports exposing (Reporting, contact, sighted)
import Sim.Environment exposing (Environment)
import Sim.Equipment as Equipment
import Sim.FleetTheater as FleetTheater
import Sim.FleetVolleys as Volleys exposing (Volley)
import Sim.HostileTracks exposing (Noisemaker)
import Sim.HullGeometry exposing (Body)
import Sim.Math as M
import Sim.Mechanics as Mechanics exposing (LogEntry, LogKind(..))
import Sim.Ordnance exposing (Blast, BlastKind)
import Sim.PatrolSearch exposing (SearchArea)
import Sim.ReconPhotos as ReconPhotos
import Sim.Ship exposing (Ship)
import Sim.Status as Status
import Sim.Suspicion as Suspicion
import Sim.Systems as Systems
import Sim.Torpedo as Torpedo exposing (Owner(..), Torpedo)
import Sim.TorpedoWatch as TorpedoWatch
import Sim.Vessel exposing (Kind(..), SurfaceShip(..))


{-| A periscope's view of a ship: the scope is up, shallow enough, not washed
over, in optical range, and when the boat looks a particular way, within 19
degrees of it.
-}
isVisible : Environment -> Maybe Float -> { s | x : Float, y : Float, depth : Float, heading : Float, pitch : Float, time : Float, scope : Bool, scopeTravel : Maybe Float, systems : { y | periscope : Float } } -> Ship -> Bool
isVisible env look s ship =
    if ship.hull <= 0 || ship.kind == Submarine || 15 < s.depth || not s.scope then
        False

    else
        not (BoatSensors.scopeWashed s env)
            && Mechanics.distance s ship
            < env.opticalRange
            * Equipment.operatingFraction s.systems.periscope
            && (case look of
                    Just l ->
                        M.abs (Mechanics.delta (Mechanics.bearing s ship) l) < 19

                    Nothing ->
                        True
               )


{-| The patrol fields the active ping reads and writes.
-}
type alias Pinging s p c t d =
    Reporting
        { s
            | depth : Float
            , status : Status.Status
            , pingAge : Float
            , pingCooldown : Float
            , systems : Boat.Systems
            , search : Maybe SearchArea
            , site : Maybe Body
            , projectiles : List Torpedo
            , traffic : Maybe { t | volleys : List Volley }
            , torpedoTracks : List TorpedoWatch.Track
            , ships : List Ship
            , difficulty : Maybe { d | pingDetection : Maybe Float }
        }
        p
        { c | shot : Maybe Volley }


{-| An active ping: it ranges every ship and torpedo within 6 km (as far as
the sonar works), finds the mission site within 1.5 km, and may tell any
opponent within 7.5 km where the boat is.
-}
ping : Pinging s p c t d -> ( Bool, Pinging s p c t d )
ping s0 =
    let
        reach : Float
        reach =
            Equipment.operatingFraction s0.systems.sonar
    in
    if 0 < s0.pingCooldown || s0.status /= Status.Patrol || not (M.truthy reach) then
        ( False, s0 )

    else
        let
            s1 : Pinging s p c t d
            s1 =
                case ( s0.search, Maybe.andThen (\site -> Maybe.map (\depth -> { x = site.x, y = site.y, depth = depth }) site.depth) s0.site ) of
                    ( Just search, Just site ) ->
                        if not search.located && Mechanics.separation s0 site < 1500 * reach then
                            Mechanics.log "Mission site echo identified. Position marked on chart." Success { s0 | search = Just { search | located = True }, pingAge = 0, pingCooldown = 15 }

                        else
                            { s0 | pingAge = 0, pingCooldown = 15 }

                    _ ->
                        { s0 | pingAge = 0, pingCooldown = 15 }

            observe : TorpedoWatch.Echo -> Pinging s p c t d -> Pinging s p c t d
            observe echo s =
                { s | torpedoTracks = TorpedoWatch.observe s echo True s.torpedoTracks }

            torpedoes : Pinging s p c t d
            torpedoes =
                List.foldl
                    (\p s ->
                        if M.hypot2 (Mechanics.distance s p) (s.depth - p.depth) < 6000 * reach then
                            observe (TorpedoWatch.gameEcho s (shot p) s.time Torpedo.torpedoSpeed) s

                        else
                            s
                    )
                    s1
                    s1.projectiles

            volleys : Pinging s p c t d
            volleys =
                List.foldl
                    (\volley s ->
                        let
                            p : { id : Int, x : Float, y : Float, depth : Float, time : Float, age : Float, heading : Float, pitch : Float, speed : Float }
                            p =
                                Volleys.fleetShotPose volley s.time
                        in
                        if volley.underwater && Mechanics.separation s p < 6000 * reach then
                            observe (TorpedoWatch.gameEcho s { id = p.id, x = p.x, y = p.y, depth = p.depth, enemy = False, aim = Nothing, orderedDepth = p.depth, diverted = False } s.time p.speed) s

                        else
                            s
                    )
                    torpedoes
                    (Volleys.activeVolleys torpedoes)

            ranged_ : Pinging s p c t d
            ranged_ =
                List.foldl
                    (\v s ->
                        if 0 < v.hull && Mechanics.distance s v < 6000 * reach then
                            Tuple.second (contact (sighted v) Active s)

                        else
                            s
                    )
                    volleys
                    volleys.ships

            heard : Pinging s p c t d
            heard =
                List.foldl
                    (\( i, v ) s ->
                        if not (FleetTheater.isOpponent v) || v.hull <= 0 || v.disabled == Just True then
                            s

                        else
                            let
                                chance : Float
                                chance =
                                    (s.difficulty |> Maybe.andThen .pingDetection |> Maybe.withDefault (0 / 0)) * M.clamp 0 1 (1 - Mechanics.distance s v / 7500)
                            in
                            if 0 < chance then
                                let
                                    ( roll, rng ) =
                                        Mechanics.rand s.rng
                                in
                                if roll < chance then
                                    { s | rng = rng, ships = setAt i (Suspicion.leaveClue 65 { x = s.x, y = s.y, time = s.time } v) s.ships }

                                else
                                    { s | rng = rng }

                            else
                                s
                    )
                    ranged_
                    (List.indexedMap Tuple.pair ranged_.ships)
        in
        ( True, Mechanics.log "Active ping. Ranges resolved. Nearby hunters may have heard it." Warning heard )


{-| A torpedo as the torpedo watch reads it.
-}
shot : Torpedo -> { id : Int, x : Float, y : Float, depth : Float, enemy : Bool, aim : Maybe { x : Float, y : Float }, orderedDepth : Float, diverted : Bool }
shot p =
    let
        ( enemy, aim ) =
            case p.owner of
                EnemyTorpedo knows ->
                    ( True, knows.aim )

                PlayerTorpedo ->
                    ( False, Nothing )
    in
    { id = p.id, x = p.x, y = p.y, depth = p.depth, enemy = enemy, aim = aim, orderedDepth = p.orderedDepth, diverted = p.diverted }


setAt : Int -> a -> List a -> List a
setAt i value =
    List.indexedMap
        (\j old ->
            if i == j then
                value

            else
                old
        )


{-| The patrol fields a photograph reads and writes.
-}
type alias Photographing s p c y =
    Reporting
        { s
            | depth : Float
            , heading : Float
            , pitch : Float
            , scope : Bool
            , scopeTravel : Maybe Float
            , systems : { y | periscope : Float }
            , ships : List Ship
            , photos : List String
            , photoCooldown : Float
        }
        { p | photoGoal : Float }
        c


{-| A photograph of the merchant nearest the reticle's center, if one is
framed.
-}
photograph : Environment -> Float -> Photographing s p c y -> ( Bool, Photographing s p c y )
photograph env look s =
    if 0 < s.photoCooldown then
        ( False, s )

    else
        let
            off : Ship -> Float
            off v =
                Mechanics.delta (Mechanics.bearing s v) look

            seen : List Ship
            seen =
                List.filter (\v -> v.incidental /= Just True && isVisible env (Just look) s v && ReconPhotos.framed (off v) PatrolCriteria.merchantPhotos && v.kind == Surface Merchant) s.ships
                    |> List.sortBy (\v -> M.abs (off v))
                    |> List.take 1
        in
        case seen of
            [] ->
                ( False, Mechanics.log "No merchant silhouette in the camera reticle." Warning s )

            v :: _ ->
                let
                    ( _, s1 ) =
                        contact (sighted v) Visual s

                    photos : List String
                    photos =
                        if List.member v.id s1.photos then
                            s1.photos

                        else
                            s1.photos ++ [ v.id ]
                in
                ( True
                , Mechanics.log ("Photograph recorded. " ++ String.fromInt (List.length photos) ++ "/" ++ String.fromFloat s1.patrol.photoGoal ++ " merchant silhouettes.") Success { s1 | photos = photos, photoCooldown = 4 }
                )


{-| The noisemaker: it masks the boat where she is, and every watcher's alert
eases.
-}
type alias Decoying s =
    { s | decoys : Int, status : Status.Status, alert : Float, x : Float, y : Float, depth : Float, heading : Float, time : Float, noisemaker : Maybe Noisemaker, ships : List Ship, events : List LogEntry }


decoy : Decoying s -> ( Bool, Decoying s )
decoy s =
    if s.decoys <= 0 || s.status /= Status.Patrol then
        ( False, s )

    else
        ( True
        , Mechanics.log "Noisemaker away. Change course and go quiet."
            Info
            { s
                | decoys = s.decoys - 1
                , alert = M.max 0 (s.alert - 35)
                , noisemaker = Just { x = s.x, y = s.y, depth = s.depth, heading = s.heading, speed = 0, time = s.time }
                , ships = List.map (\v -> { v | alert = M.max 0 (v.alert - 50) }) s.ships
            }
        )


{-| A depth charge or bomb in the water above the boat, and its splash.
-}
dropDepthCharge : { x : Float, y : Float, depth : Float, delay : Float, kind : BlastKind } -> Systems.Sounding { s | blasts : List Blast } -> ( Blast, Systems.Sounding { s | blasts : List Blast } )
dropDepthCharge order s =
    let
        charge : Blast
        charge =
            { id = s.soundSequence, x = order.x, y = order.y, depth = order.depth, delay = order.delay, totalDelay = order.delay, airTime = Nothing, airHeight = Nothing, age = 0, exploded = False, kind = order.kind, splashed = Nothing, explodedAt = Nothing, convoyCharge = Nothing }
    in
    ( charge
    , Systems.emit { kind = Acoustics.Splashdown, x = order.x, y = order.y, depth = Just 0, altitude = Nothing, power = 0.65 } { s | soundSequence = s.soundSequence + 1, blasts = s.blasts ++ [ charge ] }
    )
