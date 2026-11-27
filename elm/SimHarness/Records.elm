module SimHarness.Records exposing (function)

{-| Harness entries for the shared records saves hold.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.Boat as Boat
import Sim.Contact as Contact
import Sim.Ship as Ship
import Sim.Sound as Sound
import Sim.TrackEstimates as Tracks
import Sim.Vessel as Vessel
import SimHarness.Codec exposing (andMap, arg)


{-| A number as JavaScript arithmetic sees it: missing reads as NaN, as does
a value of another type.
-}
loose : String -> D.Decoder Float
loose key =
    D.oneOf [ D.field key D.float, D.succeed (0 / 0) ]


{-| `value ?? default`: missing or null is unsaid; another type is not a number.
-}
unsaid : String -> D.Decoder (Maybe Float)
unsaid key =
    D.oneOf [ D.field key (D.nullable D.float), D.field key D.value |> D.map (\_ -> Just (0 / 0)), D.succeed Nothing ]


observation : D.Decoder Tracks.Observation
observation =
    D.succeed Tracks.Observation
        |> andMap (loose "x")
        |> andMap (loose "y")
        |> andMap (loose "time")
        |> andMap (unsaid "vx")
        |> andMap (unsaid "vy")
        |> andMap (unsaid "positionSigma")
        |> andMap (unsaid "velocitySigma")
        |> andMap (unsaid "maneuverSigma")
        |> andMap (D.maybe (D.field "source" D.string))


{-| A satellite track; fields of the wrong type are untrusted, as `typeof` guards them.
-}
track : D.Decoder Tracks.Track
track =
    let
        known : List a -> (a -> String) -> D.Decoder a
        known values name =
            D.string |> D.andThen (\given -> List.filter (\v -> name v == given) values |> List.head |> Maybe.map D.succeed |> Maybe.withDefault (D.fail given))
    in
    D.succeed Tracks.Track
        |> andMap (D.field "id" D.string)
        |> andMap (loose "x")
        |> andMap (loose "y")
        |> andMap (unsaid "time")
        |> andMap (unsaid "vx")
        |> andMap (unsaid "vy")
        |> andMap (unsaid "positionSigma")
        |> andMap (unsaid "velocitySigma")
        |> andMap (unsaid "maneuverSigma")
        |> andMap (D.oneOf [ D.field "identified" D.bool, D.succeed False ])
        |> andMap (D.maybe (D.field "name" D.string))
        |> andMap (D.maybe (D.field "side" (known Vessel.sides Vessel.sideName)))
        |> andMap (D.maybe (D.field "kind" (known Vessel.kinds Vessel.kindName)))
        |> andMap (D.maybe (D.field "military" D.bool))


encodeChart : Tracks.ChartContact -> E.Value
encodeChart entry =
    case entry of
        Tracks.Observed c ->
            Contact.encode c

        Tracks.Exact p ->
            E.object
                ([ ( "id", E.string p.id )
                 , ( "label", E.string "LIVE" )
                 , ( "name", E.string p.name )
                 , ( "identified", E.bool True )
                 , ( "kind", E.string (Vessel.kindName p.kind) )
                 , ( "age", E.float 0 )
                 , ( "range", E.float 1 )
                 , ( "exact", E.bool True )
                 , ( "x", E.float p.x )
                 , ( "y", E.float p.y )
                 , ( "fix", E.object [ ( "time", E.float p.time ), ( "x", E.float p.x ), ( "y", E.float p.y ), ( "vx", E.float p.vx ), ( "vy", E.float p.vy ), ( "positionSigma", E.float 0 ), ( "velocitySigma", E.float 0 ), ( "maneuverSigma", E.float 0 ) ] )
                 ]
                    ++ List.filterMap identity
                        [ Maybe.map (\m -> ( "military", E.bool m )) p.military
                        , Maybe.map (\s -> ( "side", E.string (Vessel.sideName s) )) p.side
                        , Maybe.map (\d -> ( "depthEstimate", E.float d )) p.depthEstimate
                        ]
                )


{-| The functions this module answers for. `ship` has no TypeScript module of
its own: it mirrors patrol-world.ts's Ship and restore's ship checks.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "ship.roundTrip" ->
            Just
                (D.map2 (\raw now -> D.decodeValue (Ship.decoder now) raw |> Result.map Ship.encode |> Result.withDefault E.null)
                    (arg 0 D.value)
                    (arg 1 D.float)
                )

        "boat.roundTrip" ->
            Just (D.map2 (\raw now -> D.decodeValue (Boat.decoder now) raw |> Result.map (Boat.encode >> E.object) |> Result.withDefault E.null) (arg 0 D.value) (arg 1 D.float))

        "sound.roundTrip" ->
            Just (D.map2 (\raw ships -> D.decodeValue (Sound.decoder ships) raw |> Result.map Sound.encode |> Result.withDefault E.null) (arg 0 D.value) (arg 1 (D.list D.string)))

        "contact.roundTrip" ->
            Just
                (D.map2 (\raw now -> D.decodeValue (Contact.decoder now) raw |> Result.map Contact.encode |> Result.withDefault E.null)
                    (arg 0 D.value)
                    (arg 1 D.float)
                )

        "trackEstimates.designation" ->
            Just (D.map (Tracks.designation >> E.string) (arg 0 D.float))

        "trackEstimates.fixContact" ->
            Just
                (D.map2
                    (\held o ->
                        case Tracks.fixContact o { fix = held } of
                            Just c ->
                                E.object [ ( "accepted", E.bool True ), ( "fix", Maybe.map Contact.encodeFix c.fix |> Maybe.withDefault E.null ) ]

                            Nothing ->
                                E.object [ ( "accepted", E.bool False ), ( "fix", Maybe.map Contact.encodeFix held |> Maybe.withDefault E.null ) ]
                    )
                    (arg 0 (D.maybe (D.field "fix" Contact.savedFix)))
                    (arg 1 observation)
                )

        "trackEstimates.applyReconPacket" ->
            Just
                (arg 0 (D.field "time" D.float)
                    |> D.andThen
                        (\now ->
                            D.map2
                                (\s packet ->
                                    case Maybe.andThen (\p -> Tracks.applyReconPacket p s) packet of
                                        Just after ->
                                            E.object [ ( "applied", E.bool True ), ( "contacts", E.list Contact.encode after.contacts ), ( "nextId", E.float after.nextId ) ]

                                        Nothing ->
                                            E.object [ ( "applied", E.bool False ) ]
                                )
                                (arg 0
                                    (D.map5 (\time x y contacts nextId -> { time = time, x = x, y = y, contacts = contacts, nextId = nextId })
                                        (D.field "time" D.float)
                                        (loose "x")
                                        (loose "y")
                                        (D.oneOf [ D.field "contacts" (D.list (Contact.decoder now)), D.succeed [] ])
                                        (loose "nextId")
                                    )
                                )
                                -- A packet whose tracks are not all tracks (a missing one, an id
                                -- that is not a string) is refused whole.
                                (arg 1 (D.oneOf [ D.map3 Tracks.Packet (D.field "tracks" (D.list track)) (loose "capturedAt") (loose "receivedAt") |> D.map Just, D.succeed Nothing ]))
                        )
                )

        "trackEstimates.chartContacts" ->
            Just
                (arg 0 (D.field "time" D.float)
                    |> D.andThen
                        (\now ->
                            arg 0
                                (D.map5 (\omniscient searching contacts ships time -> E.list encodeChart (Tracks.chartContacts { omniscientChart = omniscient, searching = searching, contacts = contacts, ships = ships, time = time }))
                                    (D.oneOf [ D.at [ "difficulty", "omniscientChart" ] D.bool, D.succeed False ])
                                    (D.oneOf [ D.field "search" D.value |> D.map (\_ -> True), D.succeed False ])
                                    (D.field "contacts" (D.list (Contact.decoder now)))
                                    (D.field "ships" (D.list (Ship.decoder now)))
                                    (D.field "time" D.float)
                                )
                        )
                )

        _ ->
            Nothing
