/* Routing, from Geoapify (OpenStreetMap data): the road a leg follows and how long it takes on foot, by bicycle or by
   car. Nothing else in the app calls Geoapify, so changing the routing provider means changing this file. Place search
   and the map are Google's (google.js, mapview.js); routing stayed here because Google has no bicycle routes in Japan.

   The key below is meant to be public: every browser-side key is visible to whoever opens the site. It is protected
   by restricting it to this site's address in the Geoapify dashboard, not by hiding it. Free plan: 3,000 credits a
   day, one credit per route. */

var KEY='1787ed0d07774e1a8ae3bd00d083a917';
var API='https://api.geoapify.com/v1/';

/* Routes are requested a few at a time so a long trip does not trip the per-second limit */
var MODE={walk:'walk',bike:'bicycle',car:'drive'},queue=[],running=0,MAX=3;
function pump(){
  while(running<MAX&&queue.length){
    running++;
    (function(job){
      fetch(job.url).then(function(r){if(!r.ok)throw new Error('route '+r.status);return r.json();})
        .then(job.ok,job.fail).then(function(){running--;pump();});
    })(queue.shift());
  }
}
/* a and b are {lat,lng}; mode is the app's walk | bike | car.
   Resolves to {t: seconds, d: metres, c: [[lng,lat], ...]} */
export function fetchRoute(mode,a,b){
  return new Promise(function(resolve,reject){
    queue.push({
      url:API+'routing?waypoints='+a.lat+','+a.lng+'|'+b.lat+','+b.lng+'&mode='+MODE[mode]+'&apiKey='+KEY,
      ok:function(j){
        var f=j.features&&j.features[0];
        if(!f||!f.geometry){reject(new Error('no route'));return;}
        var parts=f.geometry.type==='MultiLineString'?f.geometry.coordinates:[f.geometry.coordinates],c=[];
        parts.forEach(function(part){part.forEach(function(p){c.push([+p[0].toFixed(5),+p[1].toFixed(5)]);});});
        resolve({t:f.properties.time,d:f.properties.distance,c:c});
      },
      fail:reject
    });
    pump();
  });
}
