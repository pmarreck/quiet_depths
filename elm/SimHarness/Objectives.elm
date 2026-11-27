module SimHarness.Objectives exposing (function)

{-| Harness entries for mission objectives and the periscope. Each uses the
mission definition's own criteria, as the TypeScript does.
-}

import Json.Decode as D
import Json.Encode as E
import PatrolMission
import Sim.ConvoyTracking as ConvoyTracking
import Sim.Periscope as Periscope
import Sim.ReconPhotos as ReconPhotos
import Sim.RescueOperation as Rescue
import Sim.Site as Site
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


rescue : D.Decoder PatrolMission.RescueCriteria
rescue =
    D.string
        |> D.andThen
            (\name ->
                case name of
                    "surface" ->
                        D.succeed PatrolMission.surfaceRescue

                    "undersea" ->
                        D.succeed PatrolMission.underseaRescue

                    _ ->
                        D.fail ("unknown rescue " ++ name)
            )


encodeRescue : PatrolMission.RescueCriteria -> E.Value
encodeRescue c =
    E.object
        [ ( "closestRange", E.float c.closestRange ), ( "farthestRange", E.float c.farthestRange ), ( "depthTolerance", E.float c.depthTolerance )
        , ( "fastestKnots", E.float c.fastestKnots ), ( "assessmentSeconds", E.float c.assessmentSeconds ), ( "transferSeconds", E.float c.transferSeconds )
        , ( "returnSeconds", E.float c.returnSeconds ), ( "emptySiteChance", E.float c.emptySiteChance ), ( "fewestSurvivors", E.int c.fewestSurvivors )
        , ( "survivorSpread", E.int c.survivorSpread ), ( "casualtyClockStart", E.float c.casualtyClockStart ), ( "firstLossDelay", E.float c.firstLossDelay )
        , ( "firstLossSpread", E.float c.firstLossSpread ), ( "laterLossDelay", E.float c.laterLossDelay ), ( "laterLossSpread", E.float c.laterLossSpread )
        , ( "sinking"
          , c.sinking
                |> Maybe.map
                    (\s ->
                        E.object
                            [ ( "startDepth", E.float s.startDepth ), ( "settleSeconds", E.float s.settleSeconds ), ( "foundersAfter", E.float s.foundersAfter )
                            , ( "foundersSpread", E.float s.foundersSpread ), ( "sinkRate", E.float s.sinkRate ), ( "lostBelow", E.float s.lostBelow )
                            ]
                    )
                |> Maybe.withDefault E.null
          )
        ]


encodeScope : Periscope.Scope {} -> E.Value
encodeScope s =
    E.object (( "scope", E.bool s.scope ) :: (s.scopeTravel |> Maybe.map (\t -> [ ( "scopeTravel", E.float t ) ]) |> Maybe.withDefault []))


{-| The surface rescue's sinking casualty, the only one the missions define. -}
sinking : PatrolMission.SinkingCasualty
sinking =
    PatrolMission.surfaceRescue.sinking
        |> Maybe.withDefault { startDepth = 0 / 0, settleSeconds = 0 / 0, foundersAfter = 0 / 0, foundersSpread = 0 / 0, sinkRate = 0 / 0, lostBelow = 0 / 0 }


{-| The functions this module answers for, by the TypeScript name each replaces. -}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "reconPhotos.photoGoal" ->
            Just (call1 D.float E.int (\roll -> ReconPhotos.photoGoal roll PatrolMission.merchantPhotos))

        "reconPhotos.framed" ->
            Just (call1 D.float E.bool (\offset -> ReconPhotos.framed offset PatrolMission.merchantPhotos))

        "convoyTracking.trackingGoal" ->
            Just (call1 D.float E.int (\roll -> ConvoyTracking.trackingGoal roll PatrolMission.convoyTracking))

        "convoyTracking.trackingConvoy" ->
            Just (call1 listener E.bool (\s -> ConvoyTracking.trackingConvoy s PatrolMission.convoyTracking))

        "wreckSurvey.scanRate" ->
            Just (call1 surveyPass E.float (\pass -> WreckSurvey.scanRate pass PatrolMission.surveyCriteria))

        "wreckSurvey.addScan" ->
            Just (call3 D.float D.float D.float E.float (\scan rate dt -> WreckSurvey.addScan scan rate dt PatrolMission.surveyCriteria))

        "wreckSurvey.surveyComplete" ->
            Just
                (call1 (D.map2 (\scan angles -> { scan = scan, photoAngles = angles }) (D.field "scan" D.float) (D.field "photoAngles" (D.list D.float)))
                    E.bool
                    (\op -> WreckSurvey.surveyComplete op PatrolMission.surveyCriteria)
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
