/* Someday — app entry. State, rendering and interactions for the two panels; the map itself lives in mapview.js.
   Behaviour is specified in the handoff document and the 旅行地圖 design system (see README). */
import {ICON,CATICON,catSvg} from './icons.js?v=14';
import {fetchRoute} from './geoapify.js?v=14';
import {loadMaps,searchPlaces,placePoint} from './google.js?v=14';
import {createMap} from './mapview.js?v=14';

/* ================= constants ================= */
var KEY='plan-a-trip:v1';
var CATS=[{id:'sight',name:'景點'},{id:'food',name:'飲食'},{id:'stay',name:'住宿'},{id:'transit',name:'交通'}];
var MODES=[{id:'walk',name:'步行',road:true},{id:'bike',name:'自行車',road:true},{id:'car',name:'汽車',road:true},{id:'train',name:'電車或公車',road:false},{id:'boat',name:'船',road:false},{id:'plane',name:'飛機',road:false}];
function catDot(id){return CATICON[id]?'<span class="cat cat-'+id+'" role="img" aria-label="'+catName(id)+'" title="'+catName(id)+'">'+catSvg(id)+'</span>':'';}
/* ================= helpers ================= */
function uid(){return Math.random().toString(36).slice(2,10);}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function hav(a,b){var R=6371,dLat=(b.lat-a.lat)*Math.PI/180,dLng=(b.lng-a.lng)*Math.PI/180,
  x=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
  return 2*R*Math.asin(Math.sqrt(x));}
function catName(id){for(var i=0;i<CATS.length;i++)if(CATS[i].id===id)return CATS[i].name;return '';}
function modeOf(id){for(var i=0;i<MODES.length;i++)if(MODES[i].id===id)return MODES[i];return MODES[1];}

/* ================= data ================= */
/* a place picked from the search also keeps Google's ID for it (gid) and when its position was last fetched (at) */
function newPlace(c){var p={id:uid(),name:c.name,cat:c.cat,lat:c.lat,lng:c.lng,note:'',img:''};if(c.gid){p.gid=c.gid;p.at=Date.now();}return p;}
/* a stop is one visit: the same place can be visited on several days (or twice in a day), each visit with its own notes and checklist */
function newStop(pid,plan){return {id:uid(),place:pid,plan:plan||[]};}
function place0(d,id){for(var i=0;i<d.places.length;i++)if(d.places[i].id===id)return d.places[i];return null;}
function newTrip(title){return {id:uid(),title:title,places:[],days:[{id:uid(),stops:[]}],legs:{},memo:{open:false,plan:[]}};}
function sample(){
  var d={id:uid(),title:'富士山 5 日',places:[],days:[],legs:{}};
  function P(name,cat,lat,lng,note){var p=newPlace({name:name,cat:cat,lat:lat,lng:lng});p.note=note||'';d.places.push(p);return p.id;}
  var kubota=P('久保田一竹美術館','sight',35.5252,138.7715,'非常喜歡');
  P('河口湖音樂森林美術館','sight',35.5222,138.7790);
  var kma=P('河口湖美術館','sight',35.5212,138.7570);
  P('新倉山淺間公園','sight',35.5010,138.8010);
  P('山中湖花都公園','sight',35.4330,138.8560);
  var park=P('富士箱根伊豆國立公園','sight',35.4350,138.7250);
  var iwa=P('岩本山公園','sight',35.1830,138.6330);
  var udon=P('富士吉田烏龍麵店','food',35.4900,138.8080);
  P('河口湖餺飥麵店','food',35.4985,138.7720);
  P('富士宮炒麵店','food',35.2230,138.6180);
  var inn=P('富士河口湖町','stay',35.5075,138.7690);
  P('河口湖站','transit',35.4983,138.7689);
  P('新富士站','transit',35.1422,138.6633);
  d.days.push({id:uid(),stops:[
    newStop(kubota,[{k:'n',text:'12 點左右到，買好午餐帶到這裡吃'}]),
    newStop(kma,[{k:'n',text:'要去一棵大樹下\n傍晚 14:00 左右到'},{k:'c',text:'已買票，共 4000 元',done:true,link:'https://example.com/tickets',file:null}]),
    newStop(udon,[{k:'c',text:'已訂位，18:00，兩人',done:true,link:'',file:null}]),
    newStop(inn,[{k:'c',text:'付了訂金，500 元，現場需再繳 1000 元',done:true,link:'',file:null}])]});
  d.days.push({id:uid(),stops:[newStop(park),newStop(iwa)]});
  d.legs[kubota+'>'+kma]='walk';d.legs[kma+'>'+udon]='walk';d.legs[udon+'>'+inn]='walk';
  return d;
}
/* Everything saved is one object: {v:2, current: trip id, trips:[trip, ...]}. db is the trip being shown; the rest of
   the app only ever reads and writes db, so switching trips is pointing db at another one.
   Saves from before there were several trips were a single trip object: load() turns that into the first trip. */
var store,db,memOnly=false;
/* older saves: notes were plain strings, and they belonged to the place; a day listed place ids */
function fixTrip(d){
  if(!d.id)d.id=uid();
  if(typeof d.title!=='string'||!d.title)d.title='New trip';
  if(!d.legs||typeof d.legs!=='object')d.legs={};
  /* the trip's own notes (not about any place or day), added 2026-10-09: the same entries a stop has */
  if(!d.memo||typeof d.memo!=='object')d.memo={open:false,plan:[]};
  if(!Array.isArray(d.memo.plan))d.memo.plan=[];
  d.places.forEach(function(p){if(p.plan)p.plan=p.plan.map(function(x){return typeof x==='string'?{k:'n',text:x}:x;});});
  d.days.forEach(function(day){day.stops=(day.stops||[]).map(function(x){
    if(typeof x!=='string'){x.plan=x.plan||[];return x;}
    var p=place0(d,x),st=newStop(x,p&&p.plan?p.plan:[]);if(p)delete p.plan;return st;
  }).filter(function(x){return !!place0(d,x.place);});});
  d.places.forEach(function(p){delete p.plan;});
  return d;
}
function isTrip(d){return !!d&&Array.isArray(d.places)&&Array.isArray(d.days);}
function load(){
  try{var r=localStorage.getItem(KEY);if(r){var d=JSON.parse(r),t;
    if(d&&Array.isArray(d.trips)){
      t=d.trips.filter(isTrip).map(fixTrip);
      if(t.length)return {v:2,current:t.some(function(x){return x.id===d.current;})?d.current:t[0].id,trips:t};
    }else if(isTrip(d)){t=fixTrip(d);return {v:2,current:t.id,trips:[t]};}
  }}catch(e){}
  var s=fixTrip(sample());
  return {v:2,current:s.id,trips:[s]};
}
function save(){
  var ok=true;
  try{localStorage.setItem(KEY,JSON.stringify(store));}catch(e){memOnly=true;ok=false;}
  announce();
  return ok;
}
function tripOf(id){for(var i=0;i<store.trips.length;i++)if(store.trips[i].id===id)return store.trips[i];return null;}
store=load();db=tripOf(store.current);
function place(id){for(var i=0;i<db.places.length;i++)if(db.places[i].id===id)return db.places[i];return null;}
function getDay(id){for(var i=0;i<db.days.length;i++)if(db.days[i].id===id)return db.days[i];return null;}
/* a stop by its id. The trip's own notes answer to MEMO: they hold entries exactly as a stop does, so everything that
   edits, ticks, links or attaches works on them unchanged; they have no day and no place */
var MEMO='memo';
function stopOf(sid){if(sid===MEMO)return {day:null,idx:-1,stop:db.memo};for(var i=0;i<db.days.length;i++)for(var j=0;j<db.days[i].stops.length;j++)if(db.days[i].stops[j].id===sid)return {day:db.days[i],idx:j,stop:db.days[i].stops[j]};return null;}
/* 1-based numbers of the days a place is in, ascending, each day once */
function daysOf(pid){var a=[];db.days.forEach(function(d,i){if(d.stops.some(function(x){return x.place===pid;}))a.push(i+1);});return a;}
function legMode(a,b){return db.legs[a+'>'+b]||'car';}
/* Real routes for the modes that follow roads. A route is looked up in memory, then in the browser's database, then
   asked from the routing service once and kept, so reopening the trip costs nothing. Until it arrives (or if it
   fails) the leg is drawn as a straight line with an estimated time */
var routeCache={},routeAsked={},routeTm=null;
function routeKey(m,a,b){return m+'|'+a.lat.toFixed(5)+','+a.lng.toFixed(5)+'|'+b.lat.toFixed(5)+','+b.lng.toFixed(5);}
function legRoute(p,nx){
  var m=legMode(p.id,nx.id);if(!modeOf(m).road)return null;
  var k=routeKey(m,p,nx),r=routeCache[k];
  if(r)return r.c?r:null;
  if(!routeAsked[k]){routeAsked[k]=1;
    fileGet('route:'+k).then(function(kept){
      if(kept&&kept.c)return kept;
      return fetchRoute(m,p,nx).then(function(got){filePut('route:'+k,got);return got;});
    }).then(function(got){routeCache[k]=got;clearTimeout(routeTm);routeTm=setTimeout(routesArrived,60);},function(){routeCache[k]={failed:true};});
  }
  return null;
}
/* redraw only what a route changes: the lines on the map and the times in the list. The panels are left alone so
   something being typed is not disturbed */
