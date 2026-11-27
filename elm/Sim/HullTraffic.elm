module Sim.HullTraffic exposing (Collision, Hurt, Role(..), Traffic, Work, bodyOf, boatBody, roleKey, shipBody, store)

{-| The patrol as hull contacts sees it, and the roles that stand in for the
TypeScript's object identity: the boat, the site, a ship afloat (by its place
in the ship list) and a throwaway wreck copy. Part of the TypeScript's
hull-contacts.ts.
-}

import Array exposing (Array)
import Dict exposing (Dict)
import Sim.Coast exposing (Coastline)
import Sim.Debrief as Debrief
import Sim.HullGeometry exposing (Body)
import Sim.Mechanics exposing (LogEntry)
import Sim.Ship exposing (Ship)
import Sim.SurfaceMotion exposing (Point)
import Sim.Vessel as Vessel


{-| `hurt severity text part` applies damage to the boat, as `systems` does. -}
type alias Hurt t c r =
    Float -> String -> String -> Traffic t c r -> Traffic t c r


{-| A collision the replay should show. -}
type alias Collision =
    { target : Maybe String, point : Point }


type alias Traffic t c r =
    { t
        | x : Float
        , y : Float
        , depth : Float
        , heading : Float
        , pitch : Float
        , roll : Maybe Float
        , speed : Float
        , verticalSpeed : Float
        , time : Float
        , site : Maybe Body
        , ships : List Ship
        , chart : Maybe Coastline
        , collisionHits : Dict String Float
        , systems : { c | periscope : Float }
        , repairLimits : { r | periscope : Float }
        , scope : Bool
        , scopeTravel : Maybe Float
        , events : List LogEntry
        , debrief : List Debrief.Entry
        , collisions : List Collision
    }


type Role
    = Boat
    | Site
    | Afloat Int
    | WreckCopy Body


shipBody : Ship -> Body
shipBody v =
    { x = v.x, y = v.y, depth = v.depth, heading = v.heading, pitch = v.pitch, roll = v.roll, speed = v.speed, verticalSpeed = v.verticalSpeed
    , kind = Just (Vessel.kindName v.kind), id = Just v.id, name = Just v.name, hull = Just v.hull, military = v.military, fixedWreck = v.fixedWreck == Just True, directHits = v.directHits
    }


boatBody : Traffic t c r -> Body
boatBody s =
    { x = s.x, y = s.y, depth = Just s.depth, heading = s.heading, pitch = Just s.pitch, roll = s.roll, speed = s.speed, verticalSpeed = Just s.verticalSpeed
    , kind = Nothing, id = Nothing, name = Nothing, hull = Nothing, military = Nothing, fixedWreck = False, directHits = Nothing
    }


type alias Work t c r =
    { s : Traffic t c r, ships : Array Ship }


bodyOf : Role -> Work t c r -> Body
bodyOf role w =
    case role of
        Boat ->
            boatBody w.s

        Site ->
            Maybe.withDefault (boatBody w.s) w.s.site

        Afloat i ->
            Array.get i w.ships |> Maybe.map shipBody |> Maybe.withDefault (boatBody w.s)

        WreckCopy b ->
            b


{-| Writes a body's motion and hull back to what it stands for; a wreck copy
is thrown away, as the TypeScript throws away its spread copy.
-}
store : Role -> Body -> Work t c r -> Work t c r
store role b w =
    case role of
        Boat ->
            let
                s =
                    w.s
            in
            { w | s = { s | x = b.x, y = b.y, depth = Maybe.withDefault s.depth b.depth, speed = b.speed, verticalSpeed = Maybe.withDefault s.verticalSpeed b.verticalSpeed } }

        Site ->
            let
                s =
                    w.s
            in
            { w | s = { s | site = Just b } }

        Afloat i ->
            case Array.get i w.ships of
                Just v ->
                    { w | ships = Array.set i { v | x = b.x, y = b.y, depth = b.depth, speed = b.speed, verticalSpeed = b.verticalSpeed, hull = Maybe.withDefault v.hull b.hull } w.ships }

                Nothing ->
                    w

        WreckCopy _ ->
            w


roleKey : Role -> Body -> String
roleKey role b =
    case role of
        Boat ->
            "boat"

        _ ->
            Maybe.withDefault "site" b.id
