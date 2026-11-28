module Sim.ReconSaves exposing (decoder, encode, encodePacket)

{-| A saved recon task, read from untrusted JSON with every check the game's
restore makes, and written back as the game saves it. The decoder succeeds
exactly when the TypeScript `validateReconState` accepts the value.
-}

import Json.Decode as D exposing (Decoder)
import Json.Encode as E
import Set
import Sim.Environment as Env
import Sim.Math as M
import Sim.Recon as Recon exposing (Area, Frame, FrameShip, FrameWeather, ImageMode(..), Packet, Phase(..), Recon, SceneKind(..), SceneShip, Track)
import Sim.Vessel as Vessel exposing (Kind(..), Side, SurfaceShip)


finite : Decoder Float
finite =
    D.float
        |> D.andThen
            (\v ->
                if isNaN v || isInfinite v then
                    D.fail "not a finite number"

                else
                    D.succeed v
            )


{-| A finite number passing a test.
-}
finiteWhere : String -> (Float -> Bool) -> Decoder Float
finiteWhere what test =
    finite
        |> D.andThen
            (\v ->
                if test v then
                    D.succeed v

                else
                    D.fail ("not " ++ what)
            )


{-| A field that may be left out; when present it must decode.
-}
absentOr : String -> Decoder a -> Decoder (Maybe a)
absentOr key valueDecoder =
    D.oneOf [ D.field key D.value |> D.map (\_ -> True), D.succeed False ]
        |> D.andThen
            (\present ->
                if present then
                    D.map Just (D.field key valueDecoder)

                else
                    D.succeed Nothing
            )


{-| A field that must be present, holding null or a value.
-}
nullable : String -> Decoder a -> Decoder (Maybe a)
nullable key valueDecoder =
    D.field key (D.nullable valueDecoder)


named : String -> (a -> String) -> List a -> Decoder a
named what name all =
    D.string
        |> D.andThen
            (\text ->
                case List.filter (\a -> name a == text) all of
                    a :: _ ->
                        D.succeed a

                    [] ->
                        D.fail ("not a " ++ what)
            )


surfaceShips : List SurfaceShip
surfaceShips =
    List.filterMap
        (\kind ->
            case kind of
                Surface ship ->
                    Just ship

                Submarine ->
                    Nothing
        )
        Vessel.kinds


surfaceShip : Decoder SurfaceShip
surfaceShip =
    named "surface ship" (Surface >> Vessel.kindName) surfaceShips


side : Decoder Side
side =
    named "side" Vessel.sideName Vessel.sides


andMap : Decoder a -> Decoder (a -> b) -> Decoder b
andMap =
    D.map2 (|>)


area : Decoder Area
area =
    D.map3 (\x y _ -> { x = x, y = y })
        (D.field "x" (finiteWhere "on the chart" (\v -> M.abs v <= 20000)))
        (D.field "y" (finiteWhere "on the chart" (\v -> M.abs v <= 20000)))
        (D.field "size" (finiteWhere "the footprint" (\v -> v == Recon.footprint)))


unitRange : Decoder Float
unitRange =
    finiteWhere "in [0, 1]" (\v -> 0 <= v && v <= 1)


weather : Decoder FrameWeather
weather =
    D.succeed FrameWeather
        |> andMap (D.field "id" (named "weather" identity (List.map Env.weatherIdName Env.weatherIds)))
        |> andMap (D.field "name" D.string)
        |> andMap (absentOr "waveScale" (finiteWhere "non-negative" (\v -> 0 <= v)))
        |> andMap (absentOr "waveSpeed" (finiteWhere "non-negative" (\v -> 0 <= v)))
        |> andMap (absentOr "wavePhase" (finiteWhere "non-negative" (\v -> 0 <= v)))
        |> andMap (D.field "cloud" unitRange)
        |> andMap (D.field "rain" unitRange)
        |> andMap (D.field "storm" unitRange)
        |> andMap (D.field "daylight" unitRange)
        |> andMap (D.field "hour" finite)


frameShip : Decoder FrameShip
frameShip =
    D.succeed FrameShip
        |> andMap (D.field "id" D.string)
        |> andMap (D.field "x" finite)
        |> andMap (D.field "y" finite)
        |> andMap (D.field "heading" finite)
        |> andMap (D.field "speed" finite)
        |> andMap (D.field "kind" surfaceShip)
        |> andMap (D.field "hull" finite)
        |> andMap (D.field "name" D.string)
        |> andMap (absentOr "military" D.bool)
        |> andMap (absentOr "side" side)


