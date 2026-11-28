module Sim.PatrolPhase exposing (Phase(..), phaseName, phases)

{-| A patrol's phase: working the objective, or heading to extraction once it
is met.
-}


type Phase
    = Objective
    | Extract


phaseName : Phase -> String
phaseName phase =
    case phase of
        Objective ->
            "objective"

        Extract ->
            "extract"


{-| Every phase, built so that a new one cannot be left out: the `case` in
`after` stops compiling until the new phase is given a successor.
-}
phases : List Phase
phases =
    let
        after : Phase -> Maybe Phase
        after phase =
            case phase of
                Objective ->
                    Just Extract

                Extract ->
                    Nothing

        from : Phase -> List Phase
        from phase =
            phase :: (Maybe.map from (after phase) |> Maybe.withDefault [])
    in
    from Objective
