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
  into a trip. The toolbar button is its switch (`background.js`; `pat_on` in the extension's storage, remembered,
  earth-coloured icon off / blue icon on, clicks on other sites ignored via `activeTab`); the site can also switch it on,
  never off (the empty Travel Collection posts `switch-on`, then opens Google Maps). While on, `maps.js` shows a bar
  (the trip to save to; its menu lists the trips and opens the site) and, on a place's page, the site's own save card.
  Under them, always while it is on, is the trip's collection in small (0.4.5, 2026-10-10, from Chewei's picture): four
  counts in the order of the four categories and a tile per place of the lit one, with the first character of its name;
  the open place's tile stands 2px higher, a tile just added comes up from below, a row that is too long scrolls
  sideways and keeps its place across redraws. The counts carry no icon and do not hop (Chewei's choice); tiles cannot
  be pressed. The site tells the extension every place of every trip for this (`places` in the `state` message,
  `pat_places` in the extension's storage), so what is done on the site shows here only after the site has been open.
  The place is read from the page address (`/maps/place/<name>/@…/data=…!1s<fid>…!3d<lat>!4d<lng>`, checked against the
  real site on 2026-10-09). The data part is a flattened tree and can describe two places (what was searched or opened
  first, then the one that is open): `parse` in `maps.js` reads the open one by its position in the tree (group 3
  inside group 4), never "the first match". Between two places the address briefly names none; the card stays put for
  a second before it goes. The category is marked once Google's panel shows the new place (its `h1` is the name).
  `maps.js` draws everything afresh on each change, so what moves is drawn in its earlier state and then switched (the
  bar's arrow), or is a CSS animation told how far along it is (the button turning into "Added"). `site.js` hands saved places to the page and learns the trips from it; page and extension
  talk through `window.postMessage` (see "browser extension" in `js/main.js`). The trip saved to is whichever was
  chosen last, in the bar or by switching trips on the site. Submitted to the Chrome Web Store for review on 2026-10-09 (version 0.4.3; Chewei's plan is Unlisted, so only
  people with the link can install it); on 2026-10-10 Chewei decided to cancel that review and upload 0.4.5 in its place. Until it is approved it is installed by hand in developer mode. The store upload is a
  zip with `manifest.json` at the top level and no README; every later upload needs a higher version number and goes
  through review again, while the site itself updates on push as before. Once the store copy is installed, the
  hand-installed copy must be removed, or Google Maps shows two bars.
  It reads only the page being viewed, uses none of the Google quota, and is not an official Google integration.
  Chewei decided against copying Google's photos (not allowed beyond private use).
- The repository is public: never commit secrets. Browser-side keys (Geoapify, Supabase anon key) are public by
  design and must be restricted to the site's domain in their own dashboards.

## Testing

`tests/extension.py` loads the real extension into Chromium and stands in for the two sites, so the whole path
(card on Google Maps → extension storage → place in the trip) is checked offline. Run both tests before pushing.

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

Also done (2026-10-09): several trips with a trip menu; trip notes at the foot of the left panel; the Chrome extension (description and toolbar hints in English, wording by Chewei; 0.4.3 was submitted to the store on 2026-10-09; Chewei then chose to cancel that review and submit 0.4.5 instead, which has the hop of the button and the small collection under the card); the name SomeDay and the address /SomeDay/; the top panel is now called
Travel Collection in the interface (the save button reads "Add to Travel Collection", then "Added"). The words
stay "trip" for a trip (Chewei tried "plan" and went back).

On the site the same button hops too (2026-10-10): at the press the place is saved and its card appears, selected, in
the Travel Collection; the button hops meanwhile and the save card closes .6s after the press, leaving the pin and the
name (Chewei chose "shown at the press" out of four timings on a preview page). With the system's "reduce motion" there
is no hop: the card closes at once and the line at the foot says "Added to Travel Collection". The hop's numbers live in
two places, `css/app.css` and `extension/maps.js`: change both.

The sample trip new visitors see is called 富士山 ( 範例 ) (half-width brackets with spaces: Chewei's spelling, keep it).

Next, in order: Supabase with Google sign-in for accounts and cloud data → confirmation before deleting a place.
For phones Chewei is leaning towards a read-only itinerary produced from the desktop plan rather than a phone
editing layout (see the Handoff document, 延後與未決事項).
