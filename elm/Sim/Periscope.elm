module Sim.Periscope exposing (Scope, advanceScope, orderScope, scopeEyeHeight, scopeExtension)

{-| The periscope takes three seconds to travel between stowed and raised.
`travel` is its extension while moving; at rest the order says where it is.
Posing the mast model is the renderer's job.
-}

import Sim.HullDesign exposing (design)
import Sim.Math as M


type alias Scope a =
    { a | scope : Bool, scopeTravel : Maybe Float }


fullTravelSeconds : Float
fullTravelSeconds =
    3


stowedEye : Float
stowedEye =
    design.bridgeRoof - 0.2


ordered : Scope a -> Float
ordered s =
    if s.scope then
        1

    else
        0


scopeExtension : Scope a -> Float
scopeExtension s =
    Maybe.withDefault (ordered s) s.scopeTravel


orderScope : Bool -> Scope a -> Scope a
orderScope raised s =
    if s.scope == raised then
        s

    else
        { s | scopeTravel = Just (scopeExtension s), scope = raised }


advanceScope : Float -> Scope a -> Scope a
advanceScope seconds s =
    case s.scopeTravel of
        Nothing ->
            s

        Just travel ->
            let
                step =
                    seconds / fullTravelSeconds
            in
            if M.abs (ordered s - travel) <= step then
                { s | scopeTravel = Nothing }

            else if s.scope then
                { s | scopeTravel = Just (travel + step) }

            else
                { s | scopeTravel = Just (travel - step) }


scopeEyeHeight : Scope a -> Float
scopeEyeHeight s =
    stowedEye + scopeExtension s * (design.scopeEye - stowedEye)