function routesArrived(){
  renderMap();
  var els=lpScroll.querySelectorAll('.legtime[data-leg]'),i,ids,a,b;
  for(i=0;i<els.length;i++){ids=els[i].dataset.leg.split('>');a=place(ids[0]);b=place(ids[1]);if(a&&b)els[i].textContent=fmtMin(legMinutes(a,b));}
}
/* travel time in minutes for modes that follow roads; null for the others */
function legMinutes(p,nx){
  var m=legMode(p.id,nx.id);if(!modeOf(m).road)return null;
  var r=legRoute(p,nx),min;
  if(r)min=r.t/60;
  else{var km=hav(p,nx)*1.3;min=m==='walk'?km/4.5*60:m==='bike'?km/14*60:4+km/(km<10?28:45)*60;}   /* estimate from straight-line distance */
  return min<10?Math.max(1,Math.round(min)):Math.round(min/5)*5;
}
function fmtSize(n){return n<1024*1024?Math.max(1,Math.round(n/1024))+' KB':(n/1024/1024).toFixed(1)+' MB';}
/* attached files live in IndexedDB (too big for localStorage); kept in memory if that is unavailable */
var IDBP=null,MEMF={};
function idb(){
  if(!IDBP)IDBP=new Promise(function(res,rej){
    try{var r=indexedDB.open('plan-a-trip-files',1);
      r.onupgradeneeded=function(){r.result.createObjectStore('f');};
      r.onsuccess=function(){res(r.result);};r.onerror=function(){rej(r.error);};r.onblocked=function(){rej(new Error('blocked'));};
    }catch(e){rej(e);}
  });
  return IDBP;
}
function fileOp(mode,fn){return idb().then(function(d){return new Promise(function(res,rej){
  var tx=d.transaction('f',mode),rq=fn(tx.objectStore('f'));
  tx.oncomplete=function(){res(rq&&rq.result);};tx.onerror=tx.onabort=function(){rej(tx.error);};});});}
function filePut(id,blob){MEMF[id]=blob;return fileOp('readwrite',function(s){return s.put(blob,id);}).then(function(){return true;},function(){return false;});}
function fileGet(id){if(MEMF[id])return Promise.resolve(MEMF[id]);return fileOp('readonly',function(s){return s.get(id);}).catch(function(){return null;});}
function fileDel(id){delete MEMF[id];fileOp('readwrite',function(s){return s.delete(id);}).catch(function(){});}
function dropFilesOf(st){(st.plan||[]).forEach(function(en){if(en.file)fileDel(en.file.id);});}
/* "25 m", "2 h", "1 h  55 m": a space inside each part and a double space between the parts (non-breaking, so the gap survives in HTML) */
function fmtMin(m){if(m<60)return m+'\u00a0m';var h=Math.floor(m/60),r=m%60;return h+'\u00a0h'+(r?'\u00a0\u00a0'+r+'\u00a0m':'');}

/* open: the expanded days, oldest first; day: the one the map shows (the last one opened or clicked) */
var ui={day:null,open:[],focus:null,cat:'sight',leftOpen:true,topOpen:true,menu:null,editing:null,q:'',searchOpen:false,pending:null,};
var $=function(id){return document.getElementById(id);};
var app=$('app'),mapEl=$('map'),lp=$('lp'),tp=$('tp'),
    titleWrap=$('titlewrap'),lpScroll=$('lpscroll'),memoEl=$('memo'),memoEnts=$('memoents'),chipsEl=$('chips'),cardsEl=$('cards'),menuEl=$('menu'),
    resultsEl=$('results'),qEl=$('q'),toastEl=$('toast');
/* the parts of the trip notes that never change (see "trip notes") */
(function(){var plus='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 4v8M4 8h8"/></svg>';
  $('memoh').innerHTML=ICON.memoChev;
  $('memoadds').innerHTML='<button class="memoadd" data-act="m-addnote" data-id="memo">'+plus+'Add a note</button>'+
    '<button class="memoadd" data-act="m-addcheck" data-id="memo">'+plus+'Add a checklist</button>';})();

var toastTm;
function toast(m){toastEl.textContent=m;toastEl.classList.add('show');clearTimeout(toastTm);toastTm=setTimeout(function(){toastEl.classList.remove('show');},2000);}

/* ================= left panel ================= */
function setOpen(list){ui.open=list;ui.day=list.length?list[list.length-1]:null;}
function openDay(id){var a=ui.open.filter(function(x){return x!==id;});a.push(id);setOpen(a);}
function closeDay(id){setOpen(ui.open.filter(function(x){return x!==id;}));}
function isOpen(id){return ui.open.indexOf(id)>=0;}
function moreBtn(type,id,label){
  var open=ui.menu&&ui.menu.type===type&&ui.menu.id===id;
  return '<button class="more'+(open?' open':'')+'" data-act="menu" data-menu="'+type+'" data-id="'+id+'" aria-label="'+esc(label)+'" title="選單">'+ICON.dots+'</button>';
}
function isEditing(kind,where,pid,i){var e=ui.editing;return !!e&&e.kind===kind&&e.where===where&&(e.place||'')===(pid||'')&&String(e.i==null?'':e.i)===String(i==null?'':i);}
function entryHTML(sid,en,k){
  var id=sid+'|'+k,pid=sid;
  if(en.k!=='c'){
    return '<div class="ent n" data-ent="'+k+'">'+(isEditing('plan','left',pid,k)
      ?'<textarea class="edit nbedit" rows="1" maxlength="300" placeholder="備註" aria-label="行程備註">'+esc(en.text)+'</textarea>'
      :'<div class="nb" data-edit="plan" data-i="'+k+'" title="點兩下修改">'+esc(en.text)+moreBtn('note',id,'備註的選單')+'</div>')+'</div>';
  }
  var editing=isEditing('check','left',pid,k);
  var h='<div class="ent c" data-ent="'+k+'"><div class="ck'+(en.done?' done':'')+'">'+
    '<button class="cbox" data-act="ck-toggle" data-id="'+id+'" role="checkbox" aria-checked="'+(!!en.done)+'" aria-label="'+esc(en.text)+'">'+ICON.tick+'</button>';
  if(editing)h+='<textarea class="edit ckedit" rows="1" maxlength="200" placeholder="待辦" aria-label="待辦">'+esc(en.text)+'</textarea>';
  else h+='<span class="cktext" data-edit="check" data-i="'+k+'" title="點兩下修改">'+esc(en.text)+'</span><span class="ckicons"><span class="ckmove">'+
    (en.link?'<a class="ckic" href="'+esc(en.link)+'" target="_blank" rel="noopener noreferrer" title="'+esc(en.link)+'" aria-label="開啟連結">'+ICON.link+'</a>':'')+
    (en.file?'<button class="ckic" data-act="file-open" data-id="'+id+'" title="'+esc(en.file.name)+'" aria-label="開啟檔案 '+esc(en.file.name)+'">'+ICON.file+'</button>':'')+'</span>'+moreBtn('check',id,'待辦的選單')+'</span>';
  h+='</div>';
  if(isEditing('link','left',pid,k))h+='<input class="edit lkedit" value="'+esc(en.link||'')+'" maxlength="500" placeholder="https://" aria-label="連結網址" inputmode="url">';
  return h+'</div>';
}
function renderLeft(){
  titleWrap.innerHTML=isEditing('title','left','')
    ?'<input class="edit title" value="'+esc(db.title)+'" maxlength="30" aria-label="旅行名稱">'
    :'<div class="tzone'+(ui.menu&&ui.menu.type==='trips'?' on':'')+'"><button class="tripbtn" data-act="menu" data-menu="trips" data-id="trips" title="切換旅行" aria-label="切換旅行" aria-haspopup="menu">'+ICON.tripChev+'</button>'+
      '<h1 class="title" data-edit="title" title="點兩下修改">'+esc(db.title)+'</h1></div>';
  var keep=lpScroll.scrollTop,h='';
  db.days.forEach(function(d,i){
    /* drawn in the state last shown; syncOpen() then switches classes so the change animates */
    var sel=shownOpen.indexOf(d.id)>=0,dim=shownOpen.length&&!sel;
    h+='<section class="day'+(sel?' sel':'')+(dim?' dim':'')+'" data-day="'+d.id+'"><div class="day-head">'+
      '<button class="daypill" data-act="day" data-day="'+d.id+'" aria-expanded="'+isOpen(d.id)+'">Day '+(i+1)+ICON.right+'</button>'+moreBtn('day',d.id,'Day '+(i+1)+' 的選單')+'</div><ol class="stops">';
    d.stops.forEach(function(st,n){
      var pid=st.place,sid=st.id,p=place(pid);if(!p)return;
      var nx=d.stops[n+1]&&d.stops[n+1].place;
      h+='<li class="stop'+(shownFocus===pid?' focus':'')+'" data-stop="'+sid+'" data-place="'+pid+'"><span class="bul"></span><div class="sbody"><div class="srow">'+
        (isEditing('name','left',sid)
          ?'<input class="edit" value="'+esc(p.name)+'" maxlength="40" aria-label="地點名稱">'
          :'<span class="sname" data-edit="name" title="點兩下修改名稱">'+esc(p.name)+'</span>'+catDot(p.cat)+moreBtn('stop',sid,p.name+' 的選單'))+'</div><div class="ents"><div class="entsin">';
      {
        (st.plan||[]).forEach(function(en,k){h+=entryHTML(sid,en,k);});
        if(isEditing('plan','left',sid,'new'))h+='<div class="ent n"><textarea class="edit nbedit" rows="1" maxlength="300" placeholder="備註" aria-label="新增行程備註"></textarea></div>';
        if(isEditing('check','left',sid,'new'))h+='<div class="ent c"><div class="ck"><span class="cbox"></span><textarea class="edit ckedit" rows="1" maxlength="200" placeholder="待辦" aria-label="新增待辦"></textarea></div></div>';
      }
      h+='</div></div></div>';
      if(nx){var m=legMode(pid,nx),np=place(nx),mins=np?legMinutes(p,np):null;
        h+=(mins!=null?'<span class="legtime" data-leg="'+pid+'>'+nx+'">'+fmtMin(mins)+'</span>':'')+
          '<button class="modebtn" data-act="menu" data-menu="mode" data-id="'+pid+'>'+nx+'" title="移動方式：'+modeOf(m).name+'" aria-label="移動方式：'+modeOf(m).name+'">'+ICON[m]+'</button>';}
      h+='</li>';
    });
    h+='</ol></section>';
  });
  h+='<button class="addday" data-act="add-day"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 4v8M4 8h8"/></svg>Add a day</button>';
  lpScroll.innerHTML=h;lpScroll.scrollTop=keep;renderMemo();hotSync();
}

