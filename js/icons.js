/* Every icon in the app, as inline SVG strings. Line icons on a 16 grid (class "i", stroke 1.4); category glyphs on an 18 grid. */
function svg(inner){return '<svg class="i" viewBox="0 0 16 16" aria-hidden="true">'+inner+'</svg>';}
var F='fill="currentColor" stroke="none"';
export var CATICON={
  sight:'<circle cx="6.77" cy="7.16" r=".84" fill="currentColor" stroke="none"/><circle cx="11.23" cy="7.16" r=".84" fill="currentColor" stroke="none"/><path d="M6.84 10.55c1.28 1.5 3.46 1.11 4.33 0"/>',
  food:'<path d="M5.2 4.6v2.2a1.4 1.4 0 0 0 2.8 0V4.6M6.6 4.6v8.8M11.6 8.6v4.8"/><ellipse cx="11.6" cy="6.6" rx="1.5" ry="2"/>',
  stay:'<path d="M4.5 5.6v7M4.5 11h9v1.6M7.4 11V8.6h4.1a2 2 0 0 1 2 2V11"/>',
  transit:'<rect x="5.6" y="4.4" width="6.8" height="7.4" rx="1.8"/><path d="M5.6 8.4h6.8M7 11.8l-1 1.8M11 11.8l1 1.8"/><circle cx="7.6" cy="10.1" r=".6" fill="currentColor" stroke="none"/><circle cx="10.4" cy="10.1" r=".6" fill="currentColor" stroke="none"/>'
};
/* one glyph per category on an 18 grid; the chip uses the middle 12. The face needs an outline when it has no coloured disc behind it */
export var CATCHIP={sight:'<circle cx="9" cy="9" r="5.45"/><circle cx="7.3" cy="7.9" r=".7" fill="currentColor" stroke="none"/><circle cx="10.7" cy="7.9" r=".7" fill="currentColor" stroke="none"/><path d="M6.9 10.3c.9 1.2 3.3 1.2 4.2 0"/>'};
export function catSvg(id,small){return '<svg viewBox="'+(small?'3 3 12 12':'0 0 18 18')+'" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+((small&&CATCHIP[id])||CATICON[id]||'')+'</svg>';}
export var ICON={
  dots:svg('<circle cx="2.5" cy="8" r="1.25" '+F+'/><circle cx="8" cy="8" r="1.25" '+F+'/><circle cx="13.5" cy="8" r="1.25" '+F+'/>'),
  tick:'<svg viewBox="0 0 13 13" aria-hidden="true"><path d="M3.63 5.95l2.05 2.87c.08.11.24.11.32.01l3.36-4.2"/></svg>',
  link:'<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M5 6.5a2.5 2.5 0 0 0 3.77.27l1.5-1.5a2.5 2.5 0 0 0-3.54-3.54l-.86.86"/><path d="M7 5.5a2.5 2.5 0 0 0-3.77-.27l-1.5 1.5a2.5 2.5 0 0 0 3.54 3.54l.85-.86"/></svg>',
  file:'<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M7 1H3.2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h5.6a1 1 0 0 0 1-1V3.8z"/><path d="M7 1v2.8h2.8"/></svg>',
  trash:svg('<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.4 4.5l.6 8.5h6l.6-8.5M6.8 7v3.6M9.2 7v3.6"/>'),
  remove:svg('<circle cx="8" cy="8" r="5.6"/><path d="M5.4 8h5.2"/>'),
  upload:svg('<path d="M8 10.4V3M5 5.8 8 3l3 2.8M3 10.6V13h10v-2.4"/>'),
  clear:svg('<rect x="2.5" y="3" width="11" height="10" rx="1.6"/><path d="M6 6.2l4 3.6M10 6.2 6 9.8"/>'),
  check:svg('<path d="M3.4 8.6l3 3 6.2-7.2"/>'),
  plus:svg('<path d="M8 3v10M3 8h10"/>'),
  x:svg('<path d="M4 4l8 8M12 4l-8 8"/>'),
  left:svg('<path d="M10 3.5 5.5 8l4.5 4.5"/>'),
  right:svg('<path d="M6 3.5 10.5 8 6 12.5"/>'),
  up:svg('<path d="M3.5 10 8 5.5l4.5 4.5"/>'),
  down:svg('<path d="M3.5 6 8 10.5 12.5 6"/>'),
  /* the outline is a rounded rectangle with smoothed corners (Figma: radius 3, corner smoothing 60%), drawn as a path
     because an SVG rect can only have circular corners */
  side:'<svg viewBox="0 0 18 12" aria-hidden="true"><path d="M14.25 .75L15.12 .79L15.7 .92L16.17 1.14L16.56 1.44L16.86 1.83L17.08 2.3L17.21 2.88L17.25 3.75L17.25 8.25L17.21 9.12L17.08 9.7L16.86 10.17L16.56 10.56L16.17 10.86L15.7 11.08L15.12 11.21L14.25 11.25L3.75 11.25L2.88 11.21L2.3 11.08L1.83 10.86L1.44 10.56L1.14 10.17L.92 9.7L.79 9.12L.75 8.25L.75 3.75L.79 2.88L.92 2.3L1.14 1.83L1.44 1.44L1.83 1.14L2.3 .92L2.88 .79L3.75 .75Z"/><path d="M5.75 .75v10.5"/></svg>',
  chevUp:'<svg viewBox="0 0 14 8" aria-hidden="true"><path d="M1 7 7 1l6 6"/></svg>',
  tripChev:'<svg viewBox="0 0 8 13" aria-hidden="true"><path d="M1 1l6 5.5L1 12"/></svg>',
  /* the trip menu's own small icons, on a 12 grid with a 1px line (class "mico") */
  pin:'<svg class="mico" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 .6a3.9 3.9 0 0 1 3.9 3.9c0 2.3-2.6 5.4-3.9 6.9C4.7 9.9 2.1 6.8 2.1 4.5A3.9 3.9 0 0 1 6 .6z"/><circle cx="6" cy="4.5" r="1.55"/></svg>',
  plusSm:'<svg class="mico" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2v8M2 6h8"/></svg>',
  trashSm:'<svg class="mico" viewBox="0 0 12 12" aria-hidden="true"><path d="M1.9 3.25h8.2M2.8 3.25v6.4a.9.9 0 0 0 .9.9h4.6a.9.9 0 0 0 .9-.9v-6.4M4.2 3.25v-.9a.9.9 0 0 1 .9-.9h1.8a.9.9 0 0 1 .9.9v.9M5.1 5.55v2.75M6.9 5.55v2.75"/></svg>',
  /* an arrow whose shaft can be lengthened: the line stretches, the head keeps its size (class "arr") */
  arrow:'<span class="arr" aria-hidden="true"><i></i><svg viewBox="0 0 5.3 9.3"><path d="M.65 .65l4 4-4 4"/></svg></span>',
  chevDown:'<svg viewBox="0 0 12 8" aria-hidden="true"><path d="M1.5 1.5 6 6.5l4.5-5"/></svg>',
  walk:svg('<circle cx="8.6" cy="2.9" r="1.35" '+F+'/><path d="M8.4 5.8 7.6 9.6 5.4 13.8M7.6 9.6l3 4M5.6 8l2.8-2.2L11 7.6"/>'),
  bike:svg('<circle cx="3.7" cy="10.5" r="2.7"/><circle cx="12.3" cy="10.5" r="2.7"/><path d="M3.7 10.5 6.6 5.8h3.2l2.5 4.7M9.8 5.8 9.3 4h1.6"/>'),
  car:svg('<path d="M2.3 10.6V8.7l1.4-3.4a1 1 0 0 1 .9-.6h6.8a1 1 0 0 1 .9.6l1.4 3.4v1.9M6.4 10.6h3.2"/><circle cx="4.9" cy="10.9" r="1.5"/><circle cx="11.1" cy="10.9" r="1.5"/>'),
  train:svg('<rect x="3.8" y="2" width="8.4" height="9.4" rx="2"/><path d="M3.8 7h8.4M5.8 14l.9-2.6M10.2 14l-.9-2.6"/>'),
  boat:svg('<path d="M2 10.6h12l-1.8 3H3.8zM7.6 10.6V2.4l4.6 6H7.6"/>'),
  plane:svg('<path d="M8 2.2v11.4M8 6.2 2.6 9.8M8 6.2l5.4 3.6M6 13.6h4"/>')
};
