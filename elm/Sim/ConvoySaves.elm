module Sim.ConvoySaves exposing (StationMessage(..), stationLamp, validAlliedWatch, validConvoy)

{-| The checks a saved convoy and allied lamp watch must pass, beyond the
types their decoders already require, and the lamp message the station's
signal lamp shows.
-}

import Sim.ConvoyWatch exposing (AlliedLamp, Convoy, convoyIds)
import Sim.FleetTheater exposing (Battle)
import Sim.Math as M
import Sim.Ship exposing (Ship)
import Sim.SignalLamp exposing (Estimate, LampFix, Transmission)
import Sim.SignalLampSaves as SignalLampSaves
import Sim.Vessel exposing (Kind(..), Side(..), SurfaceShip(..))


finite : Float -> Bool
finite v =
    not (isNaN v || isInfinite v)


safeCount : Float -> Bool
safeCount v =
    finite v && 0 <= v && v <= 9007199254740991 && toFloat (floor v) == v


{-| The henhouse's cast is complete and as laid out, the Plover's wreck marked,
and the convoy's counters, telegrams and torpedo consistent with the patrol.
-}
validConvoy : { s | convoy : Maybe Convoy, ships : List Ship, time : Float, weaponSequence : Int } -> Bool
validConvoy s =
    case s.convoy of
        Nothing ->
            False

        Just c ->
            let
                cast : List ( String, Side, Kind )
                cast =
                    List.map
                        (\id ->
                            ( id
                            , Friendly
                            , if id == "escort" then
                                Surface Escort

                              else
                                Surface Merchant
                            )
                        )
                        (convoyIds ++ [ "plover" ])
                        ++ [ ( "wolf", Hostile, Submarine ) ]

                present : Bool
                present =
                    List.length (List.filter (\v -> v.incidental /= Just True) s.ships)
                        == List.length cast
                        && List.all (\( id, side, kind ) -> List.any (\v -> v.id == id && v.side == Just side && v.kind == kind) s.ships) cast

                wreckMarked : Bool
                wreckMarked =
                    case List.filter (\v -> v.id == "plover") s.ships |> List.head of
                        Just wreck ->
                            wreck.settled == Just True && M.isZero wreck.hull && Maybe.map .observed wreck.wreckMark == Just True

                        Nothing ->
                            False

                messageOk : Bool
                messageOk =
                    case c.message of
                        Just m ->
                            SignalLampSaves.validTransmission m s.time && m.estimate.number == c.number && List.member m.estimate.sender convoyIds

                        Nothing ->
                            True

                pinOk : Bool
                pinOk =
                    case c.pin of
                        Just pin ->
                            SignalLampSaves.validEstimate pin s.time && List.member pin.sender convoyIds && pin.number <= c.number

                        Nothing ->
                            True

                shotOk : Bool
                shotOk =
                    case c.shot of
                        Just v ->
                            v.source
                                == "wolf"
                                && List.member v.target convoyIds
                                && v.underwater
                                && 0
                                < v.id
                                && v.id
                                < s.weaponSequence
                                && List.all finite [ v.from.x, v.from.y, v.from.altitude, v.to.x, v.to.y, v.to.altitude, v.launched, v.arrives, v.damage ]
                                && 0
                                <= v.launched
                                && v.launched
                                <= s.time
                                && s.time
                                < v.arrives
                                && 0
                                <= v.damage

                        Nothing ->
                            True
            in
            present && wreckMarked && 0 <= c.round && safeCount c.number && finite c.next && 0 <= c.next && messageOk && pinOk && shotOk


{-| The allied watch exists only where friendly ships can signal, its counters
fit the patrol, and every fix it or a ship holds names a friendly sender and a
hostile submarine.
-}
validAlliedWatch : { s | alliedLamp : Maybe AlliedLamp, convoy : Maybe Convoy, battle : Maybe Battle, ships : List Ship, time : Float } -> Bool
validAlliedWatch s =
    case s.alliedLamp of
        Nothing ->
            List.all (\v -> v.lampFix == Nothing) s.ships

        Just w ->
            let
                sender : String -> Bool
                sender id =
                    List.any (\v -> v.id == id && v.side == Just Friendly && v.kind /= Submarine) s.ships

                valid : LampFix -> Bool
                valid f =
                    SignalLampSaves.validLampFix f s.time && sender f.sender && List.any (\v -> v.id == f.target && v.side == Just Hostile && v.kind == Submarine) s.ships && f.number <= w.sequence

                signalers : Bool
                signalers =
                    s.convoy /= Nothing || s.battle /= Nothing || List.any (\v -> v.incidental == Just True && v.side == Just Friendly && v.kind /= Submarine) s.ships
            in
            signalers
                && safeCount w.sequence
                && finite w.lastIssue
                && -1
                <= w.lastIssue
                && w.lastIssue
                <= s.time
                && (case w.message of
                        Just m ->
                            valid m.estimate && SignalLampSaves.validCopy m s.time

                        Nothing ->
                            True
                   )
                && List.all
                    (\v ->
                        case v.lampFix of
                            Just f ->
                                valid f && f.sender == v.id

                            Nothing ->
                                True
                    )
                    s.ships


{-| The station's lamp message: an allied fix being signaled, or the convoy's
estimate.
-}
type StationMessage
    = AlliedSignal (Transmission LampFix)
    | ConvoySignal (Transmission Estimate)


stationLamp : { s | alliedLamp : Maybe AlliedLamp, convoy : Maybe Convoy } -> Maybe StationMessage
stationLamp s =
    case s.alliedLamp |> Maybe.andThen .message of
        Just m ->
            Just (AlliedSignal m)

        Nothing ->
            s.convoy |> Maybe.andThen .message |> Maybe.map ConvoySignal
