# SomeDay (formerly Plan a Trip, briefly "Someday") — working notes for Claude

A trip planner for Chewei and friends (not a public product). **The product is called SomeDay**, with a capital D
like the logo, in everything a person reads (page title, extension name, menus, guides, the site address) since
2026-10-09. The repository is `Chewei00/SomeDay` and the site is https://chewei00.github.io/SomeDay/ (GitHub Pages
treats the name's capitals as part of the address: `/someday/` is "not found"; the extension's manifest and
`background.js` carry this address, so changing it again means a new store review). The old name stays in what a
person does not read and must not be renamed casually: the saved-data keys (`plan-a-trip:v1`, `plan-a-trip-files`),
the message names between page and extension, the element id of the card, and this working folder. The zip of the
extension is `someday-extension`. The logo is Chewei's D on a disc (2026-10-09): earth-coloured (#F1EFE9 / #8A8579) everywhere, and blue
(#CCEDF0 / #458186) only in the toolbar while the extension is on. The small sizes are Chewei's own exports from Figma:
replace them with new exports, do not scale them. Chewei is an industrial designer, not an engineer:
explain in plain words, never ask them to run commands.

## How to work with Chewei

- Reply in Traditional Chinese (繁體中文).
- **Discuss first.** For any change to how the app looks or behaves: confirm your understanding, point out what was not
  considered, give a recommendation for each open point. Only change files after Chewei says「做原型」— even for a
  one-number change. Answering questions, updating documents and setup steps they explicitly asked for are not gated.
- **The extension's name and description are Chewei's words** (what `chrome://extensions` and the store listing
  show, i.e. `name` and `description` in `extension/manifest.json`, and any store text). Propose wording and discuss
  it; do not write, reword or carry it forward on your own, even as part of another change (asked 2026-10-09).
- Start simple, add step by step, no unrequested features. Chewei's Figma mockups are the source of truth; when their
  text and mockup disagree, follow the mockup and confirm.
- After each change report four things: what changed, what differs from what was asked, what you decided yourself,
  what you could not verify.
- Never reset people's saved data. If the data shape changes, migrate it on load (see `load()` in `js/main.js`).

## References (keep them in sync when behaviour or style changes)

- Design System「旅行地圖」: https://claude.ai/artifact/AR8yKY8BZgEG1AsSUMd7q7 — colours, type, spacing, radii, components, motion.
- Handoff document: https://claude.ai/code/artifact/8d07ba15-5e95-4e30-85b0-87c979ff000e — screens, interactions, data shape, decision log, open items, the plan for going live.
- Prototype v1.0.8 (single HTML, the design reference this code was ported from): https://claude.ai/artifact/2mZnkU57h2sTzAVuXTNPpe

## The code

- Static site, **no build step and no npm**. GitHub Pages serves `main` as is at https://chewei00.github.io/SomeDay/.
  Libraries are loaded at run time: the Google Maps JavaScript API by `js/google.js` (`v=quarterly`, Google's stable
  channel — a fixed version number cannot be pinned for long), pdf.js 4.10.38 legacy build from a CDN, lazy-loaded in
  `js/main.js`. Do not add tooling without discussing it first.
- **Before every push that changes `js/` or `css/`, run `python3 tools/release.py`.** It bumps the `?v=N` tag on every
  script and stylesheet address. GitHub Pages lets browsers cache files for ten minutes; without the tag a browser can
  mix new and old files and the page breaks. A visitor may still see the previous version for up to ten minutes.
- `js/main.js` holds state (`db`, `ui`), rendering and interactions. It re-renders whole panels on every action;
  animations work by drawing the previous state and then switching classes (`syncFocus`, `syncOpen`).
- `js/mapview.js` is the only file that touches the map library (Google Maps). The app passes it plain data (markers
  as HTML, routes as coordinate lists) and asks for camera moves. Google's own camera moves cannot be given a duration,
  so the one-second glide is done there frame by frame with `moveCamera`, with its own Web-Mercator maths. Google
  reports a map click for clicks on the app's markers too, with no target; `onMark` in that file tells them apart.
- `js/google.js` loads the map library and is the only file that calls the Places API (New): suggestions while typing
  (`languageCode` zh-TW) and, when one is picked, its position (field mask `location` only, the cheapest class).
  A suggestion has no coordinates until it is picked.
- `js/geoapify.js` is the only file that calls Geoapify, now for routing only. Routes are cached in IndexedDB under
  `route:<mode>|<from>|<to>` so each leg is requested once.
- **What Google allows to be kept**: a place ID indefinitely, latitude/longitude for 30 days. A place saved from the
  search has `gid` (place ID) and `at` (when its position was fetched); `refreshPoints()` in `js/main.js` re-fetches
  positions older than 25 days when the app opens, and keeps the old position if that fails (never empty a trip).
  Places from before the switch have no `gid` and are left alone. The name is kept as the user's own label.
- Google's logo and credit line must stay visible and unaltered: `css/app.css` moves the logo to the right of the left
  panel while it is open. The routes are not Google's, so their credit (Geoapify, OpenStreetMap) is a separate line.
- Data lives in `localStorage` (`plan-a-trip:v1`) and attached files in IndexedDB (`plan-a-trip-files`). The saved
  object is `{v:2, current, trips:[{id,title,places,days,legs,memo}]}`; `db` in `js/main.js` is the trip on screen and
  `switchTrip()` points it at another. Saves from before there were several trips were one bare trip object; `load()`
  wraps it as the first trip. A place may carry `gid` (Places API ID, from the search) or `fid` (Google Maps' own
  identifier, from the extension) — neither, for places from before either existed. `memo` is the trip's own notes
  (`{open, plan:[entries]}`, the same entries a stop's `plan` holds), shown at the foot of the left panel; in the code
  they answer to the stop id `memo` (`stopOf`), which is how every note and checklist action works on them unchanged.
  Trips saved before 2026-10-09 get an empty one on load (`fixTrip`).
- `extension/` is a Chrome extension (Manifest V3, no build step) that saves the place open on the Google Maps website
  into a trip. The toolbar button is its switch (`background.js`; `pat_on` in the extension's storage, remembered; on
  from the moment it is installed, Chewei's choice of 2026-10-10, since a new icon is not on the toolbar until pinned;
  earth-coloured icon off / blue icon on, clicks on other sites ignored via `activeTab`); the site can also switch it on,
  never off (the empty Travel Collection posts `switch-on`, then opens Google Maps). While on, `maps.js` shows a bar
  (the trip to save to; its menu lists the trips and opens the site) and, on a place's page, the site's own save card.
  The bar has a second row under the trip's name (0.4.6, 2026-10-10, Chewei's drawing from Figma: the bar is 70 high,
  each count 33 x 19 with a 1px `line` border, 6 apart, 12 from the left and the foot): four counts, an icon and a
  number each, of the trip's places in the four categories. All four are the one colour (`ink`), none is lit, they do
  not hop and are not buttons. At a press the number of the category the place went into rolls: the old one goes up
  and out, the new one comes up from below, cut off by the pill's edge, .3s. Only a press rolls it. Words and numbers
  beside an icon are centred on it by their ink, not by their line (`.t` and `level()` in `maps.js`): on Google's page
  the product's font is not loaded, the computer's own Chinese font is used, and its characters sit low in a line.
  The site needs none of this: it loads its own font. (Earlier the same
  night: a panel of tiles under the card, then lit and hopping pills; both replaced.) The site tells the extension
  every place of every trip (`places` in the `state` message); `site.js` keeps only the counts (`pat_counts`), so what
  is done on the site shows here only after the site has been open.
  The place is read from the page address (`/maps/place/<name>/@…/data=…!1s<fid>…!3d<lat>!4d<lng>`, checked against the
  real site on 2026-10-09). The data part is a flattened tree and can describe two places (what was searched or opened
  first, then the one that is open): `parse` in `maps.js` reads the open one by its position in the tree (group 3
  inside group 4), never "the first match". A place is known by Google's identifier (`key` in `parse`), not by its
  position: about half a second after a place is opened Google writes the address again with the last digits of the
  position changed (seen on the real site, 2026-10-10), and a key with the position in it made the card start over,
  its category going out and coming in again (0.4.6 has this; fixed in 0.4.7). Between two places the address briefly names none; the card stays put for
  a second before it goes. The category is marked once Google's panel shows the new place (its `h1` is the name).
  `maps.js` draws everything afresh on each change, so what moves is drawn in its earlier state and then switched (the
  bar's arrow), or is a CSS animation told how far along it is (the button turning into "Added"). `site.js` hands saved places to the page and learns the trips from it; page and extension
  talk through `window.postMessage` (see "browser extension" in `js/main.js`). The trip saved to is whichever was
  chosen last, in the bar or by switching trips on the site. Submitted to the Chrome Web Store for review on 2026-10-09 (version 0.4.3; Chewei's plan is Unlisted, so only
  people with the link can install it); on 2026-10-10 Chewei cancelled that review and submitted 0.4.6 in its place (in review since then; the
  store's second screenshot still shows the bar without its counts, which Chewei is leaving as it is). Until it is approved it is installed by hand in developer mode. The store upload is a
  zip with `manifest.json` at the top level and no README; every later upload needs a higher version number and goes
  through review again, while the site itself updates on push as before. Once the store copy is installed, the
  hand-installed copy must be removed, or Google Maps shows two bars.
  It reads only the page being viewed, uses none of the Google quota, and is not an official Google integration.
  Chewei decided against copying Google's photos (not allowed beyond private use).
- **The phone page** (`m/index.html`, live at `/SomeDay/m/`, 2026-10-10) shows one trip on a phone, to read and to
  tick: the left panel's content only. `Send to phone` in the trip menu (`snapshot()`, `packTrip()`, `openSend()` in
  `js/main.js`) makes a link with the trip inside it, after the `#`: a short-named JSON (its shape is written above
  `snapshot()`; `trip()` in `m/index.html` reads it back, **the two must agree**), squeezed with the browser's own
  deflate and written in base64url (`1.` squeezed, `0.` plain where the browser cannot squeeze). No account, no
  server, nothing uploaded; the price is that the link is a copy of the trip at that moment (sending again makes a new
  link; an old link goes on showing the old trip). The box shows the link as a QR code and copies it; over 1,500
  characters the code would be too fine to read off a screen, and the box offers the link alone. The QR generator is
  the one outside file in the repository, `js/vendor/qrcode.js` (qrcode-generator 2.0.4, MIT, unchanged), loaded only
  when the box opens (Chewei agreed to it on 2026-10-10).
  A place from the search is sent by its Google place ID, **without its position** (the ID may be kept for good, the
  position only 30 days, and a link lives as long as someone keeps it); other places by their position. The arrow by
  a place opens Google Maps with Google's documented address (`/maps/search/?api=1&query=…&query_place_id=…`, or
  `query=lat,lng`): a place saved by the extension therefore opens as a pin at its position, not as the place's own
  page (its `fid` has no documented address; open to discussion). Attached files are not sent, only their names.
  The page is one file on purpose (styles, script, icons copied from `js/icons.js`), so the copy a phone keeps is
  always whole: **a changed icon or token must be changed there too**. Everything in a link comes from outside: words
  are escaped, links must be http(s), anything of the wrong shape is dropped. The phone keeps, per trip id
  (`localStorage` `someday-phone:v1`): the link's text (so the bare address shows the trip opened last), the ticks
  made there (an item is known by the place it is under, its words, and which one if the words repeat; with a newer
  link the phone's own ticks stay for items that still exist, everything else is as the desktop had it), which days
  are closed and whether the notes are open. `m/sw.js` (scope `/SomeDay/m/` only, the desktop is untouched) keeps the
  page and the fonts it used and answers from the copy first, refreshing behind: the page opens with no network, and
  **a new version of the page shows at the second opening after a push**. It has no `?v=` tag and needs none.
  Not checked on a real iPhone from here: opening with no network, "Add to Home Screen" (which keeps its own storage
  and remembers the link it was added with), and the foot of the screen under the browser's bars.
- The repository is public: never commit secrets. Browser-side keys (Geoapify, Supabase anon key) are public by
  design and must be restricted to the site's domain in their own dashboards.

## Testing

`tests/extension.py` loads the real extension into Chromium and stands in for the two sites, so the whole path
(card on Google Maps → extension storage → place in the trip) is checked offline. `tests/phone.py` makes a link with
`Send to phone` on the desktop and opens it in a phone-sized browser: what is shown, ticks, a newer link, unreadable
links, words that try to be markup, and the network switched off. It reads the QR code back from a picture when
OpenCV is there and manages to: OpenCV's reader gives up on about a third of valid codes of this size, so the test
only fails on a wrong reading, and says in its last line whether it read the code (the same codes read 40 out of 40
with the browser's own `BarcodeDetector` on the live site, 2026-10-10). Run all three tests before pushing.

The cloud sandbox has no internet, so the real map cannot load there. `tests/smoke.py` swaps the Google Maps library
for `tests/mock-googlemaps.js` (real Web-Mercator camera maths, no rendering), answers the Places and Geoapify calls
with canned data, and checks the main flows. What it cannot check — tiles, real rendering, fonts, real search
results — has to be looked at on the live site with the built-in browser. The Google key only works from
`https://chewei00.github.io/*`, so a risky change can be pushed to a `preview/` folder first, checked at
`/SomeDay/preview/`, then moved to the root (remove the folder afterwards). Google's map only draws while the
browser pane is actually visible on Chewei's screen; if `document.visibilityState` is `hidden`, ask them to keep the
window in view.

## Where things stand (2026-10-08)

Done: ported from the prototype; Google map and place search (2026-10-08, replacing MapLibre/OpenFreeMap and the
Geoapify search, which could not find Chinese names of places in Japan); routing by Geoapify (Google has no bicycle
routes in Japan).

Google Cloud account (Chewei's, project "My First Project"), set up 2026-10-08:
- Only Maps JavaScript API and Places API (New) are enabled; the key is restricted to `https://chewei00.github.io/*`
  and to those two APIs.
- It is a **free-trial billing account**: nothing can be charged, but quotas cannot be edited. The trial ends around
  **2027-01-06** (90 days) or when the US$300 credit is used; after that the map and search stop until Chewei upgrades.
- **When Chewei upgrades, set the daily caps in the same sitting** (Google Maps Platform → Quotas): Map loads per day
  300, AutocompletePlacesRequest per day 300, GetPlaceRequest per day 150, and 1 for 3D Map loads, SearchTextRequest,
  SearchNearbyRequest and GetPhotoMediaRequest per day. Then a US$1 budget alert. These keep a month under the free
  usage of each item (10,000; request only Essentials fields from Place Details).
- A one-off reminder is scheduled for 2026-12-21 to tell Chewei about the upgrade and the caps.

Also done (2026-10-09): several trips with a trip menu; trip notes at the foot of the left panel; the Chrome extension (description and toolbar hints in English, wording by Chewei; 0.4.3 was submitted to the store on 2026-10-09; Chewei cancelled that review and submitted 0.4.6 on 2026-10-10, which has the hop of the button, the four counts in the bar, and is on from install; the source is now 0.4.7, waiting for that review to pass: the one-row categories, the dark button going black under the pointer, the icons as single paths; an upload after that must be numbered higher still); the name SomeDay and the address /SomeDay/; the top panel is now called
Travel Collection in the interface (the save button reads "Add to Travel Collection", then "Added"). The words
stay "trip" for a trip (Chewei tried "plan" and went back).

On the site the same button hops too (2026-10-10): at the press the place is saved and its card appears, selected, in
the Travel Collection; the button hops meanwhile and the save card closes .6s after the press, leaving the pin and the
name (Chewei chose "shown at the press" out of four timings on a preview page). With the system's "reduce motion" there
is no hop: the card closes at once and the line at the foot says "Added to Travel Collection". The hop's numbers live in
two places, `css/app.css` and `extension/maps.js`: change both.

Menus (2026-10-10, Chewei's rules): every row has a small icon in front (`mico`, 12 x 12, one colour): a pen for
what is edited, renamed or replaced, a plus for what is added, a cross for what is taken off a thing (its link, its
file, its picture), a bin for the thing itself going, a category's own drawing, a way to move (those at 14 in the same
place). The one in force has the round tick at the right end, in every menu; there is no other tick. The words say
what they act on, without an article (`Edit checklist`, `Delete note`, `Delete day`, `Delete place`; `Add a …` keeps
its "a"; `Delete this trip` keeps "this" because the menu lists several trips).

What answers to the pointer (2026-10-10, settled on https://claude.ai/artifact/32SGdBAiHKaeudfQmTqXy5; all in
`css/app.css`). Five ways, and a new control takes one of them rather than a sixth. **A frame goes one step darker**,
to `line-strong`, the colour the search box has while it is typed in, and never to `ink` (Chewei: "only a little
darker, not suddenly very different"): the search box, a closed day's tag, an unticked box, the Day tag on the map (which
went to `ink` before). **A pale ground (`fill-note`) comes up behind** a
bare button: the left panel's collapse button, the day filter (also while its menu is open), a category that is not
the one in force, as behind "..." and the cross, and as the rows of a menu. **Words go darker**: `Add a day`, `Add a note`, `Add a checklist`, the map's
buttons; these three rows have no ground behind them (tried and turned down), and `Add a day` answers along its whole
row and 7 above and below its words, as the other two do. **An arrow that opens or closes a panel moves 2 the way it
points** while the pointer is anywhere on its button, in .45s, the time the empty Travel Collection's arrow takes to
grow: the Travel Collection's arrow up, its tab's arrow down, the notes' arrow up when they are closed and down when
open (the `translate` property, so `transform` stays free for the notes' half turn; the Travel Collection's two
arrows are one weight, 1.5, the tab's being 12 x 8 and the other 14 x 8). **A point of the map grows**
(a numbered pin 1.1, a dot 1.3). The dark button goes from `ink` to black. What is chosen already does not answer
(the open day, the category in force, a ticked box, the pin that is picked), nor do words that are edited by a
double click. Colours change in .15s; a day's tag keeps its own .25s. In the extension (0.4.7, not uploaded yet) the
categories and the dark button answer as on the site, and the menu rows as before; the trip's name in the bar gets
the pale ground behind the name and its arrow (26 high, 8 beyond them, also while its list is open), as the site's
day filter does. Its arrow does not move: it turns when the list opens, and an arrow that moved the way it points
would drift sideways while turning and then point down at a list that a press closes (Chewei chose the ground).

The categories are one control (2026-10-10, Chewei's choice on https://claude.ai/artifact/Besq6xHvDp3Q4c5YtMzssa: four
framed pills with a grey one "looked like a wireframe", a dark one was too heavy): a pale track (`fill-track`) of four
equal parts and a white piece under the one in force, which slides to it in .25s. The piece is the track's own
`::before` and goes to `--i`, the place of the one in force, which `renderTop()` sets on the track; so it is still
there when the buttons are drawn again. On the save card the same track runs the card's whole width in one row (the
four pills took two; the card is some 30 shorter), and a press there does not draw the card again (`pend-cat` changes
the classes in place), or the piece could not slide. In the Travel Collection each part is 64 wide and `snapHead()`
makes the title's width up to a whole pixel, so the piece stands on whole pixels. The track is 30 high in a 26 row
and hangs 2 over it above and below; the cards were moved down 2 so that they are still 12 under it, and the panel is
254 high, not 252 (above, the track is 14 from the panel's top where the pills were 16: Chewei left that). The extension's card has the same
one-row track from 0.4.7 on (`extension/maps.js`, in the source since 2026-10-10 and **not uploaded yet**: Chewei
uploads it once 0.4.6 has passed review). There no category is in force until Google's panel has said what kind of
place it is. Meanwhile the piece stays where it was for the place before, and then does not move at all if the
category is the same (Chewei: "steady, as if nothing changed") or slides to the new one; for that moment it lies under
the last place's category, which Chewei accepted (a press on Add then saves what the name says, and the piece goes
there). Only a card that has just come up has no piece (`.none`), and it comes in at its place. Since the card is drawn
afresh each time, the track is drawn as it was (`shownIx`) and then switched, with `--i` set from the script, not written into
the tag (a page may forbid that), and **before anything measures the page** (`level()` does): the first thing the
browser sees of a new track must be the piece where it was, or it starts from the first category every time (it did,
in the first 0.4.7 file Chewei tried; the tests now watch the piece go between two later categories).

The left panel folds up and down in .28s, the time and ease of the Travel Collection (2026-10-10). That one slides
away whole; this one keeps its title, so its foot rises instead. It is two things: `.lp-bg`, the white sheet with the
shadow, whose height goes to 62; and `.lp`, everything on it, always full height, cut off by `clip-path` along a line
that goes to 50, between the title and the search box. Nothing in it moves or is squeezed, nothing shows under the
title on the way or after (Chewei: "shut, there is nothing under it, as now"), and what is cut off cannot be pressed.
When the fold is done `applyPanels()` adds `.lcd`, which takes the parts out as before; it takes it off before
unfolding. `safeArea()` uses the number 62, not the panel's measured height, which may be on its way.

"Day 1" stands in the middle of its pill by its capitals in all three places (a day's tag, the tag on the map, the
label on a card; 2026-10-10): it was .57 low, measured on the live site, while the arrow beside it was in the middle.
The cure is the day filter's: the words are in a `span` measured by `text-box`, on screens of two or more pixels to
one; on others nothing changes (a whole pixel would overshoot). The phone page's day labels were not touched.

The left panel's collapse button is Chewei's own drawing (2026-10-10): the panel upright with its head marked off,
10 x 13, a 1.5 line, square ends, one path (`ICON.side`), the same whether the panel is open or closed. It can be
pressed 12 to either side and 9 above and below; the pale ground under the pointer is 26 x 27.

The Travel Collection has a day filter (2026-10-10; `ui.dayf`, `dayfOk()` in `js/main.js`): at the right end of its
head, a small filter mark and then the words of what is shown (`All`, `Day 2`, `Not planned`), in `ink`, with no
frame, and the same whether a filter is on or not (Chewei's drawing: "C without its outline"; settled on
https://claude.ai/artifact/HpkjDvGLstNtVeGFvTiNaT). The menu's `All` and `Day` icons are Chewei's own drawings: an
11 grid, a 1px line, every line on a whole pixel. Such icons carry the class `m11` and are shown at 11, one to one,
never scaled, with the spare pixel of the 12-wide place above them: Latin words stand a little under the middle of
their line (measured with the site's font: capitals about .4 low, words with y or p look lower still), so a drawing
half a pixel low meets them, and one half a pixel high (as it first was) looks plainly too high. That is what a
screen with one pixel to one gets. On a sharper screen (two or more of its pixels to one, Chewei's) half a pixel can
be done exactly, so there the drawing sits in the very middle of its row and the words beside it are measured by
their capitals (`text-box: trim-both cap alphabetic`), whose middle is then the row's middle whatever the word; Chewei
had seen the one screen pixel that "All" was off (measured on the live site: drawing and capitals both at 0 from the
middle). The filter mark's three lines are 8, 5 and 2 long: at 1 the shortest read as a dot. Menus are placed on
whole pixels for the same sharpness. Its menu hangs from its right end. One choice at a time; a card
shows when it is of the category AND passes the filter; nothing left is left blank, with no words. It is not saved
(All after a reload and in another trip). It gives way so a place can be seen: adding a place sets All, and picking
a place whose card it hides sets All; a deleted day sets All. Planning a card while `Not planned` is on makes it leave
the list at once, which is the point (the list empties as the trip gets planned).

The sample trip new visitors see is called 富士山 ( 範例 ) (half-width brackets with spaces: Chewei's spelling, keep it). Six of
its cards have a picture (2026-10-10): files in `img/sample/`, 264 x 184 (twice a card), chosen and cropped by Chewei
from Wikimedia Commons, all free to reuse. Chewei first used pictures found with a Google search; those were not put
in, because the site and the repository are public (only the extension is unlisted). The authors are not shown on
screen (Chewei's decision); they are listed, with sources and licences, in README.md, which is what the licences need
at the least: **keep that table in step with the files**, and put no picture into the sample whose licence does not
allow it. A sample picture is a file's address in `img`, a dropped one is data (`loadImage`); both show the same way
(the card's frame is filled, what sticks out is cut off, nothing is stretched). The sample is only made for someone
who has nothing saved, so people who already changed theirs keep what they have.

Icons are drawn in a solid colour: a half-transparent one makes crossings darker (it showed in the extension's counts
for a while, as it once did in the menu arrow). And the lines of an icon are one `<path>`, not several shapes laid over each
other (2026-10-10, seven icons merged: food, transit, file, the side-panel button, bike, car, train): where a place
draws an icon half-transparent, separate shapes go darker where they cross, one path never does. Filled dots that
touch no line may stay separate. A new icon follows the same rule. In the extension this is in the source only: it
goes out with the next upload (above 0.4.6). The four category icons are the same drawings on the site (`CATICON`
and `CATCHIP` in `js/icons.js`) and in the extension (`GLYPH` in `extension/maps.js`); Chewei has them as 12 x 12 SVG
files, which he asked for to use in his own mockups, not to redraw them.

Next, in order: Supabase with Google sign-in for accounts and cloud data → confirmation before deleting a place.
For phones Chewei chose a read-only itinerary produced from the desktop plan rather than a phone editing layout.

The phone itinerary is live (2026-10-10, see "The phone page" above): `Send to phone` in the trip menu, and the page
at `/SomeDay/m/`. Its look was settled on a preview page (https://claude.ai/artifact/7Pvae9G2PePVoC6Lr3VkDy, version 8,
which Chewei accepted: "nothing more to change") and `m/index.html` is that page: only the left panel's content; days
open at first; a day opens and closes as on the desktop (closed keeps the places' names, the rest folds away, the
category and the arrow fade, a closed day is paler while another is open; classes are switched on the elements that
are there, nothing is redrawn; the dot is level with the first line of the name, open or closed); it moves even when
the phone asks for less motion (Chewei's wish; the desktop and the extension keep their own rule); the trip's notes
are a sheet held at the foot of the screen, as on the desktop (a line and an arrow, drawn up in .45s, closed at first,
rising at most to Day 1's label, then its entries scroll); checkbox to checkbox is 16, the same as checkbox to note;
nothing is written under the itinerary; attached files are not carried (Chewei will put Google Drive links in the
checklist instead); no cloud. Smooth corners there cannot use `corner-shape` (no iPhone browser has it, Chrome on
iPhone included): the same curve (|x|^n + |y|^n = 1, n = 2^1.4, radius x 1.25) is drawn as an SVG path, behind each
note (redrawn when its size changes) and as the checkbox's own drawing. The words in the box and the menu
(`Send to phone`, `Scan with your phone’s camera, or copy the link.`, `Copy link` / `Copied`) and the phone page's
messages when there is nothing to show are Claude's proposals, shown to Chewei for change. When the cloud comes
(Supabase), the phone could follow the trip by itself instead of being sent a copy.
