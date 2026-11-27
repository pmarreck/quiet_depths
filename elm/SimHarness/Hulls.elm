module SimHarness.Hulls exposing (function)

{-| Harness entries for hull contacts.
-}

import Dict
import Json.Decode as D
import Json.Encode as E
import Sim.Coast as Coast
import Sim.Debrief as Debrief
import Sim.HullContacts as Contacts
import Sim.HullGeometry as Geometry exposing (Body)
import Sim.Mechanics as Mechanics
import Sim.Ship as Ship
import SimHarness.Codec exposing (andMap, arg, call2)


optional : String -> D.Decoder a -> D.Decoder (Maybe a)
optional key decoder =
    D.maybe (D.field key decoder)


body : D.Decoder Body
body =
    D.succeed Body
        |> andMap (D.field "x" D.float)
        |> andMap (D.field "y" D.float)
        |> andMap (optional "depth" D.float)
        |> andMap (D.field "heading" D.float)
        |> andMap (optional "pitch" D.float)
        |> andMap (optional "roll" D.float)
        |> andMap (D.field "speed" D.float)
        |> andMap (optional "verticalSpeed" D.float)
        |> andMap (optional "kind" D.string)
        |> andMap (optional "id" D.string)
        |> andMap (optional "name" D.string)
        |> andMap (optional "hull" D.float)
        |> andMap (optional "military" D.bool)
        |> andMap (optional "fixedWreck" D.bool |> D.map (Maybe.withDefault False))
        |> andMap (optional "directHits" D.float)


encodeBody : Body -> E.Value
encodeBody b =
    let
        field key enc =
            Maybe.map (\v -> ( key, enc v ))
    in
    E.object
        ([ ( "x", E.float b.x ), ( "y", E.float b.y ), ( "heading", E.float b.heading ), ( "speed", E.float b.speed ) ]
            ++ List.filterMap identity
                [ field "depth" E.float b.depth
                , field "pitch" E.float b.pitch
                , field "roll" E.float b.roll
                , field "verticalSpeed" E.float b.verticalSpeed
                , field "kind" E.string b.kind
                , field "id" E.string b.id
                , field "name" E.string b.name
                , field "hull" E.float b.hull
                , field "military" E.bool b.military
                , field "directHits" E.float b.directHits
                , if b.fixedWreck then
                    Just ( "fixedWreck", E.bool True )

                  else
                    Nothing
                ]
        )


encodePoint : { a | x : Float, y : Float, depth : Float } -> E.Value
encodePoint p =
    E.object [ ( "x", E.float p.x ), ( "y", E.float p.y ), ( "depth", E.float p.depth ) ]


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


type alias Recorded =
    { severity : Float, text : String, part : String }


{-| The test's stand-in for systems' hurt: it records each call and takes a
tenth of the severity off the hull, as the TypeScript side's does.
-}
hurt : Float -> String -> String -> { a | hurts : List Recorded, hull : Float } -> { a | hurts : List Recorded, hull : Float }
hurt severity text part s =
    { s | hurts = s.hurts ++ [ { severity = severity, text = text, part = part } ], hull = s.hull - severity * 0.1 }


traffic : D.Decoder E.Value
traffic =
    D.field "time" D.float
        |> D.andThen
            (\now ->
                D.succeed
                    (\x y depth heading pitch roll speed verticalSpeed time site ships seed collisionHits systems repairLimits scope scopeTravel events debrief hull ->
                        { x = x
                        , y = y
                        , depth = depth
                        , heading = heading
                        , pitch = pitch
                        , roll = roll
                        , speed = speed
                        , verticalSpeed = verticalSpeed
                        , time = time
                        , site = site
                        , ships = ships
                        , chart = Just (Coast.coastline seed)
                        , collisionHits = collisionHits
                        , systems = systems
                        , repairLimits = repairLimits
                        , scope = scope
                        , scopeTravel = scopeTravel
                        , events = events
                        , debrief = debrief
                        , collisions = []
                        , hurts = []
                        , hull = hull
                        }
                    )
                    |> andMap (D.field "x" D.float)
                    |> andMap (D.field "y" D.float)
                    |> andMap (D.field "depth" D.float)
                    |> andMap (D.field "heading" D.float)
                    |> andMap (D.field "pitch" D.float)
                    |> andMap (optional "roll" D.float)
                    |> andMap (D.field "speed" D.float)
                    |> andMap (D.field "verticalSpeed" D.float)
                    |> andMap (D.field "time" D.float)
                    |> andMap (optional "site" (D.nullable body) |> D.map (Maybe.andThen identity))
                    |> andMap (D.field "ships" (D.list (Ship.decoder now)))
                    |> andMap (D.at [ "environment", "chartSeed" ] D.float)
                    |> andMap (D.field "collisionHits" (D.dict D.float))
                    |> andMap (D.field "systems" (D.map (\p -> { periscope = p }) (D.field "periscope" D.float)))
                    |> andMap (D.field "repairLimits" (D.map (\p -> { periscope = p }) (D.field "periscope" D.float)))
                    |> andMap (D.field "scope" D.bool)
                    |> andMap (optional "scopeTravel" D.float)
                    |> andMap (D.field "events" (D.list (D.map3 Mechanics.LogEntry (D.field "t" D.float) (D.field "text" D.string) (D.field "kind" logKind))))
                    |> andMap (optional "debrief" (D.list (D.map2 Debrief.Entry (D.field "time" D.float) (D.field "text" D.string))) |> D.map (Maybe.withDefault []))
                    |> andMap (D.field "hull" D.float)
                    |> D.map (Contacts.resolveTraffic hurt >> encodeTraffic)
            )


