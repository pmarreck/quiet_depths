module Sim.PatrolRestore exposing (restore)

{-| Restore: a saved patrol, untrusted JSON, brought up to date and checked
field by field before the patrol may resume. The page splits off the photo
archive and the captain's name, and checks them, before this sees the save.
-}

import Dict
import Json.Decode as D
import Json.Encode as E
import PatrolMission exposing (Mission(..))
import Sim.Carrier as Carrier
import Sim.Combat as Combat
import Sim.ConvoySaves as ConvoySaves
import Sim.FleetActionSaves as FleetActionSaves
import Sim.Math as M
import Sim.MessWatch as MessWatch
import Sim.MissionObjective as MissionObjective
import Sim.PatrolCreate as PatrolCreate
import Sim.PatrolPhase exposing (Phase(..))
import Sim.PatrolSearch as PatrolSearch
import Sim.RestoreChecks as RestoreChecks
import Sim.RestoreFields as RestoreFields
import Sim.SaveFields as SaveFields exposing (Fields)
import Sim.Torpedo exposing (Owner(..))
import Sim.TorpedoSaves as TorpedoSaves
import Sim.TrackEstimates as TrackEstimates
import Sim.TrafficSaves as TrafficSaves
import Sim.Vessel exposing (Kind(..), SurfaceShip(..))
import Sim.WatchWarnings as WatchWarnings
import Sim.World exposing (World)
import Sim.WorldDecoder as WorldDecoder


{-| A saved patrol resumed, or nothing when the save is refused.
-}
restore : D.Value -> Maybe World
restore raw =
    SaveFields.object raw
        |> Maybe.andThen
            (\fields ->
                RestoreFields.migrate fields
                    |> Maybe.andThen
                        (\f ->
                            SaveFields.field "mission" D.string f
                                |> Maybe.andThen PatrolMission.fromId
                                |> Maybe.andThen (\m -> RestoreChecks.check m f |> Maybe.andThen (resume (not (Dict.member "crewQuietUntil" fields))))
                        )
            )


{-| Each mission's targets are present and as the mission made them.
-}
validMissionTargets : Fields -> World -> Bool
validMissionTargets f s =
    case s.mission of
        Henhouse ->
            ConvoySaves.validConvoy s

        Tiebreaker ->
            D.decodeValue FleetActionSaves.savedTheater (E.dict identity identity f) |> Result.map FleetActionSaves.validTheater |> Result.withDefault False

        BigKahuna ->
            case List.filter (\v -> v.kind == Surface Carrier || v.id == Carrier.carrierId) s.ships of
                [ carrier ] ->
                    carrier.kind
                        == Surface Carrier
                        && carrier.id
                        == Carrier.carrierId
                        && carrier.military
                        == Just True
                        && (case ( carrier.fighterCount, carrier.flood, carrier.directHits ) of
                                ( Just fighters, Just flood, Just hits ) ->
                                    SaveFields.integer fighters && SaveFields.integer hits && Carrier.validCarrier { fighterCount = floor fighters, flood = flood, directHits = floor hits, hull = carrier.hull }

                                _ ->
                                    False
                           )
                        && (s.phase == Objective || M.isZero carrier.hull)

                _ ->
                    False

        Transit ->
            s.departure /= Nothing && List.any (\v -> v.kind == Submarine && v.military == Just True) s.ships && List.any (\v -> v.kind == Surface Merchant) s.ships

        Intercept ->
            List.any (\v -> v.id == "cobalt") s.ships

        SubHunt ->
            List.any (\v -> v.id == "echo" && v.kind == Submarine && v.military == Just True) s.ships

        Convoy ->
            List.all
                (\id ->
                    case List.filter (\v -> v.id == id) s.ships of
                        [ v ] ->
                            v.kind == Surface Merchant && v.military == Just True

                        _ ->
                            False
                )
                MissionObjective.convoyTransportIds
                && (s.phase == Objective || MissionObjective.allSunk s.ships MissionObjective.convoyTransportIds)

        _ ->
            True


{-| A long patrol's search area is as the mission laid it out; any other
patrol has none.
-}
validSearch : World -> Bool
validSearch s =
    if s.difficulty |> Maybe.andThen .longPatrol |> Maybe.withDefault False then
        case s.search of
            Just area ->
                PatrolSearch.validSearch s.mission
                    (Maybe.map (\site -> { x = site.x, y = site.y }) s.site)
                    (List.map (\v -> { x = v.x, y = v.y, id = v.id, kind = v.kind, military = v.military == Just True, incidental = v.incidental == Just True, side = v.side }) s.ships)
                    s.time
                    area

            Nothing ->
                False

    else
        s.search == Nothing


