module Sim.TorpedoWatch exposing (Echo, Track, gameEcho, observe, threats)

{-| Sonar observations of torpedoes, kept apart from the vessel contacts so a
return never becomes a selectable ship or weapon target. Two active fixes give
a course; an inbound run then gets an estimated arrival.
-}

import Sim.Math as M


type alias Echo =
    { id : Int, time : Float, x : Float, y : Float, depth : Float, speed : Float, inboundRun : Bool }


type alias Track =
    { id : Int
    , time : Float
    , x : Float
    , y : Float
    , depth : Float
    , speed : Float
    , inboundRun : Bool
    , arrival : Maybe Float
    , fixes : Int
    , activeAt : Float
    , activeX : Float
    , activeY : Float
    , course : Maybe Int
    }


{-| JavaScript's `value || 0`.
-}
orZero : Float -> Float
orZero value =
    if M.isZero value || isNaN value then
        0

    else
        value


{-| The arcade warning uses an enemy torpedo's scripted destination; one left
behind by the boat, or a diverted run, cancels the prediction.
-}
gameEcho :
    { a | x : Float, y : Float, depth : Float }
    -> { b | id : Int, x : Float, y : Float, depth : Float, enemy : Bool, aim : Maybe { x : Float, y : Float }, orderedDepth : Float, diverted : Bool }
    -> Float
    -> Float
    -> Echo
gameEcho boat shot time speed =
    let
        nearBoat =
            shot.enemy
                && not shot.diverted
                && (case shot.aim of
                        Just aim ->
                            M.hypot2 (aim.x - boat.x) (aim.y - boat.y) < 110 && M.abs (shot.orderedDepth - boat.depth) < 45

                        Nothing ->
                            False
                   )
    in
    { id = shot.id
    , time = time
    , x = orZero (toFloat (round shot.x))
    , y = orZero (toFloat (round shot.y))
    , depth = toFloat (round shot.depth)
    , speed = toFloat (round (speed / 0.514444))
    , inboundRun = nearBoat
    }


{-| Records an echo. An unknown torpedo starts a track only from an active
fix. A later active fix completes the course; the arrival estimate comes from
how much the range closed between the displayed fixes, and an arcade run can
still miss after the game reports a likely approach.
-}
observe : { a | x : Float, y : Float } -> Echo -> Bool -> List Track -> List Track
observe boat echo active tracks =
    case List.filter (\t -> t.id == echo.id) tracks |> List.head of
        Nothing ->
            if active then
                tracks
                    ++ [ { id = echo.id
                         , time = echo.time
                         , x = echo.x
                         , y = echo.y
                         , depth = echo.depth
                         , speed = echo.speed
                         , inboundRun = echo.inboundRun
                         , arrival = Nothing
                         , fixes = 1
                         , activeAt = echo.time
                         , activeX = echo.x
                         , activeY = echo.y
                         , course = Nothing
                         }
                       ]

            else
                tracks

        Just track ->
            if echo.time < track.time then
                tracks

            else
                let
                    secondFix =
                        active && track.fixes == 1 && track.activeAt < echo.time

                    ( previousX, previousY, previousAt ) =
                        if secondFix then
                            ( track.activeX, track.activeY, track.activeAt )

                        else
                            ( track.x, track.y, track.time )

                    dx =
                        echo.x - previousX

                    dy =
                        echo.y - previousY

                    fixed =
                        if active && track.activeAt < echo.time then
                            { track | fixes = 2, activeAt = echo.time, activeX = echo.x, activeY = echo.y }

                        else
                            track

                    course =
                        if fixed.fixes == 2 && (M.truthy dx || M.truthy dy) then
                            Just (remainderBy 360 (round (atan2 dx dy * 180 / pi) + 360))

                        else
                            fixed.course

                    arrival =
                        if not echo.inboundRun || course == Nothing then
                            Nothing

                        else
                            let
                                elapsed =
                                    echo.time - previousAt
                            in
                            if elapsed > 0 then
                                let
                                    range =
                                        M.hypot2 (echo.x - boat.x) (echo.y - boat.y)

                                    decrease =
                                        M.hypot2 (previousX - boat.x) (previousY - boat.y) - range
                                in
                                if decrease > 1 then
                                    Just (echo.time + toFloat (ceiling (range * elapsed / decrease)))

                                else
                                    Nothing

                            else
                                fixed.arrival

                    updated =
                        { fixed | id = echo.id, time = echo.time, x = echo.x, y = echo.y, depth = echo.depth, speed = echo.speed, inboundRun = echo.inboundRun, course = course, arrival = arrival }
                in
                List.map
                    (\t ->
                        if t.id == echo.id then
                            updated

                        else
                            t
                    )
                    tracks


{-| Torpedoes heard within the last eight seconds that are still expected to
arrive.
-}
threats : Float -> List Track -> List Track
threats now =
    List.filter
        (\t ->
            case t.arrival of
                Just arrival ->
                    now <= arrival && now - t.time <= 8

                Nothing ->
                    False
        )
