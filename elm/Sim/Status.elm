module Sim.Status exposing (Status(..), statusName, statuses)

{-| Where a patrol stands: under way, or ended as a success, a loss, a
partial success brought home early, a withdrawal with nothing aboard, a
compromise, a recall when time or power ran out, or the convoy lost.
-}


type Status
    = Patrol
    | Won
    | Lost
    | Partial
    | Withdrawn
    | Compromised
    | Expired
    | ConvoyLost


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

        Compromised ->
            "compromised"

        Expired ->
            "expired"

        ConvoyLost ->
            "convoy-lost"


{-| Every status, in the order restore lists them. Each constructor must name
the one after it, so a new status fails to compile until it is placed.
-}
statuses : List Status
statuses =
    let
        after : Status -> Maybe Status
        after status =
            case status of
                Patrol ->
                    Just Won

                Won ->
                    Just Partial

                Partial ->
                    Just Withdrawn

                Withdrawn ->
                    Just Lost

                Lost ->
                    Just Compromised

                Compromised ->
                    Just Expired

                Expired ->
                    Just ConvoyLost

                ConvoyLost ->
                    Nothing

        chain : Status -> List Status
        chain status =
            status :: (after status |> Maybe.map chain |> Maybe.withDefault [])
    in
    chain Patrol
