/* Every icon in the app, as inline SVG strings. Line icons on a 16 grid (class "i", stroke 1.4); category glyphs on an 18 grid. */
function svg(inner){return '<svg class="i" viewBox="0 0 16 16" aria-hidden="true">'+inner+'</svg>';}
var F='fill="currentColor" stroke="none"';
export var CATICON={
  sight:'<circle cx="6.77" cy="7.16" r=".84" fill="currentColor" stroke="none"/><circle cx="11.23" cy="7.16" r=".84" fill="currentColor" stroke="none"/><path d="M6.84 10.55c1.28 1.5 3.46 1.11 4.33 0"/>',
  food:'<path d="M5.2 4.6v2.2a1.4 1.4 0 0 0 2.8 0V4.6M6.6 4.6v8.8M11.6 8.6v4.8M10.1 6.6a1.5 2 0 1 0 3 0a1.5 2 0 1 0-3 0z"/>',
  stay:'<path d="M4.5 5.6v7M4.5 11h9v1.6M7.4 11V8.6h4.1a2 2 0 0 1 2 2V11"/>',
  transit:'<path d="M7.4 4.4h3.2a1.8 1.8 0 0 1 1.8 1.8v3.8a1.8 1.8 0 0 1-1.8 1.8H7.4a1.8 1.8 0 0 1-1.8-1.8V6.2a1.8 1.8 0 0 1 1.8-1.8zM5.6 8.4h6.8M7 11.8l-1 1.8M11 11.8l1 1.8"/><circle cx="7.6" cy="10.1" r=".6" fill="currentColor" stroke="none"/><circle cx="10.4" cy="10.1" r=".6" fill="currentColor" stroke="none"/>'
};
/* one glyph per category on an 18 grid; the chip uses the middle 12. The face needs an outline when it has no coloured disc behind it */
export var CATCHIP={sight:'<circle cx="9" cy="9" r="5.45"/><circle cx="7.3" cy="7.9" r=".7" fill="currentColor" stroke="none"/><circle cx="10.7" cy="7.9" r=".7" fill="currentColor" stroke="none"/><path d="M6.9 10.3c.9 1.2 3.3 1.2 4.2 0"/>'};
/* a category's small drawing as a menu icon (class "mico": 12 x 12) */
export function catMico(id){return catSvg(id,1).replace('<svg ','<svg class="mico mcat" ');}
export function catSvg(id,small){return '<svg viewBox="'+(small?'3 3 12 12':'0 0 18 18')+'" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+((small&&CATCHIP[id])||CATICON[id]||'')+'</svg>';}
export var ICON={
  dots:svg('<circle cx="2.5" cy="8" r="1.25" '+F+'/><circle cx="8" cy="8" r="1.25" '+F+'/><circle cx="13.5" cy="8" r="1.25" '+F+'/>'),
  tick:'<svg viewBox="0 0 13 13" aria-hidden="true"><path d="M3.63 5.95l2.05 2.87c.08.11.24.11.32.01l3.36-4.2"/></svg>',
  link:'<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M5 6.5a2.5 2.5 0 0 0 3.77.27l1.5-1.5a2.5 2.5 0 0 0-3.54-3.54l-.86.86"/><path d="M7 5.5a2.5 2.5 0 0 0-3.77-.27l-1.5 1.5a2.5 2.5 0 0 0 3.54 3.54l.85-.86"/></svg>',
  file:'<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M7 1H3.2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h5.6a1 1 0 0 0 1-1V3.8zM7 1v2.8h2.8"/></svg>',
  trash:svg('<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.4 4.5l.6 8.5h6l.6-8.5M6.8 7v3.6M9.2 7v3.6"/>'),
  remove:svg('<circle cx="8" cy="8" r="5.6"/><path d="M5.4 8h5.2"/>'),
  upload:svg('<path d="M8 10.4V3M5 5.8 8 3l3 2.8M3 10.6V13h10v-2.4"/>'),
  clear:svg('<rect x="2.5" y="3" width="11" height="10" rx="1.6"/><path d="M6 6.2l4 3.6M10 6.2 6 9.8"/>'),
  plus:svg('<path d="M8 3v10M3 8h10"/>'),
  x:svg('<path d="M4 4l8 8M12 4l-8 8"/>'),
  left:svg('<path d="M10 3.5 5.5 8l4.5 4.5"/>'),
  right:svg('<path d="M6 3.5 10.5 8 6 12.5"/>'),
  up:svg('<path d="M3.5 10 8 5.5l4.5 4.5"/>'),
  down:svg('<path d="M3.5 6 8 10.5 12.5 6"/>'),
  /* Chewei's drawing, as one path: the panel upright, its head marked off */
  side:'<svg viewBox="0 0 10 13" aria-hidden="true"><path d="M1.5 .75h7a.75.75 0 0 1 .75.75v10a.75.75 0 0 1-.75.75h-7a.75.75 0 0 1-.75-.75v-10a.75.75 0 0 1 .75-.75zM.75 4.75h8.5"/></svg>',
  chevUp:'<svg viewBox="0 0 14 8" aria-hidden="true"><path d="M1 7 7 1l6 6"/></svg>',
  tripChev:'<svg viewBox="0 0 8 13" aria-hidden="true"><path d="M1 1l6 5.5L1 12"/></svg>',
  /* the menus' own small icons, on a 12 grid with a 1px line (class "mico"), one in front of every row: a pen
     for what is edited or renamed (or replaced), a plus for what is added, a cross for what is taken off the thing
     (its link, its file, its picture), a bin for the thing itself going */
  pin:'<svg class="mico" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 .6a3.9 3.9 0 0 1 3.9 3.9c0 2.3-2.6 5.4-3.9 6.9C4.7 9.9 2.1 6.8 2.1 4.5A3.9 3.9 0 0 1 6 .6z"/><circle cx="6" cy="4.5" r="1.55"/></svg>',
  plusSm:'<svg class="mico" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2v8M2 6h8"/></svg>',
  penSm:'<svg class="mico" viewBox="0 0 12 12" aria-hidden="true"><path d="M1.7 10.3l.6-2.5 5.6-5.6a1.35 1.35 0 0 1 1.9 1.9L4.2 9.7zM6.9 3.2l1.9 1.9"/></svg>',
  xSm:'<svg class="mico" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6"/></svg>',
  /* the Travel Collection's day filter: its own mark, and its menu's rows. "All" and "Day" are Chewei's drawings
     (2026-10-10): an 11 grid, a 1px line, corners of half a unit, every line on a whole pixel, so they are shown at 11,
     one to one (class "m11"), never scaled. The mark and the dashed ring ("in no day yet") are drawn to go with them */
  filterSm:'<svg class="mico m11" viewBox="0 0 11 11" aria-hidden="true"><path d="M1.5 2.5h8M3 5.5h5M4.5 8.5h2"/></svg>',
  allSm:'<svg class="mico m11" viewBox="0 0 11 11" aria-hidden="true"><path d="M2 1.5h2a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 1 .5-.5zM7 1.5h2a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 1 .5-.5zM2 6.5h2a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 1 .5-.5zM7 6.5h2a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 1 .5-.5z"/></svg>',
  daySm:'<svg class="mico m11" viewBox="0 0 11 11" aria-hidden="true"><path d="M2 2.5h7a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-.5.5H2a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5zM1.5 5.5h8M3.5 1.5v2M7.5 1.5v2"/></svg>',
  noneSm:'<svg class="mico m11" viewBox="0 0 11 11" aria-hidden="true"><circle cx="5.5" cy="5.5" r="4" stroke-dasharray="1.52 1.6216"/></svg>',
  phoneSm:'<svg class="mico" viewBox="0 0 12 12" aria-hidden="true"><path d="M4 .9h4a1.1 1.1 0 0 1 1.1 1.1v8A1.1 1.1 0 0 1 8 11.1H4A1.1 1.1 0 0 1 2.9 10V2A1.1 1.1 0 0 1 4 .9zM5.2 9.1h1.6"/></svg>',
  trashSm:'<svg class="mico" viewBox="0 0 12 12" aria-hidden="true"><path d="M1.9 3.25h8.2M2.8 3.25v6.4a.9.9 0 0 0 .9.9h4.6a.9.9 0 0 0 .9-.9v-6.4M4.2 3.25v-.9a.9.9 0 0 1 .9-.9h1.8a.9.9 0 0 1 .9.9v.9M5.1 5.55v2.75M6.9 5.55v2.75"/></svg>',
  /* an arrow whose shaft can be lengthened: the line stretches, the head keeps its size (class "arr"). Chewei's
     drawing: a 1.5 line with square ends and a sharp point, 10.5 long at rest and 16.6 stretched */
  arrow:'<span class="arr" aria-hidden="true"><i></i><svg viewBox="4.5 0 6 9.5"><path d="M5.2 .5 9.45 4.75 5.2 9"/></svg></span>',
  chevDown:'<svg viewBox="0 0 12 8" aria-hidden="true"><path d="M1.5 1.5 6 6.5l4.5-5"/></svg>',
  /* the handle of the trip notes at the foot of the left panel: points up; turned over while they are open */
  memoChev:'<svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1.5 4.6 5 1.4l3.5 3.2"/></svg>',
  walk:svg('<circle cx="8.6" cy="2.9" r="1.35" '+F+'/><path d="M8.4 5.8 7.6 9.6 5.4 13.8M7.6 9.6l3 4M5.6 8l2.8-2.2L11 7.6"/>'),
  bike:svg('<path d="M1 10.5a2.7 2.7 0 1 0 5.4 0a2.7 2.7 0 1 0-5.4 0zM9.6 10.5a2.7 2.7 0 1 0 5.4 0a2.7 2.7 0 1 0-5.4 0zM3.7 10.5 6.6 5.8h3.2l2.5 4.7M9.8 5.8 9.3 4h1.6"/>'),
  car:svg('<path d="M2.3 10.6V8.7l1.4-3.4a1 1 0 0 1 .9-.6h6.8a1 1 0 0 1 .9.6l1.4 3.4v1.9M6.4 10.6h3.2M3.4 10.9a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0zM9.6 10.9a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0z"/>'),
  train:svg('<path d="M5.8 2h4.4a2 2 0 0 1 2 2v5.4a2 2 0 0 1-2 2H5.8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM3.8 7h8.4M5.8 14l.9-2.6M10.2 14l-.9-2.6"/>'),
  boat:svg('<path d="M2 10.6h12l-1.8 3H3.8zM7.6 10.6V2.4l4.6 6H7.6"/>'),
  plane:svg('<path d="M8 2.2v11.4M8 6.2 2.6 9.8M8 6.2l5.4 3.6M6 13.6h4"/>')
};
