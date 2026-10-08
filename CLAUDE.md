# Plan a Trip — working notes for Claude

A trip planner for Chewei and friends (not a public product). Chewei is an industrial designer, not an engineer:
explain in plain words, never ask them to run commands.

## How to work with Chewei

- Reply in Traditional Chinese (繁體中文).
- **Discuss first.** For any change to how the app looks or behaves: confirm your understanding, point out what was not
  considered, give a recommendation for each open point. Only change files after Chewei says「做原型」— even for a
  one-number change. Answering questions, updating documents and setup steps they explicitly asked for are not gated.
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

- Static site, **no build step and no npm**. GitHub Pages serves `main` as is at https://chewei00.github.io/Plan-a-Trip/.
  Libraries come from a CDN with pinned versions (MapLibre GL JS 4.7.1 in `index.html`; pdf.js 4.10.38 legacy build,
  lazy-loaded in `js/main.js`). Do not add tooling without discussing it first.
- **Before every push that changes `js/` or `css/`, run `python3 tools/release.py`.** It bumps the `?v=N` tag on every
  script and stylesheet address. GitHub Pages lets browsers cache files for ten minutes; without the tag a browser can
  mix new and old files and the page breaks. A visitor may still see the previous version for up to ten minutes.
- `js/main.js` holds state (`db`, `ui`), rendering and interactions. It re-renders whole panels on every action;
  animations work by drawing the previous state and then switching classes (`syncFocus`, `syncOpen`).
- `js/mapview.js` is the only file that touches MapLibre. The app passes it plain data (markers as HTML, routes as
  coordinate lists) and asks for camera moves.
- `js/geoapify.js` is the only file that calls Geoapify (place search, routing). Search uses `lang=ja` on purpose:
  `lang=zh` returns Simplified Chinese region names, which Chewei does not want. Routes are cached in IndexedDB under
  `route:<mode>|<from>|<to>` so each leg is requested once.
- Data lives in `localStorage` (`plan-a-trip:v1`) and attached files in IndexedDB (`plan-a-trip-files`).
- The repository is public: never commit secrets. Browser-side keys (Geoapify, Supabase anon key) are public by
  design and must be restricted to the site's domain in their own dashboards.

## Testing

The cloud sandbox has no internet, so the real map cannot load there. `tests/smoke.py` swaps MapLibre for
`tests/mock-maplibre.js` (real Web-Mercator camera maths, no rendering), answers Geoapify calls with canned data, and
checks the main flows. What it cannot check — tiles, real rendering, fonts, real search results — has to be looked
at on the live site (the built-in browser can open it and call the APIs from the page).

## Where things stand (2026-10-08)

Done: ported from the prototype; real map (MapLibre + OpenFreeMap); place search and routing (Geoapify).
Known limit: search matches Japanese and English names well, Chinese translations of names often fail (OpenStreetMap
data). The fallback discussed with Chewei is switching everything to Google Maps.
Decided 2026-10-08: switch the map and place search to Google (Maps JavaScript API + Places API (New)); routing stays
on Geoapify (Google has no bicycle routing in Japan). Not built yet — waiting for Chewei's「做原型」.

Google Cloud account (Chewei's, project "My First Project"), set up 2026-10-08:
- Only Maps JavaScript API and Places API (New) are enabled; the key is restricted to `https://chewei00.github.io/*`
  and to those two APIs.
- It is a **free-trial billing account**: nothing can be charged, but quotas cannot be edited. The trial ends around
  **2027-01-06** (90 days) or when the US$300 credit is used; after that the map and search stop until Chewei upgrades.
- **When Chewei upgrades, set the daily caps in the same sitting** (Google Maps Platform → Quotas): Map loads per day
  300, AutocompletePlacesRequest per day 300, GetPlaceRequest per day 150, and 1 for 3D Map loads, SearchTextRequest,
  SearchNearbyRequest and GetPhotoMediaRequest per day. Then a US$1 budget alert. These keep a month under the free
  usage of each item (10,000; request only Essentials fields from Place Details).

Next, in order: the Google switch above → Supabase with Google sign-in for accounts and cloud data → several trips, delete confirmation, a phone layout.
