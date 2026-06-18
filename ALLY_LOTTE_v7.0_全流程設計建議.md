# ALLY × LOTTE 移倉對點系統 — v7.0 全流程設計建議書

> 版本：v7.0 規劃（顧問分析，不含程式碼修改）
> 撰寫日期：2026-06-15
> 分支：claude/amazing-edison-w83hiu
> 前提（使用者已拍板）：① 工作流改名「核查模式 / 快速模式」 ② 版本升 v7.0 ③ 本階段只做顧問分析
> 本檔為唯一允許寫入之檔案；未修改任何 .html。

---

## 0. 名詞與檔案速查

| 代號 | 實體 | 檔案 |
|------|------|------|
| 工具① 列印器 | QR 板標列印器（office） | `ALLY_LOTTE_QR_PRINTER_v7.0.html` |
| 工具② APP | 移倉對點 APP（PDA/WebView） | `ALLY_LOTTE_WAREHOUSE_v7.0.html` |
| 來源單號 | `ALLY-{YYYYMMDD}-{A|B}-{trip1-3}-{board3碼}` | 兩工具共同契約 |

**車型 A/B 與工作流 A/B 撞名**正是本次改名的根因：來源單號裡的 `A|B` 是「車型/批次」（趟 1-3=A 車、趟 4-6=B 車，見 `genSourceId` L1274），而 UI 的「工作流 A/B」是「核查 vs 快速封板」（`setWorkflow` L1120）。兩者語意不同卻共用字母，現場與程式都易誤判。

---

## 1. 全流程端到端圖（office → 鶯歌移出 → 運送 → 瑞芳收貨上架）

```
┌─ 事前 · office ───────────────────────────────────────────────┐
│ 工具① QR板標列印器                                              │
│  畫面：單頁設定區（moveDate / tripSelect / aisleSelect / 板數）  │
│  讀：Google Sheet「儲位清單」分頁 (走道A|儲位B|狀態C)            │
│       — loadLocationsList() L432，只取 status=AVAILABLE         │
│  產：generateStickers() L492 → 32 張貼紙                        │
│       每張＝ 來源單號文字 + 來源單號 QR + 建議儲位               │
│       generateSourceId() L425（與 APP genSourceId 同公式）       │
│  刷碼：無（純列印）                                              │
│  寫 Sheet：無（唯讀儲位清單）                                    │
└───────────────────────────────────────────────────────────────┘
        ↓ 紙本貼紙帶到鶯歌
┌─ 移出 · 鶯歌 ─────────────────────────────────────────────────┐
│ 工具② APP                                                      │
│  S6 開工設定：車號 + 走道(BA~BP) + 趟次(1~6) → startWork L1090   │
│  S0 主選單 → 選「核查模式 / 快速模式」(setWorkflow L1120)        │
│  S1 移倉點驗：                                                  │
│    a) 掃商品 EAN/品號 → doLookup() L1176                        │
│    b) 掃預印貼紙 QR(來源單號) → scanPalletLabel() L1291          │
│       （驗格式 /^ALLY-\d{8}-[AB]-[1-3]-\d{3}$/，新建/選取棧板）   │
│    c) 選倉別(A47…) → addItem() L1347                            │
│  封板：                                                         │
│    核查模式 → S2 棧板清單核對 → openSeal() L1484 → S3            │
│    快速模式 → bSealCurrent() L1155 直接 openSeal() → S3          │
│    S3 confirmAndSealPallet：分配儲位 assignLoc() L1453 /         │
│       L2775 pallet.loc || _pendingLoc || assignLoc()           │
│  刷碼：來源單號 QR（綁板）                                       │
│  寫 Sheet：關單 → exportWmsToSheet() L2362 寫「入庫單」         │
│       (buildWmsRows L2322，第7欄=來源單號、第19欄=虛擬倉)       │
│       syncToGoogleSheets() L2258 寫「移倉記錄」                 │
│       operationLog → 「操作記錄」                               │
└───────────────────────────────────────────────────────────────┘
        ↓ 貨車運到瑞芳
┌─ 收貨上架 · 瑞芳 ─────────────────────────────────────────────┐
│ 工具② APP — S8 卸貨驗收（L841 UI / L2135 邏輯）                 │
│  ① 刷貼紙「來源單號 QR」→ s8QueryBoard() L2139                  │
│       讀「入庫單」分頁，WHERE 第6欄(來源單號)=刷入值            │
│       → 顯示該板全部品項（品號/數量/倉別）                      │
│  ② 【v7.0 新增】刷貼紙「儲位 Code128」→ 確認上架                 │
│       比對「貼紙建議儲位 vs 實刷儲位」→ s8ConfirmReceiving()     │
│       目前 L2213 僅 toast「可上架」，無刷碼、無寫回             │
│  寫 Sheet：【v7.0 新增】回寫「入庫單/收貨狀態」分頁             │
│       （已收貨、實際上架儲位、收貨時間、收貨人）                │
└───────────────────────────────────────────────────────────────┘
```

