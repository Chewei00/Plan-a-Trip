# Plan a Trip

自己和朋友用的旅行規劃工具：把想去的地方存到地圖上，排進 Day 1、Day 2，看每一天的順序和路線。

網站：https://chewei00.github.io/Plan-a-Trip/

## 目前的狀態

- 畫面和互動照原型 v1.0.8。
- 地圖是真的（MapLibre 加 OpenFreeMap）。
- 地點搜尋還是內建的範例地點；路線先畫直線，時間用直線距離估算。
- 資料存在各自的瀏覽器裡，還沒有登入和雲端同步。

## 檔案

| 檔案 | 內容 |
| --- | --- |
| `index.html` | 頁面骨架，載入字體和地圖元件 |
| `css/app.css` | 所有樣式，數值來自 Design System |
| `js/main.js` | 狀態、畫面、互動 |
| `js/mapview.js` | 地圖。只有這個檔案會碰到地圖元件 |
| `js/icons.js` | 所有圖示 |
| `js/catalog.js` | 暫時的範例搜尋清單 |
| `tests/` | 不需要網路的基本測試 |

沒有建置步驟：檔案改了、推上 `main`，GitHub Pages 就會更新。

## 設計依據

- 樣式規範：Design System「旅行地圖」 https://claude.ai/artifact/AR8yKY8BZgEG1AsSUMd7q7
- 規格與決策紀錄：Handoff 文件 https://claude.ai/code/artifact/8d07ba15-5e95-4e30-85b0-87c979ff000e
- 原型 v1.0.8： https://claude.ai/artifact/2mZnkU57h2sTzAVuXTNPpe

## 地圖資料

地圖圖磚來自 [OpenFreeMap](https://openfreemap.org/)，資料 © [OpenMapTiles](https://www.openmaptiles.org/) 與 [OpenStreetMap](https://www.openstreetmap.org/copyright) 貢獻者。
