module SimHarness.Recon exposing (function)

{-| Harness entries for orbital reconnaissance: requests, each moment of a
task, the panel, the radio link, and saved tasks. The conditions come from
the same patrol through the world harness's environment decoder.
-}

import Json.Decode as D
import Json.Encode as E
import Sim.Environment as Env
import Sim.Recon as Recon exposing (Recon)
import Sim.ReconPasses as ReconPasses
import Sim.ReconSaves as ReconSaves
import Sim.Ship as Ship exposing (Ship)
import Sim.Status as Status
import Sim.Systems exposing (Difficulty)
import SimHarness.Codec exposing (arg)
import SimHarness.Fleet exposing (optional)
import SimHarness.HostileTracks as HostileTracks
import SimHarness.World as World


type alias World =
    { status : Status.Status
    , time : Float
    , depth : Float
    , recon : Maybe Recon
    , ships : List Ship
    , difficulty : Maybe Difficulty
    , patrol : { seed : Float }
    , wavePhase : Maybe Float
    }


named : (a -> String) -> List a -> D.Decoder a
named name values =
    D.string
        |> D.andThen
            (\text ->
                case List.filter (\v -> name v == text) values of
                    v :: _ ->
                        D.succeed v

                    [] ->
                        D.fail ("unknown name " ++ text)
            )


world : D.Decoder World
world =
    arg 0
        (D.field "time" D.float
            |> D.andThen
                (\now ->
                    D.map8 World
                        (D.field "status" (named Status.statusName Status.statuses))
                        (D.succeed now)
                        (D.field "depth" D.float)
                        (optional "recon" ReconSaves.decoder)
                        (D.field "ships" (D.list (Ship.decoder now)))
                        (optional "difficulty" HostileTracks.difficulty)
                        (D.map (\seed -> { seed = seed }) (D.at [ "patrol", "seed" ] D.float))
                        (optional "wavePhase" D.float)
                )
        )


environment : D.Decoder Env.Environment
environment =
    arg 0 (D.map Env.environmentAt World.boat)


encodeRecon : Maybe Recon -> E.Value
encodeRecon recon =
    Maybe.map ReconSaves.encode recon |> Maybe.withDefault E.null


encodeArea : Recon.Area -> E.Value
encodeArea area =
    E.object [ ( "x", E.float area.x ), ( "y", E.float area.y ), ( "size", E.float Recon.footprint ) ]


displayArea : D.Decoder Recon.Area
displayArea =
    D.map2 (\x y -> { x = x, y = y }) (D.field "x" D.float) (D.field "y" D.float)


{-| A requested square, or nothing when the request names no numeric square.
-}
candidate : D.Decoder (Maybe { x : Float, y : Float, size : Float })
candidate =
    D.oneOf [ D.map3 (\x y size -> Just { x = x, y = y, size = size }) (D.field "x" D.float) (D.field "y" D.float) (D.field "size" D.float), D.succeed Nothing ]


{-| The functions this module answers for, by the TypeScript name each replaces.
-}
function : String -> Maybe (D.Decoder E.Value)
function name =
    case name of
        "recon.freshRecon" ->
            Just (D.succeed (ReconSaves.encode Recon.freshRecon))

        "recon.reconAreaForDisplay" ->
            Just
                (D.map2 (\r selected -> Recon.reconAreaForDisplay r selected |> Maybe.map encodeArea |> Maybe.withDefault E.null)
                    (arg 0 (D.map2 (\phase area -> { phase = phase, area = area }) (D.field "phase" (named Recon.phaseName Recon.phases)) (D.field "area" (D.nullable displayArea))))
                    (arg 1 (D.nullable displayArea))
                )

        "recon.reconLink" ->
            Just
                (arg 0 (D.oneOf [ D.field "depth" D.float |> D.map Just, D.succeed Nothing ])
                    |> D.map (\depth -> Recon.reconLink depth |> (\l -> E.object [ ( "canUplink", E.bool l.canUplink ), ( "canReceive", E.bool l.canReceive ), ( "rate", E.float l.rate ), ( "label", E.string l.label ) ]))
                )

        "recon.requestRecon" ->
            Just (D.map3 (\w e area -> Recon.requestRecon e.storm area w |> (\( ok, after ) -> E.list identity [ E.bool ok, encodeRecon after.recon ])) world environment (arg 1 candidate))

        "recon.updateRecon" ->
            Just
                (D.map3 (\w e dt -> ReconPasses.updateRecon e dt w |> (\( packet, after ) -> E.list identity [ Maybe.map ReconSaves.encodePacket packet |> Maybe.withDefault E.null, encodeRecon after.recon ]))
                    world
                    environment
                    (arg 1 D.float)
                )

        "recon.reconStatus" ->
            Just
                (D.map2
                    (\w e ->
                        Recon.reconStatus e.storm w
                            |> (\p ->
                                    E.object
                                        [ ( "phase", E.string (Recon.phaseName p.phase) )
                                        , ( "title", E.string p.title )
                                        , ( "detail", E.string p.detail )
                                        , ( "progress", E.float p.progress )
                                        , ( "canRequest", E.bool p.canRequest )
                                        , ( "cooldownRemaining", E.float p.cooldownRemaining )
                                        , ( "linkLabel", E.string p.linkLabel )
                                        ]
                               )
                    )
                    world
                    environment
                )

        "recon.validateReconState" ->
            Just
                (arg 0 D.value
                    |> D.map
                        (\value ->
                            case D.decodeValue ReconSaves.decoder value of
                                Ok _ ->
                                    E.bool True

                                Err _ ->
                                    E.bool False
                        )
                )

        _ ->
            Nothing