**端到端碼流總結**：來源單號 QR 貫穿全程（綁板 + 查單）；儲位碼（v7.0 新增 Code128）只在「移出封板顯示建議」與「瑞芳上架確認」兩端被讀。

---

## 2. 雙條碼貼紙設計建議（10cm × 10cm）

### 2.1 目標
一張貼紙、兩個可掃碼，讓瑞芳「收貨 + 上架」一條龍：
- 碼 A（已有）：**來源單號 QR**（純文字，非 JSON），給 `s8QueryBoard` 查單。
- 碼 B（新增）：**配發儲位條碼**，給 v7.0 S8 上架確認。

### 2.2 儲位用 Code128（不建議 QR），理由
| 比較 | Code128 | QR |
|------|---------|----|
| 內容 | 短字串（如 `BA001-02`）一維最適 | 適合長/結構化內容，殺雞用牛刀 |
| 掃描速度 | 一維雷射/PDA 掃描器極快 | 需相機對焦 |
| 版面 | 細長條，10×10 易排在 QR 下方 | 又一個方塊，與來源 QR 視覺易混淆 |
| 誤掃風險 | 形狀與 QR 明顯不同，人眼好分辨 | 兩個 QR 並排，人會刷錯 |

> 結論：**儲位＝Code128**，與來源單號 QR 形成「一方一條」的視覺對比，降低現場刷錯碼機率。

### 2.3 10×10cm 佈局建議（沿用現有 `.sticker` 結構，L116）
```
┌─────────────────────────────┐ 100mm
│  來源單號（文字，monospace）   │ ← .sticker-id L151（保留）
│  ALLY-20260614-A-1-001       │
├─────────────────────────────┤
│        ▓▓▓ 來源QR ▓▓▓         │ ← .sticker-qr L159（保留，建議放大到 ~45mm）
│        ▓▓ (碼A) ▓▓            │
├─────────────────────────────┤
│  建議儲位（文字）  BA001-02    │ ← .sticker-loc-value L181（保留文字，供人眼/手寫備援）
│  ▌█▌██▌█▌ Code128 ▌█▌██▌     │ ← 【v7.0 新增】儲位條碼（碼B）
└─────────────────────────────┘
```
重點：
- **文字儲位「保留」**：條碼壞掃時人眼可讀、可手寫備援。現有 `sticker-loc-value`（L181）不刪，僅在其下方「加一條」Code128。
- 來源 QR 目前限制 `max-width:60px`（L164）偏小，配合雙碼建議放寬到 ~45mm 確保 H 級容錯仍可掃。
- `page-break-inside:avoid`（L124）已具備，雙碼後仍需確認單張不被分頁切斷。

### 2.4 印標器要加的 lib 與和現有 `sticker-loc-label` 的關係
- **新增 lib：JsBarcode**（CDN：`https://cdn.jsdelivr.net/npm/jsbarcode@3/dist/JsBarcode.all.min.js`），與現有 `qrcode.min.js`（L9）並存。
- 與 `sticker-loc-label`（L175「建議儲位」字樣）/ `sticker-loc-value`（L181 儲位文字）的關係：
  - `sticker-loc-label`、`sticker-loc-value`**全部保留**。
  - 在 `generateStickers()` 的 sticker `innerHTML`（L522-535）`.sticker-location` 區塊內，於 `sticker-loc-value` 之後新增一個容器 `<svg id="locbar-${i}">`。
  - 在現有 QR `setTimeout`（L539）同一迴圈內，新增 `JsBarcode('#locbar-'+i, suggestedLoc, {format:'CODE128', width:1, height:30, displayValue:false})`。
  - 當 `suggestedLoc === '—'`（未讀到儲位，L518）時**跳過** Code128 生成，避免把破折號編成條碼。