{-| At most `limit` items.
-}
upTo : Int -> Decoder a -> Decoder (List a)
upTo limit item =
    D.list item
        |> D.andThen
            (\items ->
                if List.length items <= limit then
                    D.succeed items

                else
                    D.fail "too many"
            )


frame : Decoder Frame
frame =
    D.map4 Frame
        (D.field "time" (finiteWhere "a time" (\v -> 0 <= v)))
        (D.field "night" D.bool)
        (D.field "weather" weather)
        (D.field "ships" (upTo Recon.maxTracks frameShip))


track : Float -> Decoder Track
track capturedAt =
    let
        sigma : Decoder Float
        sigma =
            finiteWhere "non-negative" (\v -> 0 <= v)
    in
    D.succeed Track
        |> andMap (D.field "id" D.string)
        |> andMap (D.field "x" finite)
        |> andMap (D.field "y" finite)
        |> andMap (D.field "vx" finite)
        |> andMap (D.field "vy" finite)
        |> andMap (D.field "time" (finiteWhere "a capture time" (\v -> 0 <= v && v <= capturedAt)))
        |> andMap (D.field "identified" D.bool)
        |> andMap (D.field "positionSigma" sigma)
        |> andMap (D.field "velocitySigma" sigma)
        |> andMap (D.field "maneuverSigma" sigma)
        |> andMap (absentOr "name" D.string)
        |> andMap (absentOr "kind" surfaceShip)
        |> andMap (absentOr "military" D.bool)
        |> andMap (absentOr "side" side)


sceneShip : Bool -> Decoder SceneShip
sceneShip night =
    D.succeed SceneShip
        |> andMap (D.field "id" D.string)
        |> andMap (D.field "x" finite)
        |> andMap (D.field "y" finite)
        |> andMap (D.field "heading" finite)
        |> andMap (D.field "speed" finite)
        |> andMap
            (D.field "kind"
                (if night then
                    named "light" identity [ "light" ] |> D.map (\_ -> Light)

                 else
                    D.map Seen surfaceShip
                )
            )
        |> andMap (D.field "hull" finite)


{-| The ids are unique, and the scene shows each track exactly once.
-}
matched : List Track -> List SceneShip -> Bool
matched tracks scene =
    let
        ids : List String
        ids =
            List.map .id tracks

        unique : List String -> Bool
        unique list =
            Set.size (Set.fromList list) == List.length list

        shown : List String
        shown =
            List.map .id scene
    in
    unique ids && unique shown && List.length shown == List.length ids && List.all (\id -> List.member id ids) shown


packet : Decoder Packet
packet =
    D.map3 (\captured received night -> ( captured, received, night ))
        (D.field "capturedAt" (finiteWhere "a time" (\v -> 0 <= v)))
        (D.field "receivedAt" (D.nullable finite))
        (D.field "night" D.bool)
        |> D.andThen
            (\( capturedAt, receivedAt, night ) ->
                if Maybe.withDefault False (Maybe.map (\at -> at < capturedAt) receivedAt) then
                    D.fail "received before it was captured"

                else
                    D.succeed
                        (\id photoId at w coverage quality ( tracks, scene ) ( mode, firstAt ) ->
                            { id = id, photoId = photoId, area = at, capturedAt = capturedAt, receivedAt = receivedAt, night = night, weather = w, coverage = coverage, quality = quality, tracks = tracks, sceneShips = scene, mode = mode, firstFrameAt = firstAt, secondFrameAt = capturedAt }
                        )
                        |> andMap (D.field "id" D.string)
                        |> andMap (D.field "photoId" D.string)
                        |> andMap (D.field "area" area)
                        |> andMap (D.field "weather" weather)
                        |> andMap (D.field "coverage" unitRange)
                        |> andMap (D.field "quality" unitRange)
                        |> andMap
                            (D.map2 Tuple.pair (D.field "tracks" (upTo Recon.maxTracks (track capturedAt))) (D.field "sceneShips" (D.list (sceneShip night)))
                                |> D.andThen
                                    (\( tracks, scene ) ->
                                        if matched tracks scene then
                                            D.succeed ( tracks, scene )

                                        else
                                            D.fail "scene ships do not match the tracks"
                                    )
                            )
                        |> andMap (D.field "image" (image capturedAt))
            )


