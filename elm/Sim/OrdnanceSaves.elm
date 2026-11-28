module Sim.OrdnanceSaves exposing (airSupport, aircraft, blast, encodeAirSupport, encodeAircraft, encodeBlast, encodeRound, encodeTorpedo, gunRound, torpedo)

{-| Codecs for what flies and falls: aircraft and their sortie, blasts, gun
rounds and torpedoes, shared by the harness modules that read them.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.AirSupport as Air exposing (AirReport, AirSupport, Aircraft)
import Sim.AircraftPhase as AircraftPhase
import Sim.Ordnance as Ordnance exposing (Aloft, Blast, Round)
import Sim.SaveCodec exposing (andMap, optional, point)
import Sim.Torpedo exposing (DecoyTarget, Owner(..), Torpedo, Trace)


named : String -> (a -> String) -> List a -> D.Decoder a
named what name values =
    D.string
        |> D.andThen
            (\given ->
                List.filter (\v -> name v == given) values
                    |> List.head
                    |> Maybe.map D.succeed
                    |> Maybe.withDefault (D.fail ("unknown " ++ what ++ ": " ++ given))
            )


aloft : D.Decoder Aloft
aloft =
    D.map3 Aloft (D.field "x" D.float) (D.field "y" D.float) (D.field "altitude" D.float)


encodeAloft : Aloft -> E.Value
encodeAloft a =
    E.object [ ( "x", E.float a.x ), ( "y", E.float a.y ), ( "altitude", E.float a.altitude ) ]


{-| Optional fields encode only when present, as the TypeScript leaves them
out.
-}
present : List ( String, Maybe E.Value ) -> List ( String, E.Value )
present =
    List.filterMap (\( key, value ) -> Maybe.map (Tuple.pair key) value)


airReport : D.Decoder AirReport
airReport =
    D.succeed AirReport
        |> andMap (D.field "x" D.float)
        |> andMap (D.field "y" D.float)
        |> andMap (D.field "time" D.float)
        |> andMap (optional "depth" D.float)
        |> andMap (optional "heading" D.float)
        |> andMap (optional "speed" D.float)
        |> andMap (optional "reason" D.string)


encodeAirReport : AirReport -> E.Value
encodeAirReport r =
    E.object
        ([ ( "x", E.float r.x ), ( "y", E.float r.y ), ( "time", E.float r.time ) ]
            ++ present [ ( "depth", Maybe.map E.float r.depth ), ( "heading", Maybe.map E.float r.heading ), ( "speed", Maybe.map E.float r.speed ), ( "reason", Maybe.map E.string r.reason ) ]
        )


airSupport : D.Decoder AirSupport
airSupport =
    D.map5 AirSupport
        (D.field "status" (named "sortie" Air.sortieName Air.sorties))
        (D.field "requestedAt" (D.nullable D.float))
        (D.field "launchAt" (D.nullable D.float))
        (D.field "base" point)
        (D.field "lastKnown" (D.nullable airReport))


encodeAirSupport : AirSupport -> E.Value
encodeAirSupport a =
    let
        orNull : (v -> E.Value) -> Maybe v -> E.Value
        orNull encode =
            Maybe.map encode >> Maybe.withDefault E.null
    in
    E.object
        [ ( "status", E.string (Air.sortieName a.status) )
        , ( "requestedAt", orNull E.float a.requestedAt )
        , ( "launchAt", orNull E.float a.launchAt )
        , ( "base", E.object [ ( "x", E.float a.base.x ), ( "y", E.float a.base.y ) ] )
        , ( "lastKnown", orNull encodeAirReport a.lastKnown )
        ]


aircraft : D.Decoder Aircraft
aircraft =
    D.succeed Aircraft
        |> andMap (D.field "id" D.string)
        |> andMap (D.field "name" D.string)
        |> andMap (D.field "x" D.float)
        |> andMap (D.field "y" D.float)
        |> andMap (D.field "altitude" D.float)
        |> andMap (D.field "heading" D.float)
        |> andMap (D.field "speed" D.float)
        |> andMap (D.field "hull" D.float)
        |> andMap (D.field "phase" (named "aircraft phase" AircraftPhase.phaseName AircraftPhase.phases))
        |> andMap (D.field "takeoffUntil" D.float)
        |> andMap (D.field "attack" D.float)
        |> andMap (D.field "bank" D.float)
        |> andMap (D.field "bombDropped" D.bool)
        |> andMap (optional "previous" aloft)
        |> andMap (optional "egress" D.float)


encodeAircraft : Aircraft -> E.Value
encodeAircraft p =
    E.object
        ([ ( "id", E.string p.id )
         , ( "name", E.string p.name )
         , ( "x", E.float p.x )
         , ( "y", E.float p.y )
         , ( "altitude", E.float p.altitude )
         , ( "heading", E.float p.heading )
         , ( "speed", E.float p.speed )
         , ( "hull", E.float p.hull )
         , ( "phase", E.string (AircraftPhase.phaseName p.phase) )
         , ( "takeoffUntil", E.float p.takeoffUntil )
         , ( "attack", E.float p.attack )
         , ( "bank", E.float p.bank )
         , ( "bombDropped", E.bool p.bombDropped )
         ]
            ++ present [ ( "previous", Maybe.map encodeAloft p.previous ), ( "egress", Maybe.map E.float p.egress ) ]
        )


blast : D.Decoder Blast
blast =
    D.succeed Blast
        |> andMap (D.field "id" D.int)
        |> andMap (D.field "x" D.float)
        |> andMap (D.field "y" D.float)
        |> andMap (D.field "depth" D.float)
        |> andMap (D.field "delay" D.float)
        |> andMap (D.field "totalDelay" D.float)
        |> andMap (optional "airTime" D.float)
        |> andMap (optional "airHeight" D.float)
        |> andMap (D.field "age" D.float)
        |> andMap (D.field "exploded" D.bool)
        |> andMap (D.field "kind" (named "blast kind" Ordnance.blastKindName Ordnance.blastKinds))
        |> andMap (optional "splashed" D.bool)
        |> andMap (optional "explodedAt" D.float)
        |> andMap (optional "convoyCharge" D.bool)


encodeBlast : Blast -> E.Value
encodeBlast b =
    E.object
        ([ ( "id", E.int b.id )
         , ( "x", E.float b.x )
         , ( "y", E.float b.y )
         , ( "depth", E.float b.depth )
         , ( "delay", E.float b.delay )
         , ( "totalDelay", E.float b.totalDelay )
         , ( "age", E.float b.age )
         , ( "exploded", E.bool b.exploded )
         , ( "kind", E.string (Ordnance.blastKindName b.kind) )
         ]
            ++ present
                [ ( "airTime", Maybe.map E.float b.airTime )
                , ( "airHeight", Maybe.map E.float b.airHeight )
                , ( "splashed", Maybe.map E.bool b.splashed )
                , ( "explodedAt", Maybe.map E.float b.explodedAt )
                , ( "convoyCharge", Maybe.map E.bool b.convoyCharge )
                ]
        )


gunRound : D.Decoder Round
gunRound =
    D.succeed Round
        |> andMap (D.field "id" D.int)
        |> andMap (D.field "owner" (named "gun owner" Ordnance.gunOwnerName Ordnance.gunOwners))
        |> andMap (D.field "x" D.float)
        |> andMap (D.field "y" D.float)
        |> andMap (D.field "altitude" D.float)
        |> andMap (D.field "vx" D.float)
        |> andMap (D.field "vy" D.float)
        |> andMap (D.field "vz" D.float)
        |> andMap (D.field "age" D.float)
        |> andMap (D.field "tracer" D.bool)
        |> andMap (optional "previous" aloft)


encodeRound : Round -> E.Value
encodeRound r =
    E.object
        ([ ( "id", E.int r.id )
         , ( "owner", E.string (Ordnance.gunOwnerName r.owner) )
         , ( "x", E.float r.x )
         , ( "y", E.float r.y )
         , ( "altitude", E.float r.altitude )
         , ( "vx", E.float r.vx )
         , ( "vy", E.float r.vy )
         , ( "vz", E.float r.vz )
         , ( "age", E.float r.age )
         , ( "tracer", E.bool r.tracer )
         ]
            ++ present [ ( "previous", Maybe.map encodeAloft r.previous ) ]
        )


{-| A torpedo as restore leaves it: an enemy's carries its launcher and aim,
either of which may be null.
-}
torpedo : D.Decoder Torpedo
torpedo =
    let
        owner : D.Decoder Owner
        owner =
            D.field "owner" D.string
                |> D.andThen
                    (\name ->
                        case name of
                            "player" ->
                                D.succeed PlayerTorpedo

                            "enemy" ->
                                D.map2 (\launcher aim -> EnemyTorpedo { launcher = launcher, aim = aim }) (D.field "launcher" (D.nullable D.string)) (D.field "aim" (D.nullable point))

                            _ ->
                                D.fail ("unknown torpedo owner: " ++ name)
                    )

        decoy : D.Decoder DecoyTarget
        decoy =
            D.map4 DecoyTarget (D.field "x" D.float) (D.field "y" D.float) (D.field "depth" D.float) (D.field "expiresAt" D.float)

        trace : D.Decoder Trace
        trace =
            D.map4 Trace (D.field "x" D.float) (D.field "y" D.float) (D.field "depth" D.float) (D.field "time" D.float)
    in
    D.succeed Torpedo
        |> andMap (D.field "id" D.int)
        |> andMap owner
        |> andMap (D.field "runLimit" D.float)
        |> andMap (D.field "traveled" D.float)
        |> andMap (D.field "x" D.float)
        |> andMap (D.field "y" D.float)
        |> andMap (D.field "depth" D.float)
        |> andMap (D.field "age" D.float)
        |> andMap (D.field "intended" (D.nullable D.string))
        |> andMap (D.field "lock" (D.nullable D.string))
        |> andMap (D.field "pingAge" D.float)
        |> andMap (D.field "orderedHeading" D.float)
        |> andMap (D.field "orderedDepth" D.float)
        |> andMap (D.field "pitch" D.float)
        |> andMap (D.field "tubeSide" D.float)
        |> andMap (D.field "searchAge" D.float)
        |> andMap (D.field "runOut" D.float)
        |> andMap (D.field "searchDirection" D.float)
        |> andMap (D.field "decoysChecked" (D.list D.string))
        |> andMap (D.field "decoyTarget" (D.nullable decoy))
        |> andMap (D.field "diverted" D.bool)
        |> andMap (D.field "heading" D.float)
        |> andMap (D.field "path" (D.list trace))
        |> andMap (optional "decoyCheckedAt" D.float)


encodeTorpedo : Torpedo -> E.Value
encodeTorpedo p =
    let
        orNull : (v -> E.Value) -> Maybe v -> E.Value
        orNull encode =
            Maybe.map encode >> Maybe.withDefault E.null

        xy : { x : Float, y : Float } -> E.Value
        xy at =
            E.object [ ( "x", E.float at.x ), ( "y", E.float at.y ) ]

        owned : List ( String, E.Value )
        owned =
            case p.owner of
                PlayerTorpedo ->
                    [ ( "owner", E.string "player" ) ]

                EnemyTorpedo enemy ->
                    [ ( "owner", E.string "enemy" ), ( "launcher", orNull E.string enemy.launcher ), ( "aim", orNull xy enemy.aim ) ]
    in
    E.object
        (owned
            ++ [ ( "id", E.int p.id )
               , ( "runLimit", E.float p.runLimit )
               , ( "traveled", E.float p.traveled )
               , ( "x", E.float p.x )
               , ( "y", E.float p.y )
               , ( "depth", E.float p.depth )
               , ( "age", E.float p.age )
               , ( "intended", orNull E.string p.intended )
               , ( "lock", orNull E.string p.lock )
               , ( "pingAge", E.float p.pingAge )
               , ( "orderedHeading", E.float p.orderedHeading )
               , ( "orderedDepth", E.float p.orderedDepth )
               , ( "pitch", E.float p.pitch )
               , ( "tubeSide", E.float p.tubeSide )
               , ( "searchAge", E.float p.searchAge )
               , ( "runOut", E.float p.runOut )
               , ( "searchDirection", E.float p.searchDirection )
               , ( "decoysChecked", E.list E.string p.decoysChecked )
               , ( "decoyTarget", orNull (\d -> E.object [ ( "x", E.float d.x ), ( "y", E.float d.y ), ( "depth", E.float d.depth ), ( "expiresAt", E.float d.expiresAt ) ]) p.decoyTarget )
               , ( "diverted", E.bool p.diverted )
               , ( "heading", E.float p.heading )
               , ( "path", E.list (\v -> E.object [ ( "x", E.float v.x ), ( "y", E.float v.y ), ( "depth", E.float v.depth ), ( "time", E.float v.time ) ]) p.path )
               ]
            ++ present [ ( "decoyCheckedAt", Maybe.map E.float p.decoyCheckedAt ) ]
        )