/* ================= trip notes ================= */
/* At the foot of the left panel: notes and checklists that belong to the trip rather than to a place (a visa to get,
   things to pack). Closed, only the handle shows: a line and an arrow. Open, the entries and the two ways to add one.
   It grows with what it holds, up to where Day 1 sits; past that the entries scroll between the handle and the two
   "Add" rows. Open or closed is kept with the trip. Only the entries are drawn again; the rest is in index.html, so the
   opening and closing can animate. */
function renderMemo(){
  var h='',pl=db.memo.plan;
  pl.forEach(function(en,k){h+=entryHTML(MEMO,en,k);});
  if(isEditing('plan','left',MEMO,'new'))h+='<div class="ent n"><textarea class="edit nbedit" rows="1" maxlength="300" placeholder="備註" aria-label="新增旅行備註"></textarea></div>';
  if(isEditing('check','left',MEMO,'new'))h+='<div class="ent c"><div class="ck"><span class="cbox"></span><textarea class="edit ckedit" rows="1" maxlength="200" placeholder="待辦" aria-label="新增待辦"></textarea></div></div>';
  memoEnts.innerHTML=h;
  /* a new entry is written at the end: bring it into view when the entries are scrolling */
  if(ui.editing&&ui.editing.place===MEMO&&ui.editing.i==='new')memoEnts.scrollTop=memoEnts.scrollHeight;
  applyMemo();
}
function applyMemo(){
  var on=!!db.memo.open,hd=$('memoh');
  memoEl.classList.toggle('open',on);
  hd.title=on?'收起旅行備註':'展開旅行備註';hd.setAttribute('aria-label',hd.title);hd.setAttribute('aria-expanded',on);
}

/* ================= top panel ================= */
function cardHTML(p){
  var ds=daysOf(p.id);
  return '<article class="card'+(shownFocus===p.id?' focus':'')+'" data-place="'+p.id+'">'+
    '<div class="ph'+(p.img?' has':'')+'">'+(p.img?'<img src="'+p.img+'" alt="" draggable="false">':'')+
    (ds.length?'<span class="badge">Day '+ds.join(', ')+'</span>':'')+'</div>'+moreBtn('card',p.id,p.name+' 的選單')+
    (isEditing('name','card',p.id)
      ?'<input class="edit cname" value="'+esc(p.name)+'" maxlength="40" aria-label="地點名稱">'
      :'<div class="cname" data-edit="name" title="點兩下修改名稱">'+esc(p.name)+'</div>')+
    (isEditing('note','card',p.id)
      ?'<textarea class="edit cnote" maxlength="60" placeholder="備註" aria-label="備註">'+esc(p.note)+'</textarea>'
      :'<div class="cnote'+(p.note?'':' empty')+'" data-edit="note" title="點兩下修改備註">'+(p.note?esc(p.note):'備註')+'</div>')+
    '</article>';
}
function renderTop(){
  chipsEl.innerHTML=CATS.map(function(c){var on=ui.cat===c.id;
    return '<button class="chip'+(on?' on':'')+'" data-act="chip" data-cat="'+c.id+'" aria-pressed="'+on+'">'+catSvg(c.id,1)+c.name+'</button>';}).join('');
  var keep=cardsEl.scrollLeft;
  var list=db.places.filter(function(p){return p.cat===ui.cat;});
  /* a trip with no places at all invites collecting some on Google Maps (see "browser extension"); a category with
     none, in a trip that has places, just says so */
  cardsEl.innerHTML=list.length?list.map(cardHTML).join(''):
    !db.places.length?'<button class="collect" data-act="collect"><span class="collect-t">Your travel collection starts here</span>'+
      '<span class="collect-s">Add your favorite spots from Google Maps here, then start planning your trip'+ICON.arrow+'</span></button>':
    '<div class="card-empty" role="img" aria-label="這個分類還沒有地點"></div>';
  cardsEl.scrollLeft=keep;
}
function revealCard(pid){
  var el=cardsEl.querySelector('.card[data-place="'+pid+'"]');if(!el)return;
  var a=el.offsetLeft-20,b=el.offsetLeft+el.offsetWidth+20;
  if(a<cardsEl.scrollLeft)cardsEl.scrollLeft=a;
  else if(b>cardsEl.scrollLeft+cardsEl.clientWidth)cardsEl.scrollLeft=b-cardsEl.clientWidth;
}
function applyPanels(){
  app.classList.toggle('lc',!ui.leftOpen);app.classList.toggle('tc',!ui.topOpen);
  var lh=$('lh'),th=$('th'),tt=$('ttab');
  lh.innerHTML=ICON.side;
  lh.title=ui.leftOpen?'收起行程':'展開行程';lh.setAttribute('aria-label',lh.title);lh.setAttribute('aria-expanded',ui.leftOpen);
  th.innerHTML=ICON.chevUp;th.title='收起 Travel Collection';th.setAttribute('aria-label',th.title);
  tt.innerHTML='<span>Travel Collection</span>'+ICON.chevDown;tt.title='展開 Travel Collection';tt.tabIndex=ui.topOpen?-1:0;
}