image : Float -> Decoder ( ImageMode, Float )
image capturedAt =
    D.map5 (\mode firstAt _ _ _ -> ( mode, firstAt ))
        (D.field "mode" (named "image mode" imageModeName [ NightLights, Daylight ]))
        (D.field "firstFrameAt" (finiteWhere "before the second" (\v -> v < capturedAt)))
        (D.field "secondFrameAt" (finiteWhere "the capture time" (\v -> v == capturedAt)))
        (D.map2 Tuple.pair (D.field "width" (finiteWhere "640" (\v -> v == 640))) (D.field "height" (finiteWhere "640" (\v -> v == 640))))
        (D.field "footprintMeters" (finiteWhere "the footprint" (\v -> v == Recon.footprint)))


imageModeName : ImageMode -> String
imageModeName mode =
    case mode of
        NightLights ->
            "night-lights"

        Daylight ->
            "daylight"


time : String -> Decoder (Maybe Float)
time key =
    nullable key (finiteWhere "a time" (\v -> 0 <= v))


{-| A saved task: every field present, the phase holding what its update reads.
-}
decoder : Decoder Recon
decoder =
    D.succeed Recon
        |> andMap (D.field "phase" (named "phase" Recon.phaseName Recon.phases))
        |> andMap (nullable "area" area)
        |> andMap (time "requestedAt")
        |> andMap (time "startedAt")
        |> andMap (time "readyAt")
        |> andMap (D.field "cooldownUntil" (finiteWhere "a time" (\v -> 0 <= v)))
        |> andMap (D.field "progress" unitRange)
        |> andMap (absentOr "packet" (falsyOr packet) |> D.map (Maybe.andThen identity))
        |> andMap (D.field "sequence" (finiteWhere "a count" (\v -> 0 <= v && v <= 9007199254740991 && toFloat (floor v) == v) |> D.map floor))
        |> andMap (nullable "firstFrame" frame)
        |> andMap (time "transferStartedAt")
        |> D.andThen consistent


{-| JavaScript's `!p`: a missing packet may be saved as any falsy value.
-}
falsyOr : Decoder a -> Decoder (Maybe a)
falsyOr valueDecoder =
    D.oneOf
        [ D.null Nothing
        , D.bool
            |> D.andThen
                (\b ->
                    if b then
                        D.fail "true"

                    else
                        D.succeed Nothing
                )
        , D.float
            |> D.andThen
                (\n ->
                    if M.isZero n || isNaN n then
                        D.succeed Nothing

                    else
                        D.fail "a number"
                )
        , D.string
            |> D.andThen
                (\t ->
                    if String.isEmpty t then
                        D.succeed Nothing

                    else
                        D.fail "a string"
                )
        , D.map Just valueDecoder
        ]


consistent : Recon -> Decoder Recon
consistent r =
    let
        needs : List Phase -> Bool -> Bool
        needs inPhases present =
            not (List.member r.phase inPhases) || present
    in
    if
        needs [ Tasking, Imaging, Processing ] (r.startedAt /= Nothing)
            && needs [ Tasking ] (Maybe.map2 (<) r.startedAt r.readyAt == Just True)
            && needs [ Queued, Uplinking, Tasking, Imaging, Processing, Receiving, Complete ] (r.area /= Nothing)
            && needs [ Imaging ] (r.firstFrame /= Nothing)
            && needs [ Processing, Receiving, Complete ] (r.packet /= Nothing)
            && needs [ Complete ] (Maybe.andThen .receivedAt r.packet /= Nothing)
    then
        D.succeed r

    else
        D.fail ("inconsistent " ++ Recon.phaseName r.phase ++ " task")


encodeArea : Area -> E.Value
encodeArea a =
    E.object [ ( "x", E.float a.x ), ( "y", E.float a.y ), ( "size", E.float Recon.footprint ) ]


maybeField : String -> (a -> E.Value) -> Maybe a -> List ( String, E.Value )
maybeField key enc value =
    Maybe.map (\v -> [ ( key, enc v ) ]) value |> Maybe.withDefault []


nullOr : (a -> E.Value) -> Maybe a -> E.Value
nullOr enc value =
    Maybe.map enc value |> Maybe.withDefault E.null


kindValue : SurfaceShip -> E.Value
kindValue kind =
    E.string (Vessel.kindName (Surface kind))


