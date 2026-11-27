module Sim.HullDesign exposing (Station, design)

{-| The fictional 1972 patrol boat's dimensions in meters. Form references:
USS Barbel and Blueback (NHHC). The retained dual-purpose gun and compact ROV
launch are game refits.
-}


type alias Station =
    { z : Float, radius : Float }


design :
    { year : Int
    , hullRadius : Float
    , propellerRadius : Float
    , propellerPitch : Float
    , propellerZ : Float
    , propellerBlades : Int
    , shaftRadius : Float
    , sailRadius : Float
    , sailBarrel : Float
    , sailStretch : Float
    , bridgeZ : Float
    , bridgeRoof : Float
    , bridgeEye : Float
    , bridgeRailRadius : Float
    , scopeZ : Float
    , scopeEye : Float
    , tubeSide : Float
    , tubeDown : Float
    , tubeForward : Float
    , stations : List Station
    }
design =
    { year = 1972
    , hullRadius = 5
    , propellerRadius = 1.9
    , propellerPitch = 2.4
    , propellerZ = 34.2
    , propellerBlades = 5
    , shaftRadius = 0.28
    , sailRadius = 2.1
    , sailBarrel = 7
    , sailStretch = 2.5
    , bridgeZ = -5
    , bridgeRoof = 12.6
    , bridgeEye = 14.2
    , bridgeRailRadius = 0.55
    , scopeZ = -3.6
    , scopeEye = 17
    , tubeSide = 0.75
    , tubeDown = 0.65
    , tubeForward = 31.65
    , stations =
        [ Station -32.5 0.05
        , Station -31 1.8
        , Station -27 3.8
        , Station -21 4.8
        , Station -12 5
        , Station 5 5
        , Station 15 4.5
        , Station 22 3.3
        , Station 28 1.6
        , Station 31 0.65
        , Station 32.5 0.36
        ]
    }
