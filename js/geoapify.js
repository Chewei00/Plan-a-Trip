/* Place search and routing, from Geoapify (OpenStreetMap data). Nothing else in the app calls Geoapify, so changing
   the provider means changing this file.

   The key below is meant to be public: every browser-side key is visible to whoever opens the site. It is protected
   by restricting it to this site's address in the Geoapify dashboard, not by hiding it. Free plan: 3,000 credits a
   day, one credit per search or route. */

var KEY='1787ed0d07774e1a8ae3bd00d083a917';
var API='https://api.geoapify.com/v1/';

/* Geoapify category -> the app's four categories; anything else counts as a sight */
function catOf(c){
  c=c||'';
  if(c.indexOf('catering')===0)return 'food';
  if(c.indexOf('accommodation')===0)return 'stay';
  if(c.indexOf('public_transport')===0||c.indexOf('railway')===0||c.indexOf('airport')===0)return 'transit';
  return 'sight';
}

/* Search as you type. near is [lng,lat] and only nudges the ranking toward what the map is showing.
   lang=ja on purpose: with lang=zh Geoapify returns Simplified Chinese for region names, and place names stay in
   the local language either way.
   Resolves to [{name, sub, lat, lng, cat}]; sub is the town, to tell same-named places apart. */
export function searchPlaces(text,near){
  var u=API+'geocode/autocomplete?text='+encodeURIComponent(text)+'&lang=ja&limit=8&format=json'+
    (near?'&bias=proximity:'+near[0].toFixed(4)+','+near[1].toFixed(4):'')+'&apiKey='+KEY;
  return fetch(u).then(function(r){if(!r.ok)throw new Error('search '+r.status);return r.json();}).then(function(j){
    var seen={};
    return (j.results||[]).map(function(x){
      return {name:x.name||x.address_line1||'',sub:x.city||x.county||x.state||x.country||'',lat:x.lat,lng:x.lon,cat:catOf(x.category)};
    }).filter(function(o){
      var k=o.name+'|'+o.sub;
      if(!o.name||seen[k])return false;
      seen[k]=1;return true;
    });
  });
}

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
