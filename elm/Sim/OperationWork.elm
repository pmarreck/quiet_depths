module Sim.OperationWork exposing (Photographing, Working, dronePhotograph, updateOperation)

{-| An operation's work each tick: a survey scanning the wreck from a slow
pass, a rescue assessing, transferring survivors and recovering its team
while the boat holds station, survivors lost on a seeded clock, a surface
casualty settling and foundering, and the ROV's survey photographs.
-}

import PatrolCriteria exposing (RescueCriteria, SurveyCriteria)
import PatrolMission exposing (Mission(..))
import Sim.Coast as Coast exposing (Coastline)
import Sim.Drone as Drone
import Sim.Equipment as Equipment
import Sim.Math as M
import Sim.Mechanics as Mechanics exposing (LogEntry, LogKind(..))
import Sim.Operation exposing (Operation, casualtyDeadline, operationConditions, rescueCriteria)
import Sim.PatrolSearch exposing (SearchArea)
import Sim.RescueOperation as RescueOperation
import Sim.Site exposing (Kind(..), Site)
import Sim.SurfaceMotion exposing (hash01)
import Sim.WreckSurvey as WreckSurvey


{-| The patrol fields an operation's work reads and writes.
-}
type alias Working s p e y =
    { s
        | x : Float
        , y : Float
        , depth : Float
        , speed : Float
        , time : Float
        , mission : Mission
        , site : Maybe Site
        , operation : Maybe Operation
        , search : Maybe SearchArea
        , patrol : { p | seed : Float }
        , environment : { e | seed : Float }
        , chart : Maybe Coastline
        , systems : { y | sonar : Float }
        , events : List LogEntry
    }


pick3 : Float -> String -> String -> String -> String
pick3 roll a b c =
    case floor (roll * 3) of
        0 ->
            a

        1 ->
            b

        _ ->
            c


{-| A survey scans while the boat passes slowly near the wreck; once the scan
and the photographs are complete the team reports a find, drawn from the
patrol's conditions.
-}
updateSurvey : Float -> SurveyCriteria -> Working s p e y -> ( Bool, Working s p e y )
updateSurvey dt criteria s =
    case ( s.operation, operationConditions s, s.site ) of
        ( Just o, Just c, Just site ) ->
            if o.completed then
                ( False, s )

            else
                let
                    rate : Float
                    rate =
                        WreckSurvey.scanRate { range = c.range, vertical = M.abs (s.depth - site.depth), speed = s.speed, sonar = s.systems.sonar } criteria

                    active : Bool
                    active =
                        0 < rate

                    scanned : Operation
                    scanned =
                        { o
                            | holding = c.holding
                            , active = active
                            , scan =
                                if active then
                                    WreckSurvey.addScan o.scan rate dt criteria

                                else
                                    o.scan
                        }
                in
                if WreckSurvey.surveyComplete scanned criteria then
                    let
                        find : String
                        find =
                            pick3 (hash01 s.environment.seed 819)
                                "A brass ship’s bell, engraved ASTER · 1912. A museum will want her story."
                                "A sealed navigation journal and ceramic cargo. The archaeology team is delighted."
                                "Silver trade coins in a broken strongbox. Treasure, with a provenance worth preserving."
                    in
                    ( True, Mechanics.log find Success { s | operation = Just { scanned | completed = True, find = Just find } } )

                else
                    ( False, { s | operation = Just scanned } )

        _ ->
            ( False, s )


{-| While the boat holds station the team assesses the casualty, transfers a
survivor each transfer interval, and returns once none remain; leaving station
interrupts a transfer and the team's return. Survivors are lost on the seeded
clock, and a surface casualty settles, founders and finally goes under.
-}
updateRescue : Float -> RescueCriteria -> Working s p e y -> ( Bool, Working s p e y )
updateRescue dt rules s =
    case ( s.operation, operationConditions s, s.site ) of
        ( Just o0, Just c, Just site ) ->
            if o0.completed then
                ( False, s )

            else
                let
                    ( held, s1 ) =
                        if c.holding then
                            hold dt rules { o0 | holding = True } s

                        else
                            ( { o0 | holding = False, active = False, boarding = 0, diverReturn = 0 }, s )

                    ( counted, s2 ) =
                        if casualtyDeadline s1 held < s1.time && 0 < held.remaining then
                            let
                                lost : Operation
                                lost =
                                    { held | lastCasualty = s1.time, remaining = held.remaining - 1, dead = held.dead + 1 }
                            in
                            ( lost
                            , if lost.known then
                                Mechanics.log "A survivor’s signal has stopped. Rescue window is narrowing." Warning s1

                              else
                                s1
                            )

                        else
                            ( held, s1 )

                    ( o, place, s3 ) =
                        case ( site.kind, rules.sinking ) of
                            ( SurfaceCasualty, Just sink ) ->
                                let
                                    age : Float
                                    age =
                                        s2.time - (s2.search |> Maybe.map .protectedTime |> Maybe.withDefault 0)

                                    settled : Site
                                    settled =
                                        { site | depth = RescueOperation.casualtyDepth age (hash01 s2.patrol.seed 820) sink (Coast.chartDepth s2.chart site.x site.y - 5) }
                                in
                                if sink.lostBelow < settled.depth && 0 < counted.remaining then
                                    ( { counted | dead = counted.dead + counted.remaining, remaining = 0 }
                                    , settled
                                    , Mechanics.log "The casualty has gone under. No further survivor signals. Recover the rescue team." Damage s2
                                    )

                                else
                                    ( counted, settled, s2 )

                            _ ->
                                ( counted, site, s2 )
                in
                ( o.completed, { s3 | operation = Just o, site = Just place } )

        _ ->
            ( False, s )


