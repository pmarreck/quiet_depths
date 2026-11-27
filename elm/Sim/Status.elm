module Sim.Status exposing (Status(..), statusName)

{-| Where a patrol stands: under way, or ended as a success, a loss, a
partial success brought home early, or a withdrawal with nothing aboard.
-}


type Status
    = Patrol
    | Won
    | Lost
    | Partial
    | Withdrawn


statusName : Status -> String
statusName status =
    case status of
        Patrol ->
            "patrol"

        Won ->
            "won"

        Lost ->
            "lost"

        Partial ->
            "partial"

        Withdrawn ->
            "withdrawn"
