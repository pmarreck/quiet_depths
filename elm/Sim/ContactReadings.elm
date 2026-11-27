module Sim.ContactReadings exposing (Contact, Estimate, Fix, Method(..), estimateAt, observationBias, sonarReading)

{-| What the boat knows about a contact: a bearing, perhaps a measured range,
and from a timestamped fix an estimated position whose 95% ellipse grows as
the fix ages.
-}

import Sim.Math as M
import Sim.SurfaceMotion exposing (hash01)
import Sim.Text exposing (codeUnits)


type alias Fix =
    { x : Float, y : Float, time : Float, vx : Float, vy : Float, positionSigma : Float, velocitySigma : Float, maneuverSigma : Float }


type alias Contact a =
    { a | x : Float, y : Float, range : Float, bearing : Float, confidence : Float, age : Float, fix : Maybe Fix }


type Method
    = Visual
    | Passive


{-| Repeated looks at the same vessel share the patrol's estimation error,
between -1 and 1. The key may pass 32 bits between multiplications, as it
does in JavaScript.
-}
observationBias : Float -> String -> Method -> Float
observationBias seed id method =
    let
        start =
            case method of
                Visual ->
                    1

                Passive ->
                    2

        key =
            List.foldl (\unit k -> M.imul k 31 + unit) start (codeUnits id)
    in
    2 * hash01 seed (toFloat key) - 1


finite : Float -> Bool
finite x =
    not (isNaN x || isInfinite x)


usableFix : Maybe Fix -> Maybe Fix
usableFix fix =
    case fix of
        Just f ->
            if List.all finite [ f.x, f.y, f.time, f.vx, f.vy, f.positionSigma, f.velocitySigma, f.maneuverSigma ] then
                Just f

            else
                Nothing

        Nothing ->
            Nothing


projectedPosition : Fix -> Float -> { x : Float, y : Float }
projectedPosition fix age =
    { x = fix.x + fix.vx * age, y = fix.y + fix.vy * age }


{-| JavaScript's `value || 0`.
-}
orZero : Float -> Float
orZero value =
    if M.truthy value then
        value

    else
        0


{-| A bearing in degrees, 0 to 360, toward a displacement east and north.
-}
bearingTo : Float -> Float -> Float
bearingTo east north =
    M.remainder (atan2 east north * 180 / pi + 360) 360


type alias Estimate =
    { x : Float, y : Float, major : Float, minor : Float, angle : Float, age : Float, hasFix : Bool }


{-| Where the contact probably is now. Without a usable fix the measured
point stands, with an ellipse sized by confidence, or a wide one when no
range was measured.
-}
estimateAt : Maybe (Contact a) -> Float -> Maybe Estimate
estimateAt maybeContact time =
    case maybeContact of
        Nothing ->
            Nothing

        Just contact ->
            if not (finite time) then
                Nothing

            else
                case usableFix contact.fix of
                    Nothing ->
                        if not (finite contact.x && finite contact.y) then
                            Nothing

                        else
                            let
                                major =
                                    if M.truthy contact.range then
                                        let
                                            confidence =
                                                M.min 1 (M.max 0 (orZero contact.confidence))
                                        in
                                        (1 - confidence) * 1500 + 100

                                    else
                                        6500
                            in
                            Just { x = contact.x, y = contact.y, major = major, minor = major * 0.65, angle = orZero contact.bearing, age = M.max 0 (orZero contact.age), hasFix = False }

                    Just fix ->
                        let
                            age =
                                M.max 0 (time - fix.time)

                            speed =
                                M.hypot2 fix.vx fix.vy

                            maneuver =
                                0.5 * fix.maneuverSigma * age * age

                            -- 95% uncertainty ellipse from the game's observation and drift settings.
                            major =
                                2.448 * M.hypot3 fix.positionSigma (fix.velocitySigma * age) maneuver

                            minor =
                                2.448
                                    * M.hypot3 fix.positionSigma
                                        (fix.velocitySigma
                                            * age
                                            * (if speed > 0.1 then
                                                0.6

                                               else
                                                1
                                              )
                                        )
                                        maneuver

                            angle =
                                if speed > 0.01 then
                                    bearingTo fix.vx fix.vy

                                else
                                    orZero contact.bearing

                            at =
                                projectedPosition fix age
                        in
                        Just { x = at.x, y = at.y, major = major, minor = minor, angle = angle, age = age, hasFix = True }


{-| The bearing and range the sonar shows for a contact. Old saves may have a
measured point without a timestamped fix; with neither, only the bearing.
-}
sonarReading : { b | x : Float, y : Float, time : Float } -> Contact a -> { bearing : Float, range : Maybe Float }
sonarReading observer contact =
    let
        point =
            case usableFix contact.fix of
                Just fix ->
                    Just (projectedPosition fix (M.max 0 (observer.time - fix.time)))

                Nothing ->
                    if M.truthy contact.range then
                        Just { x = contact.x, y = contact.y }

                    else
                        Nothing
    in
    case point of
        Nothing ->
            { bearing = contact.bearing, range = Nothing }

        Just p ->
            let
                dx =
                    p.x - observer.x

                dy =
                    p.y - observer.y

                range =
                    M.hypot2 dx dy
            in
            { bearing =
                if M.isZero range then
                    contact.bearing

                else
                    bearingTo dx dy
            , range = Just range
            }
