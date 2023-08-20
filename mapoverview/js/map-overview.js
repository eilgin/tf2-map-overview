/**
* Map overview JS functions
* 
* @version 0.1
* @author eilgin
*/

// ID selector
function $(id){return document.getElementById(id);}

// polyfill taken from http://paulirish.com/2011/requestanimationframe-for-smart-animating/
(function() {
    var lastTime = 0;
    var vendors = ['ms', 'moz', 'webkit', 'o'];
    for(var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
        window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
        window.cancelAnimationFrame = 
          window[vendors[x]+'CancelAnimationFrame'] || window[vendors[x]+'CancelRequestAnimationFrame'];
    }
 
    if (!window.requestAnimationFrame)
        window.requestAnimationFrame = function(callback, element) {
            var currTime = new Date().getTime();
            var timeToCall = Math.max(0, 16 - (currTime - lastTime));
            var id = window.setTimeout(function() { callback(currTime + timeToCall); }, 
              timeToCall);
            lastTime = currTime + timeToCall;
            return id;
        };
 
    if (!window.cancelAnimationFrame)
        window.cancelAnimationFrame = function(id) {
            clearTimeout(id);
        };
}());

// Create a global object only if one does not already exist. We create the
// methods in a closure to avoid creating global variables
var TFVIEW = (function(window) 
{
    // var. declaration
    var recordFilename, recordPath, overViewPath, OverViewInfoPath;
    
    // external objects to load
    var recordFile,
        overviewImage,
        overviewInfo;
    
    // this object manages controls itself
    var HTMLCanvas,
        HTMLPlayButton,
        HTMLPauseButton,
        HTMLSlider,
        HTMLDebugInfo;
    
    var snapshotRate; // snapshots taken per second (default: 10)
    var deltaTime; // 1000(ms)/snapshotRate (default: 100ms)
    var futureStep = 0; // timestamp + deltaTime
    var timeout_handle; // needed by cancelAnimationFrame
    var debugging = false;
    
    var currentIndexPosition = 0; // specify which snapshot is currently used
    var nextIndexPosition = 0; // we specify the next position to interpolate values
    var recordedSnapshots = []; // Array of Snapshot
    
    // interpolated players position array
    var interpolatedPlayers = [];
    
    //////////////////////////////////
    // internal objects
    //////////////////////////////////
    
    /*
     * Snapshot contains every bit of information for one tick (entities, events,...).
     * At the moment, it only contains player infos.
     */
    function Snapshot(players)
    {
        this.players = players;
        
        this.toString = function()
        {
            var ret = "<strong>snapshot #" + currentIndexPosition + "</strong> :<br>";
            ret += "<ol>";
            for (var i = 0; i < players.length; i++)
            {
                ret += players[i].toString();
            }
            ret += "</ol><hr>";
            
            return ret;
        }
    }
    
    /*
     * Container object for one player
     */
    function Player(name, teamNumber, classNumber, posx, posy, yaw)
    {
        this.name = name;
        this.teamNumber = teamNumber;
        this.teamName = (teamNumber == 0) ? "red" : "blu";
        this.classNumber = classNumber;
        this.className = 
            ["unknown",
            "scout",
            "sniper",
            "soldier",
            "demoman",
            "medic",
            "heavy",
            "pyro",
            "spy",
            "engineer"][classNumber];
        this.posx = posx;
        this.posy = posy;
        this.yaw = yaw;
        
        this.toString = function()
        {
            return "<li>player: " + this.name
            + ", " + this.teamName
            + ", " + this.className
            + ", posX: " + this.posx
            + ", posY: "+ this.posy
            + ", yaw: " + this.yaw
            + "</li>";
        }
    }
    
    //////////////////////////////////
    // utility functions
    //////////////////////////////////
    
    /*
     * used to sort Players in a snapshot
     * params are Player objects
     * !! players could have same names !!
     */
    function compare(a,b) {
        if (a.name < b.name)
            return -1;
        if (a.name > b.name)
            return 1;
        return 0;
    }
    
    /*
     * 0 <= delta <= 1
     */
    function lerp1D(xA, xB, delta)
    {
        if (xA < xB)
            return (xA + Math.abs(xA - xB)*delta)
        else
            return (xA - Math.abs(xA - xB)*delta)
    }
    
    
    //////////////////////////////////
    // methods
    //////////////////////////////////
    
    /*
     * First method to call when using "map overview";
     * Should init. debug info, loading all stuff and
     * be prepared to play the given file
     */
    function _init(initObj)
    {      
        HTMLCanvas = $(initObj["canvas_id"]);
        HTMLPlayButton = $(initObj["play_id"]);
        HTMLPauseButton = $(initObj["pause_id"]);
        HTMLSlider = $(initObj["slider_id"]);
        HTMLDebugInfo = _outputDebug(initObj["debug_id"]);
        
        recordFilename = initObj["record_filename"];
        
        recordPath = initObj["recordpath"] || "./records/";
        overViewPath = initObj["overviewpath"] || "./img/maps/";
        OverViewInfoPath = initObj["ovinfopath"] || "./img/maps/";
        
        loadRecordFile(recordFilename);
        
        // disable handlers until data are fully loaded
        HTMLSlider.setAttribute("disabled", "");
        HTMLPlayButton.setAttribute("disabled", "");
        HTMLPauseButton.setAttribute("disabled", "");
    }
    
    /*
     * given a full path filename,
     * load all snapshots and store it in a local Array.
     * Also, trigger the loading of the right map and infos
     */
    function loadRecordFile(filename)
    {
        var xhr = new XMLHttpRequest();
        
        var fname = recordPath + filename + ".json";
        
        // create progress elements
        // debug info (loading event)
        if (HTMLDebugInfo)
        {
            var loadEl = document.createElement("p");
            loadEl.setAttribute("id", "pRecord");
            loadEl.innerHTML = "<em>loading... " + fname + "</em>";
            
            var progressEl = document.createElement("progress");
            progressEl.setAttribute("id", "progressRecord");
            progressEl.setAttribute("min", "0");
            progressEl.setAttribute("max", "100"); 
            
            HTMLDebugInfo.appendChild(loadEl);
            HTMLDebugInfo.appendChild(progressEl);
        }

        xhr.open("GET", fname, true);
        xhr.setRequestHeader("Accept-Encoding","gzip,deflate");

        xhr.onreadystatechange = function(event)
        {
            if (this.readyState == 4)
            {
                // parse JSON
                recordFile = JSON.parse(event.target.responseText);
                
                // retrieve infos
                snapshotRate = recordFile.snapshotrate;
                deltaTime = 1000.0/snapshotRate;
                
                var mapname = recordFile.mapname;
                
                // load raw snapshots
                var indSnap, indPlayer;
                for (indSnap = 0; indSnap < recordFile.values.length; indSnap++)
                {
                    var players = [];
                    var currentSnap = recordFile.values[indSnap];
                    
                    // we assure that players are always at the same index
                    currentSnap.sort(compare);
                    
                    for (indPlayer = 0; indPlayer < currentSnap.length; indPlayer++)
                    {
                        var currentPlayer = currentSnap[indPlayer];
                        players.push(
                            new Player(
                                currentPlayer[0],
                                currentPlayer[1],
                                currentPlayer[2],
                                currentPlayer[3],
                                currentPlayer[4],
                                currentPlayer[5]
                            )
                        );
                    }
                    
                    recordedSnapshots.push( new Snapshot(players) );
                }
                
                // we must load related overview{map|infos} AFTER saving snapshots
                loadOverviewInfo(mapname);
                loadOverviewImage(mapname);
            }
        };
        
        xhr.onprogress = function(event)
        {
            if (event.lengthComputable && HTMLDebugInfo)
            {
                var pourcentage = Math.round(event.loaded*100/event.total);
                
                // update progress bar
                var progressEl = $("progressRecord");
                progressEl.value = pourcentage;
                progressEl.innerHTML = pourcentage + " %";
            }
        };
        
        xhr.onload = function()
        {
            if (HTMLDebugInfo)
            {
                // destroy progress elements          
                loadEl.innerHTML = "<strong>record file loaded !</strong>";
                progressEl.parentNode.removeChild(progressEl);
            }
        };
        
        xhr.send(null);
    }
    
    /*
     * load the right screenshot (in JPEG format).
     * This should be the last thing to be loaded
     * because it enables controls.
     */
    function loadOverviewImage(name)
    {
        overviewImage = new Image();
        overviewImage.onload = function()
        {
            // enable handler
            HTMLSlider.removeAttribute("disabled");
            HTMLPlayButton.removeAttribute("disabled");
            HTMLPauseButton.removeAttribute("disabled");
            
            // init. handler
            // update the slider control
            HTMLSlider.setAttribute("max", _fileLength()-1);
            HTMLSlider.addEventListener('change', function(){ setIndexPosition(HTMLSlider.value); }, false);
            HTMLPlayButton.addEventListener('click', function(){ _play(); }, false);
            HTMLPauseButton.addEventListener('click', function(){ _pause(); }, false);
            
            // update canvas size
            HTMLCanvas.width = overviewImage.width;
            HTMLCanvas.height = overviewImage.height;
            
            // draw first snapshot
            setIndexPosition(0);
        };
        overviewImage.src = overViewPath + name + ".jpg";
    }
    
    /*
     * load the right world-to-view transformation
     * (translate, rotate, scale)
     */
    function loadOverviewInfo(name)
    {
        var fname = OverViewInfoPath + name + ".json";
        var xhr = new XMLHttpRequest();
        
        // we make a synchronous fetch (it's a small file)
        xhr.open("GET", fname, false);
        
        xhr.onreadystatechange = function(event)
        {
            if (this.readyState == 4)
            {
                // parse JSON
                overviewInfo = JSON.parse(event.target.responseText);
            }
        };
        
        xhr.send(null);
    }
    
    
    /*
     * advance one step further
     * updating every entities.
     * at the moment, it should only updates
     * players positions.
     */
    function update(timestamp)
    {
        // create new interval
        if ((futureStep - timestamp) <= 0)
        {
            futureStep = timestamp + deltaTime;
            interpolatedPlayers = [];
            
            var max = _fileLength()-1; // snapshot[max] is obviously undefined
            currentIndexPosition = nextIndexPosition;
            nextIndexPosition = Math.min(nextIndexPosition+1, max);
            
            var players = recordedSnapshots[currentIndexPosition]["players"];
            // take into account that the player might be dead in the next snapshot
            // in this case, we don't update his properties
            var nplayers = recordedSnapshots[nextIndexPosition]["players"];
            
            for (var i = 0; i < players.length; i++)
            {
                var p = players[i];
                var np = nplayers[i];
                
                // recordedSnapshots is sorted by name
                // if currentPlayer != nextPlayer then
                // we choose a "fake" end position
                if (np === undefined || p["name"] != np["name"])
                {
                    np = {posx: p["posx"], posy:p["posy"], yaw:p["yaw"]};
                }
                
                interpolatedPlayers.push({
                    player: p,
                    
                    sposx: p["posx"],
                    sposy: p["posy"],
                    syaw: p["yaw"],
                    
                    eposx: np["posx"],
                    eposy: np["posy"],
                    eyaw: np["yaw"],
                    
                    iposx: p["posx"],
                    iposy: p["posy"],
                    iyaw: p["yaw"]
                });
            }
            
            /*if (debugging)
            {
                debug(recordedSnapshots[currentIndexPosition]);
            }*/
            
            // update slider
            HTMLSlider.value = currentIndexPosition;
        }
    }
    
    /*
     * we interpolate using lerp1D.
     * Interpolation is separate from update method just
     * to avoid boucing movements when user moves the slider
     */
    function interpolate(timestamp)
    {
        var delta = 1.0 - ((futureStep - timestamp)/deltaTime);
        
        var len = interpolatedPlayers.length;
        
        for (var ii = 0; ii < len; ii++)
        {
            var iplayer = interpolatedPlayers[ii];
            
            iplayer["iposx"] = lerp1D(iplayer["sposx"], iplayer["eposx"], delta);
            iplayer["iposy"] = lerp1D(iplayer["sposy"], iplayer["eposy"], delta);
            iplayer["iyaw"] = lerp1D(iplayer["syaw"], iplayer["eyaw"], delta);
        }
    }
    
    /*
     * make all the necessary transformations
     * and display the results.
     * This should be called after calling
     * the update method
     */
    function draw()
    {
        var ctx = $("map-overview").getContext('2d');
        
        var halfWidthMap = overviewImage.width/2;
        var halfHeightMap = overviewImage.height/2;

        // mapping between 1 px and 1 'world unit'
        // the following values come from "cl_leveloverview"
        var posX = -overviewInfo["pos_x"];
        var posY = overviewInfo["pos_y"];
        
        var x_unit_to_pixel = (halfWidthMap/posX);
        var y_unit_to_pixel = (halfHeightMap/posY);
        
        ctx.clearRect(0,0, overviewImage.width, overviewImage.height);
        ctx.drawImage(overviewImage, 0, 0);
        
        ctx.save();
        
        // move the drawing cursor to the center of the image
        ctx.translate(halfWidthMap, halfHeightMap);
        
        for (var i = 0, len = interpolatedPlayers.length; i < len; i++)
        {
            var iplayer = interpolatedPlayers[i];
            
            ctx.save();
            
            // Position
            ctx.translate(iplayer["iposx"]*x_unit_to_pixel, -iplayer["iposy"]*y_unit_to_pixel);

            // Team
            switch (iplayer["player"]["teamNumber"])
            {
                case 0:
                ctx.strokeStyle = ctx.fillStyle = "red";
                break;
                case 1:
                ctx.strokeStyle = ctx.fillStyle = "blue";
                break;
                default:
                ctx.strokeStyle = ctx.fillStyle = "yellow";
                break;
            }
            
            // Name
            ctx.font = "7pt Arial";
            var str = iplayer["player"]["name"];
            var strSize = ctx.measureText(str);
            ctx.fillText(str, -Math.round(strSize.width)/2, -10);
            
            // Rotation
            ctx.rotate(-iplayer["iyaw"] * (Math.PI/180));
            
            // Circle + direction drawing
            ctx.beginPath();
            var wCursor = 3;
            ctx.lineTo(-wCursor, 0);
            ctx.lineTo(wCursor*2, 0);
            ctx.arc(0, 0, wCursor, 0, Math.PI*2);
            ctx.stroke(); // or fill();
            ctx.closePath();
            
            // "Look at" drawing
            //ctx.translate(-sight.width/2, -sight.height/2);
            //ctx.drawImage(sight, 0, 0);
            //ctx.drawImage(cursor, 0, 0);
            
            ctx.restore();
        }
        ctx.restore();
    }
    
    /*
     * Get a HTML element (that should be defined with
     * his overflow to 'auto')
     */
    function _outputDebug(elementID)
    {
        var el = $(elementID);
        
        if (el)
        {
            debugging = true;
        }
        
        return el;
    }
    
    /*
     * insert every useful infos like positions and maybe
     * events like capturing points, death, wins...
     */
    function debug()
    {
        var i;
        
        if (debugging)
        {
            for (i = 0; i < arguments.length; i++)
            {
                HTMLDebugInfo.innerHTML += arguments[i].toString() + "<br>";
            }
        }            
    }
    
    /*
     * update the current player position
     * to the next snapshot until the last one.
     * this method should deal with the animation
     * framerate, debugging.
     */
    function _play()
    {
        timeout_handle = requestAnimationFrame(function(timestamp) {
            update(timestamp);
            interpolate(timestamp);
            draw();
            
            if (currentIndexPosition == _fileLength()-1)
            {
                _pause();
            }
            _play();
        });
    }
    
    /*
     * stop the animation to the last requested
     * snapshot
     */
    function _pause()
    {
        cancelAnimationFrame(timeout_handle);
    }
    
    function clamp(val, min, max)
    {
        return Math.max(Math.min(val, max), min);
    }
    
    /*
     * this method should be used to request
     * a specific snapshot and verifying if
     * the given value is valid
     * (0 <= val <= lastSnapshotNumber)
     */
    function setIndexPosition(val)
    {     
        _pause();
        
        var max = _fileLength()-1;
        // val could be a floating-point number
        val = clamp(parseInt(val), 0, max);
        
        currentIndexPosition = nextIndexPosition = val;
        
        update(performance.now());
        draw();
    }
    
    /*
     * this must be call after initialization
     */
    function _fileLength()
    {
        return recordedSnapshots.length;
    }
    
    /*
     * This global object returns
     * "public" functions plus getters/setters
     */
    return {
        init: _init
        /*,
        fileLength: _fileLength
        ,
        play: _play
        ,
        goToPos: setIndexPosition
        ,
        pause: _pause
        ,
        outputDebug: _outputDebug*/
    };
})(window);