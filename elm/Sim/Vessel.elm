module Sim.Vessel exposing (Kind(..), SurfaceShip(..))

{-| The kinds of vessel at sea in a patrol. -}


type SurfaceShip
    = Merchant
    | Escort
    | Fishing
    | Carrier


type Kind
    = Surface SurfaceShip
    | Submarine
