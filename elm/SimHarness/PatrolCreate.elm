module SimHarness.PatrolCreate exposing (function)

{-| Harness entries for patrol creation: a new patrol from a mission, seed
and the briefing's choices, as a save writes it.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.PatrolCreate as PatrolCreate
import SimHarness.Codec exposing (arg)
import SimHarness.Fleet exposing (optional)
import SimHarness.Patrol as Patrol
import SimHarness.WorldSave exposing (encodeWorld)


options : D.Decoder PatrolCreate.Options
options =
    D.map4 PatrolCreate.Options
        (optional "timeOfDay" D.string)
        (optional "weather" D.string)
        (optional "changing" D.bool)
        (optional "difficulty" D.value |> D.map (Maybe.withDefault E.null))


{-| The functions this module answers for, by the TypeScript name each replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "patrolCreate.createGame" ->
            Just (D.map3 (\mission seed choices -> encodeWorld (PatrolCreate.createGame mission seed choices)) (arg 0 D.string) (arg 1 D.float) (arg 2 options))

        "patrolCreate.getSoundings" ->
            Just
                (D.map2
                    (\s drone ->
                        PatrolCreate.getSoundings drone s
                            |> (\v -> E.object [ ( "waterDepth", E.float v.waterDepth ), ( "referenceDepth", E.float v.referenceDepth ), ( "belowKeel", E.float v.belowKeel ), ( "keelOffset", E.float v.keelOffset ) ])
                    )
                    (arg 0 Patrol.decoder)
                    (arg 1 D.bool)
                )

        "patrolCreate.updateWatchWarnings" ->
            Just (D.map (PatrolCreate.updateWatchWarnings >> encodeWorld) (arg 0 Patrol.decoder))

        _ ->
            Nothing
