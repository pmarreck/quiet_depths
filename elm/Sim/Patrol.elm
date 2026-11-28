module Sim.Patrol exposing (Action(..), Done, Tick, act, step)

{-| The simulation as the page drives it, the port of `sim.ts`: a frame of
play tick by tick, and each action the player can take. Every result comes
with the replay marks and invalid numbers it produced, taken out of the
world's outboxes, so the world handed back always has them empty.

Creating a patrol is `Sim.PatrolCreate.createGame`, saving one is
`Sim.WorldEncoder.encodeWorld`, and resuming a save is
`Sim.PatrolRestore.restore`.

-}

import Json.Encode as E
import Sim.Combat as Combat
import Sim.DroneOrders as DroneOrders
import Sim.EarlyEnd as EarlyEnd
import Sim.Environment as Env exposing (Environment)
import Sim.InvalidNumber exposing (InvalidNumber)
import Sim.Math as M
import Sim.Mechanics as Mechanics exposing (LogKind)
import Sim.Operation as Operation
import Sim.OperationWork as OperationWork
import Sim.PatrolContacts as PatrolContacts
import Sim.PatrolTick as PatrolTick
import Sim.Periscope as Periscope
import Sim.Recon as Recon
import Sim.ReplayEvents as Replay
import Sim.Status exposing (Status(..))
import Sim.World exposing (World)


{-| One quarter-second tick of a frame: the world after it, and what it
announced on the way.
-}
type alias Tick =
    { world : World
    , replay : List Replay.Marked
    , invalid : List InvalidNumber
    }


{-| An action's outcome, as the TypeScript returns it, and the world after
it, with what it announced.
-}
type alias Done =
    { result : E.Value
    , world : World
    , replay : List Replay.Marked
    , invalid : List InvalidNumber
    }


{-| Everything the player can do to the patrol besides steering it.
-}
type Action
    = Ping
    | Photograph Float
    | Fire String
    | Decoy
    | DeployDrone
    | RecallDrone
    | FireDeckGun { bearing : Float, elevation : Float }
    | AimGunAt { x : Float, y : Float, vx : Maybe Float, vy : Maybe Float, altitude : Maybe Float }
    | OrderScope Bool
    | RequestRecon (Maybe { x : Float, y : Float, size : Float })
    | StartRescue
    | DronePhotograph
    | EndPatrolEarly
    | Log String LogKind


{-| The sea and sky over the patrol now.
-}
environment : World -> Environment
environment s =
    Env.environmentAt (PatrolTick.sky s)


{-| The world with its outboxes emptied, and what they held.
-}
drained : World -> ( World, List Replay.Marked, List InvalidNumber )
drained s =
    ( { s | replay = [], invalid = [] }, s.replay, s.invalid )


{-| A frame of play as `step` plays it, at most a minute in quarter-second
ticks, returning each tick in order; none once the patrol has ended, while
paused or behind a dialog.
-}
step : Float -> PatrolTick.Input -> World -> List Tick
step dt input s =
    if s.status /= Patrol || dt <= 0 || input.paused || input.modal then
        []

    else
        ticks input (M.min dt 60) { s | replay = [], invalid = [] } []


ticks : PatrolTick.Input -> Float -> World -> List Tick -> List Tick
ticks input left s done =
    if 0 < left && s.status == Patrol then
        let
            t : Float
            t =
                M.min 0.25 left

            ( after, replay, invalid ) =
                drained (PatrolTick.tick t input s)
        in
        ticks input (left - t) after ({ world = after, replay = replay, invalid = invalid } :: done)

    else
        List.reverse done


flag : ( Bool, World ) -> ( E.Value, World )
flag ( ok, after ) =
    ( E.bool ok, after )


{-| Reconnaissance reads an optional record, which the world always holds.
-}
requestRecon : Maybe { x : Float, y : Float, size : Float } -> World -> ( E.Value, World )
requestRecon area s =
    let
        ( ok, after ) =
            Recon.requestRecon (environment s).storm area { status = s.status, time = s.time, recon = Just s.recon, difficulty = s.difficulty }
    in
    ( E.bool ok, { s | recon = Maybe.withDefault s.recon after.recon } )


{-| The early end counts rescued crew as a number; it changes only the
status, the log and the debrief.
-}
endPatrolEarly : World -> ( E.Value, World )
endPatrolEarly s =
    let
        ( outcome, after ) =
            EarlyEnd.endPatrolEarly
                { x = s.x
                , y = s.y
                , mission = s.mission
                , status = s.status
                , phase = s.phase
                , depth = s.depth
                , time = s.time
                , home = s.home
                , patrol = s.patrol
                , photos = s.photos
                , trackTime = s.trackTime
                , ships = s.ships
                , operation = Maybe.map (\o -> { rescued = toFloat o.rescued, scan = o.scan, photoAngles = o.photoAngles }) s.operation
                , events = s.events
                , debrief = s.debrief
                }
    in
    ( Maybe.map (EarlyEnd.outcomeName >> E.string) outcome |> Maybe.withDefault E.null
    , { s | status = after.status, events = after.events, debrief = after.debrief }
    )


{-| An action taken now.
-}
act : Action -> World -> Done
act action s0 =
    let
        ( s, _, _ ) =
            drained s0

        ( result, w ) =
            case action of
                Ping ->
                    flag (PatrolContacts.ping s)

                Photograph look ->
                    flag (PatrolContacts.photograph (environment s) look s)

                Fire id ->
                    flag (Combat.launchTorpedo (environment s) id s)

                Decoy ->
                    flag (PatrolContacts.decoy s)

                DeployDrone ->
                    DroneOrders.deployDrone s |> (\( after, ok ) -> ( E.bool ok, after ))

                RecallDrone ->
                    ( E.null, DroneOrders.recallDrone s )

                FireDeckGun aim ->
                    flag (Combat.fireDeckGun aim s)

                AimGunAt point ->
                    ( E.null, Combat.aimGunAt point s )

                OrderScope raised ->
                    ( E.null, Periscope.orderScope raised s )

                RequestRecon area ->
                    requestRecon area s

                StartRescue ->
                    flag (Operation.startRescue s)

                DronePhotograph ->
                    OperationWork.dronePhotograph s |> (\( r, after ) -> ( E.object [ ( "ok", E.bool r.ok ), ( "text", E.string r.text ) ], after ))

                EndPatrolEarly ->
                    endPatrolEarly s

                Log text kind ->
                    ( E.null, Mechanics.log text kind s )

        ( world, replay, invalid ) =
            drained w
    in
    { result = result, world = world, replay = replay, invalid = invalid }