{-| One tick holding station: assessment, a transfer, and the team's return.
-}
hold : Float -> RescueCriteria -> Operation -> Working s p e y -> ( Operation, Working s p e y )
hold dt rules o0 s0 =
    let
        assessing : Operation
        assessing =
            { o0 | active = True, assessment = o0.assessment + dt }

        ( assessed, s1 ) =
            if M.notLess assessing.assessment rules.assessmentSeconds && not assessing.known then
                ( { assessing | known = True }, Mechanics.log ("Rescue team report: " ++ String.fromInt assessing.remaining ++ " survivors still awaiting transfer.") Success s0 )

            else
                ( assessing, s0 )

        ( transferred, s2 ) =
            if 0 < assessed.remaining then
                let
                    boarding : Operation
                    boarding =
                        { assessed | boarding = assessed.boarding + dt }
                in
                if M.notLess boarding.boarding rules.transferSeconds then
                    let
                        aboard : Operation
                        aboard =
                            { boarding | boarding = boarding.boarding - rules.transferSeconds, remaining = boarding.remaining - 1, rescued = boarding.rescued + 1 }
                    in
                    ( aboard, Mechanics.log ("Survivor aboard. " ++ String.fromInt aboard.rescued ++ " rescued.") Success s1 )

                else
                    ( boarding, s1 )

            else
                ( assessed, s1 )
    in
    if transferred.known && M.isZero (toFloat transferred.remaining) then
        let
            returning : Operation
            returning =
                { transferred | diverReturn = transferred.diverReturn + dt }
        in
        if M.notLess returning.diverReturn rules.returnSeconds then
            ( { returning | completed = True, active = False }
            , if M.isZero (toFloat returning.rescued) then
                Mechanics.log "Rescue search complete. No survivors found. Team recovered." Warning s2

              else
                Mechanics.log ("Rescue team recovered. " ++ String.fromInt returning.rescued ++ " survivors safe aboard.") Success s2
            )

        else
            ( returning, s2 )

    else
        ( transferred, s2 )


{-| A survey works by the survey's rules; a rescue by its site's.
-}
updateOperation : Float -> Working s p e y -> ( Bool, Working s p e y )
updateOperation dt s =
    if s.mission == Survey then
        updateSurvey dt PatrolCriteria.surveyCriteria s

    else
        updateRescue dt (rescueCriteria s) s


{-| The patrol fields an ROV survey photograph reads and writes.
-}
type alias Photographing s d =
    { s
        | mission : Mission
        , drone : { d | mode : Drone.Mode, x : Float, y : Float, depth : Float, heading : Float, camera : Float }
        , operation : Maybe Operation
        , site : Maybe Site
        , photoCooldown : Float
        , time : Float
        , events : List LogEntry
    }


{-| The ROV photographs the wreck when aimed at it from close beside or above,
each photograph from a side not yet recorded.
-}
dronePhotograph : Photographing s d -> ( { ok : Bool, text : String }, Photographing s d )
dronePhotograph s =
    let
        refuse : String -> ( { ok : Bool, text : String }, Photographing s d )
        refuse text =
            ( { ok = False, text = text }, s )
    in
    case ( s.operation, s.site ) of
        ( Just o, Just site ) ->
            let
                d : { d | mode : Drone.Mode, x : Float, y : Float, depth : Float, heading : Float, camera : Float }
                d =
                    s.drone
            in
            if s.mission /= Survey || not (d.mode == Drone.Remote || d.mode == Drone.Returning) || 0 < s.photoCooldown then
                refuse "No survey camera task available."

            else
                let
                    reach : Float
                    reach =
                        85 * Equipment.operatingFraction d.camera
                in
                if not (M.truthy reach) then
                    refuse "ROV camera offline."

                else
                    let
                        gap : Float
                        gap =
                            Mechanics.separation d site
                    in
                    if reach < gap || gap < 8 || 32 < M.abs (Mechanics.delta (Mechanics.bearing d site) d.heading) then
                        refuse ("Aim at the wreck within " ++ String.fromInt (floor reach) ++ " m. Inspect from above or beside it.")

                    else
                        let
                            angle : Float
                            angle =
                                Mechanics.bearing site d

                            c : SurveyCriteria
                            c =
                                PatrolCriteria.surveyCriteria
                        in
                        if List.any (\a -> M.abs (Mechanics.delta angle a) < c.photoSeparation) o.photoAngles then
                            refuse "This side is already recorded. Move around the wreck for another angle."

                        else
                            let
                                angles : List Float
                                angles =
                                    o.photoAngles ++ [ angle ]

                                tally : String
                                tally =
                                    String.fromInt (List.length angles) ++ "/" ++ String.fromInt c.photographs
                            in
                            ( { ok = True, text = "Survey image " ++ tally ++ " recorded." }
                            , Mechanics.log ("Wreck photograph " ++ tally ++ " recorded.") Success { s | operation = Just { o | photoAngles = angles }, photoCooldown = 4 }
                            )

        _ ->
            refuse "No survey camera task available."
