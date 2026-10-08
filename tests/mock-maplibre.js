/* test stand-in for MapLibre GL JS: real Web-Mercator camera maths, no rendering */
window.maplibregl=(function(){
  function mx(lng){return (lng+180)/360;}
  function my(lat){var s=Math.sin(lat*Math.PI/180);return .5-Math.log((1+s)/(1-s))/(4*Math.PI);}
  function ilng(x){return x*360-180;}
  function ilat(y){return Math.atan(Math.sinh(Math.PI*(1-2*y)))*180/Math.PI;}
  function Map(o){
    var self=this;this.c=typeof o.container==='string'?document.getElementById(o.container):o.container;
    this._h={};this._src={};this.layers=[];this.markers=[];this.zoom=8;this.center=[138.7,35.4];this.log=[];this.opts=o;
    this.cc=document.createElement('div');this.cc.className='maplibregl-canvas-container';this.cc.style.cssText='position:absolute;inset:0';
    this.c.appendChild(this.cc);this.c.classList.add('maplibregl-map');
    if(o.bounds){var cam=this._camFor(o.bounds,o.fitBoundsOptions||{});this.center=cam.center;this.zoom=cam.zoom;}
    this.cc.addEventListener('click',function(e){self._fire('click',{originalEvent:e});});
    this.touchZoomRotate={disableRotation:function(){}};this.keyboard={disableRotation:function(){}};
    setTimeout(function(){self._fire('load',{});},30);window.__map=this;
  }
  Map.prototype={
    on:function(t,f){(this._h[t]=this._h[t]||[]).push({f:f});return this;},
    once:function(t,f){(this._h[t]=this._h[t]||[]).push({f:f,once:1});return this;},
    _fire:function(t,e){var a=(this._h[t]||[]).slice(),self=this;this._h[t]=(this._h[t]||[]).filter(function(x){return !x.once;});a.forEach(function(x){x.f.call(self,e);});},
    _scale:function(z){return 512*Math.pow(2,z==null?this.zoom:z);},
    project:function(ll){var W=this.c.clientWidth,H=this.c.clientHeight,s=this._scale();return {x:(mx(ll[0])-mx(this.center[0]))*s+W/2,y:(my(ll[1])-my(this.center[1]))*s+H/2};},
    _camFor:function(b,o){var W=this.c.clientWidth,H=this.c.clientHeight,p=o.padding||{},pl=p.left||0,pr=p.right||0,pt=p.top||0,pb=p.bottom||0;
      var dx=Math.abs(mx(b[1][0])-mx(b[0][0])),dy=Math.abs(my(b[1][1])-my(b[0][1])),w=W-pl-pr,h=H-pt-pb;
      var z=Math.min(dx>0?Math.log2(w/(dx*512)):99,dy>0?Math.log2(h/(dy*512)):99,o.maxZoom==null?22:o.maxZoom),s=this._scale(z);
      var cx=(mx(b[0][0])+mx(b[1][0]))/2-((pl-pr)/2)/s,cy=(my(b[0][1])+my(b[1][1]))/2-((pt-pb)/2)/s;
      return {center:[ilng(cx),ilat(cy)],zoom:z};},
    _go:function(cam,dur){var self=this;this._moving=true;this._fire('movestart',{});
      setTimeout(function(){self.center=cam.center;self.zoom=cam.zoom;self._moving=false;self._upd();self._fire('moveend',{});},dur?60:0);},
    fitBounds:function(b,o){this.log.push({fn:'fitBounds',b:b,o:{padding:o.padding,maxZoom:o.maxZoom,duration:o.duration,easing:typeof o.easing}});this._go(this._camFor(b,o),o.duration);},
    panBy:function(off,o){this.log.push({fn:'panBy',off:off,duration:o&&o.duration});var s=this._scale();this._go({center:[ilng(mx(this.center[0])+off[0]/s),ilat(my(this.center[1])+off[1]/s)],zoom:this.zoom},o&&o.duration);},
    easeTo:function(o){this.log.push({fn:'easeTo',center:o.center,zoom:o.zoom,offset:o.offset,duration:o.duration});var z=o.zoom==null?this.zoom:o.zoom,s=this._scale(z),off=o.offset||[0,0];
      this._go({center:[ilng(mx(o.center[0])-off[0]/s),ilat(my(o.center[1])-off[1]/s)],zoom:z},o.duration);},
    isMoving:function(){return !!this._moving;},getZoom:function(){return this.zoom;},
    zoomIn:function(){this.log.push({fn:'zoomIn'});this.zoom+=1;this._upd();},zoomOut:function(){this.log.push({fn:'zoomOut'});this.zoom-=1;this._upd();},
    addControl:function(c,pos){this.log.push({fn:'addControl',pos:pos});},
    addSource:function(id,s){var o={data:s.data};o.setData=function(d){o.data=d;};this._src[id]=o;},getSource:function(id){return this._src[id];},
    addLayer:function(l){this.layers.push(l);},
    _upd:function(){this.markers.forEach(function(m){m._pos();});}
  };
  function Marker(o){this.el=o.element;this.anchor=o.anchor;this.el.classList.add('maplibregl-marker');}
  Marker.prototype={setLngLat:function(ll){this.ll=ll;return this;},
    addTo:function(map){this.map=map;map.cc.appendChild(this.el);map.markers.push(this);this._pos();return this;},
    remove:function(){this.el.remove();var a=this.map.markers,i=a.indexOf(this);if(i>=0)a.splice(i,1);},
    _pos:function(){var p=this.map.project(this.ll);this.el.style.transform='translate('+p.x.toFixed(1)+'px,'+p.y.toFixed(1)+'px)';}};
  function AttributionControl(o){this.o=o;}
  return {Map:Map,Marker:Marker,AttributionControl:AttributionControl};
})();
