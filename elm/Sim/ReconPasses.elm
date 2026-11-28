module Sim.ReconPasses exposing (Passing, updateRecon)

{-| A recon task's progress each moment: the uplink, the satellite's overpass,
its two exposures, processing on the ground, and the radio transfer home.
The packet freezes what the exposures saw; a held transfer never resamples
it.
-}

import Dict exposing (Dict)
import Sim.Environment as Env exposing (Environment)
import Sim.Math as M
import Sim.Recon as Recon exposing (Area, Frame, FrameShip, ImageMode(..), Packet, Phase(..), Recon, SceneKind(..), SceneShip, Track)
import Sim.Ship exposing (Ship)
import Sim.Status as Status
import Sim.SurfaceMotion exposing (hash01)
import Sim.Text exposing (codePointUnits)
import Sim.Vessel exposing (Kind(..))


uplinkSeconds : Float
uplinkSeconds =
    8


exposureSeconds : Float
exposureSeconds =
    10


processingSeconds : Float
processingSeconds =
    12


{-| The patrol fields the recon update reads and writes.
-}
type alias Passing s p =
    { s
        | status : Status.Status
        , time : Float
        , depth : Float
        , recon : Maybe Recon
        , ships : List Ship
        , patrol : { p | seed : Float }
        , wavePhase : Maybe Float
    }


{-| A ship id's hash, as JavaScript folds its code points.
-}
codeOf : String -> Int
codeOf id =
    List.foldl (\unit value -> M.toInt32 (toFloat (M.imul value 31) + toFloat unit)) 0 (codePointUnits id)


{-| What one exposure sees in the square: surface ships afloat, and at night
only those showing lights.
-}
snapshot : Environment -> Area -> Passing s p -> Frame
snapshot e area s =
    let
        half : Float
        half =
            Recon.footprint / 2

        night : Bool
        night =
            e.daylight < 0.25

        seen : Ship -> Maybe FrameShip
        seen v =
            case v.kind of
                Surface kind ->
                    if 0 < v.hull && orZero (Maybe.withDefault 0 v.depth) <= 3 && M.abs (v.x - area.x) <= half && M.abs (v.y - area.y) <= half && (not night || (v.lights /= Just False && v.blackout /= Just True)) then
                        Just { id = v.id, x = v.x, y = v.y, heading = v.heading, speed = v.speed, kind = kind, hull = v.hull, name = v.name, military = v.military, side = v.side }

                    else
                        Nothing

                Submarine ->
                    Nothing
    in
    { time = s.time
    , night = night
    , weather =
        { id = Env.weatherIdName e.weatherId
        , name = e.weather
        , waveScale = Just e.waveScale
        , waveSpeed = Just e.waveSpeed
        , wavePhase = Just (Maybe.withDefault (s.time * e.waveSpeed) s.wavePhase)
        , cloud = M.max e.cloud e.fog
        , rain = e.rain
        , storm = e.storm
        , daylight = e.daylight
        , hour = e.hour
        }
    , ships = List.filterMap seen s.ships |> List.take Recon.maxTracks
    }


orZero : Float -> Float
orZero v =
    if M.truthy v then
        v

    else
        0


{-| The packet the two exposures make: ships seen in both, placed as well as
the clouds allow, moving as far as they moved between, and named only on a
clear day.
-}
makePacket : Float -> Area -> Int -> Frame -> Frame -> Packet
makePacket seed area sequence first second =
    let
        cloud : Float
        cloud =
            second.weather.cloud

        rain : Float
        rain =
            second.weather.rain

        clear : Bool
        clear =
            cloud < 0.35 && rain < 0.1

        coverage : Float
        coverage =
            if clear then
                1

            else
                M.clamp 0.12 0.9 (1 - cloud * 0.8 - rain * 0.15)

        firstById : Dict String FrameShip
        firstById =
            Dict.fromList (List.map (\v -> ( v.id, v )) first.ships)

        interval : Float
        interval =
            M.max 0.001 (second.time - first.time)

        observed : FrameShip -> Maybe ( Track, SceneShip )
        observed ship =
            Dict.get ship.id firstById
                |> Maybe.andThen
                    (\previous ->
                        let
                            -- The mask belongs to a world patch, not a screen pixel.
                            code : Float
                            code =
                                toFloat (codeOf ship.id) + toFloat (floor (ship.x / 1300)) * 19 + toFloat (floor (ship.y / 1300)) * 43
                        in
                        if not clear && coverage < hash01 seed code then
                            Nothing

                        else
                            let
                                positionSigma : Float
                                positionSigma =
                                    if clear then
                                        0

                                    else
                                        40 + cloud * 150 + rain * 100

                                identified : Bool
                                identified =
                                    not second.night && clear

                                track : Track
                                track =
                                    { id = ship.id
                                    , x = ship.x + (hash01 seed (code + 1201) - 0.5) * positionSigma * 2
                                    , y = ship.y + (hash01 seed (code + 1202) - 0.5) * positionSigma * 2
                                    , vx = (ship.x - previous.x) / interval
                                    , vy = (ship.y - previous.y) / interval
                                    , time = second.time
                                    , identified = identified
                                    , positionSigma = positionSigma
                                    , velocitySigma =
                                        if clear then
                                            0.25

                                        else
                                            0.8
                                    , maneuverSigma = 0.008
                                    , name = whenIdentified identified ship.name
                                    , kind = whenIdentified identified ship.kind
                                    , military = Maybe.andThen (whenIdentified identified) ship.military
                                    , side = Maybe.andThen (whenIdentified identified) ship.side
                                    }
                            in
                            Just
                                ( track
                                , { id = ship.id
                                  , x = track.x
                                  , y = track.y
                                  , heading = ship.heading
                                  , speed = ship.speed
                                  , kind =
                                        if second.night then
                                            Light

                                        else
                                            Seen ship.kind
                                  , hull = ship.hull
                                  }
                                )
                    )

        ( tracks, sceneShips ) =
            List.filterMap observed second.ships |> List.unzip

        id : String
        id =
            "sat-" ++ String.fromInt sequence
    in
    { id = id
    , photoId = id
    , area = area
    , capturedAt = second.time
    , receivedAt = Nothing
    , night = second.night
    , weather = second.weather
    , coverage = coverage
    , quality =
        if clear then
            1

        else
            M.clamp 0.1 0.85 (1 - cloud * 0.7 - rain * 0.2)
    , tracks = tracks
    , sceneShips = sceneShips
    , mode =
        if second.night then
            NightLights

        else
            Daylight
    , firstFrameAt = first.time
    , secondFrameAt = second.time
    }


