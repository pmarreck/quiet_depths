module SimHarness.PatrolContacts exposing (function)

{-| Harness entries for what the boat learns of other ships: sightings,
contact reports, lamp fixes, the active ping, photographs, the noisemaker and
depth charges. The conditions come from the same patrol through the world
harness's environment decoder.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.Contact as Contact exposing (Sighting(..))
import Sim.ContactReports as ContactReports exposing (Sighted)
import Sim.Environment as Env
import Sim.Ordnance as Ordnance exposing (BlastKind)
import Sim.PatrolContacts as PatrolContacts
import Sim.Ship as Ship
import Sim.SignalLamp exposing (LampFix)
import Sim.Vessel as Vessel
import SimHarness.Codec exposing (andMap, arg)
import SimHarness.Fleet exposing (optional)
import SimHarness.Objectives as Objectives
import SimHarness.Ordnance exposing (encodeBlast)
import SimHarness.Patrol as Patrol exposing (Patrol)
import SimHarness.Watch as Watch
import SimHarness.World as World


named : (a -> String) -> List a -> D.Decoder a
named name values =
    D.string
        |> D.andThen
            (\text ->
                case List.filter (\v -> name v == text) values of
                    v :: _ ->
                        D.succeed v

                    [] ->
                        D.fail ("unknown name " ++ text)
            )


sightingName : Sighting -> String
sightingName method =
    case method of
        Visual ->
            "visual"

        Passive ->
            "passive"

        Active ->
            "active"

        Lights ->
            "lights"

        Lamp ->
            "lamp"

        Satellite ->
            "satellite"


sighting : D.Decoder Sighting
sighting =
    named sightingName [ Visual, Passive, Active, Lights, Lamp, Satellite ]


{-| A ship, or a sound source that knows only where it is.
-}
sighted : D.Decoder Sighted
sighted =
    D.succeed Sighted
        |> andMap (D.field "id" D.string)
        |> andMap (D.field "x" D.float)
        |> andMap (D.field "y" D.float)
        |> andMap (optional "kind" (named Vessel.kindName Vessel.kinds))
        |> andMap (optional "depth" D.float)
        |> andMap (optional "name" D.string)
        |> andMap (optional "military" D.bool)
        |> andMap (optional "side" (named Vessel.sideName Vessel.sides))


lampFix : D.Decoder LampFix
lampFix =
    D.succeed LampFix
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


patrol : D.Decoder Patrol
patrol =
    arg 0 Patrol.decoder


environment : D.Decoder Env.Environment
environment =
    arg 0 (D.map Env.environmentAt World.boat)


{-| The fields the contact functions change beyond the boat's own.
-}
encodeWorld : Patrol -> E.Value
encodeWorld s =
    E.object
        (Patrol.encodeFields s
            ++ [ ( "contacts", E.list Contact.encode s.contacts )
               , ( "nextId", E.float s.nextId )
               , ( "pingAge", E.float s.pingAge )
               , ( "pingCooldown", E.float s.pingCooldown )
               , ( "torpedoTracks", E.list Watch.encodeTrack s.torpedoTracks )
               , ( "ships", E.list Ship.encode s.ships )
               , ( "photos", E.list E.string s.photos )
               , ( "photoCooldown", E.float s.photoCooldown )
               , ( "decoys", E.int s.decoys )
               , ( "alert", E.float s.alert )
               , ( "blasts", E.list encodeBlast s.blasts )
               ]
            ++ (Maybe.map (\search -> [ ( "search", Objectives.encodeSearch search ) ]) s.search |> Maybe.withDefault [])
            ++ (Maybe.map (\n -> [ ( "noisemaker", E.object [ ( "x", E.float n.x ), ( "y", E.float n.y ), ( "depth", E.float n.depth ), ( "heading", E.float n.heading ), ( "speed", E.float n.speed ), ( "time", E.float n.time ) ] ) ]) s.noisemaker |> Maybe.withDefault [])
        )


withFlag : ( Bool, Patrol ) -> E.Value
withFlag ( ok, after ) =
    E.list identity [ E.bool ok, encodeWorld after ]


depthCharge : D.Decoder { x : Float, y : Float, depth : Float, delay : Float, kind : BlastKind }
depthCharge =
    D.map5 (\x y depth delay kind -> { x = x, y = y, depth = depth, delay = Maybe.withDefault 7 delay, kind = Maybe.withDefault Ordnance.Charge kind })
        (D.field "x" D.float)
        (D.field "y" D.float)
        (D.field "depth" D.float)
        (optional "delay" D.float)
        (optional "kind" (named Ordnance.blastKindName Ordnance.blastKinds))


{-| The functions this module answers for, by the TypeScript name each replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "patrolContacts.isVisible" ->
            Just
                (D.map4 (\s e ship look -> E.bool (PatrolContacts.isVisible e look s ship))
                    patrol
                    environment
                    (arg 0 (D.field "time" D.float) |> D.andThen (\now -> arg 1 (Ship.decoder now)))
                    (arg 2 (D.nullable D.float))
                )

        "patrolContacts.contact" ->
            Just (D.map3 (\s ship method -> ContactReports.contact ship method s |> (\( c, after ) -> E.list identity [ Contact.encode c, encodeWorld after ])) patrol (arg 1 sighted) (arg 2 sighting))

        "patrolContacts.recordLampContact" ->
            Just (D.map2 (\s fix -> encodeWorld (ContactReports.recordLampContact fix s)) patrol (arg 1 lampFix))

        "patrolContacts.ping" ->
            Just (D.map (PatrolContacts.ping >> withFlag) patrol)

        "patrolContacts.photograph" ->
            Just (D.map3 (\s e look -> withFlag (PatrolContacts.photograph e look s)) patrol environment (arg 1 D.float))

        "patrolContacts.decoy" ->
            Just (D.map (PatrolContacts.decoy >> withFlag) patrol)

        "patrolContacts.dropDepthCharge" ->
            Just (D.map2 (\s order -> PatrolContacts.dropDepthCharge order s |> (\( charge, after ) -> E.list identity [ encodeBlast charge, encodeWorld after ])) patrol (arg 1 depthCharge))

        _ ->
            Nothing