/* ================= menu ================= */
function mi(act,id,icon,label,checked,val){
  return '<button role="menuitem" data-act="'+act+'" data-id="'+esc(id)+'"'+(val?' data-val="'+val+'"':'')+'>'+(icon||'')+'<span>'+label+'</span>'+(checked?(checked==='round'?'<span class="rck">'+ICON.tick+'</span>':'<span class="ck">'+ICON.check+'</span>'):'')+'</button>';
}
var menuShown='',menuOut=0;
/* closing: the menu goes the way it came, and is taken away when it has gone */
function hideMenu(){
  if(menuOut||menuEl.hidden)return;
  var was=menuShown;menuShown='';
  if(!was||(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)){menuEl.hidden=true;menuEl.innerHTML='';return;}
  menuEl.classList.remove('pop');menuEl.classList.add('out');
  menuOut=setTimeout(function(){menuOut=0;menuEl.hidden=true;menuEl.innerHTML='';menuEl.classList.remove('out');},150);
}
function renderMenu(){
  var m=ui.menu,open=document.querySelectorAll('.more.open'),i,tz=titleWrap.querySelector('.tzone');
  for(i=0;i<open.length;i++)open[i].classList.remove('open');
  if(tz)tz.classList.toggle('on',!!m&&m.type==='trips');
  if(!m){hideMenu();return;}
  var h='',p;
  var SEP='<div class="sep"></div>';
  if(m.type==='stop')h=mi('m-rename',m.id,'','Rename')+SEP+mi('m-addnote',m.id,'','Add a note')+mi('m-addcheck',m.id,'','Add a checklist')+SEP+mi('m-remove',m.id,'','Delete from day');
  else if(m.type==='check'){
    var en=entryOf(m.id);if(!en){ui.menu=null;menuEl.hidden=true;menuShown='';return;}
    h=mi('m-ck-edit',m.id,'','Edit')+SEP+
      (en.link?mi('m-ck-link',m.id,'','Edit link')+mi('m-ck-unlink',m.id,'','Remove link'):mi('m-ck-link',m.id,'','Add a link'))+
      (en.link||en.file?SEP:'')+
      (en.file?mi('m-ck-file',m.id,'','Replace file')+mi('m-ck-unfile',m.id,'','Remove file'):mi('m-ck-file',m.id,'','Add a file'))+
      SEP+mi('m-ck-del',m.id,'','Delete');
  }
  else if(m.type==='note')h=mi('m-note-edit',m.id,'','Edit note')+'<div class="sep"></div>'+mi('m-note-del',m.id,'','Delete note');
  else if(m.type==='day')h=mi('m-day-delete',m.id,'','Delete');
  else if(m.type==='card'){
    p=place(m.id);if(!p){ui.menu=null;menuEl.hidden=true;menuShown='';return;}
    h=CATS.map(function(c){return mi('m-cat',m.id,'',c.name,p.cat===c.id,c.id);}).join('')+'<div class="sep"></div>'+
      (p.img?mi('m-clear',m.id,'','Clear image')+'<div class="sep"></div>':'')+
      mi('m-delete',m.id,'','Delete');
  }else if(m.type==='mode'){
    var cur=db.legs[m.id]||'car';
    h=MODES.map(function(o){return mi('m-mode',m.id,ICON[o.id],o.name,cur===o.id,o.id);}).join('');
  }else if(m.type==='trips'){
    /* every trip, the one being shown ticked; then a new one; then deleting this one, which asks once more */
    var short=db.title.length>12?db.title.slice(0,12)+'…':db.title;
    h=store.trips.map(function(t){return mi('m-trip',t.id,ICON.pin,esc(t.title),t.id===store.current&&'round');}).join('')+SEP+
      mi('m-trip-new','trips',ICON.plusSm,'Create a new trip')+SEP+
      (m.confirm?mi('m-trip-del2','trips',ICON.trashSm,'Delete “'+esc(short)+'”?'):mi('m-trip-del','trips',ICON.trashSm,'Delete this trip'));
  }
  /* it comes in when it opens, or when another one takes its place; not when the same one is drawn again (the
     confirmation row of "Delete this trip", say) */
  var fresh=menuShown!==m.type+'|'+m.id;menuShown=m.type+'|'+m.id;
  clearTimeout(menuOut);menuOut=0;
  menuEl.className='menu'+(m.type==='trips'?' trips':'');
  menuEl.innerHTML=h;menuEl.hidden=false;
  if(fresh){void menuEl.offsetWidth;menuEl.classList.add('pop');}
  var w=menuEl.offsetWidth,hh=menuEl.offsetHeight;
  menuEl.style.left=clamp(m.x,8,window.innerWidth-w-8)+'px';
  menuEl.style.top=(m.y+hh>window.innerHeight-8?Math.max(8,m.top-hh-4):m.y)+'px';
  var btn=document.querySelector('.more[data-menu="'+m.type+'"][data-id="'+m.id+'"]');if(btn)btn.classList.add('open');
}
function entryOf(id){var a=id.split('|'),s=stopOf(a[0]);return s&&s.stop.plan?s.stop.plan[+a[1]]||null:null;}
function closeMenu(){
  if(!ui.menu)return;
  /* opened with the mouse: do not leave focus on the button, or it would stay visible after Esc */
  var kb=ui.menu.kb,ae=document.activeElement;ui.menu=null;renderMenu();
  if(!kb&&ae&&ae.classList&&(ae.classList.contains('more')||ae.classList.contains('tripbtn')))ae.blur();
}

/* ================= search ================= */
/* Search looks only at the map: places come from the place search after a short pause in typing. A result that is
   already saved is still listed, marked as saved, and picking it selects the saved place instead of adding a copy.
   A saved place is recognised by Google's ID; places saved before the search was Google's have none and go by name.
   found holds the latest answer and searchNote says why there is nothing to show */
var found=[],foundFor='',searchTm=null,searchSeq=0,searchNote='',pickSeq=0;
function queueSearch(){
  clearTimeout(searchTm);
  var q=ui.q.trim();
  if(q.length<2){found=[];foundFor='';searchNote='';searchSeq++;return;}
  if(q===foundFor)return;
  searchTm=setTimeout(function(){
    var seq=++searchSeq;
    searchPlaces(q,mapView?mapView.center():null).then(function(list){
      if(seq!==searchSeq)return;
      found=list;foundFor=q;searchNote=list.length?'':'none';renderResults();
    },function(){
      if(seq!==searchSeq)return;
      found=[];foundFor='';searchNote='fail';renderResults();
    });
  },350);
}
function clearSearch(){clearTimeout(searchTm);searchSeq++;found=[];foundFor='';searchNote='';ui.searchOpen=false;ui.q='';qEl.value='';qEl.blur();renderResults();}
function renderResults(){
  if(!ui.searchOpen){resultsEl.hidden=true;resultsEl.innerHTML='';return;}
  var h='',byGid={},byName={};
  db.places.forEach(function(p){if(p.gid)byGid[p.gid]=p.id;else byName[p.name]=p.id;});
  found.forEach(function(c,i){
    var id=byGid[c.gid]||byName[c.name];
    h+=id?'<button data-act="pick-saved" data-id="'+id+'"><span>'+esc(c.name)+'</span><span class="tag">Added</span></button>'
         :'<button data-act="pick-new" data-i="'+i+'"><span>'+esc(c.name)+'</span><span class="tag">'+esc(c.sub)+'</span></button>';
  });
  if(!h&&searchNote==='none')h='<p>找不到「'+esc(ui.q.trim())+'」。</p>';
  if(!h&&searchNote==='fail')h='<p>搜尋暫時無法使用，請稍後再試。</p>';
  if(!h){resultsEl.hidden=true;resultsEl.innerHTML='';return;}
  resultsEl.innerHTML=h;resultsEl.hidden=false;
}

/* ================= map ================= */
var mapView=null;
/* the part of the map not covered by the two panels, in map-container pixels */
function safeArea(){
  var W=mapEl.clientWidth,H=mapEl.clientHeight,gap=16;
  var l=ui.leftOpen?lp.offsetWidth+gap*2+26:40,t=ui.topOpen?tp.offsetHeight+gap+34:(ui.leftOpen?56:lp.offsetHeight+gap+30);
  if(l>W-160)l=40;if(t>H-160)t=40;
  return {l:l,t:t,r:W-60,b:H-64,W:W,H:H};
}
function fitPadding(){var s=safeArea();return {left:s.l+30,top:s.t+30,right:s.W-s.r+30,bottom:s.H-s.b+30};}
/* what the map should frame right now: the day it is showing, or every place when no day is open.
   maxZoom keeps a single stop or a tight cluster from filling the screen */
function currentFrame(){
  var d=ui.day&&getDay(ui.day),pts=[];
  if(d&&d.stops.length){
    d.stops.forEach(function(st,n){var p=place(st.place);if(!p)return;pts.push([p.lng,p.lat]);
      /* a route can bulge outside its two ends, so a few of its points count too */
      var nx=d.stops[n+1]&&place(d.stops[n+1].place),r=nx&&legRoute(p,nx),i;
      if(r)for(i=0;i<r.c.length;i+=Math.max(1,Math.floor(r.c.length/40)))pts.push(r.c[i]);});
    return {pts:pts,maxZoom:d.stops.length===1?13.5:14};
  }
  db.places.forEach(function(p){pts.push([p.lng,p.lat]);});
  if(!pts.length)pts=[[138.40,35.70],[139.16,35.08]];
  return {pts:pts,maxZoom:12};
}
/* a trip with no places yet has nothing to frame: the map stays where it is */
function fitCurrent(){if(!mapView||!db.places.length)return;var f=currentFrame();mapView.fit(f.pts,fitPadding(),f.maxZoom);}
function ensureVisible(lat,lng){if(mapView)mapView.ensureVisible([lng,lat],safeArea());}
function renderMap(){
  if(!mapView)return;
  var d=ui.day&&getDay(ui.day),marks=[],legs=[];
  function mk(lat,lng,inner){marks.push({lat:lat,lng:lng,html:inner});}
  db.places.forEach(function(p){if(daysOf(p.id).length)return;
    mk(p.lat,p.lng,'<button class="dot un" data-act="focus" data-place="'+p.id+'" title="'+esc(p.name)+'" aria-label="'+esc(p.name)+'"></button>');});
  /* a leg follows the road once its route is known; train, boat and plane legs are always straight lines */
  (d?[d]:db.days).forEach(function(day){
    day.stops.forEach(function(st,n){
      var p=place(st.place),nx=day.stops[n+1]&&place(day.stops[n+1].place);if(!p||!nx)return;
      var r=legRoute(p,nx);
      legs.push({coords:r?r.c:[[p.lng,p.lat],[nx.lng,nx.lat]],w:d?4:3});
    });
  });
  if(d){
    d.stops.forEach(function(st,n){var id=st.place,p=place(id);if(!p)return;
      mk(p.lat,p.lng,'<button class="npin'+(ui.focus===id?' focus':'')+'" data-act="focus" data-place="'+id+'" aria-label="'+(n+1)+'. '+esc(p.name)+'">'+(n+1)+'</button><span class="nlabel">'+esc(p.name)+'</span>');});
  }else{
    db.days.forEach(function(day,i){
      day.stops.forEach(function(st,n){var id=st.place,p=place(id);if(!p)return;
        mk(p.lat,p.lng,'<button class="dot" data-act="focus" data-place="'+id+'" title="'+esc(p.name)+'" aria-label="'+esc(p.name)+'"></button>'+
          (n===0?'<button class="daytag" data-act="day" data-day="'+day.id+'">Day '+(i+1)+'</button>':''));});
    });
  }
  var fp=ui.focus&&place(ui.focus);
  if(fp&&!(d&&d.stops.some(function(x){return x.place===fp.id;})))mk(fp.lat,fp.lng,'<span class="fpin"></span><span class="flabel">'+esc(fp.name)+'</span>');
  if(ui.pending){var c=ui.pending;
    mk(c.lat,c.lng,'<span class="fpin"></span><div class="pend" role="group" aria-label="儲存地點"><div class="pend-top"><span class="pend-name">'+esc(c.name)+'</span>'+
      '<button class="xbtn" data-act="pend-close" aria-label="關閉">'+ICON.x+'</button></div><div class="chips">'+
      CATS.map(function(k){return '<button class="chip'+(ui.pending.cat===k.id?' on':'')+'" data-act="pend-cat" data-cat="'+k.id+'" aria-pressed="'+(ui.pending.cat===k.id)+'">'+catSvg(k.id,1)+k.name+'</button>';}).join('')+
      '</div><button class="savebtn" data-act="pend-save">Add to Travel Collection</button></div>');}
  mapView.setRoutes(legs);
  mapView.setMarkers(marks);
}
/* The map library loads in the background, so the panels are usable straight away and the map appears when it is
   ready. The app still works without it (no connection, or Google refuses the key): a note says why */
