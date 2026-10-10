# SomeDay

（原名 Plan a Trip，一度寫成 Someday。瀏覽器裡的儲存名稱和程式內部的名稱沿用舊名，沒有改；網址和程式庫名稱在 2026-10-09 改成 SomeDay。）

規劃旅行的工具，把想去的地方搜集起來（Travel Collection），再安排到每一天

網站：https://chewei00.github.io/SomeDay/

## 目前的狀態

- 畫面和互動照原型 v1.0.8。
- 地圖和地點搜尋是 Google 的（Maps JavaScript API、Places API）。搜尋可以用中文、日文、英文名稱，結果以繁體中文顯示。
- 路線來自 Geoapify：步行、自行車、汽車沿道路畫並顯示實際時間；電車、船、飛機畫直線、不顯示時間。
- 從搜尋存下來的地點會記住 Google 的地點編號；座標依 Google 的規定，每次開啟時把超過 25 天的重新取得一次。
- 可以建立好幾趟旅行：把滑鼠移到旅行名稱上，左邊會出現箭頭，點了可以切換、新增、刪除。
- 有一個 Chrome 外掛（`extension/`），可以在 Google 地圖網站上把地點直接存進目前的旅行。安裝方式見 `extension/README.md`。
- 可以把一趟旅行傳到手機：旅行選單裡的 `Send to phone` 會產生一個連結（和 QR code），手機打開就是左側欄的行程，可以看、可以打勾，開過一次之後沒有網路也能開。行程整份包在連結裡，不經過任何伺服器；電腦上改了行程要重新傳一次。
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
| `js/vendor/qrcode.js` | 畫 QR code 用的外部程式（qrcode-generator 2.0.4，MIT 授權，原樣放進來），只有打開 `Send to phone` 時才載入 |
| `m/index.html`、`m/sw.js` | 手機頁（`/SomeDay/m/`）：樣式、程式、圖示都在這一個檔案裡；`sw.js` 讓它沒有網路時也能開 |
| `img/sample/` | 範例旅行卡片上的六張圖片，來源見下方「範例旅行的圖片」 |
| `extension/` | Chrome 外掛：在 Google 地圖上把地點存進 SomeDay |
| `tests/` | 不需要網路的測試：`smoke.py` 測網站，`extension.py` 載入真的外掛做端到端測試，`phone.py` 從電腦產生連結再用手機大小的瀏覽器打開 |

沒有建置步驟：檔案改了、推上 `main`，GitHub Pages 就會更新。

## 設計依據

- 樣式規範：Design System「旅行地圖」 https://claude.ai/artifact/AR8yKY8BZgEG1AsSUMd7q7
- 規格與決策紀錄：Handoff 文件 https://claude.ai/code/artifact/8d07ba15-5e95-4e30-85b0-87c979ff000e
- 原型 v1.0.8： https://claude.ai/artifact/2mZnkU57h2sTzAVuXTNPpe

## 範例旅行的圖片

範例旅行「富士山 ( 範例 )」裡六張卡片的圖片放在 `img/sample/`，都來自維基共享資源（Wikimedia Commons）。每一張都由 Chewei 裁切並縮小成 264 × 184；裁切後的檔案沿用原圖的授權。畫面上不顯示作者，來源和授權列在這裡。

| 檔案 | 地點 | 原圖 | 作者 | 授權 |
| --- | --- | --- | --- | --- |
| `kubota.jpg` | 久保田一竹美術館 | [Itchiku Kubota Art Museum 2018c](https://commons.wikimedia.org/wiki/File:Itchiku_Kubota_Art_Museum_2018c.jpg) | 江戸村のとくぞう | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `kawaguchiko-museum.jpg` | 河口湖美術館 | [170504 Kawaguchiko Museum of Art … Japan02s3](https://commons.wikimedia.org/wiki/File:170504_Kawaguchiko_Museum_of_Art_Fujikawaguchiko_Yamanashi_pref_Japan02s3.jpg) | 663highland | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `chureito.jpg` | 新倉山淺間公園 | [Chureito Pagoda and Mount Fuji 20241022](https://commons.wikimedia.org/wiki/File:Chureito_Pagoda_and_Mount_Fuji_20241022.jpg) | Supanut Arunoprayote | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `fuji-suruga.jpg` | 富士箱根伊豆國立公園 | [Mt. Fuji from Suruga Bay in winter](https://commons.wikimedia.org/wiki/File:Mt._Fuji_from_Suruga_Bay_in_winter.jpg) | Shinichi Morita | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) |
| `iwamotoyama.jpg` | 岩本山公園 | [Mt.Iwamoto](https://commons.wikimedia.org/wiki/File:Mt.Iwamoto.jpg) | Mocchy | 公有領域 |
| `hoto.jpg` | 河口湖餺飥麵店 | [Houtou](https://commons.wikimedia.org/wiki/File:Houtou.jpg) | Jungle | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |

## 地圖資料

地圖和地點搜尋由 Google Maps Platform 提供。路線由 [Geoapify](https://www.geoapify.com/) 提供，資料 © [OpenStreetMap](https://www.openstreetmap.org/copyright) 貢獻者。

兩把金鑰都寫在程式裡，這是瀏覽器端金鑰的正常做法；保護方式是在各自的後台限制只有這個網站的網址可以使用。
