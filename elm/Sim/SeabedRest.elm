module Sim.SeabedRest exposing (restingKnots, restingStealth, seabedWear, sweepClutter, touchdownChance, touchdownDamage, touchdownImpact)

{-| Resting on the seabed. A gentle landing is safe and a hard one risks
damage. A stopped sub on the bottom blends into it; trying to move scrapes the
outer hull.
-}


restingKnots : Float
restingKnots =
    0.3


safeImpact : Float
safeImpact =
    0.4


heavyImpact : Float
heavyImpact =
    2


wearPerKnotSecond : Float
wearPerKnotSecond =
    0.06


{-| Driving into a bank counts as an impact as well as sinking onto it. -}
touchdownImpact : Float -> Float -> Float
touchdownImpact descent speedKnots =
    max descent (0.2 * abs speedKnots)


touchdownChance : Float -> Float
touchdownChance impact =
    min 1 (max 0 ((impact - safeImpact) / (heavyImpact - safeImpact)))


touchdownDamage : Float -> Float
touchdownDamage impact =
    if impact <= safeImpact then
        0

    else
        4 + 12 * min 1.5 ((impact - safeImpact) / (heavyImpact - safeImpact))


{-| Outer hull points lost while the sub works against the seabed. -}
seabedWear : Float -> Float -> Float
seabedWear effortKnots dt =
    let
        effort =
            abs effortKnots
    in
    if effort > restingKnots then
        wearPerKnotSecond * effort * dt

    else
        0


restingStealth : Bool -> Float -> Float
restingStealth bottomed effortKnots =
    if bottomed && abs effortKnots <= restingKnots then
        0.25

    else
        1


sweepClutter : Bool -> Float -> Float
sweepClutter bottomed effortKnots =
    if bottomed && abs effortKnots <= restingKnots then
        0.5

    else
        1
