module Sim.AircraftPhase exposing (Phase(..), phaseName, phases)

{-| Where an aircraft is in its sortie: climbing out, closing in, hunting,
attacking, breaking away, flying home, falling, or gone. The TypeScript
keeps these as strings on each aircraft (air-support.ts).
-}


type Phase
    = Takeoff
    | Approach
    | Search
    | Attack
    | Egress
    | Return
    | Down
    | Gone


phaseName : Phase -> String
phaseName phase =
    case phase of
        Takeoff ->
            "takeoff"

        Approach ->
            "approach"

        Search ->
            "search"

        Attack ->
            "attack"

        Egress ->
            "egress"

        Return ->
            "return"

        Down ->
            "down"

        Gone ->
            "gone"


{-| Every phase, built so that adding one without listing it fails to
compile.
-}
phases : List Phase
phases =
    let
        after : Phase -> List Phase
        after phase =
            case phase of
                Takeoff ->
                    [ Approach, Search, Attack, Egress, Return, Down, Gone ]

                Approach ->
                    [ Search, Attack, Egress, Return, Down, Gone ]

                Search ->
                    [ Attack, Egress, Return, Down, Gone ]

                Attack ->
                    [ Egress, Return, Down, Gone ]

                Egress ->
                    [ Return, Down, Gone ]

                Return ->
                    [ Down, Gone ]

                Down ->
                    [ Gone ]

                Gone ->
                    []
    in
    Takeoff :: after Takeoff
