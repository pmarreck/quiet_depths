module Sim.InvalidNumber exposing (InvalidNumber, report)

{-| A number that must be finite but is not means a bug upstream: a collision
that divided by zero, say. The simulation ignores such a value so its state
stays sound, and appends it to the state's `invalid` list. The game drains
the list to the console; the differential tests compare it with what the
TypeScript reported (typescript/invalid-numbers.ts), which throws in tests
and warns in play.
-}


{-| Where the value was refused (the TypeScript's `where`, a reserved word
here), and the value itself.
-}
type alias InvalidNumber =
    { place : String, value : Float }


report : String -> Float -> { w | invalid : List InvalidNumber } -> { w | invalid : List InvalidNumber }
report place value s =
    { s | invalid = s.invalid ++ [ { place = place, value = value } ] }
