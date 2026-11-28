module SimHarness.Objectives exposing (encodeSearch, function, searchArea)

{-| Harness entries for mission objectives and the periscope. Each uses the
mission definition's own criteria, as the TypeScript does.
-}

import Json.Decode as D
import Json.Encode as E
import PatrolCriteria
import PatrolMission
import Sim.ConvoyTracking as ConvoyTracking
import Sim.PatrolSearch as Search
import Sim.Periscope as Periscope
import Sim.ReconPhotos as ReconPhotos
import Sim.RescueOperation as Rescue
import Sim.Site as Site
import Sim.Vessel as Vessel
import Sim.WreckSurvey as WreckSurvey
import SimHarness.Codec exposing (andMap, arg, call1, call2, call3, flag, vesselKind)


listener : D.Decoder (ConvoyTracking.Listener {} {})
listener =
    D.succeed (\x y noise depth sonar ships -> { x = x, y = y, noise = noise, depth = depth, sonar = sonar, ships = ships })
        |> andMap (D.field "x" D.float)
        |> andMap (D.field "y" D.float)
        |> andMap (D.field "noise" D.float)
        |> andMap (D.field "depth" D.float)
        |> andMap (D.at [ "systems", "sonar" ] D.float)
        |> andMap
            (D.field "ships"
                (D.list
                    (D.map5 (\x y kind hull incidental -> { x = x, y = y, kind = kind, hull = hull, incidental = incidental })
                        (D.field "x" D.float)
                        (D.field "y" D.float)
                        (D.field "kind" vesselKind)
                        (D.field "hull" D.float)
                        (flag "incidental")
                    )
                )
            )


surveyPass : D.Decoder WreckSurvey.SurveyPass
surveyPass =
    D.map4 WreckSurvey.SurveyPass (D.field "range" D.float) (D.field "vertical" D.float) (D.field "speed" D.float) (D.field "sonar" D.float)


scope : D.Decoder (Periscope.Scope {})
scope =
    D.map2 (\raised travel -> { scope = raised, scopeTravel = travel }) (D.field "scope" D.bool) (D.maybe (D.field "scopeTravel" D.float))


{-| A site kind, or null for none, as the TypeScript's optional string; an
unknown string reads as the undersea rules, as it does there.
-}
siteKind : D.Decoder (Maybe Site.Kind)
siteKind =
    D.nullable D.string
        |> D.map
            (Maybe.andThen
                (\name ->
                    case name of
                        "surface" ->
                            Just Site.SurfaceCasualty

                        "wreck" ->
                            Just Site.SurveyWreck

                        "sub" ->
                            Just Site.DownedSubmarine

                        _ ->
                            Nothing
                )
            )


rescue : D.Decoder PatrolCriteria.RescueCriteria
rescue =
    D.string
        |> D.andThen
            (\name ->
                case name of
                    "surface" ->
                        D.succeed PatrolCriteria.surfaceRescue

                    "undersea" ->
                        D.succeed PatrolCriteria.underseaRescue

                    _ ->
                        D.fail ("unknown rescue " ++ name)
            )


encodeRescue : PatrolCriteria.RescueCriteria -> E.Value
encodeRescue c =
    E.object
        [ ( "closestRange", E.float c.closestRange )
        , ( "farthestRange", E.float c.farthestRange )
        , ( "depthTolerance", E.float c.depthTolerance )
        , ( "fastestKnots", E.float c.fastestKnots )
        , ( "assessmentSeconds", E.float c.assessmentSeconds )
        , ( "transferSeconds", E.float c.transferSeconds )
        , ( "returnSeconds", E.float c.returnSeconds )
        , ( "emptySiteChance", E.float c.emptySiteChance )
        , ( "fewestSurvivors", E.int c.fewestSurvivors )
        , ( "survivorSpread", E.int c.survivorSpread )
        , ( "casualtyClockStart", E.float c.casualtyClockStart )
        , ( "firstLossDelay", E.float c.firstLossDelay )
        , ( "firstLossSpread", E.float c.firstLossSpread )
        , ( "laterLossDelay", E.float c.laterLossDelay )
        , ( "laterLossSpread", E.float c.laterLossSpread )
        , ( "sinking"
          , c.sinking
                |> Maybe.map
                    (\s ->
                        E.object
                            [ ( "startDepth", E.float s.startDepth )
                            , ( "settleSeconds", E.float s.settleSeconds )
                            , ( "foundersAfter", E.float s.foundersAfter )
                            , ( "foundersSpread", E.float s.foundersSpread )
                            , ( "sinkRate", E.float s.sinkRate )
                            , ( "lostBelow", E.float s.lostBelow )
                            ]
                    )
                |> Maybe.withDefault E.null
          )
        ]