---

## 3. S8 上架刷碼流程（v7.0 新增）

### 3.1 現況
`s8ConfirmReceiving()`（L2213）只 `toast('可上架')`（L2219）後 1.5 秒重置，**不刷儲位碼、不寫回 Sheet**，帳務未真正入儲。

### 3.2 建議流程（兩段式：查單 → 上架）
```
S8 查單成功（s8QueryBoard L2139，已實作）
  ↓ 顯示 s8-result-card（L857）
【新增】出現「刷儲位條碼確認上架」輸入框
  ↓ 刷貼紙 Code128 → 得到實刷儲位值（如 BA001-02）
比對：
  expectedLoc = 貼紙建議儲位 / Sheet 入庫單「最終儲位」欄
  scannedLoc  = 刷入值
  ├─ 相符        → 綠燈，可上架
  ├─ 不相符      → 黃燈警示「貼紙建議 BA001-02，實刷 BA003-05，確認改放？」
  │                需操作員二次確認（覆寫上架儲位，記錄差異原因）
  └─ 該位被占/無效 → 紅燈，要求改刷其他空位或回報
  ↓ 確認
寫回 Sheet → 帳務入儲完成 → s8Reset()
```

### 3.3 要不要比對「貼紙建議 vs 實刷」
**建議：要比對，但採「軟驗證 + 可覆寫」**（與第 4 節 assignLoc 的「預配 + 可覆寫」哲學一致）。
- 純放行（不比對）→ 失去防呆，等於沒做。
- 硬擋（不符就拒）→ 現場儲位常被占，會卡死作業。
- 故採：**不符時警示 + 要求二次確認 + 記錄差異**，既防呆又保留現場彈性。

### 3.4 異常處理
| 情境 | 處理 |
|------|------|
| 刷錯儲位（刷到別板的位） | 比對不符 → 黃燈，提示建議位，要求確認或改刷 |
| 建議位被占 | 允許覆寫成實刷位，記錄「覆寫原因＝原位被占」 |
| 儲位條碼掃不出 | 退回手鍵入（沿用文字儲位 `sticker-loc-value` 人眼讀） |
| 來源單號查無資料 | 已有 `s8QueryBoard` L2173「找不到」分支處理 |
| 重複上架（同板掃兩次） | 寫回前查 Sheet 該板「收貨狀態」，已收→提示「此板已上架於 X」 |

### 3.5 寫回 Sheet 欄位（建議）
建議在「入庫單」分頁旁新增「收貨狀態」分頁（或於入庫單延伸欄位）：

| 欄位 | 來源 |
|------|------|
| 來源單號 | `s8_currentSourceId`（L2190） |
| 收貨時間 | `new Date().toLocaleString` |
| 收貨人 | 開工帶入或 S8 登入 |
| 建議儲位 | 入庫單最終儲位欄 |
| 實際上架儲位 | S8 刷入的 Code128 值 |
| 是否覆寫 | 建議≠實刷 時為 Y |
| 覆寫原因 | 二次確認時填 |
| 收貨狀態 | 已上架 |

---

## 4. assignLoc() 去留決策建議

### 4.1 現況盤點
- `assignLoc()`（L1453）：依 `ST.aisle` 從 `LOC_POOLS` 順序取位、破損走 `ISOLATION_LOCS`（L912 QA-HOLD）、溢出走道支援。
- 仍被呼叫兩處：`confirmAndSealPallet` L2775（`pallet.loc || ST._pendingLoc || assignLoc()`）、L1559。
- **關鍵發現**：`scanPalletLabel()`（L1317）新建棧板時 `loc:''`，且全流程**沒有任何地方把「貼紙建議儲位」寫進 `pallet.loc`**。所以 L2775 的短路目前永遠落到 `assignLoc()`——也就是說「APP 現場自己重算儲位」，**並未真正採用貼紙印的預配位**。這與架構圖第三節「①預配 + V6.9 可覆寫」的承諾有落差。

### 4.2 兩種做法取捨

