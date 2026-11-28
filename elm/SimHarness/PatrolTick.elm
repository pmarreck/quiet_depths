module SimHarness.PatrolTick exposing (function)

{-| Harness entries for the patrol's clock: a frame of play from a saved
patrol and the page's input, returned as a save writes it, with the replay
marks and invalid numbers the frame produced.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.PatrolTick as PatrolTick
import SimHarness.Codec exposing (andMap, arg)
import SimHarness.Enemy exposing (instrument, profile)
import SimHarness.Fleet exposing (optional)
import SimHarness.Patrol as Patrol
import SimHarness.WorldSave exposing (encodeWorld)


flag : String -> D.Decoder Bool
flag key =
    optional key D.bool |> D.map (Maybe.withDefault False)


input : D.Decoder PatrolTick.Input
input =
    D.succeed PatrolTick.Input
        |> andMap (flag "paused")
        |> andMap (flag "modal")
        |> andMap (optional "timeRate" D.float)
        |> andMap (optional "look" D.float)
        |> andMap (optional "observation" D.string)
        |> andMap (optional "imaging" (D.map2 (\mode p -> { mode = mode, profile = p }) (D.field "mode" instrument) (D.field "profile" profile)))
        |> andMap (optional "lampInView" (D.nullable D.string) |> D.map (Maybe.andThen identity))


{-| The functions this module answers for, by the TypeScript name each replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "patrolTick.step" ->
            Just
                (D.map3
                    (\s dt frame ->
                        let
                            after : Patrol.Patrol
                            after =
                                PatrolTick.step dt frame s
                        in
                        E.object
                            (( "world", encodeWorld after )
                                :: List.filter (\( key, _ ) -> key == "replay" || key == "invalid") (Patrol.encodeFields after)
                            )
                    )
                    (arg 0 Patrol.decoder)
                    (arg 1 D.float)
                    (arg 2 input)
                )

        _ ->
            Nothing
