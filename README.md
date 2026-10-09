# Plan a Trip

規劃旅行的工具，把想去的地方搜集起來（Travel Collection），再安排到每一天

網站：https://chewei00.github.io/Plan-a-Trip/

## 目前的狀態

- 畫面和互動照原型 v1.0.8。
- 地圖和地點搜尋是 Google 的（Maps JavaScript API、Places API）。搜尋可以用中文、日文、英文名稱，結果以繁體中文顯示。
- 路線來自 Geoapify：步行、自行車、汽車沿道路畫並顯示實際時間；電車、船、飛機畫直線、不顯示時間。
- 從搜尋存下來的地點會記住 Google 的地點編號；座標依 Google 的規定，每次開啟時把超過 25 天的重新取得一次。
- 可以建立好幾趟旅行：把滑鼠移到旅行名稱上，左邊會出現箭頭，點了可以切換、新增、刪除。
- 有一個 Chrome 外掛（`extension/`），可以在 Google 地圖網站上把地點直接存進目前的旅行。安裝方式見 `extension/README.md`。
- 資料存在各自的瀏覽器裡，還沒有登入和雲端同步。

## 檔案

| 檔案 | 內容 |
| --- | --- |
| `index.html` | 頁面骨架，載入字體和地圖元件 |
| `css/app.css` | 所有樣式，數值來自 Design System |
| `js/main.js` | 狀態、畫面、互動 |
| `js/mapview.js` | 地圖。只有這個檔案會碰到地圖元件 |
| `js/icons.js` | 所有圖示 |
| `js/google.js` | 載入 Google 地圖元件、地點搜尋。金鑰在這裡 |
| `js/geoapify.js` | 路線。只有這個檔案會呼叫 Geoapify |
| `favicon.svg`、`favicon-32.png`、`apple-touch-icon.png` | 網站圖示。SVG 是 Chewei 畫的原稿，另外兩張由它轉出（分頁用的 PNG、手機主畫面用的 180 × 180 方形） |
| `extension/` | Chrome 外掛：在 Google 地圖上把地點存進 Plan a Trip |
| `tests/` | 不需要網路的測試：`smoke.py` 測網站，`extension.py` 載入真的外掛做端到端測試 |

沒有建置步驟：檔案改了、推上 `main`，GitHub Pages 就會更新。

## 設計依據

- 樣式規範：Design System「旅行地圖」 https://claude.ai/artifact/AR8yKY8BZgEG1AsSUMd7q7
- 規格與決策紀錄：Handoff 文件 https://claude.ai/code/artifact/8d07ba15-5e95-4e30-85b0-87c979ff000e
- 原型 v1.0.8： https://claude.ai/artifact/2mZnkU57h2sTzAVuXTNPpe

## 地圖資料

地圖和地點搜尋由 Google Maps Platform 提供。路線由 [Geoapify](https://www.geoapify.com/) 提供，資料 © [OpenStreetMap](https://www.openstreetmap.org/copyright) 貢獻者。

兩把金鑰都寫在程式裡，這是瀏覽器端金鑰的正常做法；保護方式是在各自的後台限制只有這個網站的網址可以使用。
