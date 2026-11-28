module SimHarness.TorpedoRun exposing (function)

{-| Harness entries for torpedoes: a fresh run's orders, putting one in the
water, and every torpedo's run, with the strikes it makes.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.OrdnanceSaves exposing (encodeAirSupport, encodeAircraft, encodeTorpedo)
import Sim.Ship as Ship
import Sim.Torpedo as Torpedo exposing (Owner(..), Torpedo)
import Sim.TorpedoRun as Run
import SimHarness.Codec exposing (arg, point)
import SimHarness.Fleet exposing (optional)
import SimHarness.Patrol as Patrol exposing (Patrol)


{-| The fields a torpedo run changes beyond the boat's own.
-}
encodeFiring : Patrol -> E.Value
encodeFiring s =
    E.object
        (Patrol.encodeFields s
            ++ [ ( "ships", E.list Ship.encode s.ships )
               , ( "projectiles", E.list encodeTorpedo s.projectiles )
               , ( "aircraft", E.list encodeAircraft s.aircraft )
               , ( "airSupport", encodeAirSupport s.airSupport )
               , ( "reports", E.list (\r -> E.object [ ( "id", E.string r.id ), ( "text", E.string r.text ), ( "time", E.float r.time ) ]) s.reports )
               ]
        )


{-| The overrides a launcher gives: the TypeScript's `Partial<Torpedo>`, of
which the callers set these.
-}
launch : D.Decoder (Torpedo -> Torpedo)
launch =
    D.map6
        (\intended heading pitch tubeSide runOut age p ->
            { p
                | intended = Maybe.withDefault p.intended intended
                , heading = Maybe.withDefault p.heading heading
                , pitch = Maybe.withDefault p.pitch pitch
                , tubeSide = Maybe.withDefault p.tubeSide tubeSide
                , runOut = Maybe.withDefault p.runOut runOut
                , age = Maybe.withDefault p.age age
            }
        )
        (optional "intended" (D.nullable D.string))
        (optional "heading" D.float)
        (optional "pitch" D.float)
        (optional "tubeSide" D.float)
        (optional "runOut" D.float)
        (optional "age" D.float)


owner : D.Decoder Owner
owner =
    arg 1 D.string
        |> D.andThen
            (\name ->
                case name of
                    "player" ->
                        D.succeed PlayerTorpedo

                    "enemy" ->
                        arg 5 (D.map2 (\launcher aim -> EnemyTorpedo { launcher = launcher, aim = aim }) (D.field "launcher" (D.nullable D.string)) (D.field "aim" (D.nullable point)))

                    _ ->
                        D.fail ("unknown torpedo owner: " ++ name)
            )


{-| The functions this module answers for, by the TypeScript name each replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "torpedoRun.torpedoOrders" ->
            Just
                (D.map4
                    (\seed id heading depth ->
                        Torpedo.torpedoOrders seed id heading depth
                            |> (\o ->
                                    E.object
                                        [ ( "orderedHeading", E.float o.orderedHeading )
                                        , ( "orderedDepth", E.float o.orderedDepth )
                                        , ( "pitch", E.float o.pitch )
                                        , ( "tubeSide", E.float o.tubeSide )
                                        , ( "searchAge", E.float o.searchAge )
                                        , ( "runOut", E.float o.runOut )
                                        , ( "searchDirection", E.float o.searchDirection )
                                        , ( "decoysChecked", E.list E.string o.decoysChecked )
                                        , ( "decoyTarget", E.null )
                                        , ( "diverted", E.bool o.diverted )
                                        ]
                               )
                    )
                    (arg 0 (D.at [ "patrol", "seed" ] D.float))
                    (arg 1 D.int)
                    (arg 2 D.float)
                    (arg 3 D.float)
                )

        "torpedoRun.putTorpedoInWater" ->
            Just
                (D.map6
                    (\s who origin heading depth overrides ->
                        Torpedo.putTorpedoInWater who origin heading depth overrides s
                            |> (\( shot, after ) -> E.list identity [ encodeTorpedo shot, E.int after.weaponSequence, E.list encodeTorpedo after.projectiles ])
                    )
                    (arg 0 Patrol.decoder)
                    owner
                    (arg 2 (D.map3 (\x y depth -> { x = x, y = y, depth = depth }) (D.field "x" D.float) (D.field "y" D.float) (D.field "depth" D.float)))
                    (arg 3 D.float)
                    (arg 4 D.float)
                    (arg 5 launch)
                )

        "torpedoRun.updateTorpedoes" ->
            Just (D.map2 (\s dt -> encodeFiring (Run.updateTorpedoes dt s)) (arg 0 Patrol.decoder) (arg 1 D.float))

        _ ->
            Nothing
