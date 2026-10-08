# Plan a Trip：從 Google 地圖加入（Chrome 外掛）

在 Google 地圖網站上點開一個地點，右上角會出現一張小卡，按「存到想去的地方」就會存進 Plan a Trip 目前的旅行，不用回到 Plan a Trip 重新搜尋。

## 安裝（不用上架，一分鐘）

1. 把這個資料夾放在電腦上一個不會被刪掉的位置（外掛是直接從這個資料夾執行的）。
2. 在 Chrome 的網址列輸入 `chrome://extensions` 並按 Enter。
3. 打開右上角的「開發人員模式」。
4. 按左上角的「載入未封裝項目」，選這個資料夾。
5. 清單裡出現「Plan a Trip：從 Google 地圖加入」就完成了。

裝好後，已經開著的 Google 地圖和 Plan a Trip 分頁要各重新整理一次。

## 使用

1. 先打開一次 [Plan a Trip](https://chewei00.github.io/Plan-a-Trip/)，切到要存入的那趟旅行。
2. 打開 [Google 地圖](https://www.google.com/maps)，點一個地點（存過的或沒存過的都可以）。
3. 右上角的小卡會顯示地點名稱、猜好的分類、要存到哪一趟旅行。分類可以改。
4. 按「存到想去的地方」。按鈕變成「已儲存」。
5. 回到 Plan a Trip，地點已經在「想去的地方」裡。Plan a Trip 當時沒開也沒關係，下次打開時會出現。

## 它做了什麼、沒做什麼

- 只讀「你正在看的那個地點」的網址，裡面有名稱和座標。不會讀取你在 Google 的儲存清單，也不會使用 Plan a Trip 的 Google 額度。
- 存下來的地點先放在外掛自己的儲存空間，Plan a Trip 開啟時取走。資料不會傳到任何伺服器。
- 只在這兩個網站上執行：`www.google.com/maps`（和 `www.google.com.tw/maps`）、`chewei00.github.io/Plan-a-Trip`。

## 限制

- 只能在電腦的 Chrome（或 Edge、Brave 這類同核心的瀏覽器）使用，手機不行。
- 外掛和 Plan a Trip 要在同一台電腦的同一個瀏覽器設定檔裡。
- 這不是 Google 提供的官方功能。Google 地圖改版後，小卡可能不再出現，需要更新外掛。
- 更新外掛：用新的資料夾蓋掉舊的，到 `chrome://extensions` 按這個外掛卡片上的重新整理圖示。

## 檔案

| 檔案 | 內容 |
| --- | --- |
| `manifest.json` | 外掛的設定：名稱、在哪些網站執行 |
| `maps.js` | 在 Google 地圖上執行：讀地點、顯示小卡 |
| `site.js` | 在 Plan a Trip 上執行：把存下來的地點交給網站 |
| `icon-*.png` | 圖示 |
