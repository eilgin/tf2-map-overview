# Map-overview for the orangebox source engine (TF2, L4D, HL²:episode two,...)

## About

This project is aimed at captured player's movements during a match and showing it on a browser capable of handling the canvas element.
This tool can be used to improve strategic skills for tf2 competitive teams.

## Pre-requisite

You need to install at least sourcemod 1.4+ on your dedicated server (a compiled SMX plug-in is included with the source in the scripting-pawn dir).
You also need a modern web-browser.

## How to use it ?

1. Put "map-overview.smx" in the plugins directory where sourcemod is installed (should be something like `/orangebox/tf/addons/sourcemod/plugins`)
2. Change maps or reload your map (this should load the plugin).
3. Play your match
4. You should find a JSON file in the tf root directory
5. Copy it to the "records" directory of the "map_overview" project.
6. Launch index.html in your browser :)

## How to add more maps ?

Currently there's 3 overviewed maps (badlands, gullywash_pro and turbine_pro_rc1).
So basically you need 2 things :
* the overview image ;
* the location of the camera where you take the picture.

In order to get the right image along with the projection data, you need to:
* Enable the console by adding "-console" (`Right-click on TF2` > `Properties...` > `Launch options`)
* "Create a server" (choose your map)
* follow [this tutorial](https://developer.valvesoftware.com/wiki/Level_Overviews#Make_the_raw_overview_image) to take the raw overview image
* write down the projection data (this should look like `scale 6.00, pos_x -2651, pos_y 4027`) in JSON format (save it as a json file):

```json
    {
        "scale":6.00,
        "pos_x":-2651,
        "pos_y":4027
    }
```

* you'll find your screenshot in <game dir>/screenshots (JPEG or TGA format). If you take a screenshot using `jpeg`, don't forget to put `jpeg_quality` to at least 90 !
* modify it (crop where there's nothing to show, remove the green color)
* save it as a JPEG file : it has the best compression ratio (but no alpha channel!)
* paste the processed screenshot (it should be in PNG format) in the img directory along with the projection data file
* that's it !

## Improvements

There's a lot to do if you want it to be user-friendly (meaning that you could use it in a web server).
For instance, we need to compress the JSON file which could dramatically reduce the filesize (it's just a text file).
Hint : compress it using minifier (like google closure) and gzip or message pack.
For example, you can follow [this article](http://www.bearpanther.com/2012/04/11/gzip-json-generated-on-the-fly/).
Basically, you need to create (or modify) an .htaccess adding `application/json` to `AddOutputFilterByType`
