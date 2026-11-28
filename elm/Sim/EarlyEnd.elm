module Sim.EarlyEnd exposing (Extraction, Outcome, earlyEndOffered, earlyEndRule, endPatrolEarly, extractionPrompt, insidePickup, outcomeName, partialCredit, partialSummary)

{-| Ending a patrol early at extraction: when the captain is asked, and what an
early end has earned. The mission definition owns each mission's rule.
-}

import PatrolMission exposing (EarlyEnd(..), Mission, Objective(..), PartialCredit(..))
import Sim.Carrier as Carrier
import Sim.Debrief as Debrief
import Sim.Math as M
import Sim.Mechanics as Mechanics exposing (LogEntry, LogKind(..))
import Sim.PatrolPhase exposing (Phase(..))
import Sim.Ship exposing (Ship)
import Sim.Status exposing (Status(..))
import Sim.Systems as Systems


{-| An early end with part of the objective complete, or with none of it.
-}
type Outcome
    = PartlyDone
    | NothingDone


outcomeName : Outcome -> String
outcomeName outcome =
    case outcome of
        PartlyDone ->
            "partial"

        NothingDone ->
            "withdrawn"


{-| The patrol fields an early end reads and writes.
-}
type alias Extraction s q ph o =
    { s
        | x : Float
        , y : Float
        , mission : Mission
        , status : Status
        , phase : Phase
        , depth : Float
        , time : Float
        , home : { x : Float, y : Float }
        , patrol : { q | photoGoal : Float, trackGoal : Float }
        , photos : List ph
        , trackTime : Float
        , ships : List Ship
        , operation : Maybe { o | rescued : Float, scan : Float, photoAngles : List Float }
        , events : List LogEntry
        , debrief : List Debrief.Entry
    }


{-| Surfacing inside this radius of extraction completes a finished patrol.
-}
pickupRadius : Float
pickupRadius =
    400


earlyEndRule : Mission -> Maybe PartialCredit
earlyEndRule mission =
    case (PatrolMission.briefing mission).earlyEnd of
        NoEarlyEnd ->
            Nothing

        EndEarly credit ->
            Just credit


{-| The briefed targets of a sinking objective. Only sinking missions give
credit for sunk targets or a foundering carrier (the TypeScript throws on any
other, and the differential tests call it for every mission), so any other
objective has none.
-}
briefedTargets : Mission -> List String
briefedTargets mission =
    case (PatrolMission.briefing mission).objective of
        SinkShips first rest ->
            first :: rest

        SinkCarrier carrier _ ->
            [ carrier ]

        _ ->
            []


{-| The seconds of scanning a wreck survey asks for; only survey missions
have one.
-}
surveySeconds : Mission -> Maybe Float
surveySeconds mission =
    case (PatrolMission.briefing mission).objective of
        SurveyWreck criteria ->
            Just criteria.scanSeconds

        _ ->
            Nothing


insidePickup : { s | x : Float, y : Float, home : { x : Float, y : Float } } -> Bool
insidePickup s =
    Mechanics.distance s s.home < pickupRadius


{-| Surfaced inside the pickup circle with the objective still open, on a
mission whose extraction does not already end the patrol.
-}
earlyEndOffered : Extraction s q ph o -> Bool
earlyEndOffered s =
    s.status == Patrol && s.phase == Objective && earlyEndRule s.mission /= Nothing && insidePickup s && s.depth <= 1


shipById : String -> List Ship -> Maybe Ship
shipById id ships =
    List.filter (\v -> v.id == id) ships |> List.head


sunkTargets : Extraction s q ph o -> Int
sunkTargets s =
    briefedTargets s.mission
        |> List.filter (\id -> Maybe.map (.hull >> M.isZero) (shipById id s.ships) |> Maybe.withDefault False)
        |> List.length


partialCredit : Extraction s q ph o -> Bool
partialCredit s =
    case earlyEndRule s.mission of
        Nothing ->
            False

        Just NoPartialCredit ->
            False

        Just (PhotographsTaken atLeast) ->
            atLeast <= List.length s.photos

        Just (TargetsSunk atLeast) ->
            atLeast <= sunkTargets s

        Just CarrierFoundering ->
            -- A carrier's hits only come in whole numbers, and against a whole
            -- threshold flooring a count does not change the comparison.
            List.any (\id -> Carrier.carrierDoomed { directHits = shipById id s.ships |> Maybe.andThen .directHits |> Maybe.withDefault 0 |> floor }) (briefedTargets s.mission)

        Just (SurvivorsAboard atLeast) ->
            M.notLess (Maybe.map .rescued s.operation |> Maybe.withDefault 0) (toFloat atLeast)

        Just (ScanShareOrPhotographs share photographs) ->
            case s.operation of
                Just operation ->
                    (surveySeconds s.mission |> Maybe.map (\seconds -> M.notLess operation.scan (share * seconds)) |> Maybe.withDefault False)
                        || photographs
                        <= List.length operation.photoAngles

                Nothing ->
                    False

        Just (TrackingShare share) ->
            M.notLess s.trackTime (share * s.patrol.trackGoal)


{-| Ask once per entry into the pickup circle: asking disarms the prompt, and
only leaving the circle arms it again.
-}
extractionPrompt : Bool -> Extraction s q ph o -> { ask : Bool, armed : Bool }
extractionPrompt armed s =
    if not (insidePickup s) then
        { ask = False, armed = True }

    else if armed && earlyEndOffered s then
        { ask = True, armed = False }

    else
        { ask = False, armed = armed }


{-| The captain's order to end the patrol now: the outcome, or `Nothing` when
the order no longer applies.
-}
endPatrolEarly : Extraction s q ph o -> ( Maybe Outcome, Extraction s q ph o )
endPatrolEarly s =
    if not (earlyEndOffered s) then
        ( Nothing, s )

    else if partialCredit s then
        ( Just PartlyDone
        , { s | status = Partial }
            |> Mechanics.log "Patrol ended at extraction with part of the objective complete." Success
            |> Systems.addDebrief "You ended the patrol at extraction with part of the objective complete."
        )

    else
        ( Just NothingDone
        , { s | status = Withdrawn }
            |> Mechanics.log "Patrol ended at extraction. The objective was not met." Warning
            |> Systems.addDebrief "You ended the patrol at extraction before any part of the objective was met."
        )


{-| What came home from a patrol ended early with partial credit; `Nothing`
for a mission without partial credit, where the TypeScript throws.
-}
partialSummary : Extraction s q ph o -> Maybe String
partialSummary s =
    case earlyEndRule s.mission of
        Nothing ->
            Nothing

        Just NoPartialCredit ->
            Nothing

        Just (PhotographsTaken _) ->
            Just (String.fromInt (List.length s.photos) ++ " of " ++ String.fromFloat s.patrol.photoGoal ++ " merchant photographs came home.")

        Just (TargetsSunk _) ->
            Just (String.fromInt (sunkTargets s) ++ " of " ++ String.fromInt (List.length (briefedTargets s.mission)) ++ " military transports sank before you withdrew.")

        Just CarrierFoundering ->
            Just "The carrier was already sinking when you withdrew."

        Just (SurvivorsAboard _) ->
            Just (String.fromFloat (Maybe.map .rescued s.operation |> Maybe.withDefault 0) ++ " survivors came home with you.")

        Just (ScanShareOrPhotographs _ _) ->
            Just "Part of the wreck survey came home."

        Just (TrackingShare _) ->
            Just (String.fromInt (floor s.trackTime) ++ " of " ++ String.fromFloat s.patrol.trackGoal ++ " seconds of convoy tracking came home.")
