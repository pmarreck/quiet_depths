module Sim.PatrolCalendar exposing (Day, Holiday(..), daySeconds, moonCycle, patrolCalendar, sailingDay)

{-| The patrol's calendar in 1972: the date each patrol second falls on, the
holidays, and the moon's phase from NASA's table of primary phases.
-}

import Array exposing (Array)
import Bitwise
import Sim.SurfaceMotion exposing (hash01)


{-| Seconds in a patrol day. -}
daySeconds : Float
daySeconds =
    2880


{-| Successive primary phases, beginning with new moon on 17 December 1971,
in minutes from 1972-01-01 0000 UTC. NASA, Phases of the Moon 1901–2000:
<https://eclipse.gsfc.nasa.gov/phase/phases1901.html>
-}
phases : Array Float
phases =
    Array.fromList
        [ -20457, -9985, -220, 10891, 22252, 32249, 42418, 53951, 64829, 74480, 85152, 96905, 107255, 116772, 127925, 139664
        , 149551, 159165, 170684, 182186, 191768, 201676, 213387, 224482, 233970, 244301, 256006, 266605, 276219, 287026, 298523, 308642
        , 318566, 329829, 340942, 350688, 361048, 372673, 383287, 392836, 403688, 415495, 425605, 435161, 446481, 458221, 467947, 477705
        , 489384, 500796, 510345, 520467, 532302, 543207, 552808, 563405
        ]


phaseAt : Int -> Float
phaseAt i =
    Array.get i phases |> Maybe.withDefault (0 / 0)


{-| The day of 1972 a patrol sails, from its seed. -}
sailingDay : Float -> Int
sailingDay seed =
    floor (hash01 seed 1972366 * 366)


{-| The moon's age as a fraction of its cycle, 0 at new moon. -}
moonCycle : Float -> Float
moonCycle day =
    let
        minute =
            day * 1440

        search lo hi =
            if hi - lo > 1 then
                let
                    mid =
                        Bitwise.shiftRightBy 1 (lo + hi)
                in
                if phaseAt mid <= minute then
                    search mid hi

                else
                    search lo mid

            else
                lo

        lo0 =
            search 0 (Array.length phases - 1)

        phase =
            (toFloat lo0 + (minute - phaseAt lo0) / (phaseAt (lo0 + 1) - phaseAt lo0)) / 4
    in
    phase - toFloat (floor phase)


type Holiday
    = NewYear
    | Christmas


type alias Day =
    { date : String, holiday : Maybe Holiday, day : Int, cycle : Float, illumination : Float }


monthNames : Array String
monthNames =
    Array.fromList [ "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC" ]


{-| Year, month (1 to 12) and day of the month for a count of days from
1970-01-01, in the proleptic Gregorian calendar JavaScript's Date uses.
Howard Hinnant, chrono-compatible low-level date algorithms:
<https://howardhinnant.github.io/date_algorithms.html#civil_from_days>
-}
civilFromDays : Int -> ( Int, Int, Int )
civilFromDays days =
    let
        z =
            days + 719468

        era =
            (if z >= 0 then
                z

             else
                z - 146096
            )
                // 146097

        dayOfEra =
            z - era * 146097

        yearOfEra =
            (dayOfEra - dayOfEra // 1460 + dayOfEra // 36524 - dayOfEra // 146096) // 365

        dayOfYear =
            dayOfEra - (365 * yearOfEra + yearOfEra // 4 - yearOfEra // 100)

        shifted =
            (5 * dayOfYear + 2) // 153

        dayOfMonth =
            dayOfYear - (153 * shifted + 2) // 5 + 1

        month =
            if shifted < 10 then
                shifted + 3

            else
                shifted - 9

        year =
            yearOfEra
                + era
                * 400
                + (if month <= 2 then
                    1

                   else
                    0
                  )
    in
    ( year, month, dayOfMonth )


{-| 1972-01-01 is day 730 after 1970-01-01. -}
patrolCalendar : Float -> Float -> Float -> Day
patrolCalendar startDay startHour time =
    let
        day =
            startDay + startHour / 24 + time / daySeconds

        index =
            floor day

        ( year, month, date ) =
            civilFromDays (index + 730)

        cycle =
            moonCycle day
    in
    { date = String.padLeft 2 '0' (String.fromInt date) ++ " " ++ (Array.get (month - 1) monthNames |> Maybe.withDefault "") ++ " " ++ String.fromInt year
    , holiday =
        if month == 1 && date == 1 then
            Just NewYear

        else if month == 12 && date == 25 then
            Just Christmas

        else
            Nothing
    , day = index
    , cycle = cycle
    , illumination = (1 - cos (2 * pi * cycle)) / 2
    }