**做法甲：保留 assignLoc 當 fallback（建議採此）**
- 流程：貼紙儲位優先 → 沒讀到才 `assignLoc()` 兜底。
- 落地：在 `scanPalletLabel`（L1317 新建處）把貼紙 Code128/文字儲位存進 `pallet.suggestedLoc`；封板 L2775 改為 `pallet.loc || pallet.suggestedLoc || ST._pendingLoc || assignLoc()`。
- 優點：office 預配真正生效、離線/漏掃時仍有位可分配、改動最小、向後相容。
- 缺點：兩套配位邏輯並存（貼紙序 vs APP 序）可能不一致，需靠覆寫收斂。

**做法乙：改為只讀貼紙儲位（移除自動分配）**
- 流程：一律以掃進來的儲位碼為準，APP 不再自算。
- 優點：單一事實來源（貼紙），杜絕雙序不一致。
- 缺點：貼紙沒印到位/掃不出時無兜底，現場會卡死；破損品 QA-HOLD 隔離邏輯（L1456）會失去自動化，需另開手動流程；改動大、風險高。

> **建議：採做法甲**。保留 `assignLoc` 為 fallback，新增「貼紙儲位優先」。實質效果＝架構圖承諾的「預配 + 可覆寫」，且把目前「沒用到預配」的隱性 bug 一併修掉。破損 QA-HOLD 隔離仍由 `assignLoc` 接手，不受影響。

---

## 5. 工作流改名落地點清單（A/B → 核查/快速）

> 原則：**UI 文案一定改**；**內部變數值 'A'/'B' 建議一併改為 'inspect'/'fast'**，徹底斷開與車型 A/B 的字母耦合（否則日後讀碼者仍會混淆）。改值時務必全檔一次到位，避免半套。

| # | 位置 | 現況 | 建議改為 |
|---|------|------|----------|
| 1 | L533 按鈕 `#wf-a` | 文案「A · 核查後封板」 | 「🔍 核查模式」 |
| 2 | L534 按鈕 `#wf-b` | 文案「B · 直接封板」 | 「⚡ 快速模式」 |
| 3 | L537 `#wf-desc` 初值 | 「A：掃描 → 核查(棧板清單) → 封板」 | 「核查模式：掃描 → 核查清單(S2) → 封板」 |
| 4 | L533/534 `onclick` | `setWorkflow('A'/'B')` | `setWorkflow('inspect'/'fast')` |
| 5 | `setWorkflow` L1120-1136 | 比較 `w === 'A'`、desc 文字含 A/B | 改判 `w === 'inspect'`，desc 文案改中文模式名 |
| 6 | `updateBSealBar` L1142 | `if (ST.workflow !== 'B')` | `!== 'fast'` |
| 7 | `s3Back` L1162 | `ST.workflow === 'B' ? 1 : 2` | `=== 'fast' ? 1 : 2` |
| 8 | `setWorkflow` L1135 | `addLog('切換工作流', w)` | `addLog('切換模式', w==='inspect'?'核查模式':'快速模式')` |
| 9 | 預設值初始化 | 任何 `ST.workflow='A'` 預設 | `'inspect'` |
| 10 | 全檔搜尋 | `ST.workflow`、`workflow:` 字面 | 確認無遺漏（grep `workflow`） |

**注意撞名陷阱**：改 `setWorkflow` L1125 的判斷時，勿與 `genSourceId` L1274 的車型 `'A'`/`'B'` 混改。兩者目前都用字母 `'A'`/`'B'`，正是改名後最容易誤傷之處——**車型那組（genSourceId、scanPalletLabel 的 regex `[AB]`、buildWmsRows 來源單號）一律不動**。

---

## 6. 資料契約 / 邊界風險

