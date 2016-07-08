var map, group, socket;
var polylineColours = ["RED", "GREEN", "ORANGE", "YELLOW", "PURPLE"];
//Embankment/Temple place and hyde park corner, a4 hogarth roundabout
var fakeJamCams = ["00001.02500.jpg","00001.06515.jpg", "00001.06604.jpg", "00001.06614.jpg", "00001.06593.jpg"];
var fakeJamCamLocations = [{lat: '51.5107', lng: '-0.11512'}, {lat: '51.5019', lng: '-0.15213'}, {lat: '51.4872',lng: '-0.25186'}, {lat: '51.4907', lng:'-0.21425'},
                           {lat: '51.5022', lng: '-0.15768'}];
var fakeJamCamGroup;

$(document).ready(function() {
    initMap();
    initSocketIO();
    //getFlights();
    map.on('popupopen', function (e) {
      // if (e.popup._content.indexOf("jpg") > -1)
      if (e.popup.options.className != "journey") {

          // var filename = e.popup._content;
          // var pname = filename.split('.').join("");
          // var mp4Filename = filename.substr(0,filename.length-3) + "mp4";
          var filename = e.popup.options.className;
          var pname = filename.split('.').join("");
          var mp4Filename = filename.substr(0,filename.length-3) + "mp4";

          $.get('/isFakeJam', function(res) {
            
            if (res.fake_jam && (fakeJamCams.indexOf(filename) > -1)) {
              e.popup.setContent("<div class='row'><div class='col-sm-6'><div class='camera-image'><h3>Latest camera feed</h3><img class='jamcam' src='historic_data/"+filename+"'/></div></div>"+
                "<div class='col-sm-6'><div class='camera-video'><h3>Latest video feed</h3><p>No video available</p></div></div></div>"+

                "<p id="+pname+">Image classifying with IBM Watson....</p>");


            } else {
              e.popup.setContent("<div class='row'><div class='col-sm-6'><div class='camera-image'><h3>Latest camera feed</h3><img class='jamcam' src='https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/"+filename+"'/></div></div>"+
                "<div class='col-sm-6'><div class='camera-video'><h3>Latest video feed</h3><video width='353' height='288' autoplay controls><source src='https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/"+mp4Filename+"' type='video/mp4'>Your browser does not support the video tag.</video></div></div></div>"+

                "<p id="+pname+">Image classifying with IBM Watson....</p>");
            }
            $.get('/classifyImage/'+filename, function(res) {
              if (res.err) {
                console.log(res.err);
                return;
              }
              if (res.confidence) {
                $("#"+pname).html("IBM Watson Classification: "+res.classification+" with a confidence score of: "+parseFloat(res.confidence).toFixed(3));
              } else {

                $("#"+pname).html("IBM Watson Classification: "+res.classification);
              }

            });
          });
    }

    
  });

    map.on('popupclose', function(e) {
       if (e.popup.options.className != "journey") {
         e.popup.setContent("");
       }
    });

    $("#showFakeJamCams").click(function(e) {
      e.preventDefault();
      createJam();
    });
    $("#hideFakeJamCams").click(function(e) {
      e.preventDefault();
      hideFakeJamCams();
    });
    $("#reset").click(function(e) {
      e.preventDefault();
      clearMap();
    })

});

function initMap() {
  map = L.map('map').setView([51.505, -0.09], 13);

  group = new L.featureGroup();
  fakeJamCamGroup = new L.featureGroup();
  map.addLayer(group);
  map.addLayer(fakeJamCamGroup);

  L.tileLayer('http://{s}.tile2.opencyclemap.org/transport/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  map.on('click', function(e) {

    //clear all markers and polylines
    group.clearLayers();

    var lat = e.latlng.lat;
    var lng = e.latlng.lng;

    var StartIcon = L.Icon.Default.extend({
        options: {
          iconUrl: 'marker-icon-start.png' 
      }
    });
     var startIcon = new StartIcon();
     var startPoint = new L.LatLng(lat,lng);
     L.marker(startPoint, {icon: startIcon}).setZIndexOffset(1000).addTo(group);

    

    var ROAD_RETURNED = false;
    var RAIL_RETURNED = false;
    getRoadDirections(lat,lng,function(polyline) {   
      polyline.addTo(group);
      // map.fitBounds(polyline.getBounds());
      mapCamerasOnRoadRoute(polyline, function() {
        ROAD_RETURNED = true;
        checkForCompletion();
      });
      
    });
    getRailDirections(lat,lng, function(polylines) { 
      for (var i=0; i<polylines.length; i++) {
          polylines[i].addTo(group);
          // map.fitBounds(polylines[i].getBounds());
      } 
      RAIL_RETURNED = true;
      checkForCompletion(); 
    });

    function checkForCompletion() {
      if (RAIL_RETURNED && ROAD_RETURNED) {

        var FinishIcon = L.Icon.Default.extend({
            options: {
              iconUrl: 'marker-icon-finish.png' 
          }
        });
         var finishIcon = new FinishIcon();
         var finishPoint = new L.LatLng("51.4716677","-0.4579162");
         L.marker(finishPoint, {icon: finishIcon}).setZIndexOffset(1000).addTo(group);

        map.fitBounds(group.getBounds());
      }
    }
  });
}

