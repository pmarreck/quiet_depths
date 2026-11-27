module Sim.TorpedoTubes exposing (Tube(..), Tubes, exitPitch, reloadSeconds, tubes)

{-| The two bow tubes: which hold a round, how long each has left to reload,
and which fires next. A torpedo leaving the tube clears the bow before it
bends toward its ordered course.
-}

import Sim.Math as M


type Tube
    = Port
    | Starboard


reloadSeconds : Float
reloadSeconds =
    20


{-| Each tube's remaining reload in seconds, or Nothing when it holds no
round, and the tube that fires next, if one is ready.
-}
type alias Tubes =
    { port_ : Maybe Float, starboard : Maybe Float, next : Maybe Tube }


{-| `torps` counts every remaining round, including those in the tubes. A
single remaining round belongs to the tube that finishes reloading first.
-}
tubes : { a | time : Float, torps : Int, portReadyAt : Float, starboardReadyAt : Float } -> Tubes
tubes s =
    let
        first =
            if s.portReadyAt == s.starboardReadyAt then
                if modBy 2 s.torps == 1 then
                    Starboard

                else
                    Port

            else if s.portReadyAt < s.starboardReadyAt then
                Port

            else
                Starboard

        readyAt tube =
            case tube of
                Port ->
                    s.portReadyAt

                Starboard ->
                    s.starboardReadyAt

        remaining tube =
            if s.torps > 1 || (s.torps == 1 && tube == first) then
                Just (M.max 0 (readyAt tube - s.time))

            else
                Nothing
    in
    { port_ = remaining Port
    , starboard = remaining Starboard
    , next =
        if s.torps > 0 && readyAt first <= s.time then
            Just first

        else
            Nothing
    }


{-| The first half of the launch clears the bow; the second smoothsteps
through the bend. Reusing the fraction already played lets a short frame and
a restored shot both continue from their current pose.
-}
exitPitch : Float -> Float -> Float -> Float -> Float -> Float
exitPitch current requested age elapsed duration =
    if elapsed <= 0 || age <= duration / 2 then
        current

    else if age >= duration then
        requested

    else
        let
            remaining time =
                let
                    t =
                        M.min 1 (2 * (duration - time) / duration)
                in
                t * t * (3 - 2 * t)
        in
        requested + (current - requested) * (remaining age / remaining (age - elapsed))
