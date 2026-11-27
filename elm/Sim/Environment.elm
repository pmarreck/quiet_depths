module Sim.Environment exposing
    ( Config
    , Direction
    , Environment
    , Phase(..)
    , Sky
    , Soundings
    , Strike
    , Weather
    , WeatherId(..)
    , boatSurfacePose
    , defaultSeed
    , environmentAt
    , makeEnvironment
    , phaseName
    , scopePosition
    , scopeWashed
    , soundings
    , timeHours
    , timeIds
    , weather
    , weatherIdName
    , weatherIds
    )

{-| The patrol's weather and light: fronts that change every five minutes,
the sun and moon, morning fog, how far a lookout can see, lightning, and
whether a wave washes over the periscope lens.
-}

import Bitwise
import Sim.HullDesign exposing (design)
import Sim.Math as M
import Sim.PatrolCalendar as Calendar
import Sim.Periscope exposing (Scope, scopeEyeHeight)
import Sim.SurfaceMotion as Motion exposing (Point, Pose, Sea, boatPoint, hash01, surfaceHeight, surfaceMotion)


type WeatherId
    = Clear
    | Cloudy
    | Rain
    | Storm


{-| Every weather, in the order a seeded front draws from. A new weather
must be given its place in this chain before the module compiles.
-}
weatherIds : List WeatherId
weatherIds =
    let
        from id =
            id
                :: (case id of
                        Clear ->
                            from Cloudy

                        Cloudy ->
                            from Rain

                        Rain ->
                            from Storm

                        Storm ->
                            []
                   )
    in
    from Clear


weatherIdName : WeatherId -> String
weatherIdName id =
    case id of
        Clear ->
            "clear"

        Cloudy ->
            "cloudy"

        Rain ->
            "rain"

        Storm ->
            "storm"


type alias Weather =
    { name : String, cloud : Float, rain : Float, storm : Float, waveScale : Float, waveSpeed : Float, wind : Float, visibility : Float }


weather : WeatherId -> Weather
weather id =
    case id of
        Clear ->
            { name = "Clear", cloud = 0.12, rain = 0, storm = 0, waveScale = 0.55, waveSpeed = 0.75, wind = 9, visibility = 1 }

        Cloudy ->
            { name = "Cloudy", cloud = 0.82, rain = 0, storm = 0, waveScale = 1, waveSpeed = 1, wind = 22, visibility = 0.82 }

        Rain ->
            { name = "Rain", cloud = 0.95, rain = 0.6, storm = 0, waveScale = 1.45, waveSpeed = 1.2, wind = 38, visibility = 0.65 }

        Storm ->
            { name = "Storm", cloud = 1, rain = 1, storm = 1, waveScale = 2.6, waveSpeed = 1.55, wind = 65, visibility = 0.46 }


{-| The times a patrol can sail at, by their setup names, in draw order. -}
timeIds : List String
timeIds =
    [ "dawn", "day", "dusk", "night" ]


timeHours : String -> Maybe { name : String, hour : Float }
timeHours id =
    case id of
        "dawn" ->
            Just { name = "Dawn", hour = 6 }

        "day" ->
            Just { name = "Day", hour = 12 }

        "dusk" ->
            Just { name = "Dusk", hour = 18 }

        "night" ->
            Just { name = "Night", hour = 22 }

        _ ->
            Nothing


type alias Config =
    { startDay : Maybe Float, chartSeed : Float, startHour : Float, startWeather : WeatherId, changing : Bool, seed : Float }


defaultSeed : Float
defaultSeed =
    19830604