function initSocketIO() {
  socket = io.connect();
  socket.on('connect', function(data) {
      socket.on('createJam', function() {
        showFakeJamCams();
      });

      socket.on('stopJam', function() {
        hideFakeJamCams();
      });
      socket.on('err', function(msg) {
        var id = Date.now()
        appendNotification(msg,'error',id,3000);
      });
  });
}

function getRoadDirections(lat,lng,callback) {
    $.get('/journey/road/'+lat+'/'+lng, function(result) {
      console.log(result);
        if (!result.err) {
          var time = result.time[0];
          var distance = result.distance;

          var points = result.points;

          var pointList = [];
          for (var i=0; i<points.length; i++) {
              //Split each array item by space
              var split = points[i].split(" ");
              var newPoint = new L.LatLng(split[1],split[0]);
              pointList.push(newPoint)
          }

          var durationMinutes = parseInt(time.substring(2,time.length-1).split("M")[0]) +1;

          var arrivalTime = new Date(new Date().getTime() + durationMinutes*60000);
          var minutes = String(arrivalTime.getMinutes());
          var hours = String(arrivalTime.getHours());
          var durationMinutesString = String(durationMinutes);
          if (minutes.length == 1) {
            minutes = "0"+minutes;
          }
          if (durationMinutesString.length == 1) {
            durationMinutesString = "0"+durationMinutesString;
          }
          if (hours.length == 1) {
            hours = "0"+hours;
          }
          var htmlString = "<h4>Taxi Journey</h4>"+
                              "<p class='rail-journey'><b>Arrive by: </b>"+hours +":"+minutes+"<br>"+
                              "<b>Duration: </b>"+durationMinutesString+" minutes<br>";
                              
          var polyline = L.polyline(pointList, {color: 'BLUE', weight: 10, fillOpacity: 1})
            .bindPopup(htmlString,{className: "journey"});;
          callback(polyline);
        }
        
    });
}

function getRailDirections(lat,lng,callback) {

    $.get('/journey/railTfl/'+lat+'/'+lng, function(result) {

        var journeys = result.journeys;
        console.log(journeys);
        var polylines = [];
        for (var i=0; i<journeys.length; i++) {
            var journey = journeys[i];
            var duration = journey.duration; 
            var leaveAt = journey.startDateTime; 
            var arriveAt = journey.arrivalDateTime; 
            var instructions = journey.instructions;

            //get points
            var pointList = []
            var points = journey.points[0];
            for (var j=0; j<points.length; j++) {
                var newPoint = new L.LatLng(points[j][0],points[j][1]);
                pointList.push(newPoint)
            }
            // var htmlString = "<h4>Public Transport Journey</h4>"+
            //                   "<p class='rail-journey'><b>Arrive by: </b>"+(new Date(arriveAt)).getHours() +":"+(new Date(arriveAt)).getMinutes()+"<br>" +
            //                   "<b>Duration: </b>"+duration+" minutes<br>" +
            //                   "<b>Instructions: </b></p>";

            // var instructionsHTMLString = "";

            // for (var i=0; i<instructions.length; i++) {
            //   instructionsHTMLString += instructions[i] +"<br>";
            // }
            // instructionsHTMLString+="</p>";
            var polyline = L.polyline(pointList, {color: polylineColours[i],weight: 10, fillOpacity: 1})
                            .bindPopup(instructions,{className: "journey"});
            
            //polyline._popup.setContent("hello")


            // polyline.on('mouseover', function (e) {
            //     this.openPopup();
            // });
            // polyline.on('mouseout', function (e) {
            //     this.closePopup();
            // });

            polylines.push(polyline);
        }
        callback(polylines);

    });

}

// function getPublicTransportDirections(lat,lng,callback) {

//     $.get('/journey/rail/'+lat+'/'+lng, function(result) {
//         var routes = result.routes;

//         var polylines = [];
//         for (var i=0; i<routes.length; i++) {
//             var duration = routes[i].duration;
            
