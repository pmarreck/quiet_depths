module Sim.PatrolReports exposing (Finding, Report, WreckMark, disciplinaryFinding, hearWreck, recordCivilianHit, report)

{-| The crew's spoken reports, the record of fire that strikes civilians or
allies and the finding it brings at the end of a patrol, and the wreck site a
single acoustic report plots.
-}

import Sim.Debrief as Debrief
import Sim.Mechanics as Mechanics exposing (LogEntry, LogKind(..))
import Sim.SurfaceMotion exposing (hash01)


type alias Report =
    { id : String, text : String, time : Float }


{-| A report replaces any earlier one with its id; reports older than 18 s
are dropped. Each also goes into the log.
-}
report : String -> String -> { s | time : Float, reports : List Report, events : List LogEntry } -> { s | time : Float, reports : List Report, events : List LogEntry }
report id text s =
    Mechanics.log text Info { s | reports = List.filter (\r -> r.id /= id && s.time - r.time < 18) s.reports ++ [ { id = id, text = text, time = s.time } ] }


{-| Only a vessel's first civilian hit is recorded.
-}
recordCivilianHit : String -> { s | time : Float, debrief : List Debrief.Entry } -> { v | neutralHitAt : Maybe Float } -> ( { s | time : Float, debrief : List Debrief.Entry }, { v | neutralHitAt : Maybe Float } )
recordCivilianHit cause s ship =
    case ship.neutralHitAt of
        Just _ ->
            ( s, ship )

        Nothing ->
            ( { s | debrief = Debrief.add s.time cause s.debrief }, { ship | neutralHitAt = Just s.time } )


type alias Finding =
    { title : String, angle : Float, reason : String }


disciplinaryFinding : Float -> List { v | name : String, military : Bool, side : Maybe String, playerDamaged : Bool, neutralHitAt : Maybe Float } -> Maybe Finding
disciplinaryFinding seed ships =
    let
        civilians : List { v | military : Bool, name : String, neutralHitAt : Maybe Float, playerDamaged : Bool, side : Maybe String }
        civilians =
            List.filter (\v -> not v.military && v.neutralHitAt /= Nothing) ships

        allies : List { v | military : Bool, name : String, neutralHitAt : Maybe Float, playerDamaged : Bool, side : Maybe String }
        allies =
            List.filter (\v -> v.side == Just "friendly" && v.playerDamaged) ships

        struck : String -> List { v | name : String, military : Bool, side : Maybe String, playerDamaged : Bool, neutralHitAt : Maybe Float } -> Maybe String
        struck heading vessels =
            if List.isEmpty vessels then
                Nothing

            else
                Just (heading ++ " Your fire struck " ++ String.join ", " (List.map .name vessels) ++ ".")
    in
    if List.isEmpty civilians && List.isEmpty allies then
        Nothing

    else
        Just
            { title =
                if hash01 seed 951 < 0.5 then
                    "COURT MARTIALED"

                else
                    "RANK DEMOTION"
            , angle =
                (if hash01 seed 952 < 0.5 then
                    -1

                 else
                    1
                )
                    * (3 + 17 * hash01 seed 953)
            , reason = String.join " " (List.filterMap identity [ struck "Civilian casualties." civilians, struck "Friendly fire." allies ])
            }


type alias WreckMark =
    { x : Float, y : Float, observed : Bool }


{-| A single acoustic report plots an approximate site, even for an unknown
hull. A wreck already marked keeps its mark.
-}
hearWreck : { s | x : Float, y : Float } -> { id : Float, vessel : Maybe String, x : Float, y : Float } -> List { v | id : String, wreckMark : Maybe WreckMark } -> List { v | id : String, wreckMark : Maybe WreckMark }
hearWreck s source ships =
    case ships of
        [] ->
            []

        ship :: rest ->
            if Just ship.id /= source.vessel then
                ship :: hearWreck s source rest

            else if ship.wreckMark /= Nothing then
                ships

            else
                let
                    angle : Float
                    angle =
                        Mechanics.rad (Mechanics.bearing s source + (hash01 source.id 51 - 0.5) * 7)

                    estimate : Float
                    estimate =
                        Mechanics.distance s source * (0.89 + 0.22 * hash01 source.id 52)
                in
                { ship | wreckMark = Just { x = s.x + sin angle * estimate, y = s.y + cos angle * estimate, observed = False } } :: rest