encodeTraffic : { a | x : Float, y : Float, depth : Float, speed : Float, verticalSpeed : Float, site : Maybe Body, ships : List Ship.Ship, collisionHits : Dict.Dict String Float, systems : { periscope : Float }, repairLimits : { periscope : Float }, scope : Bool, scopeTravel : Maybe Float, events : List Mechanics.LogEntry, debrief : List Debrief.Entry, collisions : List { target : Maybe String, point : { x : Float, y : Float, depth : Float } }, hurts : List Recorded, hull : Float } -> E.Value
encodeTraffic s =
    E.object
        [ ( "x", E.float s.x )
        , ( "y", E.float s.y )
        , ( "depth", E.float s.depth )
        , ( "speed", E.float s.speed )
        , ( "verticalSpeed", E.float s.verticalSpeed )
        , ( "site", Maybe.map encodeBody s.site |> Maybe.withDefault E.null )
        , ( "ships", E.list Ship.encode s.ships )
        , ( "collisionHits", E.dict identity E.float s.collisionHits )
        , ( "systems", E.object [ ( "periscope", E.float s.systems.periscope ) ] )
        , ( "repairLimits", E.object [ ( "periscope", E.float s.repairLimits.periscope ) ] )
        , ( "scope", E.bool s.scope )
        , ( "scopeTravel", Maybe.map E.float s.scopeTravel |> Maybe.withDefault E.null )
        , ( "events", E.list (\e -> E.object [ ( "t", E.float e.t ), ( "text", E.string e.text ), ( "kind", E.string (Mechanics.logKindName e.kind) ) ]) s.events )
        , ( "debrief", E.list (\d -> E.object [ ( "time", E.float d.time ), ( "text", E.string d.text ) ]) s.debrief )
        , ( "collisions", E.list (\c -> E.object (( "kind", E.string "collision" ) :: ( "point", encodePoint c.point ) :: (Maybe.map (\t -> [ ( "target", E.string t ) ]) c.target |> Maybe.withDefault []))) s.collisions )
        , ( "hurts", E.list (\h -> E.object [ ( "severity", E.float h.severity ), ( "text", E.string h.text ), ( "part", E.string h.part ) ]) s.hurts )
        , ( "hull", E.float s.hull )
        ]


{-| The functions this module answers for, by the TypeScript name each replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "hullContacts.hullContact" ->
            Just
                (call2 body
                    body
                    (Maybe.map (\c -> E.object [ ( "point", encodePoint c.point ), ( "nx", E.float c.nx ), ( "ny", E.float c.ny ), ( "nd", E.float c.nd ), ( "overlap", E.float c.overlap ), ( "lateralGap", E.float c.lateralGap ) ]) >> Maybe.withDefault E.null)
                    Geometry.hullContact
                )

        "hullContacts.keelLimit" ->
            Just (D.map2 (\b seed -> E.float (Geometry.keelLimit b (Just (Coast.coastline seed)))) (arg 0 body) (arg 1 D.float))

        "hullContacts.pushOffShoal" ->
            Just (D.map3 (\p overlap seed -> (\q -> E.object [ ( "x", E.float q.x ), ( "y", E.float q.y ) ]) (Geometry.pushOffShoal p overlap (Just (Coast.coastline seed)))) (arg 0 (D.map2 (\x y -> { x = x, y = y }) (D.field "x" D.float) (D.field "y" D.float))) (arg 1 D.float) (arg 2 D.float))

        "hullContacts.resolveTraffic" ->
            Just (arg 0 traffic)

        _ ->
            Nothing
