module Sim.Suspicion exposing (Clue, Patrol, Watcher, activeClue, imagerClue, leaveClue, searchClue, searchSeconds, suspicionLabel)

{-| What the enemy suspects. A clue names a chart square, not a firing
solution; a watcher who has one searches it until it goes stale, making an
inquiry now and then. Imaging sonar transmissions risk leaving clues.
-}

import Sim.Math as M
import Sim.SonarTransmitters as Sonar exposing (Instrument, Profile)
import Sim.SurfaceMotion exposing (hash01)
import Sim.Text exposing (codePointUnits)
import Sim.Vessel exposing (Kind(..))


type alias Clue =
    { x : Float, y : Float, time : Float }


type alias Watcher a =
    { a
        | x : Float
        , y : Float
        , alert : Float
        , heading : Float
        , id : String
        , kind : Kind
        , depth : Maybe Float
        , clue : Maybe Clue
        , nextInquiry : Maybe Float
    }


type alias Patrol a p d =
    { a
        | x : Float
        , y : Float
        , time : Float
        , heading : Float
        , depth : Float
        , patrol : { p | seed : Float }
        , difficulty : { d | pingDetection : Float, detection : Float, pursuit : Float }
    }


{-| How long a clue stays worth searching.
-}
searchSeconds : Float -> Float
searchSeconds pursuit =
    100 * pursuit


suspicionLabel : Float -> List { b | tracking : Maybe String } -> String
suspicionLabel level ships =
    if level >= 60 && List.any (\v -> v.tracking == Just "tracking") ships then
        "Under pursuit"

    else if level >= 30 then
        "Searching"

    else if level >= 12 then
        "Suspicious"

    else
        "No suspicion"


{-| A clue names the 600 m chart square the observation fell in.
-}
leaveClue : Float -> Clue -> Watcher a -> Watcher a
leaveClue amount observed v =
    let
        square : Float
        square =
            600

        center : Float -> Float
        center c =
            (toFloat (floor (c / square)) + 0.5) * square
    in
    { v | clue = Just { x = center observed.x, y = center observed.y, time = observed.time }, alert = M.min 100 (v.alert + amount) }


{-| A transmission within one and a half ranges may leave a clue; a direct
look at the watcher far more often than a glancing one.
-}
imagerClue : Patrol a p d -> Instrument -> Profile -> Float -> Watcher w -> Watcher w
imagerClue s mode profile beat v =
    if Sonar.range profile * 1.5 < M.hypot2 (v.x - s.x) (v.y - s.y) then
        v

    else
        let
            direct : Bool
            direct =
                Sonar.scanSector s v mode (Sonar.range profile)

            risk : Float
            risk =
                Sonar.exposure profile
                    * (if direct then
                        1

                       else
                        0.16
                      )
                    * s.difficulty.pingDetection
                    * s.difficulty.detection

            key : Float
            key =
                List.foldl (\unit k -> toFloat (M.imul (M.toInt32 k) 31) + toFloat unit) (beat * 157) (codePointUnits v.id)
        in
        if hash01 s.patrol.seed key < risk then
            leaveClue
                (if direct then
                    24

                 else
                    12
                )
                { x = s.x, y = s.y, time = s.time }
                v

        else
            v


{-| The watcher's clue while it is fresh and the watcher still alert; a stale
one is forgotten along with the next inquiry.
-}
activeClue : Patrol a p d -> Watcher w -> ( Maybe Clue, Watcher w )
activeClue s v =
    case v.clue of
        Nothing ->
            ( Nothing, v )

        Just clue ->
            if searchSeconds s.difficulty.pursuit < s.time - clue.time || v.alert < 1 then
                ( Nothing, { v | clue = Nothing, nextInquiry = Nothing } )

            else
                ( Just clue, v )


{-| Steers the watcher toward its clue and says whether an inquiry is due;
submarines inquire less often than surface ships.
-}
searchClue : Patrol a p d -> Float -> Maybe Clue -> Watcher w -> ( Bool, Watcher w )
searchClue s dt maybeClue v =
    case maybeClue of
        Nothing ->
            ( False, v )

        Just clue ->
            let
                dx : Float
                dx =
                    clue.x - v.x

                dy : Float
                dy =
                    clue.y - v.y

                turned : Watcher w
                turned =
                    if M.hypot2 dx dy > 140 then
                        let
                            course : Float
                            course =
                                atan2 dx dy * 180 / pi

                            turn : Float
                            turn =
                                M.remainder (course - v.heading + 540) 360 - 180
                        in
                        { v | heading = M.remainder (v.heading + M.min dt (M.max (negate dt) turn) + 360) 360 }

                    else
                        v

                sub : Bool
                sub =
                    v.kind == Submarine

                next : Float
                next =
                    case turned.nextInquiry of
                        Just n ->
                            n

                        Nothing ->
                            s.time
                                + (if sub then
                                    20

                                   else
                                    9
                                  )

                waiting : Watcher w
                waiting =
                    { turned | nextInquiry = Just next }
            in
            if s.time < next then
                ( False, waiting )

            else
                ( True
                , { waiting
                    | nextInquiry =
                        Just
                            (s.time
                                + (if sub then
                                    70

                                   else
                                    35
                                  )
                            )
                  }
                )
