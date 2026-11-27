module Sim.DroneCollisions exposing (Obstacle, collide, obstacles, seabed)

{-| The drone against hulls (our own, every ship afloat, the casualty) and
the charted seabed: pushed clear, damaged when it closes fast enough, and
slowed.
-}

import Sim.Carrier as Carrier
import Sim.Drone exposing (Drone)
import Sim.DroneOrders as Orders exposing (Flying, dronePosition, setDrone)
import Sim.Math as M
import Sim.Mechanics as Mechanics
import Sim.ReplayEvents as Replay
import Sim.Ship exposing (Ship)
import Sim.Systems as Systems
import Sim.Vessel exposing (Kind(..), SurfaceShip(..))


type alias Obstacle =
    { body : { x : Float, y : Float, depth : Float, heading : Float, pitch : Float, speed : Float }, half : Float, radius : Float, own : Bool }


orZero : Float -> Float
orZero v =
    if M.truthy v then
        v

    else
        0


obstacles : Flying w -> List Obstacle
obstacles s =
    let
        own : Obstacle
        own =
            { body = { x = s.x, y = s.y, depth = s.depth, heading = s.heading, pitch = s.pitch, speed = s.speed }, half = 27.5, radius = 5, own = True }

        shipObstacle : Ship -> Obstacle
        shipObstacle v =
            let
                size : { half : Float, radius : Float }
                size =
                    case v.kind of
                        Surface Carrier ->
                            { half = Carrier.carrierSize.halfLength - Carrier.carrierSize.halfBeam, radius = Carrier.carrierSize.halfBeam }

                        Submarine ->
                            { half = 27.5, radius = 5 }

                        Surface Fishing ->
                            { half = 19, radius = 5 }

                        _ ->
                            { half = 45, radius = 9 }
            in
            { body = { x = v.x, y = v.y, depth = shipDepth v, heading = v.heading, pitch = Maybe.withDefault 0 v.pitch, speed = v.speed }
            , half = size.half
            , radius = size.radius
            , own = False
            }

        siteObstacle : List Obstacle
        siteObstacle =
            case s.site of
                Just site ->
                    [ { body = { x = site.x, y = site.y, depth = Maybe.withDefault (0 / 0) site.depth, heading = site.heading, pitch = Maybe.withDefault 0 site.pitch, speed = site.speed }
                      , half =
                            if site.kind == Just "surface" then
                                19

                            else
                                27.5
                      , radius = 5
                      , own = False
                      }
                    ]

                Nothing ->
                    []
    in
    own :: List.map shipObstacle (List.filter (\v -> v.hull > 0) s.ships) ++ siteObstacle


{-| `v.depth || 3`: a ship without a depth, or at 0 or NaN, sits 3 m down.
-}
shipDepth : Ship -> Float
shipDepth v =
    case v.depth of
        Just z ->
            if M.truthy z then
                z

            else
                3

        Nothing ->
            3


collide : Float -> Obstacle -> Flying w -> Flying w
collide forward object s =
    let
        d : Drone
        d =
            s.drone
    in
    case Mechanics.capsuleContact d object.body object.half object.radius 0.7 of
        Nothing ->
            s

        Just hit ->
            let
                push : Float
                push =
                    hit.penetration + 0.001

                pushed : Drone
                pushed =
                    { d | x = d.x + hit.nx * push, y = d.y + hit.ny * push, depth = M.clamp 0 280 (d.depth + hit.nd * push) }

                body : { x : Float, y : Float, depth : Float, heading : Float, pitch : Float, speed : Float }
                body =
                    object.body

                closing : Float
                closing =
                    negate (sin (Mechanics.rad pushed.heading) * forward - sin (Mechanics.rad body.heading) * orZero body.speed * 0.514444)
                        * hit.nx
                        - (cos (Mechanics.rad pushed.heading) * forward - cos (Mechanics.rad body.heading) * orZero body.speed * 0.514444)
                        * hit.ny
                        - pushed.verticalSpeed
                        * hit.nd

                struck : Flying w
                struck =
                    if closing > 0.3 && pushed.collisionCooldown <= 0 then
                        let
                            damage : Float
                            damage =
                                M.clamp 3 60 (3 + closing * closing * 1.4)

                            damaged : Flying w
                            damaged =
                                Orders.damageDrone damage
                                    (if object.own then
                                        "pressure hull"

                                     else
                                        "vessel / wreck"
                                    )
                                    (setDrone pushed s)

                            plated : Flying w
                            plated =
                                if object.own then
                                    damaged
                                        |> Replay.mark (Replay.at Replay.Collision (dronePosition damaged.drone))
                                        |> Systems.hurt (damage * 0.07) "Drone struck our hull. Minor plating damage." Nothing Nothing

                                else
                                    damaged
                        in
                        setDrone (plated.drone |> (\x -> { x | collisionCooldown = 2 })) plated

                    else
                        setDrone pushed s
            in
            setDrone (struck.drone |> (\x -> { x | speed = x.speed * 0.15, verticalSpeed = x.verticalSpeed * 0.2 })) struck


seabed : Flying w -> Flying w
seabed s =
    let
        d : Drone
        d =
            s.drone

        seabedDepth : Float
        seabedDepth =
            Systems.bottom s d.x d.y - 0.7
    in
    if seabedDepth < d.depth then
        let
            settled : Flying w
            settled =
                setDrone { d | depth = M.max 0 seabedDepth } s

            hit : Flying w
            hit =
                if settled.drone.collisionCooldown <= 0 then
                    Orders.damageDrone (3 + M.abs settled.drone.speed * 1.5) "seabed" settled
                        |> (\x -> setDrone (x.drone |> (\y -> { y | collisionCooldown = 2 })) x)

                else
                    settled
        in
        setDrone (hit.drone |> (\x -> { x | verticalSpeed = 0, speed = x.speed * 0.7 })) hit

    else
        s