whenIdentified : Bool -> a -> Maybe a
whenIdentified identified value =
    if identified then
        Just value

    else
        Nothing


{-| One moment of the task, with the packet when its transfer completes. A
phase missing what it reads (which saves refuse) holds where it is.
-}
updateRecon : Environment -> Float -> Passing s p -> ( Maybe Packet, Passing s p )
updateRecon e dt s =
    case s.recon of
        Just r0 ->
            if s.status /= Status.Patrol || isNaN s.time || isInfinite s.time || isNaN dt || isInfinite dt || dt <= 0 then
                ( Nothing, s )

            else
                let
                    link : Recon.Link
                    link =
                        Recon.reconLink (Just s.depth)

                    -- A queued request starts uplinking in the same moment the link allows.
                    r : Recon
                    r =
                        if r0.phase == Queued && link.canUplink then
                            { r0 | phase = Uplinking, startedAt = Just s.time, progress = 0 }

                        else
                            r0

                    with : Recon -> Passing s p
                    with next =
                        { s | recon = Just next }
                in
                case r.phase of
                    Uplinking ->
                        if not link.canUplink then
                            ( Nothing, s )

                        else
                            let
                                progress : Float
                                progress =
                                    M.clamp 0 1 (r.progress + dt / uplinkSeconds)
                            in
                            if progress < 1 then
                                ( Nothing, with { r | progress = progress } )

                            else
                                ( Nothing, with { r | phase = Tasking, startedAt = Just s.time, readyAt = Just (s.time + 90 + toFloat (floor (hash01 s.patrol.seed (toFloat (700 + r.sequence)) * 61))), progress = 0 } )

                    Tasking ->
                        case ( ( r.startedAt, r.readyAt ), r.area ) of
                            ( ( Just started, Just ready ), Just area ) ->
                                let
                                    progressed : Recon
                                    progressed =
                                        { r | progress = M.clamp 0 1 ((s.time - started) / (ready - started)) }
                                in
                                if s.time < ready then
                                    ( Nothing, with progressed )

                                else
                                    ( Nothing, with { progressed | firstFrame = Just (snapshot e area s), phase = Imaging, startedAt = Just s.time, progress = 0 } )

                            _ ->
                                ( Nothing, s )

                    Imaging ->
                        case ( ( r.startedAt, r.firstFrame ), r.area ) of
                            ( ( Just started, Just first ), Just area ) ->
                                let
                                    progress : Float
                                    progress =
                                        M.clamp 0 1 ((s.time - started) / exposureSeconds)
                                in
                                if progress < 1 then
                                    ( Nothing, with { r | progress = progress } )

                                else
                                    ( Nothing, with { r | packet = Just (makePacket s.patrol.seed area r.sequence first (snapshot e area s)), firstFrame = Nothing, phase = Processing, startedAt = Just s.time, progress = 0 } )

                            _ ->
                                ( Nothing, s )

                    Processing ->
                        case r.startedAt of
                            Just started ->
                                let
                                    progress : Float
                                    progress =
                                        M.clamp 0 1 ((s.time - started) / processingSeconds)
                                in
                                if progress < 1 then
                                    ( Nothing, with { r | progress = progress } )

                                else
                                    ( Nothing, with { r | phase = Receiving, startedAt = Just s.time, transferStartedAt = Just s.time, progress = 0 } )

                            Nothing ->
                                ( Nothing, s )

                    Receiving ->
                        case r.packet of
                            Just packet ->
                                let
                                    progress : Float
                                    progress =
                                        M.clamp 0 1 (r.progress + dt * link.rate)
                                in
                                if progress < 1 then
                                    ( Nothing, with { r | progress = progress } )

                                else
                                    let
                                        received : Packet
                                        received =
                                            { packet | receivedAt = Just s.time }
                                    in
                                    ( Just received, with { r | packet = Just received, phase = Complete, progress = 1, cooldownUntil = M.max r.cooldownUntil (s.time + Recon.cooldown) } )

                            Nothing ->
                                ( Nothing, s )

                    _ ->
                        ( Nothing, with r )

        Nothing ->
            ( Nothing, s )
