module Sim.Carrier exposing (Carrier, advanceCarrierFlood, carrierDescentFactor, carrierDoomed, carrierGroup, carrierId, carrierSize, incidentalHull, registerCarrierHit, validCarrier)

{-| The fleet carrier of the carrier hunt: how direct hits doom her, how she
floods and settles, and the floor other damage cannot push her below until
she is doomed. Fictional patrol balance, in game units. The carrier group
itself is built with the other ships; the flight deck outline is the
renderer's.
-}

import PatrolMission
import Sim.Math as M
import Sim.Ship as Ship exposing (Ship)
import Sim.Vessel exposing (Kind(..), SurfaceShip(..))


carrierId : String
carrierId =
    "solstice"


{-| The fleet carrier Solstice and her escorts, Kestrel and Gull, with Petrel
when the patrol rolls a third escort; the carrier carries one to three
fighters.
-}
carrierGroup : Float -> Float -> Float -> Float -> Bool -> Float -> List Ship
carrierGroup x y heading speed extraEscort fighterRoll =
    let
        ship : String -> String -> Kind -> Float -> Float -> Ship
        ship id name kind dx dy =
            Ship.fresh { id = id, name = name, kind = kind, x = x + dx, y = y + dy, heading = heading, speed = speed }
                |> (\v -> { v | military = Just True, flood = Just 0, disabled = Just False, sinkDepth = Just 0 })

        carrier : Ship
        carrier =
            ship carrierId "Fleet carrier Solstice" (Surface Carrier) 0 0

        escorts : List Ship
        escorts =
            [ ship "kestrel" "Kestrel" (Surface Escort) -460 210, ship "gull" "Gull" (Surface Escort) 320 -530 ]
                ++ (if extraEscort then
                        [ ship "petrel" "Petrel" (Surface Escort) 510 380 ]

                    else
                        []
                   )
    in
    { carrier | directHits = Just 0, fighterCount = Just (toFloat (1 + floor (fighterRoll * 3))) } :: escorts


carrierSize : { halfLength : Float, halfBeam : Float, deckHeight : Float }
carrierSize =
    { halfLength = 108, halfBeam = 16, deckHeight = 17 }


{-| How many direct hits doom the carrier; the mission definition owns it.
-}
fatalHits : Int
fatalHits =
    PatrolMission.carrierFatalHits


type alias Carrier a =
    { a | directHits : Int, hull : Float, flood : Float, disabled : Bool, speed : Float }


{-| Hits before the fatal one are survivable. The fatal hit opens a permanent
flood and stops her; further hits remove what buoyancy remains.
-}
registerCarrierHit : Carrier a -> Carrier a
registerCarrierHit ship =
    let
        hits : Int
        hits =
            ship.directHits + 1

        hit : Carrier a
        hit =
            { ship
                | directHits = hits
                , hull =
                    M.max 1
                        (ship.hull
                            - (if hits <= fatalHits then
                                30

                               else
                                10
                              )
                        )
                , flood = M.max ship.flood (toFloat (hits * 2))
            }
    in
    if fatalHits <= hits then
        { hit | disabled = True, speed = 0 }

    else
        hit


{-| Damage from anything but a direct torpedo hit. Until she is doomed the
carrier keeps at least one point of hull.
-}
incidentalHull : { a | kind : Kind, hull : Float, directHits : Int } -> Float -> Float
incidentalHull ship damage =
    let
        lowest : Float
        lowest =
            if ship.kind == Surface Carrier && ship.directHits < fatalHits then
                1

            else
                0
    in
    M.max lowest (ship.hull - damage)


carrierDoomed : { a | directHits : Int } -> Bool
carrierDoomed ship =
    fatalHits <= ship.directHits


{-| Each hit past the fatal one speeds her descent after she slips under.
-}
carrierDescentFactor : { a | directHits : Int } -> Float
carrierDescentFactor ship =
    M.max 1 (toFloat (ship.directHits - fatalHits + 1))


{-| Once doomed she settles as buoyancy goes.
-}
advanceCarrierFlood : Float -> Carrier a -> Carrier a
advanceCarrierFlood dt ship =
    if fatalHits <= ship.directHits then
        { ship | hull = M.max 0 (ship.hull - dt * toFloat (ship.directHits - fatalHits + 1)) }

    else
        ship


{-| A saved carrier: one to three fighters, a finite non-negative flood that
the fatal hit has opened, and a hull that reaches zero only when doomed.
Whole-number counts are the decoder's to check.
-}
validCarrier : { a | fighterCount : Int, flood : Float, directHits : Int, hull : Float } -> Bool
validCarrier ship =
    ship.fighterCount
        >= 1
        && ship.fighterCount
        <= 3
        && not (isNaN ship.flood || isInfinite ship.flood)
        && ship.flood
        >= 0
        && (ship.directHits < fatalHits || ship.flood > 0)
        && ship.directHits
        >= 0
        && ship.hull
        >= 0
        && ship.hull
        <= 100
        && (ship.hull > 0 || fatalHits <= ship.directHits)
