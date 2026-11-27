module SimHarness.World exposing (function)

{-| Harness entries for the calendar and the chart. -}

import Json.Decode as D
import Json.Encode as E
import Sim.Coast as Coast
import Sim.PatrolCalendar as Calendar
import SimHarness.Codec exposing (arg, call1, call2, call3, point)


encodeDay : Calendar.Day -> E.Value
encodeDay d =
    E.object
        [ ( "date", E.string d.date )
        , ( "holiday"
          , case d.holiday of
                Just Calendar.NewYear ->
                    E.string "new-year"

                Just Calendar.Christmas ->
                    E.string "christmas"

                Nothing ->
                    E.null
          )
        , ( "day", E.int d.day )
        , ( "cycle", E.float d.cycle )
        , ( "illumination", E.float d.illumination )
        ]


{-| The functions this module answers for, by the TypeScript name each replaces. -}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "patrolCalendar.constants" ->
            Just (D.succeed (E.object [ ( "DAY_SECONDS", E.float Calendar.daySeconds ) ]))

        "patrolCalendar.sailingDay" ->
            Just (call1 D.float E.int Calendar.sailingDay)

        "patrolCalendar.moonCycle" ->
            Just (call1 D.float E.float Calendar.moonCycle)

        "patrolCalendar.patrolCalendar" ->
            Just (call3 D.float D.float D.float encodeDay Calendar.patrolCalendar)

        "coast.chartDepth" ->
            Just (D.map3 (\x y seed -> E.float (Coast.chartDepth (Maybe.map Coast.coastline seed) x y)) (arg 0 D.float) (arg 1 D.float) (arg 2 (D.nullable D.float)))

        "coast.shelfOutcrops" ->
            Just
                (call2 point
                    D.float
                    (E.list (\o -> E.object [ ( "x", E.float o.x ), ( "y", E.float o.y ), ( "length", E.float o.length ), ( "width", E.float o.width ), ( "height", E.float o.height ), ( "heading", E.float o.heading ) ]))
                    Coast.shelfOutcrops
                )

        _ ->
            Nothing
