module Sim.Mechanics exposing (CapsuleContact, LogEntry, LogKind(..), bearing, capsuleContact, delta, distance, log, logKindName, propellerState, rad, rand, separation)

{-| Geometry, the patrol's seeded random draws, the captain's log, hull
contact and propeller cavitation. Coordinates: x east, y north, depth down;
SI units except knots and degrees.
-}

import Bitwise
import Sim.Equipment exposing (operatingFraction)
import Sim.HullDesign exposing (design)
import Sim.Math as M


rad : Float -> Float
rad d =
    d * pi / 180


{-| Compass bearing from one point to another, 0 to 360. -}
bearing : { a | x : Float, y : Float } -> { b | x : Float, y : Float } -> Float
bearing a b =
    M.remainder (atan2 (b.x - a.x) (b.y - a.y) * 180 / pi + 360) 360


{-| The signed turn from bearing b to bearing a, -180 to 180. -}
delta : Float -> Float -> Float
delta a b =
    M.remainder (a - b + 540) 360 - 180


distance : { a | x : Float, y : Float } -> { b | x : Float, y : Float } -> Float
distance a b =
    M.hypot2 (a.x - b.x) (a.y - b.y)


separation : { a | x : Float, y : Float, depth : Float } -> { b | x : Float, y : Float, depth : Float } -> Float
separation a b =
    M.hypot3 (a.x - b.x) (a.y - b.y) (a.depth - b.depth)


{-| Xorshift over the patrol's saved state, shared by every seeded system:
the draw in [0, 1) and the next state.
-}
rand : Int -> ( Float, Int )
rand rng =
    let
        a =
            Bitwise.xor rng (Bitwise.shiftLeftBy 13 rng)

        b =
            Bitwise.xor a (Bitwise.shiftRightZfBy 17 a)

        c =
            Bitwise.xor b (Bitwise.shiftLeftBy 5 b)
    in
    ( toFloat (Bitwise.shiftRightZfBy 0 c) / 4294967296, c )


type LogKind
    = Info
    | Warning
    | Damage
    | Success
    | Contact


logKindName : LogKind -> String
logKindName kind =
    case kind of
        Info ->
            "info"

        Warning ->
            "warning"

        Damage ->
            "damage"

        Success ->
            "success"

        Contact ->
            "contact"


type alias LogEntry =
    { t : Float, text : String, kind : LogKind }


{-| The captain's log, newest first: a line repeating the newest is dropped,
and 45 lines are kept.
-}
log : String -> LogKind -> { a | events : List LogEntry, time : Float } -> { a | events : List LogEntry, time : Float }
log text kind s =
    case s.events of
        newest :: _ ->
            if newest.text == text then
                s

            else
                { s | events = List.take 45 ({ t = s.time, text = text, kind = kind } :: s.events) }

        [] ->
            { s | events = [ { t = s.time, text = text, kind = kind } ] }


{-| JavaScript's `value || 0`. -}
orZero : Float -> Float
orZero value =
    if M.truthy value then
        value

    else
        0


type alias CapsuleContact =
    { penetration : Float, nx : Float, ny : Float, nd : Float }


{-| How far a point of the given radius sinks into a capsule, and the outward
normal, using the same centerline and radius as the capsule's mesh.
-}
capsuleContact : { a | x : Float, y : Float, depth : Float } -> { b | x : Float, y : Float, depth : Float, heading : Float, pitch : Float } -> Float -> Float -> Float -> Maybe CapsuleContact
capsuleContact point body halfLength radius pointRadius =
    let
        a =
            rad body.heading

        sn =
            sin a

        cs =
            cos a

        cp =
            cos (orZero body.pitch)

        sp =
            sin (orZero body.pitch)

        dx =
            point.x - body.x

        dy =
            point.y - body.y

        dz =
            point.depth - body.depth

        horizontal =
            dx * sn + dy * cs

        forward =
            horizontal * cp - dz * sp

        side =
            dx * cs - dy * sn

        along =
            forward - M.clamp (negate halfLength) halfLength forward

        down =
            horizontal * sp + dz * cp

        length =
            M.hypot3 side along down

        penetration =
            radius + pointRadius - length
    in
    if penetration <= 0 then
        Nothing

    else
        let
            ( ls, la, ld ) =
                if length > 1.0e-8 then
                    ( side / length, along / length, down / length )

                else
                    ( 1, 0, 0 )
        in
        Just
            { penetration = penetration
            , nx = ls * cs + la * sn * cp + ld * sn * sp
            , ny = negate ls * sn + la * cs * cp + ld * cs * sp
            , nd = negate la * sp + ld * cp
            }


{-| Local cavitation number, following MIT 2.611 Cavitation Notes. Blade
loading (critical sigma 1.25), RPM gearing and bubble density are fictional
tuning.
-}
propellerState : Float -> Float -> Float -> { rpm : Float, sigma : Float, cavitation : Float }
propellerState speed depth health =
    let
        rpm =
            speed * 13 * operatingFraction health

        radius =
            design.propellerRadius

        omega =
            rpm * pi / 30

        q =
            0.5 * 1025 * ((speed * 0.514444) ^ 2 + (omega * radius) ^ 2)

        sigma =
            if q > 0 then
                (101325 + 1025 * 9.81 * M.max 0 (depth - radius) - 2300) / q

            else
                1 / 0
    in
    { rpm = rpm
    , sigma = sigma
    , cavitation =
        if not (M.isZero rpm) && q > 0 then
            M.clamp 0 1 ((1.25 - sigma) / 1.25)

        else
            0
    }
