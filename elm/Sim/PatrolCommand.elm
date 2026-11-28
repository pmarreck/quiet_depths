module Sim.PatrolCommand exposing (action, encodeDone, encodeTick, input)

{-| The simulation's side of the page boundary: the page's frame input and
actions as JSON, and each tick and action's outcome written back, the world
in the save's shape.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.InvalidNumber exposing (InvalidNumber)
import Sim.Mechanics as Mechanics
import Sim.Patrol exposing (Action(..), Done, Tick)
import Sim.PatrolTick as PatrolTick
import Sim.ReplayEvents as Replay
import Sim.SaveCodec exposing (andMap, optional)
import Sim.SaveParts as SaveParts
import Sim.SonarTransmitters as Sonar
import Sim.World exposing (World)
import Sim.WorldEncoder as WorldEncoder


switch : String -> D.Decoder Bool
switch key =
    optional key D.bool |> D.map (Maybe.withDefault False)


named : List ( String, a ) -> D.Decoder a
named choices =
    D.string
        |> D.andThen
            (\name ->
                case List.filter (\( n, _ ) -> n == name) choices of
                    ( _, value ) :: _ ->
                        D.succeed value

                    [] ->
                        D.fail ("not one of the expected names: " ++ name)
            )


{-| What the page passes `step` each frame; absent fields take the
TypeScript's defaults.
-}
input : D.Decoder PatrolTick.Input
input =
    D.succeed PatrolTick.Input
        |> andMap (switch "paused")
        |> andMap (switch "modal")
        |> andMap (optional "timeRate" D.float)
        |> andMap (optional "look" D.float)
        |> andMap (optional "observation" D.string)
        |> andMap
            (optional "imaging"
                (D.map2 (\mode profile -> { mode = mode, profile = profile })
                    (D.field "mode" (named [ ( "scribbler", Sonar.Scribbler ), ( "painter", Sonar.Painter ) ]))
                    (D.field "profile" (named [ ( "survey", Sonar.Survey ), ( "detail", Sonar.Detail ) ]))
                )
            )
        |> andMap (optional "lampInView" (D.nullable D.string) |> D.map (Maybe.andThen identity))


{-| An action by its `kind` and the arguments the TypeScript function takes.
A reconnaissance area that is not a square counts as none, which the
request refuses.
-}
action : D.Decoder Action
action =
    D.field "kind" D.string
        |> D.andThen
            (\kind ->
                case kind of
                    "ping" ->
                        D.succeed Ping

                    "photograph" ->
                        D.map Photograph (D.field "look" D.float)

                    "fire" ->
                        D.map Fire (D.field "id" D.string)

                    "decoy" ->
                        D.succeed Decoy

                    "deployDrone" ->
                        D.succeed DeployDrone

                    "recallDrone" ->
                        D.succeed RecallDrone

                    "fireDeckGun" ->
                        D.map2 (\bearing elevation -> FireDeckGun { bearing = bearing, elevation = elevation }) (D.field "bearing" D.float) (D.field "elevation" D.float)

                    "aimGunAt" ->
                        D.succeed (\x y vx vy altitude -> AimGunAt { x = x, y = y, vx = vx, vy = vy, altitude = altitude })
                            |> andMap (D.field "x" D.float)
                            |> andMap (D.field "y" D.float)
                            |> andMap (optional "vx" D.float)
                            |> andMap (optional "vy" D.float)
                            |> andMap (optional "altitude" D.float)

                    "orderScope" ->
                        D.map OrderScope (D.field "raised" D.bool)

                    "requestRecon" ->
                        D.map RequestRecon
                            (D.oneOf
                                [ D.field "area" (D.map3 (\x y size -> Just { x = x, y = y, size = size }) (D.field "x" D.float) (D.field "y" D.float) (D.field "size" D.float))
                                , D.succeed Nothing
                                ]
                            )

                    "startRescue" ->
                        D.succeed StartRescue

                    "dronePhotograph" ->
                        D.succeed DronePhotograph

                    "endPatrolEarly" ->
                        D.succeed EndPatrolEarly

                    "log" ->
                        D.map2 Log (D.field "text" D.string) (optional "logKind" SaveParts.logKind |> D.map (Maybe.withDefault Mechanics.Info))

                    _ ->
                        D.fail ("no such action: " ++ kind)
            )


{-| The outboxes as the save's field encoder writes them, filled with what
a tick or action announced.
-}
announced : World -> List Replay.Marked -> List InvalidNumber -> List ( String, E.Value )
announced w replay invalid =
    List.filter (\( key, _ ) -> key == "replay" || key == "invalid") (WorldEncoder.encodeFields { w | replay = replay, invalid = invalid })


{-| A tick: the world after it, its replay marks and its invalid numbers.
-}
encodeTick : Tick -> E.Value
encodeTick t =
    E.object (( "world", WorldEncoder.encodeWorld t.world ) :: announced t.world t.replay t.invalid)


{-| An action: what it returned, the world after it, and what it announced.
-}
encodeDone : Done -> E.Value
encodeDone d =
    E.object (( "result", d.result ) :: ( "world", WorldEncoder.encodeWorld d.world ) :: announced d.world d.replay d.invalid)
