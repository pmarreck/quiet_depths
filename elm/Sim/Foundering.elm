module Sim.Foundering exposing (Vessel, descentSpeed, founderingPose, submergedDepth, surfaceCollapseAge, wreckVisible)

{-| How a sinking surface ship lists, trims and settles as it passes beneath
the surface, and when its wreck can be seen. The bow is local -Z.
-}

import Sim.Math as M
import Sim.Vessel exposing (Kind(..), SurfaceShip(..))


type alias Profile =
    { scale : Float, list : Float, trim : Float, lastVisible : Float }


{-| Final list and trim while passing beneath the surface.
-}
profile : SurfaceShip -> Profile
profile kind =
    case kind of
        Merchant ->
            Profile 1 0.74 -0.39 39.86

        Escort ->
            Profile 0.78 -0.79 0.36 25.76

        Fishing ->
            Profile 0.38 -0.82 -0.44 13.36

        Carrier ->
            Profile 1.55 0.57 -0.32 53.36


ease : Float -> Float -> Float -> Float
ease from to value =
    let
        t =
            M.max 0 (M.min 1 ((value - from) / (to - from)))
    in
    t * t * (3 - 2 * t)


{-| Descent begins on a nearly level keel. Deep underwater the hull rolls
farther onto its side and levels out along its length.
-}
founderingPose : SurfaceShip -> Float -> { roll : Float, pitch : Float, wave : Float }
founderingPose kind drop =
    let
        p =
            profile kind

        immersion =
            drop / p.scale

        list =
            0.28 * ease 0 2 immersion + 0.72 * ease 2 16 immersion

        deep =
            ease (p.lastVisible + 3) (p.lastVisible + 40 * p.scale) drop
    in
    { roll = p.list * list * (1 + deep * 0.55)
    , pitch = p.trim * ease 2 16 immersion * (1 - 0.94 * deep)
    , wave = 1 - ease 0 14 immersion
    }


submergedDepth : SurfaceShip -> Float
submergedDepth kind =
    (profile kind).lastVisible


descentSpeed : Float -> Float
descentSpeed age =
    0.12 + 1.18 * ease 0 26 age


surfaceCollapseAge : Float
surfaceCollapseAge =
    80


type alias Vessel a =
    { a
        | kind : Kind
        , hull : Float
        , sinkDepth : Maybe Float
        , sunkAt : Maybe Float
        , settled : Bool
        , collapsed : Bool
        , wreckObserved : Bool
    }


{-| A wreck shows once it has settled. Charted casualties and older saves
without a sinking clock show at once; a surface ship shows only after it has
been down long enough to sink below its last visible depth.
-}
wreckVisible : Vessel a -> Float -> Bool
wreckVisible v now =
    if v.hull > 0 then
        False

    else if v.settled && (v.sunkAt == Nothing || (v.sunkAt |> Maybe.map M.isZero |> Maybe.withDefault False) && v.wreckObserved) then
        True

    else
        case v.kind of
            Submarine ->
                v.collapsed || v.settled

            Surface ship ->
                (v.collapsed || v.settled)
                    && surfaceCollapseAge
                    <= now
                    - Maybe.withDefault now v.sunkAt
                    && submergedDepth ship
                    < Maybe.withDefault 0 v.sinkDepth
