module Sim.PatrolEnd exposing (conclude, locate, sightings)

{-| The end of each tick: a long patrol's search area located, ships and
wrecks sighted through the scope, from the tower or by the drone's camera,
the shadowing mission's tracking time, and the objective judged with every
way a patrol can end.
-}

import PatrolCriteria
import PatrolMission exposing (Mission(..), Objective(..))
import Sim.BoatSensors as BoatSensors
import Sim.Contact exposing (Sighting(..))
import Sim.ContactReports as ContactReports
import Sim.ConvoyTracking as ConvoyTracking
import Sim.ConvoyWatch as ConvoyWatch
import Sim.Drone as Drone
import Sim.Environment exposing (Environment)
import Sim.Equipment as Equipment
import Sim.FleetTheater as FleetTheater
import Sim.Math as M
import Sim.Mechanics as Mechanics exposing (LogKind(..))
import Sim.Missions as Missions
import Sim.PatrolPhase exposing (Phase(..))
import Sim.PatrolReports as PatrolReports
import Sim.Ship exposing (Ship)
import Sim.Site as Site
import Sim.Status exposing (Status(..))
import Sim.Systems as Systems
import Sim.Vessel exposing (Kind(..))
import Sim.World exposing (World)


{-| A long patrol's search area is located once its surface casualty is in
sight or the boat or drone comes close to the site, or, without a site, once
every target has been identified, or fixed if a submarine.
-}
locate : Maybe String -> Maybe Float -> Environment -> World -> World
locate observation look env s =
    case s.search of
        Just area ->
            if area.located then
                s

            else
                case s.site of
                    Just site ->
                        let
                            surfaceSight : Bool
                            surfaceSight =
                                site.kind
                                    == Site.SurfaceCasualty
                                    && List.member observation [ Just "scope", Just "tower", Just "gun" ]
                                    && (if observation == Just "scope" then
                                            s.scope && s.depth <= 15 && not (BoatSensors.scopeWashed s env)

                                        else
                                            s.depth <= 1
                                       )
                                    && Mechanics.distance s site
                                    < env.opticalRange
                                    && M.abs (Mechanics.delta (Mechanics.bearing s site) (Maybe.withDefault s.heading look))
                                    < 19

                            close : Bool
                            close =
                                Mechanics.separation s site < 120 || s.drone.mode == Drone.Remote && Mechanics.separation s.drone site < 80
                        in
                        if surfaceSight || close then
                            Mechanics.log "Mission site located. Position marked on chart." Success { s | search = Just { area | located = True } }

                        else
                            s

                    Nothing ->
                        let
                            recognized : List String
                            recognized =
                                List.foldl
                                    (\c ids ->
                                        if (c.identified == Just True || c.kind == Just Submarine && c.fix /= Nothing) && List.member c.id area.targets && not (List.member c.id ids) then
                                            ids ++ [ c.id ]

                                        else
                                            ids
                                    )
                                    area.recognized
                                    s.contacts
                        in
                        if List.length recognized == List.length area.targets then
                            Mechanics.log "Search contacts accounted for. Chart now shows their individual tracks." Info { s | search = Just { area | recognized = recognized, located = True } }

                        else
                            { s | search = Just { area | recognized = recognized } }

        Nothing ->
            s


{-| Through the scope, from the tower or by the drone's camera: the drone
identifies close ships in the convoy defense, the fleet action and among
incidental traffic, and any optical watch marks wrecks it sees.
-}
sightings : Maybe String -> Maybe Float -> Environment -> World -> World
sightings observation look env s =
    case observation of
        Just watched ->
            if watched == "" then
                s

            else
                let
                    rov : Bool
                    rov =
                        watched == "drone"

                    camera : Float
                    camera =
                        Equipment.operatingFraction s.drone.camera

                    periscope : Float
                    periscope =
                        Equipment.operatingFraction s.systems.periscope

                    optical : Bool
                    optical =
                        if rov then
                            s.drone.mode == Drone.Remote && 0 < camera

                        else if watched == "scope" then
                            s.scope && s.depth <= 15 && 0 < periscope && not (BoatSensors.scopeWashed s env)

                        else
                            s.depth <= 1
                in
                if optical then
                    let
                        ( spotted, after ) =
                            List.foldl (spot { rov = rov, scope = watched == "scope", camera = camera, periscope = periscope, look = look, env = env }) ( [], s ) s.ships
                    in
                    { after | ships = List.reverse spotted }

                else
                    s

        Nothing ->
            s


