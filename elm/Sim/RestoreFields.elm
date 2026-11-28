module Sim.RestoreFields exposing (migrate)

{-| The first half of restore: a saved patrol's fields, as JSON, checked and
brought up to date in the TypeScript's order. Older saves gain each field
added since, sometimes from other fields; every check refuses the save.
Absence and JSON null differ here as they do in the TypeScript: a field
filled only when `undefined` keeps a null, and one filled with `??=` does not.
-}

import Dict
import Json.Decode as D
import Json.Encode as E
import PatrolMission exposing (Mission(..))
import Sim.Difficulty as Difficulty
import Sim.EarlyEnd as EarlyEnd
import Sim.Environment as Env
import Sim.HunterReports as HunterReports
import Sim.Math as M
import Sim.MessWatch as MessWatch
import Sim.Recon as Recon
import Sim.ReconSaves as ReconSaves
import Sim.RestoreStores exposing (plant, stores)
import Sim.SaveFields exposing (Fields, absentOr, ensure, field, fill, fillNullish, finite, integer, number, object, safeInteger, savedReport, time)
import Sim.SaveParts as SaveParts
import Sim.Status as Status


text : String -> Fields -> Maybe String
text key =
    field key D.string


mission : Fields -> Maybe Mission
mission =
    text "mission" >> Maybe.andThen PatrolMission.fromId


header : Fields -> Maybe Fields
header f =
    ensure
        (number "version" f
            == Just 1
            && mission f
            /= Nothing
            && (text "status" f |> Maybe.map (\s -> List.member s (List.map Status.statusName Status.statuses)) |> Maybe.withDefault False)
        )
        f


missionFields : Fields -> Maybe Fields
missionFields f =
    let
        m : Maybe Mission
        m =
            mission f

        status : Maybe String
        status =
            text "status" f
    in
    ensure
        (absentOr "scopeTravel" (\v -> 0 <= v && v <= 1) f
            && (m == Just Henhouse || not (Dict.member "convoy" f) && status /= Just "convoy-lost")
            && (m == Just Tiebreaker || not (Dict.member "battle" f))
            && (m == Just Transit || not (Dict.member "departure" f))
            && (if status == Just "partial" || status == Just "withdrawn" then
                    text "phase" f == Just "objective" && (m |> Maybe.andThen EarlyEnd.earlyEndRule) /= Nothing

                else
                    True
               )
        )
        f


transmitters : D.Decoder Bool
transmitters =
    let
        mode : D.Decoder Bool
        mode =
            D.oneOf [ D.null True, D.string |> D.map (\s -> s == "survey" || s == "detail") ]
    in
    D.map2 (&&) (D.field "scribbler" mode) (D.field "painter" mode)


{-| The imagers, the clocks of imaging, the New Year watch, power loss and
the wave, and the difficulty as the patrol keeps it.
-}
clocks : Fields -> Maybe Fields
clocks f0 =
    let
        f : Fields
        f =
            fill "imagers" (E.object [ ( "scribbler", E.null ), ( "painter", E.null ) ]) f0

        t : Float
        t =
            time f
    in
    ensure
        (field "imagers" transmitters f
            == Just True
            && absentOr "imagingTime" (\v -> 0 <= v && M.notLess (t + 0.001) v) f
            && absentOr "newYearWatch" (\v -> safeInteger v && 0 <= v) f
            && absentOr "unpoweredSince" (\v -> 0 <= v && M.notLess t v) f
            && absentOr "wavePhase" (\v -> 0 <= v) f
        )
        f


{-| Patrols saved before the orbit option existed always used station views.
-}
normalizeDifficulty : Fields -> Fields
normalizeDifficulty f =
    let
        stored : Fields
        stored =
            Dict.get "difficulty" f |> Maybe.andThen object |> Maybe.withDefault Dict.empty

        merged : Fields
        merged =
            Dict.union stored (Dict.fromList [ ( "orbitCamera", E.bool False ), ( "instantReplay", E.bool False ) ])
    in
    Dict.insert "difficulty" (Difficulty.encode (Difficulty.decode (E.dict identity identity merged))) f