mission : D.Decoder PatrolMission.Mission
mission =
    D.string |> D.andThen (\id -> PatrolMission.fromId id |> Maybe.map D.succeed |> Maybe.withDefault (D.fail ("unknown mission " ++ id)))


{-| A ship as the search reads it. A missing flag is false and an unknown
side is none, as the TypeScript's comparisons treat them.
-}
traffic : D.Decoder (Search.Traffic {})
traffic =
    D.succeed (\x y id kind military incidental side -> { x = x, y = y, id = id, kind = kind, military = military, incidental = incidental, side = side })
        |> andMap (D.field "x" D.float)
        |> andMap (D.field "y" D.float)
        |> andMap (D.field "id" D.string)
        |> andMap (D.field "kind" vesselKind)
        |> andMap (flag "military")
        |> andMap (flag "incidental")
        |> andMap
            (D.maybe (D.field "side" D.string)
                |> D.map
                    (Maybe.andThen
                        (\side ->
                            case side of
                                "friendly" ->
                                    Just Vessel.Friendly

                                "hostile" ->
                                    Just Vessel.Hostile

                                _ ->
                                    Nothing
                        )
                    )
            )


{-| The patrol setup: mission, seed, ships and an optional site.
-}
setup : D.Decoder { mission : PatrolMission.Mission, seed : Float, ships : List (Search.Traffic {}), site : Maybe Search.Point }
setup =
    D.map4 (\m seed ships site -> { mission = m, seed = seed, ships = ships, site = site })
        (D.field "mission" mission)
        (D.at [ "patrol", "seed" ] D.float)
        (D.field "ships" (D.list traffic))
        (D.field "site" (D.nullable (D.map2 Search.Point (D.field "x" D.float) (D.field "y" D.float))))


searchArea : D.Decoder Search.SearchArea
searchArea =
    D.succeed Search.SearchArea
        |> andMap (D.field "x" D.float)
        |> andMap (D.field "y" D.float)
        |> andMap (D.field "radius" D.float)
        |> andMap (D.field "targets" (D.list D.string))
        |> andMap (D.field "recognized" (D.list D.string))
        |> andMap (D.field "located" D.bool)
        |> andMap (D.field "activeSeconds" D.float)
        |> andMap (D.field "protectedTime" D.float)


encodeSearch : Search.SearchArea -> E.Value
encodeSearch a =
    E.object
        [ ( "x", E.float a.x )
        , ( "y", E.float a.y )
        , ( "radius", E.float a.radius )
        , ( "targets", E.list E.string a.targets )
        , ( "recognized", E.list E.string a.recognized )
        , ( "located", E.bool a.located )
        , ( "activeSeconds", E.float a.activeSeconds )
        , ( "protectedTime", E.float a.protectedTime )
        ]


encodeApproach : Search.Approach -> E.Value
encodeApproach a =
    E.object
        ([ ( "x", E.float a.x ), ( "y", E.float a.y ), ( "heading", E.float a.heading ), ( "targetHeading", E.float a.targetHeading ), ( "search", encodeSearch a.search ) ]
            ++ (a.home |> Maybe.map (\p -> [ ( "home", E.object [ ( "x", E.float p.x ), ( "y", E.float p.y ) ] ) ]) |> Maybe.withDefault [])
        )


encodeScope : Periscope.Scope {} -> E.Value
encodeScope s =
    E.object (( "scope", E.bool s.scope ) :: (s.scopeTravel |> Maybe.map (\t -> [ ( "scopeTravel", E.float t ) ]) |> Maybe.withDefault []))