{-| JavaScript's `seed >>> 0`. -}
unsigned : Float -> Float
unsigned seed =
    toFloat (Bitwise.shiftRightZfBy 0 (M.toInt32 seed))


nth : Int -> List a -> Maybe a
nth i items =
    List.head (List.drop i items)


{-| A patrol's conditions from its seed and the setup choices: a named or
random time and weather, and whether fronts change.
-}
makeEnvironment : Float -> { timeOfDay : Maybe String, weather : Maybe String, changing : Bool } -> Config
makeEnvironment seed options =
    let
        startHour =
            if options.timeOfDay == Just "random" then
                nth (floor (hash01 seed 750 * 4)) timeIds |> Maybe.andThen timeHours |> Maybe.map .hour |> Maybe.withDefault (0 / 0)

            else
                options.timeOfDay |> Maybe.andThen timeHours |> Maybe.map .hour |> Maybe.withDefault 18

        startWeather =
            if options.weather == Just "random" then
                nth (floor (hash01 seed 751 * 4)) weatherIds |> Maybe.withDefault Clear

            else
                options.weather |> Maybe.andThen (\name -> List.filter (\id -> weatherIdName id == name) weatherIds |> List.head) |> Maybe.withDefault Clear
    in
    { startDay = Just (toFloat (Calendar.sailingDay seed))
    , chartSeed = unsigned seed
    , startHour = startHour
    , startWeather = startWeather
    , changing = options.changing
    , seed = unsigned seed
    }


type alias Direction =
    { x : Float, y : Float, z : Float }


type Phase
    = Night
    | Daytime
    | Dawn
    | Dusk


phaseName : Phase -> String
phaseName phase =
    case phase of
        Night ->
            "Night"

        Daytime ->
            "Day"

        Dawn ->
            "Dawn"

        Dusk ->
            "Dusk"


type alias Environment =
    { cloud : Float
    , rain : Float
    , storm : Float
    , waveScale : Float
    , waveSpeed : Float
    , wind : Float
    , visibility : Float
    , sampledAt : Maybe Float
    , wavePhase : Maybe Float
    , weather : String
    , weatherId : WeatherId
    , hour : Float
    , sunAltitude : Float
    , daylight : Float
    , twilight : Float
    , phase : Phase
    , fog : Float
    , date : String
    , holiday : Maybe Calendar.Holiday
    , day : Int
    , cycle : Float
    , illumination : Float
    , moonDirection : Direction
    , clearLight : Float
    , moonLight : Float
    , sunDirection : Direction
    , opticalRange : Float
    , subVisualRange : Float
    , lightRange : Float
    , navigationLights : Bool
    , seaState : Int
    , flash : Float
    }


type alias Strike =
    { time : Float, x : Float, y : Float }


{-| What the sky depends on. No conditions means a default patrol's. -}
type alias Sky a =
    { a | environment : Maybe Config, time : Float, wavePhase : Maybe Float, lightning : List Strike, x : Float, y : Float }


mix : Float -> Float -> Float -> Float
mix a b t =
    a + (b - a) * t


smooth : Float -> Float -> Float -> Float
smooth a b v =
    let
        t =
            M.clamp 0 1 ((v - a) / (b - a))
    in
    t * t * (3 - 2 * t)


noOptions : { timeOfDay : Maybe String, weather : Maybe String, changing : Bool }
noOptions =
    { timeOfDay = Nothing, weather = Nothing, changing = True }


environmentAt : Sky a -> Environment
environmentAt s =
    let
        cfg =
            Maybe.withDefault (makeEnvironment defaultSeed noOptions) s.environment

        time =
            if M.truthy s.time then
                s.time

            else
                0

        slot =
            toFloat (floor (time / 300))

        idAt n =
            if n <= 0 then
                cfg.startWeather

            else
                nth (floor (hash01 cfg.seed n * 4)) weatherIds |> Maybe.withDefault Clear

        ( earlier, later ) =
            if cfg.changing then
                ( idAt (slot - 1), idAt slot )

            else
                ( idAt 0, idAt 0 )

        a =
            weather earlier

        b =
            weather later

        -- Before the first change both sides are the starting weather, so
        -- blending them changes nothing.
        blend =
            if cfg.changing then
                smooth 0 75 (M.remainder time 300)

            else
                0

        mixed field =
            mix (field a) (field b) blend

        hour =
            M.remainder (M.remainder (cfg.startHour + time * 24 / Calendar.daySeconds) 24 + 24) 24

        angle =
            (hour - 6) * pi / 12

        sunAltitude =
            sin angle

        daylight =
            smooth (-0.14) 0.18 sunAltitude

        rain =
            mixed .rain

        mist =
            hash01 cfg.seed (8150 + toFloat (floor ((cfg.startHour + time * 24 / Calendar.daySeconds) / 24)))

        fog =
            if mist < 0.46 then
                (1 - smooth 0.05 0.55 rain) * smooth 4.5 5.75 hour * (1 - smooth 7 9 hour) * (0.64 + 0.3 * mist / 0.46)

            else
                0

        visibility =
            mixed .visibility * (1 - 0.79 * fog)

        cloud =
            mixed .cloud

        calendar =
            Calendar.patrolCalendar (Maybe.withDefault (toFloat (Calendar.sailingDay cfg.seed)) cfg.startDay) cfg.startHour time

        lunarAngle =
            angle - 2 * pi * calendar.cycle

        moonDirection =
            { x = cos lunarAngle, y = sin lunarAngle, z = -0.32 * cos (2 * pi * calendar.cycle) }

        clearLight =
            (1 - cloud) ^ 2 * (1 - fog)

        waveScale =
            mixed .waveScale

        flash =
            List.foldl
                (\strike brightest ->
                    let
                        age =
                            time - strike.time
                    in
                    if age >= 0 && age < 0.75 then
                        let
                            pulse =
                                M.exp (negate age * 13) + 0.75 * M.exp (negate (((age - 0.22) / 0.05) ^ 2))
                        in
                        M.max brightest (pulse / (1 + M.hypot2 (strike.x - s.x) (strike.y - s.y) / 14000))

                    else
                        brightest
                )
                0
                s.lightning
    in
    { cloud = cloud
    , rain = rain
    , storm = mixed .storm
    , waveScale = waveScale
    , waveSpeed = mixed .waveSpeed
    , wind = mixed .wind
    , visibility = visibility
    , sampledAt = Maybe.map (\_ -> time) s.wavePhase
    , wavePhase = s.wavePhase
    , weather =
        if fog > 0.16 then
            "Morning fog"

        else if blend < 0.5 then
            a.name

        else
            b.name
    , weatherId =
        if blend < 0.5 then
            earlier

        else
            later
    , hour = hour
    , sunAltitude = sunAltitude
    , daylight = daylight
    , twilight = 1 - M.abs (daylight * 2 - 1)
    , phase =
        if daylight < 0.12 then
            Night

        else if daylight > 0.9 then
            Daytime

        else if hour < 12 then
            Dawn

        else
            Dusk
    , fog = fog
    , date = calendar.date
    , holiday = calendar.holiday
    , day = calendar.day
    , cycle = calendar.cycle
    , illumination = calendar.illumination
    , moonDirection = moonDirection
    , clearLight = clearLight
    , moonLight = calendar.illumination * smooth (-0.01) 0.12 moonDirection.y * clearLight
    , sunDirection = { x = cos angle, y = sin angle, z = -0.32 }
    , opticalRange = (3900 + 2600 * daylight) * visibility
    , subVisualRange = (1800 + 3700 * daylight) * visibility
    , -- Fog shortens it; clear air multiplies by exactly 1.
      lightRange = (7000 - 1000 * daylight) * (0.65 + 0.35 * visibility) * (1 - 0.55 * fog)
    , navigationLights = daylight < 0.85 || fog > 0.16
    , seaState =
        if waveScale < 0.7 then
            2

        else if waveScale < 1.2 then
            3

        else if waveScale < 1.8 then
            4

        else
            6
    , flash = flash
    }


{-| How the boat rides the sea in these conditions. -}
boatSurfacePose : { a | x : Float, y : Float, heading : Float, depth : Float, pitch : Float } -> Sea b -> Float -> Pose
boatSurfacePose =
    surfaceMotion


{-| Where the periscope's eye is, raised as far as it has traveled. -}
scopePosition : Pose -> Scope a -> Point
scopePosition pose s =
    boatPoint pose { side = 0, forward = negate design.scopeZ, down = negate (scopeEyeHeight s) }


{-| Whether the lens is under the passing wave, with a hand's breadth of spray. -}
scopeWashed : { a | scope : Bool, scopeTravel : Maybe Float, x : Float, y : Float, heading : Float, depth : Float, pitch : Float, time : Float } -> Environment -> Bool
scopeWashed s e =
    let
        eye =
            scopePosition (boatSurfacePose s e s.time) s
    in
    negate eye.depth <= surfaceHeight eye.x eye.y s.time e + 0.15


type alias Soundings =
    { waterDepth : Float, referenceDepth : Float, belowKeel : Float, keelOffset : Float }


soundings : Float -> Float -> Float -> Soundings
soundings waterDepth referenceDepth keelOffset =
    { waterDepth = waterDepth, referenceDepth = referenceDepth, belowKeel = waterDepth - referenceDepth - keelOffset, keelOffset = keelOffset }