function mapNote(){
  if(mapEl.querySelector('.maperr'))return;
  var n=document.createElement('p');n.className='maperr';n.textContent='地圖載入不了。請確認網路連線後重新整理；行程仍然可以編輯。';mapEl.appendChild(n);
}
function initMap(){
  loadMaps(mapNote).then(function(){
    var f=currentFrame();
    mapView=createMap($('mapgl'),{points:f.pts,padding:fitPadding(),maxZoom:f.maxZoom,
      onBackgroundClick:function(){if(ui.focus||ui.pending){ui.focus=null;ui.pending=null;render();}}});
    renderMap();
  }).catch(function(){mapView=null;mapNote();});
}
/* Google lets a place's position be kept for 30 days. A little before that, places that came from the search are
   asked for again, one after another, when the app is opened. If that fails (offline, daily cap reached) the place
   keeps the position it has and is tried again next time: a saved trip is never emptied */
var FRESH=25*24*3600*1000;
function refreshPoints(){
  var due=[],changed=false;
  store.trips.forEach(function(t){t.places.forEach(function(p){if(p.gid&&!(Date.now()-p.at<FRESH))due.push(p);});});
  due=due.slice(0,40);
  (function next(){
    var p=due.shift();
    if(!p){if(changed){save();renderMap();}return;}
    placePoint(p.gid,false).then(function(pt){
      if(pt.lat.toFixed(5)!==p.lat.toFixed(5)||pt.lng.toFixed(5)!==p.lng.toFixed(5)){p.lat=pt.lat;p.lng=pt.lng;}
      p.at=Date.now();changed=true;
    },function(){due=[];}).then(next);
  })();
}

/* ================= render ================= */
var shownFocus=null,shownOpen=[];
function syncOpen(){
  if(shownOpen.join()===ui.open.slice().sort().join())return;
  shownOpen=ui.open.slice().sort();
  void document.body.offsetWidth;   /* settle the old state so the transitions have a starting point */
  var o=lpScroll.querySelectorAll('.day'),i,on;
  for(i=0;i<o.length;i++){on=shownOpen.indexOf(o[i].dataset.day)>=0;o[i].classList.toggle('sel',on);o[i].classList.toggle('dim',!on&&shownOpen.length>0);}
}
function syncFocus(){
  if(shownFocus===ui.focus)return;
  shownFocus=ui.focus;
  void document.body.offsetWidth;   /* settle the old state so the transition has a starting point */
  var o=document.querySelectorAll('.stop.focus,.card.focus'),i;
  for(i=0;i<o.length;i++)o[i].classList.remove('focus');
  if(shownFocus){o=document.querySelectorAll('.stop[data-place="'+shownFocus+'"],.card[data-place="'+shownFocus+'"]');for(i=0;i<o.length;i++)o[i].classList.add('focus');}
}
/* menu buttons in the open day: only "hot" while the pointer is within HOTW px of the row's right edge
   (or on the icons that slid left out of that zone, so chasing them does not cancel the hover) */
var HOTW=60,hotPt=null,hotEl=null;
function hotSync(){
  var row=null,el;
  if(hotPt&&!(drag&&drag.on)){
    el=document.elementFromPoint(hotPt.x,hotPt.y);
    row=el&&lp.contains(el)?el.closest('.day.sel .srow,.day.sel .ck,.day.sel .nb,.memo .ck,.memo .nb'):null;
    if(row&&hotPt.x<row.getBoundingClientRect().right-HOTW&&!el.closest('.ckmove,.more'))row=null;
  }
  if(row===hotEl&&(!row||row.classList.contains('hot')))return;
  if(hotEl)hotEl.classList.remove('hot');
  hotEl=row;if(row)row.classList.add('hot');
}
function hotMove(e){hotPt={x:e.clientX,y:e.clientY};hotSync();}
lp.addEventListener('pointermove',hotMove);lp.addEventListener('pointerdown',hotMove);
lp.addEventListener('pointerleave',function(){hotPt=null;hotSync();});
lpScroll.addEventListener('scroll',hotSync);memoEnts.addEventListener('scroll',hotSync);
function render(){
  renderLeft();renderTop();renderMap();renderMenu();syncFocus();syncOpen();
  var inp=document.querySelector('.edit');
  if(inp){
    if(inp.classList.contains('nbedit')||inp.classList.contains('ckedit'))autosize(inp);
    if(document.activeElement!==inp){inp.focus();
      try{if(inp.tagName==='TEXTAREA')inp.setSelectionRange(inp.value.length,inp.value.length);else inp.select();}catch(_){}}
  }
}
function autosize(t){t.style.height='auto';t.style.height=(t.scrollHeight+3)+'px';}
function focusPlace(id){
  var p=place(id);if(!p)return;
  ui.focus=id;ui.pending=null;ui.cat=p.cat;render();ensureVisible(p.lat,p.lng);revealCard(id);
}

/* ================= trips ================= */
/* Show another trip. Nothing carries over from the one before: no open day, no selection, no half-finished edit.
   The map goes to the trip's places; an empty trip leaves it where it is */
function switchTrip(id){
  var t=tripOf(id);if(!t)return;
  store.current=id;db=t;
  ui.day=null;ui.open=[];ui.focus=null;ui.pending=null;ui.menu=null;ui.editing=null;ui.cat='sight';
  shownFocus=null;shownOpen=[];   /* so the new trip is drawn as it is, not animated from the old one's state */
  clearSearch();save();render();
  lpScroll.scrollTop=0;cardsEl.scrollLeft=0;
  fitCurrent();
}
/* Deleting takes the trip's attached files with it. There is always a trip to show: deleting the last one leaves an empty one */
function deleteTrip(id){
  var t=tripOf(id),i=store.trips.indexOf(t);if(!t)return;
  t.days.forEach(function(d){d.stops.forEach(dropFilesOf);});dropFilesOf(t.memo||{});
  store.trips.splice(i,1);
  if(!store.trips.length)store.trips.push(newTrip('New trip'));
  switchTrip(store.trips[Math.max(0,i-1)].id);
}

/* ================= browser extension ================= */
/* The Chrome extension (extension/ in the repository) lets a place be saved from the Google Maps website. It cannot
   reach this page's data, so the two talk through messages on this window:
     page -> extension   {from:'plan-a-trip', type:'state', trip:{id,title}, trips:[{id,title}], saved:{tripId:[fid]}}
                                      the trip on screen, every trip, and the Google places each already has
     extension -> page   {from:'plan-a-trip-ext', type:'inbox', items:[{id,tripId,name,lat,lng,cat,fid}]}
     page -> extension   {from:'plan-a-trip', type:'took', ids:[...]}                  so the extension can forget them
     page -> extension   {from:'plan-a-trip', type:'switch-on'}                        turn the card on Google Maps on
   fid is Google Maps' own identifier for a place, taken from the address of its page; it tells the extension and
   this page that a place is already saved. Without the extension these messages go nowhere. */