{-| A list field each of whose entries passes.
-}
entries : String -> Int -> D.Decoder Bool -> Fields -> Bool
entries key most entry f =
    field key (D.list (D.oneOf [ entry, D.succeed False ])) f
        |> Maybe.map (\oks -> List.length oks <= most && List.all identity oks)
        |> Maybe.withDefault False


{-| The record's numeric fields, each finite.
-}
finites : List String -> D.Decoder (List Float)
finites keys =
    List.foldr (\key -> D.map2 (::) (D.field key finite)) (D.succeed []) keys


histories : Fields -> Maybe Fields
histories f0 =
    let
        f : Fields
        f =
            f0 |> fillNullish "wake" (E.list identity []) |> fillNullish "soundBearings" (E.list identity []) |> fill "torpedoTracks" (E.list identity []) |> fillNullish "debrief" (E.list identity [])

        t : Float
        t =
            time f

        wake : D.Decoder Bool
        wake =
            finites [ "time", "width", "strength", "x", "y", "heading" ]
                |> D.map
                    (\vs ->
                        case vs of
                            [ at, width, strength, _, _, _ ] ->
                                at <= t && 0 <= width && 0 <= strength && strength <= 1

                            _ ->
                                False
                    )

        bearing : D.Decoder Bool
        bearing =
            D.map2
                (\vs kind ->
                    case vs of
                        [ b, at, _, _ ] ->
                            0 <= b && b < 360 && at <= t && (kind == "launch" || kind == "splashdown")

                        _ ->
                            False
                )
                (finites [ "bearing", "time", "x", "y" ])
                (D.field "kind" D.string)

        entry : D.Decoder Bool
        entry =
            D.map2 (\at words -> 0 <= at && at <= t && String.length words <= 220) (D.field "time" finite) (D.field "text" D.string)

        patrolId : Bool
        patrolId =
            case Dict.get "patrolId" f of
                Just _ ->
                    text "patrolId" f |> Maybe.map (\s -> String.length s == 32 && String.all (\c -> Char.isDigit c || List.member c [ 'a', 'b', 'c', 'd', 'e', 'f' ]) s) |> Maybe.withDefault False

                Nothing ->
                    True
    in
    ensure
        (entries "wake" 28 wake f
            && entries "soundBearings" 16 bearing f
            && field "torpedoTracks" (D.list D.value) f
            /= Nothing
            && validTracks t f
            && entries "debrief" 48 entry f
            && patrolId
        )
        f


echo : Float -> D.Decoder Bool
echo t =
    D.map3
        (\id vs inbound ->
            case vs of
                [ depth, speed, at, _, _ ] ->
                    safeInteger id && 0 < id && 0 <= depth && 0 <= speed && 0 <= at && at <= t && inbound

                _ ->
                    False
        )
        (D.field "id" finite)
        (finites [ "depth", "speed", "time", "x", "y" ])
        (D.field "inboundRun" D.bool |> D.map (\_ -> True))


{-| Torpedo tracks: at most 128 with distinct ids, each a valid echo with
one or two fixes, a course only after two and an arrival only with a course.
-}
validTracks : Float -> Fields -> Bool
validTracks t f =
    let
        track : D.Decoder Bool
        track =
            D.map5
                (\ok fixes active course arrival ->
                    case active of
                        [ activeAt, at, _, _ ] ->
                            ok
                                && (fixes == 1 || fixes == 2)
                                && 0
                                <= activeAt
                                && activeAt
                                <= at
                                && (case course of
                                        Nothing ->
                                            True

                                        Just c ->
                                            fixes == 2 && integer c && 0 <= c && c < 360
                                   )
                                && (case arrival of
                                        Nothing ->
                                            True

                                        Just a ->
                                            fixes == 2 && course /= Nothing && at <= a
                                   )

                        _ ->
                            False
                )
                (echo t)
                (D.field "fixes" D.float)
                (finites [ "activeAt", "time", "activeX", "activeY" ])
                (D.field "course" (D.nullable finite))
                (D.field "arrival" (D.nullable finite))

        ids : List (Maybe Float)
        ids =
            field "torpedoTracks" (D.list (D.oneOf [ D.field "id" D.float |> D.map Just, D.succeed Nothing ])) f |> Maybe.withDefault []

        distinct : List (Maybe Float) -> Bool
        distinct list =
            case list of
                first :: rest ->
                    not (List.member first rest) && distinct rest

                [] ->
                    True
    in
    entries "torpedoTracks" 128 track f && distinct ids