| # | 風險 | 說明 | 緩解建議 |
|---|------|------|----------|
| R1 | 車型 A/B vs 工作流 A/B 撞名 | 已由改名解決，但改值時可能誤傷車型字母 | 第 5 節明確隔離「車型那組不動」 |
| R2 | 板號重複 | `genSourceId` L1279 以「現有 ST.pallets 同前綴 max+1」算板號。**跨裝置**（兩台 PDA 同走道同趟）各自從 1 算 → 撞號。離線後合併也撞 | 板號應以 office 貼紙為唯一來源（掃貼紙綁板，已是 scanPalletLabel 主路徑）；`genId/genSourceId` 僅 batch L1394 還在用，建議標為「離線備援」並加裝置前綴或關閉 batch 自動建板 |
| R3 | 趟次跨車型 mod 計算 | `((trip-1)%3)+1`（L1275 / 列印器 L427）將 1-6 折成 A1-3/B1-3。若未來趟數 >6 或非 3 的倍數，公式失真；兩工具須同步改 | 把對應表（趟→車型+內趟）抽成共用常數註解，列印器與 APP 並列維護，任何一邊改都要回交叉驗證 |
| R4 | 儲位不足 | 列印器 `loadLocationsList` L476 已警示不足、留空手寫；但 APP `assignLoc` L1476「走道已無空格」只 toast，無阻擋 | S8 上架若刷到「無空格/—」應紅燈擋下；列印不足的板，現場手寫＋S8 必須刷實位回寫 |
| R5 | 離線 localStorage 衝突 | `ST`/`CLOSED_TRIPS`/`operationLog` 存 localStorage（L2128 等）。多台 PDA 或重開 APP 後狀態各自為政，覆蓋同板 | 以來源單號為主鍵做 merge，而非整包覆蓋；上傳前以 Sheet 既有資料去重（同來源單號已存在則跳過/標更新） |
| R6 | QR 純文字 vs 條碼掃描相容性 | 來源單號＝純文字 QR（非 JSON），S8 輸入框（L851）靠 Enter 觸發。新增儲位 Code128 後，**PDA 鍵盤楔型掃描器無法分辨刷的是哪種碼** | S8 設兩個獨立輸入框（查單框、上架框）並用格式判別：`^ALLY-` → 當來源單號；否則當儲位。避免把儲位刷進查單框 |
| R7 | Code128 內含特殊字元 | 若儲位含 `(溢)`（assignLoc L1473）或全形字，Code128 不一定可編 | 儲位編碼前正規化（去括號/全形），或溢出位另定純 ASCII 代碼 |
| R8 | 兩工具公式漂移 | 列印器 `generateSourceId` L425 與 APP `genSourceId` L1269 是兩份獨立實作 | 任一改動都必須跑 CROSS_VALIDATION 場景 A，視為發版前硬性關卡 |

---

## 7. 建議的 v7.0 開發切分（給開發 Agent 的施工清單，依優先序）

> 每項標注檔案與下刀位置。建議分 PR：印標器、APP 上架、改名、收尾各一支，便於交叉驗證。

**P1 — 工具① 雙條碼貼紙（印標器）** `ALLY_LOTTE_QR_PRINTER_v7.0.html`
1. `<head>` L9 旁新增 JsBarcode CDN script。
2. `generateStickers()` sticker innerHTML L522-535：在 `.sticker-location`（L530）`sticker-loc-value` 後加 `<svg id="locbar-${i}">`。
3. QR 迴圈 L539-550 內新增 `JsBarcode('#locbar-'+i, suggestedLoc, {format:'CODE128',...})`；`suggestedLoc==='—'`（L518）時跳過。
4. 微調 `.sticker-qr` L164 尺寸，確認 10×10 雙碼 + 文字不溢出、列印 `page-break-inside:avoid`（L124）正常。

**P2 — 工具② S8 上架刷碼** `ALLY_LOTTE_WAREHOUSE_v7.0.html`
5. S8 UI L857 `s8-result-card` 內，於「確認驗收+上架」按鈕（L861）前新增「刷儲位條碼」輸入框 + 比對結果列。
6. 新增 `s8ScanLocation()`：讀儲位框 → 比對 `s8` 查回的最終儲位 → 軟驗證（綠/黃/紅，見 §3.2）。
7. 改寫 `s8ConfirmReceiving()` L2213：要求先刷儲位通過才能確認；回寫「收貨狀態」分頁（§3.5 欄位）。
8. `s8QueryBoard` L2139：把 Sheet「最終儲位」欄一併讀出（目前只讀到 warehouseCol=18，需確認入庫單最終儲位欄索引）供比對。

**P3 — assignLoc 預配優先（做法甲）** `ALLY_LOTTE_WAREHOUSE_v7.0.html`
9. `scanPalletLabel()` L1317 新建棧板物件加 `suggestedLoc`（由貼紙第二碼/Sheet 帶入；現場若用掃儲位框可先留空）。
10. `confirmAndSealPallet` L2775 改 `pallet.loc || pallet.suggestedLoc || ST._pendingLoc || assignLoc()`。
11. `assignLoc` L1453 保留為 fallback，加註解「僅在無預配儲位時觸發」。

