module Sim.SeabedContact exposing (seabed)

{-| The boat against the charted seabed: settling on it, pushed off a shoal,
a landing that may strike hard, and the hull scraping while it moves.
-}

import Dict
import Sim.DamageControl exposing (Moving)
import Sim.Equipment exposing (System(..))
import Sim.HullGeometry exposing (Body, keelLimit, pushOffShoal)
import Sim.Math as M
import Sim.Mechanics as Mechanics exposing (LogKind(..))
import Sim.ReplayEvents as Replay
import Sim.SeabedRest as SeabedRest
import Sim.Systems as Systems


bodyOf : Moving w -> Body
bodyOf s =
    { x = s.x
    , y = s.y
    , depth = Just s.depth
    , heading = s.heading
    , pitch = Just s.pitch
    , roll = s.roll
    , speed = s.speed
    , verticalSpeed = Just s.verticalSpeed
    , kind = Nothing
    , id = Nothing
    , name = Nothing
    , hull = Just s.hull
    , military = Nothing
    , fixedWreck = False
    , directHits = Nothing
    }


seabed : Float -> Moving w -> Moving w
seabed dt s =
    let
        keelDepth : Float
        keelDepth =
            keelLimit (bodyOf s) s.chart
    in
    if keelDepth < s.depth then
        let
            settled : Moving w
            settled =
                { s | depth = M.max 0 keelDepth }

            pushed : Moving w
            pushed =
                if keelDepth < 0 then
                    pushOffShoal settled (negate keelDepth) s.chart

                else
                    settled

            landed : Moving w
            landed =
                if pushed.bottomed then
                    pushed

                else
                    let
                        impact : Float
                        impact =
                            SeabedRest.touchdownImpact (M.max 0 s.verticalSpeed) s.speed
                    in
                    touchdown impact pushed

            scraped : Moving w
            scraped =
                scrapeSeabed dt landed
        in
        { scraped | verticalSpeed = M.min 0 scraped.verticalSpeed, speed = scraped.speed * M.exp (negate dt * 1.5) }

    else if s.bottomed && s.depth < keelDepth - 1 then
        Mechanics.log "Off the bottom." Info { s | bottomed = False }

    else
        s


touchdown : Float -> Moving w -> Moving w
touchdown impact start =
    let
        s : Moving w
        s =
            { start | bottomed = True }

        chance : Float
        chance =
            SeabedRest.touchdownChance impact

        ( struck, drawn ) =
            if chance >= 1 then
                ( True, s )

            else if chance > 0 then
                Systems.draw s |> Tuple.mapFirst (\r -> r < chance)

            else
                ( False, s )
    in
    if not struck then
        Mechanics.log "Resting on the seabed. Stop the screw to stay quiet." Info drawn

    else
        let
            hurt : Moving w
            hurt =
                drawn
                    |> Replay.mark (Replay.at Replay.Ground { x = drawn.x, y = drawn.y, depth = drawn.depth })
                    |> Systems.hurt (SeabedRest.touchdownDamage impact) "Hard landing on the seabed. Check the hull." (Just Planes) Nothing
        in
        { hurt | collisionHits = Dict.insert "ground" hurt.time hurt.collisionHits }


scrapeSeabed : Float -> Moving w -> Moving w
scrapeSeabed dt s =
    let
        wear : Float
        wear =
            SeabedRest.seabedWear (M.max (M.abs s.speed) (M.abs s.targetSpeed)) dt * Systems.damageScale s
    in
    if wear <= 0 then
        s

    else
        let
            worn : Moving w
            worn =
                { s | outerHull = M.clamp 0 100 (s.outerHull - wear) }
        in
        if 20 < worn.time - (Dict.get "scrape" worn.collisionHits |> Maybe.withDefault -99) then
            Mechanics.log "Hull scraping the seabed. All stop or rise to stop the wear." Damage { worn | collisionHits = Dict.insert "scrape" worn.time worn.collisionHits }

        else
            worn