{-| Every contact's fix, if it has one, is one the chart can use.
-}
validFixes : World -> Bool
validFixes s =
    List.all
        (\c ->
            case c.fix of
                Just f ->
                    TrackEstimates.fixContact { x = f.x, y = f.y, time = f.time, vx = f.vx, vy = f.vy, positionSigma = f.positionSigma, velocitySigma = f.velocitySigma, maneuverSigma = f.maneuverSigma, source = f.source } { fix = Nothing } /= Nothing

                Nothing ->
                    True
        )
        s.contacts


{-| Torpedoes in the water, each brought up to date and checked.
-}
torpedoes : List D.Value -> World -> Maybe World
torpedoes saved s0 =
    List.foldl
        (\v acc ->
            Maybe.andThen
                (\( done, s ) ->
                    case TorpedoSaves.restoreTorpedo v s of
                        ( Just torpedo, after ) ->
                            Just ( torpedo :: done, after )

                        ( Nothing, _ ) ->
                            Nothing
                )
                acc
        )
        (Just ( [], s0 ))
        saved
        |> Maybe.map (\( done, s ) -> { s | projectiles = List.reverse done })


{-| A save from before the crew's quiet watch keeps quiet after its own
torpedoes in flight.
-}
crewWatch : World -> World
crewWatch s =
    { s
        | crewQuietUntil =
            List.foldl
                (\p quiet ->
                    if p.owner == PlayerTorpedo && 0 <= p.age && p.age <= s.time then
                        M.max quiet (s.time - p.age + MessWatch.launchWatchSeconds)

                    else
                        quiet
                )
                s.crewQuietUntil
                s.projectiles
    }


weaponBlast : D.Value -> Bool
weaponBlast v =
    D.decodeValue (D.map2 (\kind exploded -> kind == "weapon" && not exploded) (D.field "kind" D.string) (D.oneOf [ D.field "exploded" D.bool, D.succeed False ])) v
        |> Result.withDefault False


{-| The typed half of restore: the world decoded, the watch's warnings for
an older save, the traffic, the allied watch, the mission's targets, the
search and the contacts' fixes checked, torpedoes restored, an older save's
crew watch, and pre-torpedo-run weapon blasts turned into incoming runs.
-}
resume : Bool -> Fields -> Maybe World
resume legacyCrewWatch f =
    let
        projectiles : List D.Value
        projectiles =
            SaveFields.field "projectiles" (D.list D.value) f |> Maybe.withDefault []

        allBlasts : List D.Value
        allBlasts =
            SaveFields.field "blasts" (D.list D.value) f |> Maybe.withDefault []

        decoded : Maybe World
        decoded =
            f
                |> Dict.insert "projectiles" (E.list identity [])
                |> Dict.insert "blasts" (E.list identity (List.filter (weaponBlast >> not) allBlasts))
                |> E.dict identity identity
                |> D.decodeValue WorldDecoder.decoder
                |> Result.toMaybe
    in
    decoded
        |> Maybe.map
            (\s ->
                case s.watchWarnings of
                    Just _ ->
                        s

                    Nothing ->
                        { s | watchWarnings = Just (WatchWarnings.warnings (PatrolCreate.getSoundings False s).belowKeel s.battery Nothing) }
            )
        |> Maybe.andThen
            (\s ->
                if
                    (D.decodeValue TrafficSaves.savedTraffic (E.dict identity identity f) |> Result.map TrafficSaves.validTraffic |> Result.withDefault False)
                        && ConvoySaves.validAlliedWatch s
                        && validMissionTargets f s
                        && validSearch s
                        && validFixes s
                then
                    Just s

                else
                    Nothing
            )
        |> Maybe.andThen (torpedoes projectiles)
        |> Maybe.map
            (\s ->
                if legacyCrewWatch then
                    crewWatch s

                else
                    s
            )
        |> Maybe.map
            (\s ->
                List.foldl
                    (\v w ->
                        case D.decodeValue (D.map4 (\x y depth delay -> { x = x, y = y, depth = depth, delay = delay }) (D.field "x" D.float) (D.field "y" D.float) (D.field "depth" D.float) (D.field "delay" D.float)) v of
                            Ok blast ->
                                Combat.restoreIncomingRun blast w

                            Err _ ->
                                w
                    )
                    s
                    (List.filter weaponBlast allBlasts)
            )
