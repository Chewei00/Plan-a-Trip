# Plan a Trip：從 Google 地圖加入（Chrome 外掛）

在 Google 地圖網站上點一下工具列的圖示把它打開，之後點開任何地點，右上角就會出現一張小卡，按「Add to Travel Collection」就存進 Plan a Trip 的旅行，不用回到 Plan a Trip 重新搜尋。再點一次圖示就關掉。

## 安裝（不用上架，一分鐘）

1. 把這個資料夾放在電腦上一個不會被刪掉的位置（外掛是直接從這個資料夾執行的）。
2. 在 Chrome 的網址列輸入 `chrome://extensions` 並按 Enter。
3. 打開右上角的「開發人員模式」。
4. 按左上角的「載入未封裝項目」，選這個資料夾。
5. 清單裡出現「Plan a Trip：從 Google 地圖加入」就完成了。

裝好後，已經開著的 Google 地圖和 Plan a Trip 分頁要各重新整理一次。

## 使用

1. 打開 [Google 地圖](https://www.google.com/maps)，點一下工具列上的 P 圖示。圖示從灰色變成有顏色，右上角出現一條寫著旅行名稱的橫條，代表已開啟。
   （圖示不在工具列上的話，按工具列的拼圖圖示，把「Plan a Trip」釘選出來。）
2. 點一個地點（存過的或沒存過的都可以）。橫條下面出現小卡：地點名稱、猜好的分類、存檔按鈕。分類可以改。
3. 按「Add to Travel Collection」。按鈕變成「Added」。
4. 回到 Plan a Trip，地點已經在那趟旅行的 Travel Collection 裡。Plan a Trip 當時沒開也沒關係，下次打開時會出現。
5. 不用的時候再點一次圖示，橫條和小卡都會消失，圖示變回灰色。

橫條上的旅行名稱可以點：

- 清單列出 Plan a Trip 裡所有的旅行，選另一趟，之後存的地點就進那一趟。
- 最下面的「Open Plan a Trip」會切到 Plan a Trip 的分頁，還沒開就開一個新的。

幾個規則：

- 開或關的狀態會記住，重新整理、開新的 Google 地圖分頁、重開 Chrome 都不變。
- Plan a Trip 裡還沒有任何地點的旅行，Travel Collection 會顯示一塊空白區域。點它會開 Google 地圖，同時把外掛打開（只會開，不會關）。
- 圖示只有在 Google 地圖的分頁上點才有作用，在其他網站點了不會有反應。
- 要存到哪一趟，以最後一次選的為準：在橫條上選，或在 Plan a Trip 切換旅行，都算。
- 旅行的清單是 Plan a Trip 告訴外掛的。新增或改名之後，要開過一次 Plan a Trip，清單才會更新。

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
| `background.js` | 工具列圖示：開關、換圖示、打開 Plan a Trip |
| `maps.js` | 在 Google 地圖上執行：讀地點、顯示橫條和小卡 |
| `site.js` | 在 Plan a Trip 上執行：把存下來的地點交給網站 |
| `icon-*.png`、`icon-off-*.png` | 圖示：開啟時有顏色，關閉時灰色 |
