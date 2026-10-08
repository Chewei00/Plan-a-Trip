/* test stand-in for the Google Maps JavaScript API: real Web-Mercator camera maths, no rendering.
   Like the real one it reports a map click for clicks on overlay content too, without saying what was clicked. */
(function(){
  function wx(lng){return (lng+180)/360;}
  function wy(lat){var s=Math.sin(lat*Math.PI/180);return .5-Math.log((1+s)/(1-s))/(4*Math.PI);}
  function LatLng(lat,lng){this._lat=lat;this._lng=lng;}
  LatLng.prototype={lat:function(){return this._lat;},lng:function(){return this._lng;}};
  function Map(div,o){
    var self=this;this.div=div;this.opts=o;this.c={lat:o.center.lat,lng:o.center.lng};this.z=o.zoom;
    this._h={};this.overlays=[];this.lines=[];this.moves=[];
    this.pane=document.createElement('div');this.pane.style.cssText='position:absolute;left:0;top:0;width:0;height:0';div.appendChild(this.pane);
    div.addEventListener('click',function(){self._fire('click',{});});
    window.__map=this;
  }
  Map.prototype={
    addListener:function(t,f){(this._h[t]=this._h[t]||[]).push(f);return {remove:function(){}};},
    _fire:function(t,e){(this._h[t]||[]).forEach(function(f){f(e);});},
    getCenter:function(){return new LatLng(this.c.lat,this.c.lng);},getZoom:function(){return this.z;},getDiv:function(){return this.div;},
    moveCamera:function(c){
      if(c.center)this.c={lat:c.center.lat,lng:c.center.lng};
      if(c.zoom!=null)this.z=c.zoom;
      this.moves.push({t:performance.now(),lat:this.c.lat,lng:this.c.lng,zoom:this.z});
      this.overlays.forEach(function(o){if(o._ready)o.draw();});
    },
    _px:function(ll){var k=256*Math.pow(2,this.z);return {x:(wx(ll.lng())-wx(this.c.lng))*k+this.div.clientWidth/2,y:(wy(ll.lat())-wy(this.c.lat))*k+this.div.clientHeight/2};}
  };
  function OverlayView(){}
  OverlayView.prototype={
    setMap:function(map){var self=this;this._map=map;if(!map)return;map.overlays.push(this);
      setTimeout(function(){self.onAdd();self._ready=true;self.draw();},0);},
    getPanes:function(){return {floatPane:this._map.pane};},
    getProjection:function(){var m=this._map;return this._ready?{fromLatLngToDivPixel:function(ll){return m._px(ll);}}:undefined;}
  };
  function Polyline(o){this.o={};this.setOptions(o);}
  Polyline.prototype={
    setOptions:function(o){for(var k in o)if(k!=='map')this.o[k]=o[k];if('map' in o)this.setMap(o.map);},
    setMap:function(m){if(this._map){var a=this._map.lines,i=a.indexOf(this);if(i>=0)a.splice(i,1);}this._map=m;if(m)m.lines.push(this);}
  };
  var maps={Map:Map,OverlayView:OverlayView,Polyline:Polyline,LatLng:LatLng,version:'mock'};
  maps.importLibrary=function(){return Promise.resolve(maps);};
  window.google={maps:maps};
  var cb=(/[?&]callback=([\w$]+)/.exec(document.currentScript?document.currentScript.src:'')||[])[1];
  if(cb&&window[cb])setTimeout(window[cb],0);
})();
