module SimHarness.Systems exposing (function)

{-| Harness entries for systems: damage, hurt and the drone's orders.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.BoatMotion as BoatMotion
import Sim.DroneFlight as DroneFlight
import Sim.DroneOrders as Orders
import Sim.Equipment as Equipment exposing (System)
import Sim.Systems as Systems
import SimHarness.Acoustics exposing (kind)
import SimHarness.Codec exposing (arg)
import SimHarness.Patrol as Patrol exposing (Patrol)


system : D.Decoder System
system =
    D.string
        |> D.andThen
            (\key ->
                case List.filter (\s -> Equipment.systemKey s == key) Equipment.systems of
                    s :: _ ->
                        D.succeed s

                    [] ->
                        D.fail key
            )


patrol : D.Decoder Patrol
patrol =
    arg 0 Patrol.decoder


{-| The functions this module answers for, by the TypeScript name each replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "systems.droneDeployReason" ->
            Just (D.map (Orders.droneDeployReason >> E.string) patrol)

        "systems.deployDrone" ->
            Just (D.map (Orders.deployDrone >> (\( s, ok ) -> E.list identity [ Patrol.encode s, E.bool ok ])) patrol)

        "systems.recallDrone" ->
            Just (D.map (Orders.recallDrone >> Patrol.encode) patrol)

        "systems.loseDrone" ->
            Just (D.map2 (\s reason -> Patrol.encode (Orders.loseDrone reason s)) patrol (arg 1 D.string))

        "systems.damageSystem" ->
            Just (D.map3 (\s key amount -> Patrol.encode (Systems.damageSystem key amount s)) patrol (arg 1 system) (arg 2 D.float))

        "acoustics.emitSound" ->
            Just
                (D.map3 (\s ( k, at ) power -> Patrol.encode (Systems.emitSound k at power s))
                    patrol
                    (arg 1 (D.map2 Tuple.pair (D.field "type" kind) (D.map3 (\x y depth -> { x = x, y = y, depth = depth }) (D.field "x" D.float) (D.field "y" D.float) (D.field "depth" D.float))))
                    (arg 1 (D.field "power" D.float))
                )

        "systems.hurt" ->
            Just
                (D.map5 (\s amount text subsystem point -> Patrol.encode (Systems.hurt amount text subsystem point s))
                    patrol
                    (arg 1 D.float)
                    (arg 2 D.string)
                    (arg 3 (D.nullable system))
                    (arg 4 (D.nullable (D.map3 (\x y depth -> { x = x, y = y, depth = depth }) (D.field "x" D.float) (D.field "y" D.float) (D.field "depth" D.float))))
                )

        "systems.updateBoat" ->
            Just (D.map2 (\s dt -> BoatMotion.updateBoat dt s |> (\( after, diesel ) -> E.list identity [ Patrol.encode after, E.bool diesel ])) patrol (arg 1 D.float))

        "systems.updateDrone" ->
            Just (D.map3 (\s dt diesel -> Patrol.encode (DroneFlight.updateDrone dt diesel s)) patrol (arg 1 D.float) (arg 2 D.bool))

        "systems.damageDrone" ->
            Just (D.map3 (\s amount reason -> Patrol.encode (Orders.damageDrone amount reason s)) patrol (arg 1 D.float) (arg 2 D.string))

        _ ->
            Nothing
