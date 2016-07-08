/*eslint-env node*/

//------------------------------------------------------------------------------
// node.js starter application for Bluemix
//------------------------------------------------------------------------------

// This application uses express as its web server
// for more info, see: http://expressjs.com
var express = require('express');

// cfenv provides access to your Cloud Foundry environment
// for more info, see: https://www.npmjs.com/package/cfenv
var cfenv = require('cfenv');

// create a new express server
var app = express();

// serve the files out of ./public as our main files
app.use(express.static(__dirname + '/public'));
var FAKE_JAM_ENABLED = false;
app.get('/', function(req,res,next) {
    if (FAKE_JAM_ENABLED) {
        client.emit("createJam");
    }
    
});

// get the app environment from Cloud Foundry
var appEnv = cfenv.getAppEnv();

// start server on the specified port and binding host
// app.listen(appEnv.port, '0.0.0.0', function() {
//   // print a message when the server starts listening
//   console.log("server starting on " + appEnv.url);
// });
var http = require('http').Server(app);
var io = require('socket.io')(http);
var client;
io.on("connection", function(sio_client) {
    client = sio_client;
});
http.listen(appEnv.port, function() {
    console.log("server starting on "+ appEnv.url);
});


var request = require('request');
var xml2js = require('xml2js');
var parseString = xml2js.parseString;
var fs = require('fs');
var jsonfile = require('jsonfile');
var watson = require('watson-developer-cloud');
var moment = require('moment-timezone');
var fileExists = require('file-exists');
var visual_recognition = watson.visual_recognition({
  api_key: process.env.WATSON_VISUAL_RECOGNITION_KEY,
  version: 'v3',
  version_date:'2016-05-20'
});



//Road
app.get('/journey/road/:lat/:lng', function(req,res,next) {
    var lat = req.params.lat;
    var lng = req.params.lng;

    //start example
    //51.505858, -0.139904

    //lhr
    //51.4716677,-0.4579162

    //http request to 
    //http://openls.geog.uni-heidelberg.de/route?start=-0.139904,51.505858&end=-0.452886,51.471440&via=&lang=en&distunit=MI&routepref=Car&weighting=Fastest&avoidAreas=&useTMC=false&noMotorways=false&noTollways=false&noUnpavedroads=false&noSteps=false&noFerries=false&instructions=false
    var url = 'http://openls.geog.uni-heidelberg.de/route?start='+lng+','+lat+'&end=-0.4579162,51.4716677&via=&lang=en&distunit=MI&routepref=Car&weighting=Fastest&avoidAreas=&useTMC=false&noMotorways=false&noTollways=false&noUnpavedroads=false&noSteps=false&noFerries=false&instructions=false';

    request(url, function (error, response, body) {
        parseString(body, function (err, directions) {
            if (err) {
                return res.json({err: error});
            }
            if (directions) {
                if (directions.error) {
                    return res.json({err: directions.error});
                }
                if (!error && response.statusCode == 200) {

                    //Extract polyline and return array of lat lng objects
                    if (directions['xls:XLS']['xls:Response']) {
                        var points = directions['xls:XLS']['xls:Response'][0]['xls:DetermineRouteResponse'][0]['xls:RouteGeometry'][0]['gml:LineString'][0]['gml:pos'];
                        var summary = directions['xls:XLS']['xls:Response'][0]['xls:DetermineRouteResponse'][0]['xls:RouteSummary'][0];
                        var time = summary['xls:TotalTime'];
                        var distance = summary['xls:TotalDistance'];

                        res.json({time: time, distance: distance, points: points}); 
                    } else {
                        client.emit("err", "No road route found, please try a different starting location");
                        res.json({err: 'no route found'});
                    }
                               
                    
                } else {
                    console.log(error);
                    console.log(response.statusCode);
                }
            }
            
        });
        
    });

});

