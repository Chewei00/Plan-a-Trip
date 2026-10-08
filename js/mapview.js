/* The map. A thin wrapper around MapLibre GL JS (loaded from a CDN in index.html as window.maplibregl) drawing
   OpenFreeMap tiles. Nothing else in the app touches MapLibre, so changing the map provider means changing this file.

   The app hands over plain data and this file decides how to show it:
     setMarkers([{lat,lng,html}])   HTML markers; the html is the app's own pins, dots and labels
     setRoutes([{coords,w}])        lines between stops; coords are [lng,lat] pairs, w is the width in px
     fit / ensureVisible / showPoint   camera moves made by the app glide for one second so you keep your bearings;
                                       the user's own drags and wheel zooms are MapLibre's and stay immediate */

var STYLE='https://tiles.openfreemap.org/styles/liberty';
var INK='#333333',SURFACE='#fefefe';   /* same values as --ink and --surface in app.css */
var GLIDE=1000;

function ease(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;}
function boundsOf(pts){
  var w=Infinity,s=Infinity,e=-Infinity,n=-Infinity;
  pts.forEach(function(p){w=Math.min(w,p[0]);e=Math.max(e,p[0]);s=Math.min(s,p[1]);n=Math.max(n,p[1]);});
  return [[w,s],[e,n]];
}

export function createMap(container,opts){
  var gl=window.maplibregl;
  if(!gl)throw new Error('map library not loaded');
  var map=new gl.Map({
    container:container,style:STYLE,
    bounds:boundsOf(opts.points),fitBoundsOptions:{padding:opts.padding,maxZoom:opts.maxZoom},
    attributionControl:false,dragRotate:false,pitchWithRotate:false,maxPitch:0
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.addControl(new gl.AttributionControl({compact:false}),'bottom-right');

  var markers=[],routes={type:'FeatureCollection',features:[]},styleReady=false;
  map.on('load',function(){
    styleReady=true;
    map.addSource('routes',{type:'geojson',data:routes});
    var lay={'line-cap':'round','line-join':'round'};
    map.addLayer({id:'routes-casing',type:'line',source:'routes',layout:lay,paint:{'line-color':SURFACE,'line-width':['*',2,['get','w']]}});
    map.addLayer({id:'routes-line',type:'line',source:'routes',layout:lay,paint:{'line-color':INK,'line-width':['get','w']}});
  });
  /* a click on the map itself, not on one of the app's markers (those sit inside the map's own element) */
  map.on('click',function(e){
    var t=e.originalEvent&&e.originalEvent.target;
    if(t&&t.closest&&t.closest('.mk'))return;
    if(opts.onBackgroundClick)opts.onBackgroundClick();
  });

  function glide(){return {duration:GLIDE,easing:ease};}
  function whenStill(fn){if(map.isMoving())map.once('moveend',fn);else fn();}

  return {
    setMarkers:function(list){
      markers.forEach(function(m){m.remove();});
      markers=list.map(function(o){
        var el=document.createElement('div');el.className='mk';el.innerHTML=o.html;
        return new gl.Marker({element:el,anchor:'top-left'}).setLngLat([o.lng,o.lat]).addTo(map);
      });
    },
    setRoutes:function(list){
      routes={type:'FeatureCollection',features:list.map(function(r){
        return {type:'Feature',properties:{w:r.w},geometry:{type:'LineString',coordinates:r.coords}};})};
      var src=styleReady&&map.getSource('routes');
      if(src)src.setData(routes);
    },
    /* frame a set of [lng,lat] points inside the padding */
    fit:function(pts,padding,maxZoom){
      if(!pts.length)return;
      var o=glide();o.padding=padding;o.maxZoom=maxZoom;
      map.fitBounds(boundsOf(pts),o);
    },
    /* pan only if the point is outside the visible rect {l,t,r,b}; waits for a move already under way so it is
       judged against where the map ends up */
    ensureVisible:function(lngLat,rect){
      whenStill(function(){
        var p=map.project(lngLat);
        if(p.x<rect.l+20||p.x>rect.r-20||p.y<rect.t+20||p.y>rect.b-20)map.panBy([p.x-(rect.l+rect.r)/2,p.y-(rect.t+rect.b)/2],glide());
      });
    },
    /* bring a point to the middle of the visible rect, zooming in to at least minZoom */
    showPoint:function(lngLat,minZoom,rect){
      var o=glide();o.center=lngLat;o.zoom=Math.max(map.getZoom(),minZoom);
      o.offset=[(rect.l+rect.r)/2-rect.W/2,(rect.t+rect.b)/2-rect.H/2];
      map.easeTo(o);
    },
    zoomIn:function(){map.zoomIn();},
    zoomOut:function(){map.zoomOut();}
  };
}