{-| The surface rescue's sinking casualty, the only one the missions define.
-}
sinking : PatrolCriteria.SinkingCasualty
sinking =
    PatrolCriteria.surfaceRescue.sinking
        |> Maybe.withDefault { startDepth = 0 / 0, settleSeconds = 0 / 0, foundersAfter = 0 / 0, foundersSpread = 0 / 0, sinkRate = 0 / 0, lostBelow = 0 / 0 }


{-| The functions this module answers for, by the TypeScript name each replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "reconPhotos.photoGoal" ->
            Just (call1 D.float E.int (\roll -> ReconPhotos.photoGoal roll PatrolCriteria.merchantPhotos))

        "reconPhotos.framed" ->
            Just (call1 D.float E.bool (\offset -> ReconPhotos.framed offset PatrolCriteria.merchantPhotos))

        "convoyTracking.trackingGoal" ->
            Just (call1 D.float E.int (\roll -> ConvoyTracking.trackingGoal roll PatrolCriteria.convoyTracking))

        "convoyTracking.trackingConvoy" ->
            Just (call1 listener E.bool (\s -> ConvoyTracking.trackingConvoy s PatrolCriteria.convoyTracking))

        "wreckSurvey.scanRate" ->
            Just (call1 surveyPass E.float (\pass -> WreckSurvey.scanRate pass PatrolCriteria.surveyCriteria))

        "wreckSurvey.addScan" ->
            Just (call3 D.float D.float D.float E.float (\scan rate dt -> WreckSurvey.addScan scan rate dt PatrolCriteria.surveyCriteria))

        "wreckSurvey.surveyComplete" ->
            Just
                (call1 (D.map2 (\scan angles -> { scan = scan, photoAngles = angles }) (D.field "scan" D.float) (D.field "photoAngles" (D.list D.float)))
                    E.bool
                    (\op -> WreckSurvey.surveyComplete op PatrolCriteria.surveyCriteria)
                )

        "rescueOperation.rescueCriteriaFor" ->
            Just (call1 siteKind encodeRescue Rescue.criteriaFor)

        "rescueOperation.casualtyDepth" ->
            Just
                (D.map3 (\age roll resting -> E.float (Rescue.casualtyDepth age roll sinking resting)) (arg 0 D.float) (arg 1 D.float) (arg 2 D.float))

        "rescueOperation.initialSurvivors" ->
            Just (call3 D.float D.float rescue E.int Rescue.initialSurvivors)

        "rescueOperation.nextLossDelay" ->
            Just (call3 D.int D.float rescue E.float Rescue.nextLossDelay)

        "rescueOperation.stationKeeping" ->
            Just
                (D.map4 (\range speed error c -> (\k -> E.object [ ( "onStation", E.bool k.onStation ), ( "holding", E.bool k.holding ) ]) (Rescue.stationKeeping range speed error c))
                    (arg 0 D.float)
                    (arg 1 D.float)
                    (arg 2 D.float)
                    (arg 3 rescue)
                )

        "patrolSearch.longPatrol" ->
            Just (call1 setup encodeApproach (\s -> Search.longPatrol s.mission s.seed s.site s.ships))

        "patrolSearch.advanceApproach" ->
            Just (call3 searchArea D.float D.float (\( advanced, a ) -> E.object [ ( "advanced", E.bool advanced ), ( "search", encodeSearch a ) ]) (\a dt rate -> Search.advanceApproach dt rate a))

        "patrolSearch.approachProgress" ->
            Just (call1 searchArea E.float Search.approachProgress)

        "patrolSearch.validSearch" ->
            Just
                (D.map3
                    (\s time area -> E.bool (Maybe.map (Search.validSearch s.mission s.site s.ships time) area |> Maybe.withDefault False))
                    (arg 0 setup)
                    (arg 0 (D.field "time" D.float))
                    (arg 0 (D.maybe (D.field "search" searchArea)))
                )

        "periscope.scopeExtension" ->
            Just (call1 scope E.float Periscope.scopeExtension)

        "periscope.scopeEyeHeight" ->
            Just (call1 scope E.float Periscope.scopeEyeHeight)

        "periscope.orderScope" ->
            Just (call2 scope D.bool encodeScope (\s raised -> Periscope.orderScope raised s))

        "periscope.advanceScope" ->
            Just (call2 scope D.float encodeScope (\s seconds -> Periscope.advanceScope seconds s))

        _ ->
            Nothing