//Rail - tfl
app.get('/journey/railTfl/:lat/:lng', function(req,res,next) {
    
    var lat = req.params.lat;
    var lng = req.params.lng;

    //start example
    //51.505858, -0.139904

    //lhr
    //51.471440, -0.452886

    //https://api.tfl.gov.uk/journey/journeyresults/51.505858,-0.139904/to/51.471440,-0.452886
    var url = 'https://api.tfl.gov.uk/journey/journeyresults/'+lat+','+lng+'/to/51.4716677,-0.4579162?adjustment=TripFirst';
    request(url, function (error, response, body) {
        var plan = JSON.parse(body);
        if (plan.error) {
            return res.json({err: plan.error});
        }
        if (!error && response.statusCode == 200) {
            if (plan.journeys) {

                var journeys = plan.journeys;
                var journeysReturn = [];

                for (var i=0; i<journeys.length; i++) {
                    (function(iteration_outer) {
                        var journey = journeys[iteration_outer];

                        var duration = journey.duration;
                        var arrivalDateTime = journey.arrivalDateTime;
                        var startDateTime = journey.startDateTime;
                        var legs = journey.legs;

                        var points = "";
                        var instructions = [];
                        


                        for (var j=0; j<legs.length; j++) {
                            (function(iteration_inner) {
                                //Get line string
                                var lineString = legs[iteration_inner].path.lineString;
                                var summary = legs[iteration_inner].instruction.summary;
                                instructions.push(summary);

                                //remove first and last chars
                                if (lineString) {
                                    lineString = lineString.substring(1,lineString.length-1);
                                    points= points + lineString + ",";
                                } 
                            })(j);
                            
                        }
                        //Convert points to array and add to object
                        points = points.substring(0,points.length-1);
                        points = "["+points+"]";


                        //Render html server side
                        var hours = String((new Date(arrivalDateTime)).getHours());
                        if (hours.length == 1) {
                            hours = "0"+hours;
                        }
                        var minutes = String((new Date(arrivalDateTime)).getMinutes());
                        if (minutes.length == 1) {
                            minutes = "0"+minutes;
                        }
                        var htmlString = "<h4>Public Transport Journey</h4>"+
                                  "<p class='rail-journey'><b>Arrive by: </b>"+hours +":"+minutes+"<br>" +
                                  "<b>Duration: </b>"+duration+" minutes<br>" +
                                  "<b>Instructions: </b>";
                      

                        for (var k=0; k<instructions.length; k++) {
                            (function(iteration_inner_one) {
                                htmlString += instructions[iteration_inner_one] +"<br>";
                            })(k);
                          
                        }
                        htmlString+="</p>";

                        //Check each journey to see if points already exist, we don't want duplicates
                        var addJourney = true;
                        for (k=0; k<journeysReturn.length; k++) {
                            var journPoints = JSON.stringify(journeysReturn[k].points);
                            if (journPoints == "["+points+"]") {
                                addJourney = false;
                                break;
                            }
                        }
                        if (addJourney) {
                            var array = JSON.parse("["+points+"]");
                            journeysReturn.push({duration: duration, arrivalDateTime: arrivalDateTime, startDateTime: startDateTime, points: array, instructions: htmlString}); 
                        }
                        
                    })(i);
                    
                }

                

                res.json({journeys: journeysReturn});
            } else {
                res.json({err: 'No journeys found'});
            }
        } else {
            console.log(error);
            console.log(response.statusCode);
        }
    });
});

//Parse xml and save to json file
app.get('/cameras/saveInfo', function(req,res,next) {
    parseCameraXML(function(json) {
        
        var cameras = json.syndicatedFeed.cameraList[0].camera;
        var cameraList = [];
        for (var i=0; i<cameras.length; i++) {
            //Get filename and lat lng
            var filename = cameras[i].file[0];
            var lat = cameras[i].lat[0];
            var lng = cameras[i].lng[0];

            cameraList.push({filename: filename, lat: lat, lng: lng});
        }

        jsonfile.writeFile('cameralist.json', cameraList, function (err) {
          console.error(err)
        });
        res.json({res:"complete"});
    });
});