{-| The crew's watch after a launch, and the boat's own noisemaker.
-}
watches : Fields -> Maybe Fields
watches f =
    let
        t : Float
        t =
            time f
    in
    ensure
        (absentOr "crewQuietUntil" (\v -> 0 <= v && M.notLess (t + MessWatch.launchWatchSeconds) v) f
            && (case Dict.get "noisemaker" f of
                    Just v ->
                        D.decodeValue (savedReport False) v |> Result.toMaybe |> Maybe.map (HunterReports.validReport t False) |> Maybe.withDefault False

                    Nothing ->
                        True
               )
        )
        f


{-| Reconnaissance, the scope, the sky and a patrol record for older saves.
-}
defaults : Fields -> Maybe Fields
defaults f0 =
    let
        f1 : Fields
        f1 =
            f0 |> fill "recon" (ReconSaves.encode Recon.freshRecon) |> fill "reconArchivedSequence" (E.float 0)
    in
    if field "recon" ReconSaves.decoder f1 == Nothing then
        Nothing

    else
        let
            f2 : Fields
            f2 =
                f1 |> fill "scopeAngle" (E.float 0) |> fill "scopeSteerBearing" E.null |> environment

            seed : Maybe D.Value
            seed =
                field "environment" (D.field "seed" D.value) f2
        in
        f2
            |> fill "lightning" (E.list identity [])
            |> fill "acoustics" (E.list identity [])
            |> fill "nextLightningAt" (E.float (time f2 + 8))
            |> fill "soundSequence" (E.float 1)
            |> fill "patrol" (E.object (List.filterMap identity [ Maybe.map (Tuple.pair "seed") seed, Just ( "photoGoal", E.float 2 ), Just ( "trackGoal", E.float 180 ), Just ( "variant", E.float 0 ) ]))
            |> Just


{-| An older save's sky, from its patrol seed or else its random state, with
no chart.
-}
environment : Fields -> Fields
environment f =
    if Dict.member "environment" f then
        f

    else
        let
            patrolSeed : Maybe D.Value
            patrolSeed =
                field "patrol" (D.field "seed" D.value) f
                    |> Maybe.andThen
                        (\v ->
                            if D.decodeValue (D.null ()) v == Ok () then
                                Nothing

                            else
                                Just v
                        )

            seed : Float
            seed =
                case patrolSeed of
                    Just v ->
                        D.decodeValue D.float v |> Result.withDefault 0

                    Nothing ->
                        number "rng" f |> Maybe.withDefault 0

            made : Env.Config
            made =
                Env.makeEnvironment seed { timeOfDay = Nothing, weather = Nothing, changing = True }
        in
        Dict.insert "environment" (SaveParts.encodeConfig { made | chartSeed = Nothing }) f


{-| Restore's first half: checks and migrations up to the drone's newer
fields, or nothing when the save is refused.
-}
migrate : Fields -> Maybe Fields
migrate fields =
    header fields
        |> Maybe.andThen missionFields
        |> Maybe.andThen clocks
        |> Maybe.map normalizeDifficulty
        |> Maybe.andThen histories
        |> Maybe.andThen watches
        |> Maybe.andThen defaults
        |> Maybe.andThen plant
        |> Maybe.andThen stores
