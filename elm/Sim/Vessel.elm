module Sim.Vessel exposing (Kind(..), Side(..), SurfaceShip(..), kindName, kinds, sideName, sides)

{-| The kinds of vessel at sea in a patrol, and the side a fleet ship fights
on, with the names saves use for them.
-}


type SurfaceShip
    = Merchant
    | Escort
    | Fishing
    | Carrier


type Kind
    = Surface SurfaceShip
    | Submarine


type Side
    = Friendly
    | Hostile


kindName : Kind -> String
kindName kind =
    case kind of
        Surface Merchant ->
            "merchant"

        Surface Escort ->
            "escort"

        Surface Fishing ->
            "fishing"

        Surface Carrier ->
            "carrier"

        Submarine ->
            "sub"


{-| Every kind. A new one must be given its place in this chain before the
module compiles.
-}
kinds : List Kind
kinds =
    let
        from kind =
            kind
                :: (case kind of
                        Surface Merchant ->
                            from (Surface Escort)

                        Surface Escort ->
                            from (Surface Fishing)

                        Surface Fishing ->
                            from (Surface Carrier)

                        Surface Carrier ->
                            from Submarine

                        Submarine ->
                            []
                   )
    in
    from (Surface Merchant)


sideName : Side -> String
sideName side =
    case side of
        Friendly ->
            "friendly"

        Hostile ->
            "hostile"


sides : List Side
sides =
    let
        from side =
            side
                :: (case side of
                        Friendly ->
                            from Hostile

                        Hostile ->
                            []
                   )
    in
    from Friendly
