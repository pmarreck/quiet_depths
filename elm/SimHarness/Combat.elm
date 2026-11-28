module SimHarness.Combat exposing (function)

{-| Harness entries for combat: the boat's torpedoes and deck gun, an enemy's
torpedo, torpedo saves, and each moment of combat. The conditions come from
the same patrol through the world harness's sky decoder.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.Combat as Combat
import Sim.Contact as Contact
import Sim.Environment as Env
import Sim.OrdnanceSaves exposing (blast, encodeAirSupport, encodeAircraft, encodeBlast, encodeRound, encodeTorpedo)
import Sim.SaveParts exposing (encodeGun)
import Sim.Ship as Ship
import Sim.TorpedoSaves as TorpedoSaves
import SimHarness.Codec exposing (arg)
import SimHarness.Fleet exposing (optional)
import SimHarness.HostileTracks exposing (track)
import SimHarness.Patrol as Patrol exposing (Patrol)
import SimHarness.World as World


{-| The fields combat changes beyond the boat's own.
-}
encodeCombat : Patrol -> E.Value
encodeCombat s =
    E.object
        (Patrol.encodeFields s
            ++ [ ( "ships", E.list Ship.encode s.ships )
               , ( "projectiles", E.list encodeTorpedo s.projectiles )
               , ( "aircraft", E.list encodeAircraft s.aircraft )
               , ( "airSupport", encodeAirSupport s.airSupport )
               , ( "blasts", E.list encodeBlast s.blasts )
               , ( "gunRounds", E.list encodeRound s.gunRounds )
               , ( "reports", E.list (\r -> E.object [ ( "id", E.string r.id ), ( "text", E.string r.text ), ( "time", E.float r.time ) ]) s.reports )
               , ( "tubeReadyAt", E.object [ ( "port", E.float s.tubeReadyAt.port_ ), ( "starboard", E.float s.tubeReadyAt.starboard ) ] )
               , ( "gun", encodeGun s.gun )
               , ( "crewQuietUntil", E.float s.crewQuietUntil )
               ]
        )


patrol : D.Decoder Patrol
patrol =
    arg 0 Patrol.decoder


environment : D.Decoder Env.Environment
environment =
    arg 0 (D.map Env.environmentAt World.boat)


{-| The functions this module answers for, by the TypeScript name each replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "combat.chargeAltitude" ->
            Just (D.map (Combat.chargeAltitude >> E.float) (arg 0 blast))

        "combat.firingBearing" ->
            Just
                (D.map2 (\s c -> E.float (Combat.firingBearing s c))
                    (arg 0 (D.map3 (\time x y -> { time = time, x = x, y = y }) (D.field "time" D.float) (D.field "x" D.float) (D.field "y" D.float)))
                    (arg 0 (D.field "time" D.float) |> D.andThen (\now -> arg 1 (Contact.decoder now)))
                )

        "combat.launchTorpedo" ->
            Just (D.map3 (\s sea id -> Combat.launchTorpedo sea id s |> (\( ok, after ) -> E.list identity [ E.bool ok, encodeCombat after ])) patrol environment (arg 1 D.string))

        "combat.launchHostileTorpedo" ->
            Just
                (D.map3 (\s ship t -> Combat.launchHostileTorpedo ship t s |> (\( fired, after ) -> E.list identity [ Ship.encode fired, encodeCombat after ]))
                    patrol
                    (arg 0 (D.field "time" D.float) |> D.andThen (\now -> arg 1 (Ship.decoder now)))
                    (arg 2 track)
                )

        "combat.restoreIncomingRun" ->
            Just
                (D.map2 (\s b -> encodeCombat (Combat.restoreIncomingRun b s))
                    patrol
                    (arg 1 (D.map4 (\x y depth delay -> { x = x, y = y, depth = depth, delay = delay }) (D.field "x" D.float) (D.field "y" D.float) (D.field "depth" D.float) (D.field "delay" D.float)))
                )

        "combat.restoreTorpedo" ->
            Just
                (D.map2
                    (\s raw ->
                        TorpedoSaves.restoreTorpedo raw s
                            |> (\( restored, after ) -> E.list identity [ Maybe.map encodeTorpedo restored |> Maybe.withDefault E.null, E.int after.weaponSequence ])
                    )
                    patrol
                    (arg 1 D.value)
                )

        "combat.fireDeckGun" ->
            Just
                (D.map2 (\s aim -> Combat.fireDeckGun aim s |> (\( ok, after ) -> E.list identity [ E.bool ok, encodeCombat after ]))
                    patrol
                    (arg 1 (D.map2 (\bearing elevation -> { bearing = bearing, elevation = elevation }) (D.field "bearing" D.float) (D.field "elevation" D.float)))
                )

        "combat.aimGunAt" ->
            Just
                (D.map2 (\s point -> encodeGun (Combat.aimGunAt point s).gun)
                    patrol
                    (arg 1 (D.map5 (\x y vx vy altitude -> { x = x, y = y, vx = vx, vy = vy, altitude = altitude }) (D.field "x" D.float) (D.field "y" D.float) (optional "vx" D.float) (optional "vy" D.float) (optional "altitude" D.float)))
                )

        "combat.updateCombat" ->
            Just (D.map3 (\s e dt -> encodeCombat (Combat.updateCombat e dt s)) patrol environment (arg 1 D.float))

        _ ->
            Nothing
