module Sim.Recon exposing
    ( Area
    , Frame
    , FrameShip
    , FrameWeather
    , ImageMode(..)
    , Link
    , Packet
    , Panel
    , Phase(..)
    , Recon
    , SceneKind(..)
    , SceneShip
    , Track
    , cooldown
    , footprint
    , freshRecon
    , maxTracks
    , phaseName
    , phases
    , reconAreaForDisplay
    , reconLink
    , reconStatus
    , requestRecon
    )

{-| Orbital reconnaissance: the boat radios a request for a 10 km square, the
satellite is retasked, takes two exposures to measure surface motion, and the
packet comes back over the radio. The 1972 imagery relay is a deliberate
historical exception; depth limits and timings are play tuning.

An area's size is always the footprint and an image always 640 pixels square,
so neither is stored: a save holding anything else is refused.

-}

import Sim.Math as M
import Sim.Status as Status
import Sim.Vessel exposing (Side, SurfaceShip)


footprint : Float
footprint =
    10000


uplinkDepth : Float
uplinkDepth =
    15


receiveDepth : Float
receiveDepth =
    30


cooldown : Float
cooldown =
    480


surfaceTransferSeconds : Float
surfaceTransferSeconds =
    18


maxTracks : Int
maxTracks =
    256


type Phase
    = Idle
    | Queued
    | Uplinking
    | Tasking
    | Imaging
    | Processing
    | Receiving
    | Complete
    | Failed


{-| Every phase, in order. Each case names the next, so adding a phase without
listing it fails to compile.
-}
phases : List Phase
phases =
    let
        from : Phase -> List Phase
        from phase =
            phase
                :: (case phase of
                        Idle ->
                            from Queued

                        Queued ->
                            from Uplinking

                        Uplinking ->
                            from Tasking

                        Tasking ->
                            from Imaging

                        Imaging ->
                            from Processing

                        Processing ->
                            from Receiving

                        Receiving ->
                            from Complete

                        Complete ->
                            from Failed

                        Failed ->
                            []
                   )
    in
    from Idle


phaseName : Phase -> String
phaseName phase =
    case phase of
        Idle ->
            "idle"

        Queued ->
            "queued"

        Uplinking ->
            "uplinking"

        Tasking ->
            "tasking"

        Imaging ->
            "imaging"

        Processing ->
            "processing"

        Receiving ->
            "receiving"

        Complete ->
            "complete"

        Failed ->
            "failed"


{-| A search square's center; its size is the footprint.
-}
type alias Area =
    { x : Float, y : Float }


{-| The weather of an exposure. Saves from before the wave fields existed lack
them.
-}
type alias FrameWeather =
    { id : String
    , name : String
    , waveScale : Maybe Float
    , waveSpeed : Maybe Float
    , wavePhase : Maybe Float
    , cloud : Float
    , rain : Float
    , storm : Float
    , daylight : Float
    , hour : Float
    }


type alias FrameShip =
    { id : String
    , x : Float
    , y : Float
    , heading : Float
    , speed : Float
    , kind : SurfaceShip
    , hull : Float
    , name : String
    , military : Maybe Bool
    , side : Maybe Side
    }


type alias Frame =
    { time : Float, night : Bool, weather : FrameWeather, ships : List FrameShip }


type alias Track =
    { id : String
    , x : Float
    , y : Float
    , vx : Float
    , vy : Float
    , time : Float
    , identified : Bool
    , positionSigma : Float
    , velocitySigma : Float
    , maneuverSigma : Float
    , name : Maybe String
    , kind : Maybe SurfaceShip
    , military : Maybe Bool
    , side : Maybe Side
    }


{-| What the photograph shows: a ship's silhouette by day, its lights at night.
-}
type SceneKind
    = Seen SurfaceShip
    | Light


type alias SceneShip =
    { id : String, x : Float, y : Float, heading : Float, speed : Float, kind : SceneKind, hull : Float }


type ImageMode
    = NightLights
    | Daylight


type alias Packet =
    { id : String
    , photoId : String
    , area : Area
    , capturedAt : Float
    , receivedAt : Maybe Float
    , night : Bool
    , weather : FrameWeather
    , coverage : Float
    , quality : Float
    , tracks : List Track
    , sceneShips : List SceneShip
    , mode : ImageMode
    , firstFrameAt : Float
    , secondFrameAt : Float
    }


type alias Recon =
    { phase : Phase
    , area : Maybe Area
    , requestedAt : Maybe Float
    , startedAt : Maybe Float
    , readyAt : Maybe Float
    , cooldownUntil : Float
    , progress : Float
    , packet : Maybe Packet
    , sequence : Int
    , firstFrame : Maybe Frame
    , transferStartedAt : Maybe Float
    }


freshRecon : Recon
freshRecon =
    { phase = Idle, area = Nothing, requestedAt = Nothing, startedAt = Nothing, readyAt = Nothing, cooldownUntil = 0, progress = 0, packet = Nothing, sequence = 0, firstFrame = Nothing, transferStartedAt = Nothing }


{-| Idle, complete or failed: free to take a new request.
-}
settled : Phase -> Bool
settled phase =
    phase == Idle || phase == Complete || phase == Failed


{-| The square the chart shows: the one being worked, or between tasks the one
the player has prepared.
-}
reconAreaForDisplay : { r | phase : Phase, area : Maybe Area } -> Maybe Area -> Maybe Area
reconAreaForDisplay recon selected =
    if settled recon.phase then
        case selected of
            Just area ->
                Just area

            Nothing ->
                recon.area

    else
        recon.area