**P4 — 工作流改名** `ALLY_LOTTE_WAREHOUSE_v7.0.html`
12. 依第 5 節清單逐點改（L533/534/537 文案、L1120-1136 判斷、L1142/L1162/L1135、預設值）。
13. 全檔 grep `workflow` 與 `'A'`/`'B'` 確認車型那組（genSourceId/scanPalletLabel regex/buildWmsRows）未被誤改。

**P5 — 收尾**
14. 版本號 v6.9 → v7.0（檔名、標題 L6/L272、CHANGELOG 新增 v7.0 條目）。
15. 同步更新「系統架構圖」第六節待開發清單狀態（S8 上架、雙條碼）。

---

## 8. 建議的驗證清單（給驗證 Agent，延伸 CROSS_VALIDATION_TEST 格式）

### 8.1 雙條碼貼紙（工具①）
- [ ] 每張貼紙含「兩個可掃碼」：來源單號 QR + 儲位 Code128
- [ ] 掃來源 QR → 純文字 `ALLY-YYYYMMDD-A-1-001`（非 JSON，沿用舊契約）
- [ ] 掃儲位 Code128 → 得到建議儲位字串（如 `BA001-02`），與 `sticker-loc-value` 文字一致
- [ ] `suggestedLoc='—'`（未讀到儲位）時：不產生 Code128，文字顯示「—」可手寫
- [ ] 10×10cm 列印：兩碼 + 文字不重疊、不溢出、單張不被分頁切斷
- [ ] 儲位含特殊字元（溢出位）時 Code128 仍可編或已正規化

### 8.2 S8 上架刷碼（工具②）
- [ ] 查單成功後出現「刷儲位條碼」輸入框
- [ ] 刷對儲位（＝建議位）→ 綠燈，可確認上架
- [ ] 刷不同儲位 → 黃燈警示「建議 X / 實刷 Y」，需二次確認才放行
- [ ] 刷無效/被占儲位 → 紅燈擋下，要求改刷
- [ ] 確認上架 → 回寫 Sheet「收貨狀態」（來源單號/實際儲位/是否覆寫/時間/收貨人）
- [ ] 重複刷同板 → 提示「已上架於 X」
- [ ] 儲位框與來源單號框分離：`^ALLY-` 不會被當儲位、儲位不會被當查單

### 8.3 改名一致性（工具②）
- [ ] S0 兩按鈕顯示「核查模式 / 快速模式」，無殘留 A/B 字樣
- [ ] 核查模式：掃描 → S2 核查清單 → 封板（s3Back 回 S2）
- [ ] 快速模式：掃描 → 直接封板（s3Back 回 S1）
- [ ] addLog 記錄「核查模式/快速模式」而非 A/B
- [ ] **車型 A/B 未受影響**：來源單號仍 `ALLY-...-A-1-001`（趟 1-3=A、4-6=B）、scanPalletLabel regex `[AB]` 仍通過、入庫單第 7 欄正確

### 8.4 端到端交叉場景（延伸原場景 A/B/C）
- [ ] 場景 D（雙碼一條龍）：工具①印雙碼貼紙 → 鶯歌掃來源 QR 綁板封板 → 上傳入庫單 → 瑞芳 S8 掃來源 QR 查單 → 掃儲位 Code128 上架 → Sheet 收貨狀態正確
- [ ] 場景 E（預配生效）：貼紙建議 BA001-02 → APP 封板採用該位（非 assignLoc 重算）→ 入庫單最終儲位＝BA001-02
- [ ] 場景 F（覆寫）：建議位被占 → 鶯歌封板覆寫 / 瑞芳上架覆寫 → 兩端「最終/實際儲位」一致，差異有記錄
- [ ] 場景 G（不足兜底）：列印儲位不足留「—」→ APP `assignLoc` 兜底分配 → S8 刷實位回寫
- [ ] 回歸：板號無重複、趟次 mod 公式兩工具一致、離線 localStorage 不互覆蓋

---

**結語**：v7.0 核心＝「貼紙雙碼貫穿收貨上架」+「工作流改名去耦」。施工請嚴守一條紅線——改 UI 工作流字母時，**絕不動車型 A/B 與來源單號相關程式碼**，並以 CROSS_VALIDATION 場景 A/D/E 為發版硬關卡。
</content>
</invoke>
