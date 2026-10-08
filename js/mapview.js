/* The map. A thin wrapper around the Google Maps JavaScript API (loaded by google.js as window.google.maps). Nothing
   else in the app touches the map library, so changing the map provider means changing this file.

   The app hands over plain data and this file decides how to show it:
     setMarkers([{lat,lng,html}])   HTML markers; the html is the app's own pins, dots and labels
     setRoutes([{coords,w}])        lines between stops; coords are [lng,lat] pairs, w is the width in px
     fit / ensureVisible / showPoint   camera moves made by the app glide for one second so you keep your bearings;
                                       the user's own drags and wheel zooms are Google's and stay immediate

   Google's own camera moves (fitBounds, panTo) cannot be given a duration or an easing, so the glide is done here:
   the camera is worked out in Web-Mercator "world" units (the whole world is 1 x 1; at zoom z it is 256 * 2^z px
   across) and handed to the map frame by frame with moveCamera. */

var INK='#333333',SURFACE='#fefefe';   /* same values as --ink and --surface in app.css */
var GLIDE=1000,STEP=300;               /* app moves; the zoom buttons */
var TILE=256,MINZ=2,MAXZ=20;

function ease(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;}
function wx(lng){return (lng+180)/360;}
function wy(lat){var s=Math.sin(lat*Math.PI/180);return .5-Math.log((1+s)/(1-s))/(4*Math.PI);}
function lngOf(x){return x*360-180;}
function latOf(y){return Math.atan(Math.sinh(Math.PI*(1-2*y)))*180/Math.PI;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

export function createMap(container,opts){
  var gm=window.google&&window.google.maps;
  if(!gm||!gm.Map)throw new Error('map library not loaded');
  var still=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)');

  /* the camera {x,y,z} that frames a set of [lng,lat] points inside the padding */
  function frame(pts,pad,maxZoom){
    var W=container.clientWidth,H=container.clientHeight,x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    pts.forEach(function(p){var x=wx(p[0]),y=wy(p[1]);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);});
    var w=Math.max(40,W-pad.left-pad.right),h=Math.max(40,H-pad.top-pad.bottom),dx=x1-x0,dy=y1-y0;
    var z=clamp(Math.min(dx>0?Math.log2(w/(dx*TILE)):99,dy>0?Math.log2(h/(dy*TILE)):99,maxZoom==null?MAXZ:maxZoom),MINZ,MAXZ),k=TILE*Math.pow(2,z);
    return {x:(x0+x1)/2-((pad.left-pad.right)/2)/k,y:(y0+y1)/2-((pad.top-pad.bottom)/2)/k,z:z};
  }

  var first=frame(opts.points,opts.padding,opts.maxZoom);
  var map=new gm.Map(container,{
    center:{lat:latOf(first.y),lng:lngOf(first.x)},zoom:first.z,minZoom:MINZ,maxZoom:MAXZ,
    isFractionalZoomEnabled:true,   /* lets a frame fit exactly and a glide pass through in-between zooms */
    disableDefaultUI:true,          /* the app has its own Fit and zoom buttons */
    clickableIcons:false,           /* Google's own place icons would open Google's info window */
    gestureHandling:'greedy',       /* the map fills the page, so the wheel zooms it without holding a key */
    tilt:0,heading:0
  });

  /* ---- camera ---- */
  function now(){var c=map.getCenter();return {x:wx(c.lng()),y:wy(c.lat()),z:map.getZoom()};}
  function put(c){map.moveCamera({center:{lat:latOf(clamp(c.y,.02,.98)),lng:lngOf(c.x)},zoom:c.z});}
  var anim=null;
  function stop(){if(!anim)return;cancelAnimationFrame(anim.id);var after=anim.after;anim=null;after.forEach(function(fn){fn();});}
  /* Glide to a camera. Zoom and centre follow the same ease; when the zoom changes as well, the centre runs a little
     ahead (zooming in) or behind (zooming out), so the place being moved to does not rush across the screen at one
     end of the move and crawl at the other. Same rule as the previous map (MapLibre's easeTo). */
  function glideTo(to,ms){
    stop();
    var from=now(),t0=null,lead=clamp(Math.pow(2,to.z-from.z),.5,2);
    if((still&&still.matches)||!(ms>0)||(Math.abs(to.x-from.x)<1e-9&&Math.abs(to.y-from.y)<1e-9&&Math.abs(to.z-from.z)<1e-4)){put(to);return;}
    anim={id:0,after:[],to:to};
    function tick(t){
      if(!anim)return;
      if(t0==null)t0=t;
      var k=clamp((t-t0)/ms,0,1),e=ease(k),s=e*Math.pow(lead,1-e);
      put({x:from.x+(to.x-from.x)*s,y:from.y+(to.y-from.y)*s,z:from.z+(to.z-from.z)*e});
      if(k<1){anim.id=requestAnimationFrame(tick);return;}
      var after=anim.after;anim=null;after.forEach(function(fn){fn();});
    }
    anim.id=requestAnimationFrame(tick);
  }
  /* run fn once no glide is under way, so it is judged against where the map ends up */
  function whenStill(fn){if(anim)anim.after.push(fn);else fn();}
  /* the user takes over: a drag, a wheel turn or a press on the map ends a glide where it is.
     onMark remembers whether the latest press landed on one of the app's markers (see the click handler) */
  var onMark=false;
  map.addListener('dragstart',stop);
  container.addEventListener('wheel',stop,{capture:true,passive:true});
  container.addEventListener('pointerdown',function(e){onMark=!!(e.target&&e.target.closest&&e.target.closest('.mk'));stop();},{capture:true,passive:true});

  /* ---- markers: one layer of the app's own HTML, kept in place by Google's overlay hooks ---- */
  var layer=new gm.OverlayView(),box=document.createElement('div'),marks=[];
  box.className='mklayer';
  function place1(m,pr){var p=pr.fromLatLngToDivPixel(m.at);m.el.style.transform='translate('+p.x.toFixed(1)+'px,'+p.y.toFixed(1)+'px)';}
  layer.onAdd=function(){this.getPanes().floatPane.appendChild(box);};
  layer.draw=function(){var pr=this.getProjection();if(pr)marks.forEach(function(m){place1(m,pr);});};
  layer.onRemove=function(){if(box.parentNode)box.parentNode.removeChild(box);};
  layer.setMap(map);

  /* ---- routes: a light casing under a dark line, kept and reused between redraws ---- */
  var lines=[];
  function sig(r){var c=r.coords;return r.w+'|'+c.length+'|'+c[0]+'|'+c[c.length-1];}

  /* a click on the map itself, not on one of the app's markers: those sit inside the map's own element, so the map
     reports a click for them too (with no target to tell them apart, hence onMark) */
  map.addListener('click',function(e){
    var t=e&&e.domEvent&&e.domEvent.target;
    if(onMark||(t&&t.closest&&t.closest('.mk')))return;
    if(opts.onBackgroundClick)opts.onBackgroundClick();
  });

  return {
    setMarkers:function(list){
      var pr=layer.getProjection();
      box.textContent='';
      marks=list.map(function(o){
        var el=document.createElement('div');el.className='mk';el.innerHTML=o.html;box.appendChild(el);
        var m={el:el,at:new gm.LatLng(o.lat,o.lng)};
        if(pr)place1(m,pr);
        return m;
      });
    },
    setRoutes:function(list){
      list.forEach(function(r,i){
        var pair=lines[i];
        if(!pair)pair=lines[i]={sig:'',
          casing:new gm.Polyline({map:map,clickable:false,strokeColor:SURFACE,strokeOpacity:1,zIndex:1}),
          line:new gm.Polyline({map:map,clickable:false,strokeColor:INK,strokeOpacity:1,zIndex:2})};
        var s=sig(r);if(s===pair.sig)return;
        var path=r.coords.map(function(c){return {lat:c[1],lng:c[0]};});
        pair.sig=s;
        pair.casing.setOptions({path:path,strokeWeight:r.w*2});
        pair.line.setOptions({path:path,strokeWeight:r.w});
      });
      lines.splice(list.length).forEach(function(pair){pair.casing.setMap(null);pair.line.setMap(null);});
    },
    /* frame a set of [lng,lat] points inside the padding */
    fit:function(pts,padding,maxZoom){if(pts.length)glideTo(frame(pts,padding,maxZoom),GLIDE);},
    /* pan only if the point is outside the visible rect {l,t,r,b}; waits for a glide already under way */
    ensureVisible:function(lngLat,rect){
      whenStill(function(){
        var c=now(),k=TILE*Math.pow(2,c.z),W=container.clientWidth,H=container.clientHeight;
        var px=(wx(lngLat[0])-c.x)*k+W/2,py=(wy(lngLat[1])-c.y)*k+H/2;
        if(px<rect.l+20||px>rect.r-20||py<rect.t+20||py>rect.b-20)
          glideTo({x:c.x+(px-(rect.l+rect.r)/2)/k,y:c.y+(py-(rect.t+rect.b)/2)/k,z:c.z},GLIDE);
      });
    },
    /* bring a point to the middle of the visible rect, zooming in to at least minZoom */
    showPoint:function(lngLat,minZoom,rect){
      var z=Math.max(now().z,minZoom),k=TILE*Math.pow(2,z);
      glideTo({x:wx(lngLat[0])-((rect.l+rect.r)/2-rect.W/2)/k,y:wy(lngLat[1])-((rect.t+rect.b)/2-rect.H/2)/k,z:z},GLIDE);
    },
    /* where the map is looking, as [lng,lat] */
    center:function(){var c=map.getCenter();return [c.lng(),c.lat()];},
    /* a second press while the first is still moving adds to where that one was heading */
    zoomIn:function(){var c=anim?anim.to:now();glideTo({x:c.x,y:c.y,z:clamp(c.z+1,MINZ,MAXZ)},STEP);},
    zoomOut:function(){var c=anim?anim.to:now();glideTo({x:c.x,y:c.y,z:clamp(c.z-1,MINZ,MAXZ)},STEP);}
  };
}