app.get('/cameras/getAll', function(req,res,next) {
    jsonfile.readFile('cameralist.json', function(err, obj) {
      res.json({cameras:obj});
    });
});

function parseCameraXML(callback) {
    var XMLPath = "jamcams-camera-list.xml";
    callback(loadXMLDoc(XMLPath));
    function loadXMLDoc(filePath) {
        
        var json;
        try {
            var fileData = fs.readFileSync(filePath, 'ascii');
            var parser = new xml2js.Parser();
            parser.parseString(fileData.substring(0, fileData.length), function (err, result) {
                json = result;
            });
        return json;
    } catch (ex) {console.log(ex)}
 }
}

app.get('/cameras/scrape', function(req,res,next) {
    jsonfile.readFile('cameralist.json', function(err, obj) {
        var imagesDownloaded = 0;
        var cameras = obj;
        for (var i=0; i<cameras.length; i++) {
            (function(iteration){ 
                
                var filename = cameras[i].filename;
                
                //Make HTTP Request and download image
                setTimeout(function() {
                    downloadImage('http://www.tfl.gov.uk/tfl/livetravelnews/trafficcams/cctv/'+filename, 'cameras/'+filename, function(err){
                        if (!err) {
                    
                            imagesDownloaded++;

                            if (imagesDownloaded == cameras.length) {
                                console.log("Finished ---------------");
                                res.json({"res": "finished"});
                            }
                        }
                      
                    }); 
                },1500);
                 
            })(i);
        }
    });
})

function downloadImage(uri, filename, callback){
    console.log(filename);
  request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
};

app.get('/classifyImage/:filename', function(req,res,next) {

    //If nighttime use nighttime classifier
    var daytime = ['daytime_1503956357'];
    var nighttime = ['nighttime_1395702533'];

    var hour = parseInt(moment().tz("Europe/London").get('hour'));
    var classifierToUse;

    if ((hour < 6 || hour > 20) && !FAKE_JAM_ENABLED){
        classifierToUse = nighttime;
        console.log("using nighttime classifier");
    } else {
        classifierToUse = daytime;
        console.log("using daytime classifier");
    }

    var filename = req.params.filename;
    console.log(filename);
    var params;

    if (fileExists('public/historic_data/'+filename) && FAKE_JAM_ENABLED) {
        params = {
          images_file: fs.createReadStream('public/historic_data/'+filename),
          classifier_ids: classifierToUse
        };
    } else {
        params = {
          url: 'https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/'+filename,
          classifier_ids: classifierToUse
        };
    }
 
    
    visual_recognition.classify(params, function(err, response) {
      if (err) {
        console.log(err);
        res.json({'err': err});    
      } else {
        // console.log(JSON.stringify(response, null, 2));
        //res.json(response);


        //Get score and classification
        var images = response.images;
        if (images[0].error) {
            return res.json({err: images[0].error.description})
        }
        console.log(images[0]);
        if (images[0].classifiers.length > 0) {
            result = images[0].classifiers[0].classes[0];
            
            //this indicates a positive classification
            res.json({classification: "Congested", confidence: result.score})
        } else {
            res.json({classification: "Not Congested"});
        }

      }
        
    });
});

app.get('/createJam',function(req,res,next) {
    FAKE_JAM_ENABLED=true;

    //Send websocket message over socket.io to add notification
    client.emit("createJam");
    res.sendStatus(200);
});

app.get('/stopJam',function(req,res,next) {
    FAKE_JAM_ENABLED=false;
    client.emit("stopJam");
    res.sendStatus(200);
});

app.get('/isFakeJam',function(req,res,next) {
    res.json({fake_jam: FAKE_JAM_ENABLED});
});