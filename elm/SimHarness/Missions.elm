module SimHarness.Missions exposing (function)

{-| Harness entries for a patrol's mission at sea: a new patrol's seeded
layout, the objective with any rescue or survey worked as it is judged, and
the fleet action heard and recorded by the patrol.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.Missions as Missions
import Sim.Operation as Operation
import Sim.OrdnanceSaves exposing (encodeAirSupport)
import Sim.PatrolPhase as PatrolPhase
import Sim.SaveParts exposing (encodeBattle, encodeConvoy)
import Sim.Ship as Ship
import Sim.Site as Site
import SimHarness.Codec exposing (arg)
import SimHarness.Patrol as Patrol exposing (Patrol)


patrol : D.Decoder Patrol
patrol =
    arg 0 Patrol.decoder


nullable : (a -> E.Value) -> Maybe a -> E.Value
nullable encode =
    Maybe.map encode >> Maybe.withDefault E.null


point : { x : Float, y : Float } -> E.Value
point p =
    E.object [ ( "x", E.float p.x ), ( "y", E.float p.y ) ]


{-| The fields a mission's layout, objective or fleet action changes beyond
the boat's own; the convoy, the battle and the departure gate only when the
patrol has them.
-}
encodeWorld : Patrol -> E.Value
encodeWorld s =
    E.object
        (Patrol.encodeFields s
            ++ [ ( "ships", E.list Ship.encode s.ships )
               , ( "site", nullable Site.encode s.site )
               , ( "operation", nullable Operation.encode s.operation )
               , ( "home", point s.home )
               , ( "patrol", E.object [ ( "seed", E.float s.patrol.seed ), ( "startingTorpedoes", E.int s.patrol.startingTorpedoes ), ( "photoGoal", E.float s.patrol.photoGoal ), ( "trackGoal", E.float s.patrol.trackGoal ), ( "variant", E.int s.patrol.variant ) ] )
               , ( "phase", E.string (PatrolPhase.phaseName s.phase) )
               , ( "airSupport", encodeAirSupport s.airSupport )
               , ( "crewQuietUntil", E.float s.crewQuietUntil )
               , ( "trackTime", E.float s.trackTime )
               ]
            ++ List.filterMap identity
                [ Maybe.map (\c -> ( "convoy", encodeConvoy c )) s.convoy
                , Maybe.map (\b -> ( "battle", encodeBattle b )) s.battle
                , Maybe.map (\d -> ( "departure", point d )) s.departure
                ]
        )


{-| The functions this module answers for, by the TypeScript name each replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "missions.randomizePatrol" ->
            Just (D.map2 (\s seed -> encodeWorld (Missions.randomizePatrol seed s)) patrol (arg 1 D.float))

        "missions.objectiveComplete" ->
            Just (D.map2 (\s dt -> Missions.objectiveComplete dt s |> (\( met, after ) -> E.list identity [ E.bool met, encodeWorld after ])) patrol (arg 1 D.float))

        "missions.updateFleetBattle" ->
            Just (D.map (Missions.updateFleetBattle >> encodeWorld) patrol)

        _ ->
            Nothing
