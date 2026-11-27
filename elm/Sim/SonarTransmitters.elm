module Sim.SonarTransmitters exposing (Instrument(..), Profile(..), Transmitters, decoder, exposure, fresh, notice, range, scanSector)

{-| The imaging sonars as the simulation sees them: which instruments are
transmitting, how far each profile reaches, how readily a transmission gives
the boat away, and what falls inside each instrument's beam. The recorder
paper is drawn by the page.
-}

import Json.Decode as D
import Sim.Math as M


type Instrument
    = Scribbler
    | Painter


type Profile
    = Survey
    | Detail


type alias Transmitters =
    { scribbler : Maybe Profile, painter : Maybe Profile }


fresh : Transmitters
fresh =
    { scribbler = Nothing, painter = Nothing }


{-| A saved transmitter state: both instruments present, each off (null) or
on one profile.
-}
decoder : D.Decoder Transmitters
decoder =
    let
        profile =
            D.string
                |> D.andThen
                    (\name ->
                        case name of
                            "survey" ->
                                D.succeed Survey

                            "detail" ->
                                D.succeed Detail

                            _ ->
                                D.fail ("unknown sonar profile " ++ name)
                    )
    in
    D.map2 Transmitters (D.field "scribbler" (D.nullable profile)) (D.field "painter" (D.nullable profile))


{-| Listening range in meters. -}
range : Profile -> Float
range profile =
    case profile of
        Survey ->
            1600

        Detail ->
            650


{-| How readily a transmission on this profile gives the boat away. -}
exposure : Profile -> Float
exposure profile =
    case profile of
        Survey ->
            0.24

        Detail ->
            0.56


notice : Transmitters -> Bool -> String
notice t online =
    let
        names =
            List.filterMap identity [ Maybe.map (\_ -> "Scribbler") t.scribbler, Maybe.map (\_ -> "Painter") t.painter ]
    in
    if List.isEmpty names then
        ""

    else
        String.join " + " names
            ++ (if online then
                    " transmitting · Increased detection risk"

                else
                    " armed · Sonar offline"
               )


radians : Float
radians =
    pi / 180


{-| Whether an object lies in the beam: the Painter looks ahead in a cone,
the Scribbler sweeps a thin fan to either side and below.
-}
scanSector : { a | x : Float, y : Float, depth : Float, heading : Float } -> { b | x : Float, y : Float, depth : Maybe Float } -> Instrument -> Float -> Bool
scanSector eye object mode reach =
    let
        dx =
            object.x - eye.x

        dy =
            object.y - eye.y

        angle =
            eye.heading * radians

        along =
            dx * sin angle + dy * cos angle

        across =
            dx * cos angle - dy * sin angle

        dz =
            Maybe.withDefault 0 object.depth - eye.depth
    in
    if M.hypot3 dx dy dz > reach then
        False

    else
        case mode of
            Painter ->
                -- The cone admits only objects ahead: |across| < 1.2 along fails when along <= 0.
                M.abs across < along * 1.2 && M.abs dz < along * 0.65

            Scribbler ->
                dz >= 0 && M.abs along < M.max 14 (M.abs across * 0.1)
