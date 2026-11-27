module Sim.Vessel exposing (Kind(..), Side(..), SurfaceShip(..))

{-| The kinds of vessel at sea in a patrol, and the side a fleet ship fights
on.
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
