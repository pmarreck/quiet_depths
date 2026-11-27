module Sim.Debrief exposing (Entry, add)

{-| The end-of-patrol debrief: what actually happened, oldest first. A line
repeated within four patrol seconds is recorded once, and only the latest 48
lines are kept.
-}


type alias Entry =
    { time : Float, text : String }


limit : Int
limit =
    48


add : Float -> String -> List Entry -> List Entry
add time text entries =
    case List.head (List.reverse entries) of
        Just last ->
            if last.text == text && time - last.time < 4 then
                entries

            else
                keepLatest (entries ++ [ { time = time, text = text } ])

        Nothing ->
            [ { time = time, text = text } ]


keepLatest : List Entry -> List Entry
keepLatest entries =
    if limit < List.length entries then
        List.drop 1 entries

    else
        entries