var seenInbox={};
function announce(){
  var saved={};
  store.trips.forEach(function(t){saved[t.id]=t.places.map(function(p){return p.fid;}).filter(Boolean);});
  try{window.postMessage({from:'plan-a-trip',type:'state',trip:{id:db.id,title:db.title},
    trips:store.trips.map(function(t){return {id:t.id,title:t.title};}),saved:saved},location.origin);}catch(e){}
}
function takeInbox(items){
  var took=[],added=0,last=null;
  items.slice(0,200).forEach(function(it){
    if(!it||typeof it.id!=='string')return;
    took.push(it.id);
    if(seenInbox[it.id])return;seenInbox[it.id]=1;
    var name=String(it.name==null?'':it.name).replace(/\s+/g,' ').trim().slice(0,40),lat=+it.lat,lng=+it.lng;
    if(!name||!isFinite(lat)||!isFinite(lng)||Math.abs(lat)>85||Math.abs(lng)>180)return;
    var cat=catName(it.cat)?it.cat:'sight',fid=typeof it.fid==='string'&&/^0x[0-9a-f]+:0x[0-9a-f]+$/.test(it.fid)?it.fid:'';
    var t=tripOf(it.tripId)||db;
    if(t.places.some(function(p){return fid?p.fid===fid:p.name===name&&Math.abs(p.lat-lat)<1e-5&&Math.abs(p.lng-lng)<1e-5;}))return;
    var p=newPlace({name:name,cat:cat,lat:+lat.toFixed(6),lng:+lng.toFixed(6)});if(fid)p.fid=fid;
    t.places.push(p);added++;if(t===db)last=p;
  });
  try{window.postMessage({from:'plan-a-trip',type:'took',ids:took},location.origin);}catch(e){}
  if(!added)return;
  save();
  /* something being typed is left alone; the new place shows at the next redraw */
  if(last&&!ui.editing){if(!ui.topOpen){ui.topOpen=true;applyPanels();}focusPlace(last.id);}
  toast('從 Google 地圖加入了 '+added+' 個地點');
}
window.addEventListener('message',function(e){
  if(e.source!==window||e.origin!==location.origin)return;
  var m=e.data;if(!m||m.from!=='plan-a-trip-ext')return;
  if(m.type==='hello')announce();
  else if(m.type==='inbox'&&Array.isArray(m.items))takeInbox(m.items);
});

/* ================= inline editing ================= */
function startEdit(kind,where,pid,i){closeMenu();ui.editing={kind:kind,where:where,place:pid||'',i:i==null?'':i};render();}
function commitEdit(cancel){
  var e=ui.editing;if(!e)return;
  var inp=document.querySelector('.edit'),v=inp?inp.value.replace(/^\s*\n/,'').replace(/\s+$/,''):'';
  if(e.kind!=='plan'&&e.kind!=='check')v=v.trim();
  ui.editing=null;
  if(!cancel&&inp){
    if(e.kind==='title'){if(v)db.title=v;}
    else{
      /* in the left panel an edit targets one stop (a visit); on a card it targets the place */
      var so=e.where==='left'?stopOf(e.place):null,st=so&&so.stop,p=place(st?st.place:e.place);if(p||e.place===MEMO){
      if(e.kind==='name'){if(v&&p)p.name=v;}
      else if(e.kind==='plan'||e.kind==='check'){if(st){st.plan=st.plan||[];
        if(e.i==='new'){if(v)st.plan.push(e.kind==='plan'?{k:'n',text:v}:{k:'c',text:v,done:false,link:'',file:null});}
        else{var en=st.plan[+e.i];if(en){if(v)en.text=v;else{if(en.file)fileDel(en.file.id);st.plan.splice(+e.i,1);}}}}}
      else if(e.kind==='link'){var le=st&&st.plan&&st.plan[+e.i];if(le){
        if(!v)le.link='';
        else{var u=/^[a-z][a-z0-9+.-]*:/i.test(v)?v:'https://'+v,ok=false;
          try{var U=new URL(u);ok=(U.protocol==='https:'||U.protocol==='http:')&&U.hostname.indexOf('.')>0;}catch(_){}
          if(ok)le.link=u;else toast('這不是有效的網址，連結沒有變更');}}}
      else if(p)p.note=v;}}
    save();
  }
  render();
}