spot : { rov : Bool, scope : Bool, camera : Float, periscope : Float, look : Maybe Float, env : Environment } -> Ship -> ( List Ship, World ) -> ( List Ship, World )
spot eyes v ( done, s0 ) =
    let
        eye : { x : Float, y : Float, depth : Float, heading : Float }
        eye =
            if eyes.rov then
                { x = s0.drone.x, y = s0.drone.y, depth = s0.drone.depth, heading = s0.drone.heading }

            else
                { x = s0.x, y = s0.y, depth = s0.depth, heading = s0.heading }

        aimed : Bool
        aimed =
            M.abs (Mechanics.delta (Mechanics.bearing eye v) (Maybe.withDefault eye.heading eyes.look)) < 25

        s1 : World
        s1 =
            if
                eyes.rov
                    && (s0.convoy /= Nothing || s0.mission == Tiebreaker || v.incidental == Just True)
                    && 0
                    < v.hull
                    && M.hypot2 (Mechanics.distance eye v) (eye.depth - Mechanics.orZero (Maybe.withDefault 0 v.depth))
                    < 70
                    * eyes.camera
                    && aimed
            then
                ContactReports.contact (ContactReports.sighted v) Visual s0 |> Tuple.second

            else
                s0
    in
    if 0 < v.hull || (v.wreckMark |> Maybe.map .observed |> Maybe.withDefault False) then
        ( v :: done, s1 )

    else
        let
            depth : Float
            depth =
                (if v.kind == Submarine then
                    Maybe.withDefault (0 / 0) v.depth

                 else
                    0
                )
                    + Mechanics.orZero (Maybe.withDefault 0 v.sinkDepth)

            near : Bool
            near =
                if eyes.rov then
                    M.hypot2 (Mechanics.distance eye v) (eye.depth - depth) < 70 * eyes.camera

                else
                    depth
                        < 5
                        && Mechanics.distance s1 v
                        < M.min 1200 eyes.env.opticalRange
                        * (if eyes.scope then
                            eyes.periscope

                           else
                            1
                          )
        in
        if near && aimed then
            ( { v | wreckMark = Just { x = v.x, y = v.y, observed = True } } :: done, PatrolReports.report "wreck" "Wreck sighted. Position marked on chart." s1 )

        else
            ( v :: done, s1 )


log : String -> LogKind -> World -> World
log =
    Mechanics.log


{-| Tracking time for the shadowing mission, then the objective judged: a
convoy lost or saved, the transit's gate reached, extraction opened or
reached, the fleet action lost, or the patrol window closed.
-}
conclude : Float -> World -> World
conclude dt s0 =
    let
        s1 : World
        s1 =
            if
                s0.mission
                    == Shadow
                    && ConvoyTracking.trackingConvoy
                        { x = s0.x
                        , y = s0.y
                        , noise = s0.noise
                        , depth = s0.depth
                        , sonar = s0.systems.sonar
                        , ships = List.map (\v -> { x = v.x, y = v.y, kind = v.kind, hull = v.hull, incidental = v.incidental == Just True }) s0.ships
                        }
                        PatrolCriteria.convoyTracking
            then
                { s0 | trackTime = s0.trackTime + dt }

            else
                s0

        ( done, s2 ) =
            Missions.objectiveComplete dt s1

        s3 : World
        s3 =
            if s2.convoy /= Nothing && s2.status == Patrol then
                let
                    lossLimit : Float
                    lossLimit =
                        case (PatrolMission.briefing s2.mission).objective of
                            ProtectConvoy _ limit ->
                                toFloat limit

                            _ ->
                                0 / 0
                in
                if lossLimit <= toFloat (ConvoyWatch.convoyLosses s2) then
                    Systems.addDebrief "Two more convoy vessels were lost after Plover." { s2 | status = ConvoyLost }

                else if done then
                    Systems.addDebrief "The hunter sank. The surviving convoy is clear." { s2 | status = Won }

                else
                    s2

            else
                s2

        s4 : World
        s4 =
            if s3.mission == Transit && done && s3.status == Patrol then
                log "Gate B reached. Patrol corridor cleared." Success { s3 | status = Won }

            else
                s3

        s5 : World
        s5 =
            if s4.status == Patrol && done && s4.phase == Objective then
                let
                    opened : World
                    opened =
                        { s4 | phase = Extract }
                in
                if opened.mission == Tiebreaker then
                    log "Command confirms a two-vessel lead. Extraction open. Stay to assist or surface at pickup." Success opened
                        |> Systems.addDebrief "The friendly fleet earned its two-vessel lead. Extraction opened."

                else if List.member opened.mission [ Intercept, Convoy, BigKahuna ] then
                    opened

                else
                    log "Objective complete. Return to extraction and surface for pickup." Success opened

            else
                s4

        s6 : World
        s6 =
            if s5.status == Patrol && s5.phase == Extract && Mechanics.distance s5 s5.home < 400 && s5.depth <= 1 then
                log "Patrol complete. Surfaced at pickup. Sub and crew home safely." Success { s5 | status = Won }

            else
                s5

        s7 : World
        s7 =
            if s6.mission == Tiebreaker && s6.phase == Objective && s6.status == Patrol && (FleetTheater.sidesAfloat s6.ships).friendly < 2 then
                Systems.addDebrief "Too few friendly vessels remained to establish the lead. Command recalled the patrol." { s6 | status = Expired }

            else
                s6

        window : Float
        window =
            case s7.search of
                Just area ->
                    toFloat PatrolMission.patrolTiming.longerWindow + area.protectedTime

                Nothing ->
                    toFloat PatrolMission.patrolTiming.standardWindow
    in
    if window < s7.time && s7.status == Patrol && not (s7.mission == Tiebreaker && s7.phase == Extract) then
        log "Patrol window closed. Command orders withdrawal." Warning { s7 | status = Expired }

    else
        s7