encodeWeather : FrameWeather -> E.Value
encodeWeather w =
    E.object
        ([ ( "id", E.string w.id ), ( "name", E.string w.name ) ]
            ++ maybeField "waveScale" E.float w.waveScale
            ++ maybeField "waveSpeed" E.float w.waveSpeed
            ++ maybeField "wavePhase" E.float w.wavePhase
            ++ [ ( "cloud", E.float w.cloud ), ( "rain", E.float w.rain ), ( "storm", E.float w.storm ), ( "daylight", E.float w.daylight ), ( "hour", E.float w.hour ) ]
        )


encodeFrame : Frame -> E.Value
encodeFrame f =
    E.object
        [ ( "time", E.float f.time )
        , ( "night", E.bool f.night )
        , ( "weather", encodeWeather f.weather )
        , ( "ships"
          , E.list
                (\v ->
                    E.object
                        ([ ( "id", E.string v.id ), ( "x", E.float v.x ), ( "y", E.float v.y ), ( "heading", E.float v.heading ), ( "speed", E.float v.speed ), ( "kind", kindValue v.kind ), ( "hull", E.float v.hull ), ( "name", E.string v.name ) ]
                            ++ maybeField "military" E.bool v.military
                            ++ maybeField "side" (Vessel.sideName >> E.string) v.side
                        )
                )
                f.ships
          )
        ]


encodePacket : Packet -> E.Value
encodePacket p =
    E.object
        [ ( "id", E.string p.id )
        , ( "photoId", E.string p.photoId )
        , ( "area", encodeArea p.area )
        , ( "capturedAt", E.float p.capturedAt )
        , ( "receivedAt", nullOr E.float p.receivedAt )
        , ( "night", E.bool p.night )
        , ( "weather", encodeWeather p.weather )
        , ( "coverage", E.float p.coverage )
        , ( "quality", E.float p.quality )
        , ( "tracks"
          , E.list
                (\t ->
                    E.object
                        ([ ( "id", E.string t.id ), ( "x", E.float t.x ), ( "y", E.float t.y ), ( "vx", E.float t.vx ), ( "vy", E.float t.vy ), ( "time", E.float t.time ), ( "identified", E.bool t.identified ) ]
                            ++ [ ( "positionSigma", E.float t.positionSigma ), ( "velocitySigma", E.float t.velocitySigma ), ( "maneuverSigma", E.float t.maneuverSigma ) ]
                            ++ maybeField "name" E.string t.name
                            ++ maybeField "kind" kindValue t.kind
                            ++ maybeField "military" E.bool t.military
                            ++ maybeField "side" (Vessel.sideName >> E.string) t.side
                        )
                )
                p.tracks
          )
        , ( "sceneShips"
          , E.list
                (\v ->
                    E.object
                        [ ( "id", E.string v.id )
                        , ( "x", E.float v.x )
                        , ( "y", E.float v.y )
                        , ( "heading", E.float v.heading )
                        , ( "speed", E.float v.speed )
                        , ( "kind"
                          , case v.kind of
                                Seen kind ->
                                    kindValue kind

                                Light ->
                                    E.string "light"
                          )
                        , ( "hull", E.float v.hull )
                        ]
                )
                p.sceneShips
          )
        , ( "image"
          , E.object
                [ ( "width", E.int 640 )
                , ( "height", E.int 640 )
                , ( "mode", E.string (imageModeName p.mode) )
                , ( "firstFrameAt", E.float p.firstFrameAt )
                , ( "secondFrameAt", E.float p.secondFrameAt )
                , ( "footprintMeters", E.float Recon.footprint )
                ]
          )
        ]


encode : Recon -> E.Value
encode r =
    E.object
        [ ( "phase", E.string (Recon.phaseName r.phase) )
        , ( "area", nullOr encodeArea r.area )
        , ( "requestedAt", nullOr E.float r.requestedAt )
        , ( "startedAt", nullOr E.float r.startedAt )
        , ( "readyAt", nullOr E.float r.readyAt )
        , ( "cooldownUntil", E.float r.cooldownUntil )
        , ( "progress", E.float r.progress )
        , ( "packet", nullOr encodePacket r.packet )
        , ( "sequence", E.int r.sequence )
        , ( "firstFrame", nullOr encodeFrame r.firstFrame )
        , ( "transferStartedAt", nullOr E.float r.transferStartedAt )
        ]