/* ================= images ================= */
function loadImage(file,pid){
  var p=place(pid);if(!p)return;
  if(!/^image\//.test(file.type)){toast('請選擇圖片檔');return;}
  var r=new FileReader();
  r.onload=function(){
    var img=new Image();
    img.onload=function(){
      var w=Math.min(520,img.naturalWidth||520),hh=Math.round(w*(img.naturalHeight||1)/(img.naturalWidth||1));
      var c=document.createElement('canvas');c.width=w;c.height=hh;c.getContext('2d').drawImage(img,0,0,w,hh);
      try{p.img=c.toDataURL('image/jpeg',0.82);}catch(_){p.img=String(r.result);}
      if(!save())toast('圖片已顯示，但瀏覽器的儲存空間不足，重新整理後會消失');
      renderTop();renderMenu();
    };
    img.onerror=function(){toast('這個檔案無法當作圖片讀取');};
    img.src=String(r.result);
  };
  r.readAsDataURL(file);
}
function attachFile(sid,k,file){
  var so=stopOf(sid),en=so&&so.stop.plan&&so.stop.plan[k];if(!en||en.k!=='c')return;
  if(!(file.type==='application/pdf'||/^image\//.test(file.type))){toast('只能附加 PDF 或圖片');return;}
  if(file.size>5*1024*1024){toast('檔案超過 5 MB，原型放不下');return;}
  var id=uid();
  filePut(id,file).then(function(kept){
    if(en.file)fileDel(en.file.id);
    en.file={id:id,name:file.name,type:file.type,size:file.size};
    save();render();
    toast(kept?'已附加 '+file.name:'已附加，但瀏覽器不讓原型存檔案，重新整理後會消失');
  });
}
var fileIn=$('filein'),fileFor=null;
fileIn.addEventListener('change',function(){var f=fileIn.files&&fileIn.files[0];if(f&&fileFor)attachFile(fileFor[0],+fileFor[1],f);fileIn.value='';fileFor=null;});

/* in-page viewer: the prototype's host blocks downloads and embedded PDF viewers */
var viewerEl=$('viewer'),vBody=$('vbody'),vUrl=null,vTok=0,pdfLib=null;
var PDFJS='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/';
viewerEl.querySelector('.xbtn').innerHTML=ICON.x;
function closeViewer(){if(viewerEl.hidden)return;viewerEl.hidden=true;vTok++;vBody.innerHTML='';if(vUrl){URL.revokeObjectURL(vUrl);vUrl=null;}}
function vMsg(t){vBody.innerHTML='<p class="vmsg">'+esc(t)+'</p>';}
function loadPdfLib(){
  if(!pdfLib){pdfLib=import(PDFJS+'pdf.min.mjs').then(function(m){m.GlobalWorkerOptions.workerSrc=PDFJS+'pdf.worker.min.mjs';return m;});
    pdfLib.catch(function(){pdfLib=null;});}
  return pdfLib;
}
function openFile(id){
  var en=entryOf(id);if(!en||!en.file)return;
  var f=en.file,tok=++vTok;
  $('vname').textContent=f.name;vMsg('讀取中…');viewerEl.hidden=false;
  fileGet(f.id).then(function(blob){
    if(tok!==vTok)return;
    if(!blob){vMsg('找不到這個檔案。它可能是在別的瀏覽器加的，或是瀏覽器的資料被清掉了。');return;}
    if(/^image\//.test(f.type)){vUrl=URL.createObjectURL(blob);vBody.innerHTML='<img alt="">';vBody.firstChild.src=vUrl;return;}
    var fail=function(){if(tok===vTok)vMsg(f.name+'（'+fmtSize(f.size)+'）已經附加。原型的執行環境沒辦法顯示這份 PDF，正式版會直接開啟。');};
    var timer=setTimeout(fail,20000);
    Promise.all([loadPdfLib(),blob.arrayBuffer()]).then(function(r){return r[0].getDocument({data:new Uint8Array(r[1])}).promise;}).then(function(doc){
      if(tok!==vTok)return;
      clearTimeout(timer);vBody.innerHTML='';
      var n=Math.min(doc.numPages,12),cssW=Math.max(240,Math.min(780,vBody.clientWidth-40)),dpr=Math.min(window.devicePixelRatio||1,2),chain=Promise.resolve();
      function pageJob(i){return function(){return doc.getPage(i).then(function(pg){
        if(tok!==vTok)return;
        var vp=pg.getViewport({scale:1}),v2=pg.getViewport({scale:cssW/vp.width*dpr}),c=document.createElement('canvas');
        c.width=Math.floor(v2.width);c.height=Math.floor(v2.height);c.style.width=cssW+'px';vBody.appendChild(c);
        return pg.render({canvasContext:c.getContext('2d'),viewport:v2,canvas:c}).promise;});};}
      for(var i=1;i<=n;i++)chain=chain.then(pageJob(i));
      return chain.then(function(){if(tok===vTok&&doc.numPages>n){var m=document.createElement('p');m.className='vmsg';m.textContent='只顯示前 '+n+' 頁，共 '+doc.numPages+' 頁。';vBody.appendChild(m);}});
    }).catch(function(){clearTimeout(timer);fail();});
  });
}

function markDrop(el,cls){var o=document.querySelectorAll('.'+cls),i;for(i=0;i<o.length;i++)if(o[i]!==el)o[i].classList.remove(cls);if(el)el.classList.add(cls);}
document.addEventListener('dragover',function(e){
  e.preventDefault();
  var c=e.target.closest&&e.target.closest('.card'),k=e.target.closest&&e.target.closest('.ent.c');
  markDrop(c||null,'dropimg');markDrop(k||null,'dropfile');
  if(e.dataTransfer)e.dataTransfer.dropEffect=c||k?'copy':'none';
});
document.addEventListener('dragleave',function(e){if(!e.relatedTarget){markDrop(null,'dropimg');markDrop(null,'dropfile');}});
document.addEventListener('drop',function(e){
  e.preventDefault();markDrop(null,'dropimg');markDrop(null,'dropfile');
  var c=e.target.closest&&e.target.closest('.card'),k=e.target.closest&&e.target.closest('.ent.c');
  var fs=e.dataTransfer&&e.dataTransfer.files,f=null,i;
  if(k){var st=k.closest('.stop,.memo-ents');if(fs&&fs[0]&&st)attachFile(st.dataset.stop,+k.dataset.ent,fs[0]);return;}
  if(!c)return;
  for(i=0;fs&&i<fs.length;i++)if(/^image\//.test(fs[i].type)){f=fs[i];break;}
  if(!f){toast('請從電腦拖曳圖片檔進來');return;}
  loadImage(f,c.dataset.place);
});

/* ================= drag places into days ================= */
var drag=null,suppressClick=false,ghost=null,dropline=null;
function clearDropUI(){
  var o=lpScroll.querySelectorAll('.day.over'),i;for(i=0;i<o.length;i++)o[i].classList.remove('over');
  if(dropline){dropline.remove();dropline=null;}
}
function startDrag(){
  var p=place(drag.id);if(!p){drag=null;return;}
  drag.on=true;closeMenu();
  if(!ui.leftOpen){ui.leftOpen=true;applyPanels();}
  document.body.classList.add('dragging');
  ghost=document.createElement('div');ghost.className='ghost';document.body.appendChild(ghost);
  if(drag.ent!=null){
    var en=entryOf(drag.stop+'|'+drag.ent);ghost.textContent=en?String(en.text).split('\n')[0]:'';
    var se=lpScroll.querySelector('.stop[data-stop="'+drag.stop+'"] .ent[data-ent="'+drag.ent+'"]');if(se)se.classList.add('dragsrc');
    return;
  }
  ghost.textContent=p.name;
  /* a stop dragged in the left panel moves; a card dragged from the top panel adds one more visit */
  var s=drag.stop?lpScroll.querySelector('.stop[data-stop="'+drag.stop+'"]'):cardsEl.querySelector('.card[data-place="'+drag.id+'"]');
  if(s)s.classList.add('dragsrc');
}
function moveDrag(e){
  ghost.style.transform='translate('+(e.clientX+14)+'px,'+(e.clientY+12)+'px)';
  var el=document.elementFromPoint(e.clientX,e.clientY),dayEl=el&&el.closest&&el.closest('.day');
  clearDropUI();drag.target=null;
  var sr=lpScroll.getBoundingClientRect();
  if(e.clientX>=sr.left&&e.clientX<=sr.right){
    if(e.clientY<sr.top+34)lpScroll.scrollTop-=10;else if(e.clientY>sr.bottom-34)lpScroll.scrollTop+=10;
  }
  if(drag.ent!=null){
    /* reorder a note or checklist item inside its own place */
    var st=lpScroll.querySelector('.stop[data-stop="'+drag.stop+'"]');
    if(!st||!el||!el.closest('#lp'))return;
    var ents=st.querySelectorAll('.ent[data-ent]'),ei=ents.length,j,er,ey;
    for(j=0;j<ents.length;j++){er=ents[j].getBoundingClientRect();if(e.clientY<er.top+er.height/2){ei=j;break;}}
    if(!ents.length)return;
    ey=ei<ents.length?ents[ei].getBoundingClientRect().top-4:ents[ents.length-1].getBoundingClientRect().bottom+4;
    dropline=document.createElement('div');dropline.className='dropline sub';
    dropline.style.top=(ey-sr.top+lpScroll.scrollTop)+'px';lpScroll.appendChild(dropline);
    drag.target={ent:ei};
    return;
  }
  if(!dayEl)return;
  var stops=dayEl.querySelectorAll('.stop'),idx=stops.length,i,r,y;
  for(i=0;i<stops.length;i++){r=stops[i].getBoundingClientRect();if(e.clientY<r.top+r.height/2){idx=i;break;}}
  dayEl.classList.add('over');
  if(!stops.length){r=dayEl.querySelector('.day-head').getBoundingClientRect();y=r.bottom+14;}
  else if(idx<stops.length){y=stops[idx].getBoundingClientRect().top-2;}
  else{y=stops[stops.length-1].getBoundingClientRect().bottom+2;}
  dropline=document.createElement('div');dropline.className='dropline';
  dropline.style.top=(y-sr.top+lpScroll.scrollTop)+'px';lpScroll.appendChild(dropline);
  drag.target={day:dayEl.dataset.day,idx:idx};
}
function endDrag(apply){
  var t=drag.target,id=drag.id;
  if(ghost){ghost.remove();ghost=null;}
  clearDropUI();document.body.classList.remove('dragging');
  if(drag.ent!=null){
    var so=stopOf(drag.stop),pp=so&&so.stop;
    if(apply&&t&&pp&&pp.plan){var fromI=drag.ent,toI=t.ent;if(fromI<toI)toI--;
      if(toI!==fromI){var moved=pp.plan.splice(fromI,1)[0];pp.plan.splice(clamp(toI,0,pp.plan.length),0,moved);save();}}
    render();return;
  }
  if(apply&&t){
    var to=getDay(t.day),src=drag.stop?stopOf(drag.stop):null,from=src&&src.day,idx=t.idx,item=src?src.stop:newStop(id);
    if(to&&!(drag.stop&&!src)){
      if(src){from.stops.splice(src.idx,1);if(from===to&&src.idx<idx)idx--;}
      to.stops.splice(clamp(idx,0,to.stops.length),0,item);
      save();
      if(ui.day&&(to.id===ui.day||(from&&from.id===ui.day))){render();fitCurrent();return;}
    }
  }
  render();
}
document.addEventListener('pointerdown',function(e){
  if(e.button!==0||ui.editing)return;
  if(e.target.closest('button,input,textarea,a,#menu'))return;
  var el=e.target.closest('.card[data-place],.stop[data-place]');if(!el)return;
  var entEl=e.target.closest('.ent[data-ent]');
  drag={id:el.dataset.place,stop:el.dataset.stop||null,ent:entEl?+entEl.dataset.ent:null,x:e.clientX,y:e.clientY,on:false,target:null};
});
document.addEventListener('pointermove',function(e){
  if(!drag)return;
  if(!drag.on){if(Math.abs(e.clientX-drag.x)+Math.abs(e.clientY-drag.y)<6)return;startDrag();if(!drag)return;}
  moveDrag(e);
});
function finishPointer(apply){
  if(!drag)return;
  if(drag.on){endDrag(apply);suppressClick=true;setTimeout(function(){suppressClick=false;},0);}
  drag=null;
}
document.addEventListener('pointerup',function(){finishPointer(true);});
document.addEventListener('pointercancel',function(){finishPointer(false);});

/* ================= actions ================= */
var ACT={
  /* closed: open it. Open but the map is on another day: move the map to it, keep it open. Open and on the map: close it;
     the map then goes to the day opened before it, or to the whole trip when none is left */
  'day':function(el){var id=el.dataset.day;if(isOpen(id)&&ui.day===id)closeDay(id);else openDay(id);ui.focus=null;ui.pending=null;render();fitCurrent();},
  'add-day':function(){db.days.push({id:uid(),stops:[]});save();render();lpScroll.scrollTop=lpScroll.scrollHeight;},
  'menu':function(el,ev){
    var type=el.dataset.menu,id=el.dataset.id;
    if(ui.menu&&ui.menu.type===type&&ui.menu.id===id){closeMenu();return;}
    var r=el.getBoundingClientRect();ui.menu={type:type,id:id,x:r.left,y:r.bottom+4,top:r.top,kb:!!(ev&&ev.detail===0)};renderMenu();
  },
  'm-rename':function(el){startEdit('name','left',el.dataset.id);},
  'm-addnote':function(el){var id=el.dataset.id,so=stopOf(id),d=so&&so.day,changed=d&&ui.day!==d.id;if(d)openDay(d.id);startEdit('plan','left',id,'new');if(changed)fitCurrent();},
  'm-addcheck':function(el){var id=el.dataset.id,so=stopOf(id),d=so&&so.day,changed=d&&ui.day!==d.id;if(d)openDay(d.id);startEdit('check','left',id,'new');if(changed)fitCurrent();},
  'ck-toggle':function(el){var en=entryOf(el.dataset.id);if(en){en.done=!en.done;save();render();}},
  'm-ck-edit':function(el){var a=el.dataset.id.split('|');startEdit('check','left',a[0],a[1]);},
  'm-ck-link':function(el){var a=el.dataset.id.split('|');startEdit('link','left',a[0],a[1]);},
  'm-ck-unlink':function(el){var en=entryOf(el.dataset.id);if(en){en.link='';save();}ui.menu=null;render();},
  'm-ck-file':function(el){fileFor=el.dataset.id.split('|');ui.menu=null;renderMenu();fileIn.click();},
  'm-ck-unfile':function(el){var en=entryOf(el.dataset.id);if(en&&en.file){fileDel(en.file.id);en.file=null;save();}ui.menu=null;render();},
  'm-ck-del':function(el){var a=el.dataset.id.split('|'),so=stopOf(a[0]),p=so&&so.stop,en=p&&p.plan&&p.plan[+a[1]];if(en){if(en.file)fileDel(en.file.id);p.plan.splice(+a[1],1);save();}ui.menu=null;render();},
  'file-open':function(el){openFile(el.dataset.id);},
  'viewer-close':function(){closeViewer();},
  'm-note-edit':function(el){var a=el.dataset.id.split('|');startEdit('plan','left',a[0],a[1]);},
  'm-note-del':function(el){var a=el.dataset.id.split('|'),so=stopOf(a[0]),p=so&&so.stop;if(p&&p.plan){p.plan.splice(+a[1],1);save();}ui.menu=null;render();},
  /* removes this one visit, with its notes and checklist; the place stays in the top panel and in its other days */
  'm-remove':function(el){var so=stopOf(el.dataset.id);if(so){dropFilesOf(so.stop);so.day.stops.splice(so.idx,1);save();}ui.menu=null;render();},
  /* removes the place everywhere: every visit in every day goes with it */
  'm-delete':function(el){var id=el.dataset.id;
    db.days.forEach(function(d){d.stops=d.stops.filter(function(x){if(x.place!==id)return true;dropFilesOf(x);return false;});});
    db.places=db.places.filter(function(p){return p.id!==id;});
    Object.keys(db.legs).forEach(function(k){if(k.indexOf(id)>=0)delete db.legs[k];});
    if(ui.focus===id)ui.focus=null;ui.menu=null;save();render();},
  'm-day-delete':function(el){var gd=getDay(el.dataset.id);if(gd)gd.stops.forEach(dropFilesOf);db.days=db.days.filter(function(d){return d.id!==el.dataset.id;});var wasCur=ui.day===el.dataset.id;closeDay(el.dataset.id);ui.menu=null;save();render();if(wasCur)fitCurrent();},
  'm-cat':function(el){var p=place(el.dataset.id);if(p){p.cat=el.dataset.val;ui.cat=p.cat;save();}ui.menu=null;render();revealCard(el.dataset.id);},
  'm-clear':function(el){var p=place(el.dataset.id);if(p){p.img='';save();}ui.menu=null;render();},
  'm-mode':function(el){db.legs[el.dataset.id]=el.dataset.val;ui.menu=null;save();render();},
  'm-trip':function(el){if(el.dataset.id===store.current){closeMenu();return;}switchTrip(el.dataset.id);},
  'm-trip-new':function(){var t=newTrip('New trip');store.trips.push(t);switchTrip(t.id);startEdit('title','left','');},
  'm-trip-del':function(){if(ui.menu){ui.menu.confirm=true;renderMenu();}},
  'm-trip-del2':function(){deleteTrip(store.current);},
  'chip':function(el){var c=el.dataset.cat;if(c===ui.cat)return;   /* one category at a time, never none */
    ui.cat=c;cardsEl.scrollLeft=0;renderTop();},
  'toggle-left':function(){ui.leftOpen=!ui.leftOpen;applyPanels();},
  'memo-toggle':function(){db.memo.open=!db.memo.open;save();applyMemo();},
  'toggle-top':function(){ui.topOpen=!ui.topOpen;applyPanels();},
  'focus':function(el){focusPlace(el.dataset.place);},
  'pick-saved':function(el){var p=place(el.dataset.id);if(!p)return;
    clearSearch();focusPlace(p.id);},
  /* a suggestion has no position yet: it is asked for now, and the map goes there when it arrives */
  'pick-new':function(el){var c=found[+el.dataset.i];if(!c)return;
    var seq=++pickSeq;ui.pending=null;ui.focus=null;clearSearch();render();
    placePoint(c.gid,true).then(function(pt){
      if(seq!==pickSeq)return;
      ui.pending={name:c.name,lat:pt.lat,lng:pt.lng,cat:c.cat,gid:c.gid};ui.focus=null;render();
      if(mapView)mapView.showPoint([pt.lng,pt.lat],15,safeArea());
    },function(){if(seq===pickSeq)toast('取不到這個地點的位置，請稍後再試');});},
  'pend-cat':function(el){if(ui.pending){ui.pending.cat=el.dataset.cat;renderMap();}},
  'pend-close':function(){ui.pending=null;renderMap();},
  'pend-save':function(){if(!ui.pending)return;var c=ui.pending,p=newPlace({name:c.name,cat:c.cat,lat:c.lat,lng:c.lng,gid:c.gid});
    db.places.push(p);ui.cat=p.cat;ui.pending=null;ui.focus=p.id;save();render();
    if(!ui.topOpen){ui.topOpen=true;applyPanels();}
    revealCard(p.id);toast('Added to Travel Collection');},
  /* the empty Travel Collection: open Google Maps, with the extension (if it is installed) switched on */
  'collect':function(){
    try{window.postMessage({from:'plan-a-trip',type:'switch-on'},location.origin);}catch(e){}
    window.open('https://www.google.com/maps','_blank','noopener');},
  'zoom-in':function(){if(mapView)mapView.zoomIn();},
  'zoom-out':function(){if(mapView)mapView.zoomOut();},
  'fit':function(){fitCurrent();}
};
var lastClick={key:'',t:0};
document.addEventListener('click',function(e){
  if(suppressClick){suppressClick=false;return;}
  var t=e.target,a=t.closest('[data-act]');
  if(ui.menu&&!t.closest('#menu')&&!(a&&a.dataset.act==='menu'))closeMenu();
  if(ui.searchOpen&&!t.closest('.search')){ui.searchOpen=false;renderResults();}
  if(t===viewerEl){closeViewer();return;}
  if(a){if(ACT[a.dataset.act])ACT[a.dataset.act](a,e);return;}
  if(t.closest('input,textarea,a,#viewer'))return;
  var ed=t.closest('[data-edit]'),pl=t.closest('.card[data-place],.stop[data-place]');
  if(ed){
    var where=ed.closest('.card')?'card':'left',pid=ed.closest('.memo-ents')?MEMO:pl?(where==='left'&&pl.dataset.stop)||pl.dataset.place:'',ei=ed.dataset.i||'',key=ed.dataset.edit+'|'+where+'|'+pid+'|'+ei,now=Date.now();
    if(lastClick.key===key&&now-lastClick.t<450){lastClick={key:'',t:0};startEdit(ed.dataset.edit,where,pid,ei);return;}
    lastClick={key:key,t:now};
  }
  if(pl)focusPlace(pl.dataset.place);
});
document.addEventListener('keydown',function(e){
  var el=e.target;
  if(el.classList&&el.classList.contains('edit')){
    if(e.isComposing||e.keyCode===229)return;
    if(e.key==='Escape'){e.preventDefault();commitEdit(true);}
    else if(e.key==='Enter'&&!(el.tagName==='TEXTAREA'&&e.shiftKey)){e.preventDefault();commitEdit(false);}
    return;
  }
  if(e.key==='Enter'&&el===qEl){var b=resultsEl.querySelector('button');if(b)b.click();return;}
  if(e.key==='Escape'){
    if(!viewerEl.hidden){closeViewer();return;}
    if(drag&&drag.on){finishPointer(false);return;}
    if(ui.menu){closeMenu();return;}
    if(ui.searchOpen){ui.searchOpen=false;renderResults();qEl.blur();return;}
    if(ui.pending||ui.focus){ui.pending=null;ui.focus=null;render();}
  }
});
document.addEventListener('focusout',function(e){if(e.target.classList&&e.target.classList.contains('edit')&&ui.editing)commitEdit(false);});
document.addEventListener('input',function(e){var c=e.target.classList;if(c&&(c.contains('nbedit')||c.contains('ckedit')))autosize(e.target);});
qEl.addEventListener('input',function(){ui.q=qEl.value;ui.searchOpen=true;queueSearch();renderResults();});
qEl.addEventListener('focus',function(){if(!ui.searchOpen){ui.searchOpen=true;renderResults();}});
cardsEl.addEventListener('wheel',function(e){if(Math.abs(e.deltaY)>Math.abs(e.deltaX)&&cardsEl.scrollWidth>cardsEl.clientWidth){cardsEl.scrollLeft+=e.deltaY;e.preventDefault();}},{passive:false});
window.addEventListener('resize',function(){closeMenu();});

/* ================= start ================= */
applyPanels();initMap();render();refreshPoints();announce();