type alias Link =
    { canUplink : Bool, canReceive : Bool, rate : Float, label : String }


{-| What the radio can do at a depth; an unknown depth reaches nothing.
-}
reconLink : Maybe Float -> Link
reconLink boatDepth =
    let
        depth : Float
        depth =
            case boatDepth of
                Just d ->
                    if isNaN d || isInfinite d then
                        1 / 0

                    else
                        M.max 0 d

                Nothing ->
                    1 / 0

        canReceive : Bool
        canReceive =
            depth <= receiveDepth
    in
    { canUplink = depth <= uplinkDepth
    , canReceive = canReceive
    , rate =
        if not canReceive then
            0

        else if depth <= 1 then
            1 / surfaceTransferSeconds

        else
            1 / (80 + depth * 8)
    , label =
        if not canReceive then
            "Reception held · rise to 30 m"

        else if depth <= 1 then
            "Surface radio relay"

        else
            "Slow shallow VLF relay"
    }


finite : Float -> Bool
finite v =
    not (isNaN v || isInfinite v)


{-| A requested square: on the chart, and exactly the footprint.
-}
validArea : { a | x : Float, y : Float, size : Float } -> Bool
validArea area =
    finite area.x && finite area.y && M.abs area.x <= 20000 && M.abs area.y <= 20000 && area.size == footprint


{-| The patrol fields a request reads and writes.
-}
type alias Requesting s d =
    { s | status : Status.Status, time : Float, recon : Maybe Recon, difficulty : Maybe { d | satellite : Maybe Bool } }


{-| Queues a request for a square, unless the satellite is off, the patrol is
over, the area is off the chart, the last task is busy or cooling down, or a
storm blinds the optics. `storm` is the storm strength now.
-}
requestRecon : Float -> Maybe { x : Float, y : Float, size : Float } -> Requesting s d -> ( Bool, Requesting s d )
requestRecon storm candidate s =
    case ( s.recon, candidate ) of
        ( Just recon, Just area ) ->
            if (s.difficulty |> Maybe.andThen .satellite) == Just False || s.status /= Status.Patrol || not (finite s.time) || s.time < 0 || not (validArea area) || s.time < recon.cooldownUntil || not (settled recon.phase) || 0.5 < storm then
                ( False, s )

            else
                ( True
                , { s
                    | recon =
                        Just
                            { freshRecon
                                | phase = Queued
                                , area = Just { x = area.x, y = area.y }
                                , requestedAt = Just s.time
                                , cooldownUntil = s.time + cooldown
                                , sequence = recon.sequence + 1
                            }
                  }
                )

        _ ->
            ( False, s )


type alias Panel =
    { phase : Phase, title : String, detail : String, progress : Float, canRequest : Bool, cooldownRemaining : Float, linkLabel : String }


{-| What the recon panel shows. `storm` is the storm strength now.
-}
reconStatus : Float -> { s | time : Float, depth : Float, recon : Maybe Recon } -> Panel
reconStatus storm s =
    let
        r : Recon
        r =
            Maybe.withDefault freshRecon s.recon

        link : Link
        link =
            reconLink (Just s.depth)

        cooldownRemaining : Float
        cooldownRemaining =
            M.max 0 (r.cooldownUntil - s.time)

        blocked : Bool
        blocked =
            0.5 < storm

        ( title, detail ) =
            case r.phase of
                Idle ->
                    ( "Orbital reconnaissance"
                    , if blocked then
                        "Storm obscures optical reconnaissance."

                      else
                        "Place a 10 km square on the chart."
                    )

                Queued ->
                    ( "Awaiting radio uplink"
                    , if link.canUplink then
                        "Sending tasking request."

                      else
                        "Rise to antenna depth: 15 m or less."
                    )

                Uplinking ->
                    ( "Transmitting tasking request"
                    , if link.canUplink then
                        "Radio request in progress."

                      else
                        "Uplink held: rise to 15 m."
                    )

                Tasking ->
                    ( "Retasking · awaiting overpass", "The satellite is moving into the requested observing geometry." )

                Imaging ->
                    ( "Imaging the search square", "Two exposures measure surface motion. Clouds and darkness limit identification." )

                Processing ->
                    ( "Processing reconnaissance", "Decoding and checking the captured observations." )

                Receiving ->
                    ( "Receiving reconnaissance"
                    , if link.canReceive then
                        link.label

                      else
                        "Reception held: rise to 30 m or less for the shallow antenna."
                    )

                Complete ->
                    ( "Reconnaissance received"
                    , case r.packet of
                        Just packet ->
                            if List.isEmpty packet.tracks then
                                "No usable surface returns in this exposure."

                            else
                                String.fromInt (List.length packet.tracks) ++ " surface tracks · observation " ++ String.fromInt (round (s.time - packet.capturedAt)) ++ " s old"

                        Nothing ->
                            "No usable surface returns in this exposure."
                    )

                Failed ->
                    ( "Reconnaissance unavailable", "No usable exposure received." )
    in
    { phase = r.phase
    , title = title
    , detail = detail
    , progress =
        M.clamp 0
            1
            (if M.truthy r.progress then
                r.progress

             else
                0
            )
    , canRequest = settled r.phase && cooldownRemaining <= 0 && not blocked
    , cooldownRemaining = cooldownRemaining
    , linkLabel = link.label
    }
