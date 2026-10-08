/* Google Maps Platform: loading the map library, and place search (Places API (New)). Apart from mapview.js, which
   draws the map with the library loaded here, nothing else in the app talks to Google.

   The key below is meant to be public: every browser-side key is visible to whoever opens the site. It is protected
   in the Google Cloud console, not by hiding it: it only works from this site's address and only for the two APIs
   used here (Maps JavaScript API, Places API (New)). Daily caps for both are to be set when the account leaves its free
   trial (see CLAUDE.md).

   What may be kept from a place (Maps Platform service terms, Places API): its place ID for as long as you like, its
   latitude and longitude for up to 30 days. So a saved place keeps its ID, and main.js asks for its position again
   before the 30 days are up (refreshPoints). */

var KEY='AIzaSyCfUK9TSeWLjxNp9fVw5HJe0JxJ-VLhxvk';
var LANG='zh-TW';
var PLACES='https://places.googleapis.com/v1/';

/* Loads the map library once. Resolves when google.maps.Map and friends exist; rejects if the script cannot load.
   onRefused is called if Google later refuses the key (wrong site, API switched off): the map is then unusable.
   v=quarterly is Google's stable channel; a fixed version number cannot be pinned for long, old ones are retired. */
var loading=null;
export function loadMaps(onRefused){
  if(!loading)loading=new Promise(function(resolve,reject){
    window.gm_authFailure=function(){if(onRefused)onRefused();};
    window.__planATripMaps=function(){window.google.maps.importLibrary('maps').then(resolve,reject);};
    var s=document.createElement('script');
    s.src='https://maps.googleapis.com/maps/api/js?key='+KEY+'&v=quarterly&language='+LANG+'&loading=async&callback=__planATripMaps';
    s.async=true;
    s.onerror=function(){reject(new Error('map library did not load'));};
    document.head.appendChild(s);
  });
  return loading;
}

/* Google place types -> the app's four categories. A place often has several types (a museum with a café is also
   "food"), so the order matters: somewhere to sleep, then stations, then things to see, then food; anything else
   counts as a sight */
var STAY=/^(lodging|hotel|motel|hostel|inn|guest_house|bed_and_breakfast|resort_hotel|japanese_inn|campground|private_guest_room|extended_stay_hotel|cottage|farmstay|budget_japanese_inn|camping_cabin|rv_park)$/;
var TRANSIT=/^(transit_station|train_station|subway_station|bus_station|bus_stop|light_rail_station|airport|international_airport|ferry_terminal|transit_depot|taxi_stand|tram_stop)$/;
var SIGHT=/^(tourist_attraction|museum|art_gallery|park|national_park|amusement_park|zoo|aquarium|place_of_worship|historical_landmark|historical_place|cultural_landmark|garden|botanical_garden|scenic_spot|observation_deck|monument|beach|hiking_area)$/;
var FOOD=/(restaurant|^food$|^cafe$|cafe_|coffee|bakery|^bar$|_bar$|^pub$|noodle|ramen|sushi|izakaya|tea_house|dessert|ice_cream|confectionery|meal_|food_court|^deli$|steak_house|^diner$|bagel|donut|juice|sandwich)/;
function catOf(types){
  function any(re){return types.some(function(t){return re.test(t);});}
  types=types||[];
  if(any(STAY))return 'stay';
  if(any(TRANSIT))return 'transit';
  if(any(SIGHT))return 'sight';
  if(any(FOOD))return 'food';
  return 'sight';
}
/* the short text beside a name that tells same-named places apart: the town. Google gives a whole address
   ("日本山梨縣富士河口湖町 Oishi, 2585-85"); the part written in Chinese characters is the region and town */
function townOf(address){
  var parts=(address||'').split(/[\s,，]+/).filter(function(x){return /[㐀-鿿]/.test(x);});
  return (parts[0]||'').replace(/^日本|日本$/g,'');
}

/* One search "session" runs from the first letter typed to the place picked, and Google counts it as one. The token
   ties those requests together; a new one starts after a pick or after a pause of a few minutes. */
var session='',sessionAt=0;
function uuid(){
  if(window.crypto&&crypto.randomUUID)return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0;return (c==='x'?r:(r&3|8)).toString(16);});
}
function token(){var now=Date.now();if(!session||now-sessionAt>180000)session=uuid();sessionAt=now;return session;}
function ask(url,init){
  return fetch(url,init).then(function(r){if(!r.ok)throw new Error('places '+r.status);return r.json();});
}

/* Search as you type. near is [lng,lat] and only nudges the ranking toward what the map is showing.
   Resolves to [{name, sub, gid, cat}]: gid is the Google place ID. A suggestion carries no position; that is asked
   for when one is picked (placePoint). */
export function searchPlaces(text,near){
  var body={input:text,languageCode:LANG,sessionToken:token()};
  if(near)body.locationBias={circle:{center:{latitude:+near[1].toFixed(4),longitude:+near[0].toFixed(4)},radius:50000}};
  return ask(PLACES+'places:autocomplete',{method:'POST',
    headers:{'Content-Type':'application/json','X-Goog-Api-Key':KEY,
      'X-Goog-FieldMask':'suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.types'},
    body:JSON.stringify(body)
  }).then(function(j){
    return (j.suggestions||[]).map(function(s){
      var p=s.placePrediction,f=p&&p.structuredFormat;
      return p&&f&&f.mainText?{name:f.mainText.text||'',sub:townOf(f.secondaryText&&f.secondaryText.text),gid:p.placeId,cat:catOf(p.types)}:null;
    }).filter(function(o){return o&&o.name&&o.gid;});
  });
}

/* Where a place is. Only the position is asked for, which keeps the request in the cheapest class of Place Details.
   picked: true when this ends a search (the user chose a suggestion), false when refreshing a saved place.
   Resolves to {lat, lng}. */
export function placePoint(gid,picked){
  var url=PLACES+'places/'+encodeURIComponent(gid)+'?languageCode='+LANG;
  if(picked){url+='&sessionToken='+token();session='';}
  return ask(url,{headers:{'X-Goog-Api-Key':KEY,'X-Goog-FieldMask':'location'}}).then(function(j){
    if(!j.location||typeof j.location.latitude!=='number')throw new Error('no position');
    return {lat:+j.location.latitude.toFixed(6),lng:+j.location.longitude.toFixed(6)};
  });
}