//             var pointList = [];
//             var routeParts = routes[i].route_parts;
         
//             for (var j=0; j<routeParts.length; j++) {
                
//                 var coords = routeParts[j].coordinates;
//                 //get coordinates and add to point array
//                 for (var k=0; k<coords.length; k++ ) {
                    
//                     if (coords[k][0] != 0 && coords[k][1] != 0) {
//                         var point = new L.LatLng(coords[k][1],coords[k][0]);
//                         pointList.push(point);
//                     }

                    
//                 }
//             }
            
//             polylines.push(L.polyline(pointList, {color: 'RED'}));
//         }
        

//         console.log("calling back");
//         callback(polylines);
//     });
// }

function mapCamerasOnRoadRoute(polyline,callback) {
    camerasOnRoute = [];
    $.get('/cameras/getAll', function(result) {

        var cameras = result.cameras;
        for (var i=0; i<cameras.length; i++) {
            var point = new L.LatLng(cameras[i].lat,cameras[i].lng);
            var fraction = L.GeometryUtil.locateOnLine(map,polyline,point);
            var interpolation = L.GeometryUtil.interpolateOnLine(map, polyline, fraction);
            var locationOnLine = interpolation.latLng;
            var distanceFromLine = locationOnLine.distanceTo(point).toFixed(0);

            if (distanceFromLine <= 100) {
               // point on line
               L.marker(point).bindPopup("",{className: cameras[i].filename}).addTo(group);
               camerasOnRoute.push(cameras[i]);
               
               //Extend the Default marker class
               var CamIcon = L.Icon.Default.extend({
                  options: {
                    iconUrl: 'marker-icon-camera.png' 
                }
              });
               var camIcon = new CamIcon();
               L.marker(point, {icon: camIcon}).bindPopup("",{className: cameras[i].filename}).addTo(group);
               camerasOnRoute.push(cameras[i]);
           }
       }

       callback(camerasOnRoute);

   });
}

function appendNotification(content,type,id,duration) {
  var messageID;

  if(id === null){
    messageID = $("#messages").children().length + 1;
  }else{
    messageID = id;
  }

  switch(type){
    case 'activate':
      $("#messages").append("<div id='" + messageID + "' class='message message-activate'><p><i class='fa fa-car'></i>" + content + "</p></div>");
      break;
    case 'error':
      $("#messages").append("<div id='" + messageID + "' class='message message-error'><p><i class='fa fa-exclamation'></i>" + content + "</p></div>");
      break;
    default:
      $("#messages").append("<div id='" + messageID + "' class='message message-" + type + "'><p>" + content + "</p></div>");
      break;
  }

  $("#messages #" + messageID).hide();
  $("#messages #" + messageID).slideDown(function(){
    if(duration != null){
      setTimeout(removeNotification,duration,messageID);
    }
  });

  return messageID;
}

function removeNotification(id) {
  $("#messages #" + id).slideUp(function(){
    $("#messages #" + id).remove();
  }); 
}

function getFlights() {
  $.get('/flights/departing/LHR',function(res) {
    console.log(res);
  });
}

function clearMap() {
  group.clearLayers();
  fakeJamCamGroup.clearLayers();
  $.get('/stopJam', function() {

  });
}

function showFakeJamCams() {
  appendNotification('Fake traffic jam activated','activate','fake-cams');
  //Plot points
  var CamFakeIcon = L.Icon.Default.extend({
      options: {
        iconUrl: 'marker-icon-camera-fake.png' 
    }
  });
  for (var i=0; i<fakeJamCamLocations.length; i++) {

      var camFakeIcon = new CamFakeIcon();
      var point = new L.LatLng(fakeJamCamLocations[i].lat,fakeJamCamLocations[i].lng);
      L.marker(point, {icon: camFakeIcon}).bindPopup("",{className: fakeJamCams[i]}).setZIndexOffset(1000).addTo(fakeJamCamGroup);

  }
  map.fitBounds(fakeJamCamGroup.getBounds());

}

function createJam() {
  $.get('/isFakeJam', function(res) {
      if (!res.fake_jam) {
        $.get('/createJam', function(res) {
          console.log("fake jam created");
        });
      } else {
        showFakeJamCams();
      }
  });
}

function hideFakeJamCams() {
  $.get('/isFakeJam', function(res) {
    if (res.fake_jam) {
      $.get('/stopJam', function() {
        console.log("jam stopped");
      });
      
    } else {
      removeNotification('fake-cams');
      fakeJamCamGroup.clearLayers();
    }
    
  });
}