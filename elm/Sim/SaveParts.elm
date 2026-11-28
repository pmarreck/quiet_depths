module Sim.SaveParts exposing
    ( area
    , battle
    , config
    , convoy
    , encodeBattle
    , encodeConfig
    , encodeConvoy
    , encodeEstimate
    , encodeGun
    , encodeLampFix
    , encodeSearch
    , encodeTrack
    , encodeTraffic
    , encodeTransmission
    , encodeVolley
    , encodeWarnings
    , estimate
    , lampFix
    , logKind
    , position
    , searchArea
    , track
    , traffic
    , transmission
    , volley
    , warnings
    )

{-| Codecs for the parts of a save that are records of their own: the log's
kinds, the watch's warnings, a long patrol's search area, torpedo tracks,
the sky's conditions, the fleet action's battle and volleys, the coastal
traffic, signal lamp messages and fixes, the convoy, and the deck gun.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.Combat as Combat
import Sim.ConvoyWatch exposing (Convoy)
import Sim.Environment as Env
import Sim.FleetTheater exposing (Area, Battle)
import Sim.FleetVolleys exposing (Position, Volley)
import Sim.Mechanics as Mechanics
import Sim.PatrolSearch as Search
import Sim.SaveCodec exposing (andMap, optional)
import Sim.SignalLamp as Lamp
import Sim.TorpedoWatch as TorpedoWatch
import Sim.TrafficEncounters exposing (Traffic)
import Sim.WatchWarnings as WatchWarnings


{-| A value or JSON null.
-}
maybe : (a -> E.Value) -> Maybe a -> E.Value
maybe encode =
    Maybe.map encode >> Maybe.withDefault E.null


logKind : D.Decoder Mechanics.LogKind
logKind =
    D.string
        |> D.andThen
            (\name ->
                case List.filter (\k -> Mechanics.logKindName k == name) [ Mechanics.Info, Mechanics.Warning, Mechanics.Damage, Mechanics.Success, Mechanics.Contact ] of
                    k :: _ ->
                        D.succeed k

                    [] ->
                        D.fail name
            )


battery : D.Decoder WatchWarnings.Battery
battery =
    D.int
        |> D.andThen
            (\level ->
                case level of
                    0 ->
                        D.succeed WatchWarnings.Charged

                    1 ->
                        D.succeed WatchWarnings.Low

                    2 ->
                        D.succeed WatchWarnings.Critical

                    _ ->
                        D.fail ("unknown battery warning " ++ String.fromInt level)
            )


batteryLevel : WatchWarnings.Battery -> Int
batteryLevel level =
    case level of
        WatchWarnings.Charged ->
            0

        WatchWarnings.Low ->
            1

        WatchWarnings.Critical ->
            2


warnings : D.Decoder WatchWarnings.Warnings
warnings =
    D.map2 WatchWarnings.Warnings (D.field "bottom" D.bool) (D.field "battery" battery)


encodeWarnings : WatchWarnings.Warnings -> E.Value
encodeWarnings w =
    E.object [ ( "bottom", E.bool w.bottom ), ( "battery", E.int (batteryLevel w.battery) ) ]


searchArea : D.Decoder Search.SearchArea
searchArea =
    D.succeed Search.SearchArea
        |> andMap (D.field "x" D.float)
        |> andMap (D.field "y" D.float)
        |> andMap (D.field "radius" D.float)
        |> andMap (D.field "targets" (D.list D.string))
        |> andMap (D.field "recognized" (D.list D.string))
        |> andMap (D.field "located" D.bool)
        |> andMap (D.field "activeSeconds" D.float)
        |> andMap (D.field "protectedTime" D.float)


encodeSearch : Search.SearchArea -> E.Value
encodeSearch a =
    E.object
        [ ( "x", E.float a.x )
        , ( "y", E.float a.y )
        , ( "radius", E.float a.radius )
        , ( "targets", E.list E.string a.targets )
        , ( "recognized", E.list E.string a.recognized )
        , ( "located", E.bool a.located )
        , ( "activeSeconds", E.float a.activeSeconds )
        , ( "protectedTime", E.float a.protectedTime )
        ]


track : D.Decoder TorpedoWatch.Track
track =
    D.succeed TorpedoWatch.Track
        |> andMap (D.field "id" D.int)
        |> andMap (D.field "time" D.float)
        |> andMap (D.field "x" D.float)
        |> andMap (D.field "y" D.float)
        |> andMap (D.field "depth" D.float)
        |> andMap (D.field "speed" D.float)
        |> andMap (D.field "inboundRun" D.bool)
        |> andMap (D.field "arrival" (D.nullable D.float))
        |> andMap (D.field "fixes" D.int)
        |> andMap (D.field "activeAt" D.float)
        |> andMap (D.field "activeX" D.float)
        |> andMap (D.field "activeY" D.float)
        |> andMap (D.field "course" (D.nullable D.int))


encodeTrack : TorpedoWatch.Track -> E.Value
encodeTrack t =
    E.object
        [ ( "id", E.int t.id )
        , ( "time", E.float t.time )
        , ( "x", E.float t.x )
        , ( "y", E.float t.y )
        , ( "depth", E.float t.depth )
        , ( "speed", E.float t.speed )
        , ( "inboundRun", E.bool t.inboundRun )
        , ( "fixes", E.int t.fixes )
        , ( "activeAt", E.float t.activeAt )
        , ( "activeX", E.float t.activeX )
        , ( "activeY", E.float t.activeY )
        , ( "course", maybe E.int t.course )
        , ( "arrival", maybe E.float t.arrival )
        ]


weatherId : D.Decoder Env.WeatherId
weatherId =
    D.string
        |> D.andThen
            (\name ->
                case List.filter (\id -> Env.weatherIdName id == name) Env.weatherIds of
                    id :: _ ->
                        D.succeed id

                    [] ->
                        D.fail ("unknown weather " ++ name)
            )


config : D.Decoder Env.Config
config =
    D.map6 Env.Config
        (optional "startDay" (D.nullable D.float) |> D.map (Maybe.andThen identity))
        (optional "chartSeed" D.float)
        (D.field "startHour" D.float)
        (D.field "startWeather" weatherId)
        (D.field "changing" D.bool)
        (D.field "seed" D.float)


encodeConfig : Env.Config -> E.Value
encodeConfig c =
    E.object
        (( "startDay", Maybe.map E.float c.startDay |> Maybe.withDefault E.null )
            :: (Maybe.map (\seed -> [ ( "chartSeed", E.float seed ) ]) c.chartSeed |> Maybe.withDefault [])
            ++ [ ( "startHour", E.float c.startHour )
               , ( "startWeather", E.string (Env.weatherIdName c.startWeather) )
               , ( "changing", E.bool c.changing )
               , ( "seed", E.float c.seed )
               ]
        )


position : D.Decoder Position
position =
    D.map3 Position (D.field "x" D.float) (D.field "y" D.float) (D.field "altitude" D.float)


encodePosition : Position -> E.Value
encodePosition p =
    E.object [ ( "x", E.float p.x ), ( "y", E.float p.y ), ( "altitude", E.float p.altitude ) ]


volley : D.Decoder Volley
volley =
    D.map8 (\id underwater from to source target launched arrives -> { id = id, underwater = underwater, from = from, to = to, source = source, target = target, launched = launched, arrives = arrives, damage = 0, warning = Nothing })
        (D.field "id" D.int)
        (D.field "underwater" D.bool)
        (D.field "from" position)
        (D.field "to" position)
        (D.field "source" D.string)
        (D.field "target" D.string)
        (D.field "launched" D.float)
        (D.field "arrives" D.float)
        |> D.andThen (\v -> D.map2 (\damage warning -> { v | damage = damage, warning = warning }) (D.field "damage" D.float) (optional "warning" D.bool))


encodeVolley : Volley -> E.Value
encodeVolley v =
    E.object
        ([ ( "id", E.int v.id )
         , ( "underwater", E.bool v.underwater )
         , ( "from", encodePosition v.from )
         , ( "to", encodePosition v.to )
         , ( "source", E.string v.source )
         , ( "target", E.string v.target )
         , ( "launched", E.float v.launched )
         , ( "arrives", E.float v.arrives )
         , ( "damage", E.float v.damage )
         ]
            ++ (Maybe.map (\w -> [ ( "warning", E.bool w ) ]) v.warning |> Maybe.withDefault [])
        )


area : D.Decoder Area
area =
    D.map4 Area (D.field "x" D.float) (D.field "y" D.float) (D.field "label" D.string) (D.field "radius" D.float)


battle : D.Decoder Battle
battle =
    D.map4 Battle (D.field "areas" (D.list area)) (D.field "volleys" (D.list volley)) (D.field "round" D.int) (D.field "next" D.float)


encodeBattle : Battle -> E.Value
encodeBattle b =
    E.object
        [ ( "areas", E.list (\a -> E.object [ ( "x", E.float a.x ), ( "y", E.float a.y ), ( "radius", E.float a.radius ), ( "label", E.string a.label ) ]) b.areas )
        , ( "volleys", E.list encodeVolley b.volleys )
        , ( "round", E.int b.round )
        , ( "next", E.float b.next )
        ]


traffic : D.Decoder Traffic
traffic =
    D.map4 Traffic (D.field "window" D.int) (D.field "next" D.float) (D.field "turn" D.int) (D.field "volleys" (D.list volley))


encodeTraffic : Traffic -> E.Value
encodeTraffic t =
    E.object [ ( "window", E.int t.window ), ( "next", E.float t.next ), ( "turn", E.int t.turn ), ( "volleys", E.list encodeVolley t.volleys ) ]


transmission : D.Decoder e -> D.Decoder (Lamp.Transmission e)
transmission decodeEstimate =
    D.map6 Lamp.Transmission
        (D.field "estimate" decodeEstimate)
        (D.field "elapsed" D.float)
        (D.field "since" (D.nullable D.float))
        (D.field "copied" D.int)
        (D.field "delivered" D.bool)
        (D.field "completedAt" (D.nullable D.float))


encodeTransmission : (e -> E.Value) -> Lamp.Transmission e -> E.Value
encodeTransmission encode m =
    E.object
        [ ( "estimate", encode m.estimate )
        , ( "elapsed", E.float m.elapsed )
        , ( "since", maybe E.float m.since )
        , ( "copied", E.int m.copied )
        , ( "delivered", E.bool m.delivered )
        , ( "completedAt", maybe E.float m.completedAt )
        ]


lampFix : D.Decoder Lamp.LampFix
lampFix =
    D.succeed Lamp.LampFix
        |> andMap (D.field "text" D.string)
        |> andMap (D.field "x" D.float)
        |> andMap (D.field "y" D.float)
        |> andMap (D.field "time" D.float)
        |> andMap (D.field "radius" D.float)
        |> andMap (D.field "sender" D.string)
        |> andMap (D.field "number" D.float)
        |> andMap (D.field "target" D.string)
        |> andMap (D.field "depth" D.float)
        |> andMap (D.field "course" D.float)
        |> andMap (D.field "speed" D.float)


encodeLampFix : Lamp.LampFix -> E.Value
encodeLampFix p =
    E.object
        [ ( "sender", E.string p.sender )
        , ( "target", E.string p.target )
        , ( "x", E.float p.x )
        , ( "y", E.float p.y )
        , ( "radius", E.float p.radius )
        , ( "time", E.float p.time )
        , ( "number", E.float p.number )
        , ( "text", E.string p.text )
        , ( "depth", E.float p.depth )
        , ( "course", E.float p.course )
        , ( "speed", E.float p.speed )
        ]


estimate : D.Decoder Lamp.Estimate
estimate =
    D.map7 Lamp.Estimate
        (D.field "text" D.string)
        (D.field "x" D.float)
        (D.field "y" D.float)
        (D.field "time" D.float)
        (D.field "radius" D.float)
        (D.field "sender" D.string)
        (D.field "number" D.float)


encodeEstimate : Lamp.Estimate -> E.Value
encodeEstimate p =
    E.object
        [ ( "text", E.string p.text )
        , ( "x", E.float p.x )
        , ( "y", E.float p.y )
        , ( "radius", E.float p.radius )
        , ( "time", E.float p.time )
        , ( "sender", E.string p.sender )
        , ( "number", E.float p.number )
        ]


convoy : D.Decoder Convoy
convoy =
    D.map6 Convoy
        (D.field "message" (D.nullable (transmission estimate)))
        (D.field "pin" (D.nullable estimate))
        (D.field "number" D.float)
        (D.field "round" D.int)
        (D.field "next" D.float)
        (D.field "shot" (D.nullable volley))


encodeConvoy : Convoy -> E.Value
encodeConvoy c =
    E.object
        [ ( "message", maybe (encodeTransmission encodeEstimate) c.message )
        , ( "pin", maybe encodeEstimate c.pin )
        , ( "number", E.float c.number )
        , ( "round", E.int c.round )
        , ( "next", E.float c.next )
        , ( "shot", maybe encodeVolley c.shot )
        ]


encodeGun : Combat.Gun -> E.Value
encodeGun g =
    E.object [ ( "ammo", E.float g.ammo ), ( "cooldown", E.float g.cooldown ), ( "shots", E.float g.shots ), ( "angle", E.float g.angle ), ( "elevation", E.float g.elevation ) ]
