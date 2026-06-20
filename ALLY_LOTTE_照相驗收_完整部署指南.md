# ALLY LOTTE 照相驗收 v1 - 完整部署指南

**目標工作流程**：
1. 拍照員用手機掃描貼紙上的 QR Code
2. 瀏覽器自動開啟照相驗收頁面 (HTTPS)
3. 相機自動啟動，拍照後立即上傳 Google Drive
4. 每拍一張上傳一次，無需等待全部完成
5. 操作記錄自動寫入 Google Sheet

---

## 📋 部署清單（共4步）

- [ ] **Step 1**: 設置 Google Apps Script (GAS) 後端
- [ ] **Step 2**: 配置 Google Drive 照片儲存文件夾
- [ ] **Step 3**: 部署 photo.html 到 GitHub Pages
- [ ] **Step 4**: 更新貼紙列印器 v8.3 配置
- [ ] **測試**: 完整端對端測試

---

## Step 1: 設置 Google Apps Script (GAS) 後端

### 1.1 建立 GAS 專案

1. 進入 [script.google.com](https://script.google.com)
2. 點擊「新專案」
3. 專案名稱: `ALLY_LOTTE_照相驗收_backend`

### 1.2 複製 GAS 代碼

將以下檔案的內容複製到 GAS 編輯器：
- 檔案: `ALLY_LOTTE_GAS_照相驗收_v1.gs`

**複製步驟**:
1. 開啟 `ALLY_LOTTE_GAS_照相驗收_v1.gs`（用文字編輯器或本 repo）
2. 全選 → 複製
3. 貼到 GAS 編輯器中（覆蓋預設的 Code.gs）
4. 按 `Ctrl+S` 儲存

### 1.3 配置常數（關鍵步驟）

**編輯以下常數**（在 GAS 代碼最上方）:

```javascript
// 照片儲存文件夾 ID
const PHOTO_FOLDER_ID = 'YOUR_PHOTO_FOLDER_ID';

// 驗收記錄 Sheet ID（儲存上傳日誌）
const LOG_SHEET_ID = 'YOUR_LOG_SHEET_ID';

// 棧板資訊 Sheet ID（查詢商品詳情）
const PALLET_DATA_SHEET_ID = 'YOUR_PALLET_DATA_SHEET_ID';
```

**如何取得 ID**:

#### 取得 PHOTO_FOLDER_ID
1. 在 Google Drive 中建立新文件夾：`ALLY_LOTTE_Photos_2026`
2. 打開文件夾，查看網址列
3. 從 URL 中提取 ID：
   ```
   https://drive.google.com/drive/folders/[THIS_IS_YOUR_ID]
   ```

#### 取得 LOG_SHEET_ID 和 PALLET_DATA_SHEET_ID
可以使用同一個 Google Sheet（多個分頁）:

1. 建立新 Google Sheet：`ALLY_LOTTE_照相驗收_2026`
2. 建立兩個分頁：
   - 分頁 1: `照相記錄` (for log)
   - 分頁 2: `棧板資訊` (for pallet data)
3. 取得 Sheet ID 從 URL：
   ```
   https://docs.google.com/spreadsheets/d/[THIS_IS_YOUR_ID]/edit
   ```

### 1.4 設定 Sheet 標頭（重要）

#### 分頁 1: `照相記錄`
在 A1 行放入標頭：
```
時間戳 | 棧板ID (sourceId) | 圖片編號 | 圖片連結 | 狀態 | 操作時間
```

**或自動建立**: 在 GAS 編輯器中執行 `setupSheet()` 函數
1. 選擇 `setupSheet` 函數
2. 點擊執行按鈕 ▶️
3. 等待執行完成

#### 分頁 2: `棧板資訊`
導入你現有的棧板資料 (從v8.3 列印器產生的資料)，必須包含列：
```
sourceId | orderId | sku | name | qtyBox | qtyPcs | destLocation
```

**快速導入** (來自 v8.3 貼紙資料):
1. 從 v8.3 列印器複製所有棧板資料
2. 貼到 `棧板資訊` 分頁
3. 確保欄位名稱匹配

### 1.5 部署為 Web App

1. 在 GAS 編輯器中，點擊「部署」→ 「新部署」
2. 部署類型: 選擇「Web App」
3. 新建版本: 「新建」
4. 執行身分: 選擇「你的帳號」
5. 執行者: 「擁有帳號的人」
6. **存取權**: 選擇「任何人」

   > ⚠️ 這樣 QR 掃描後任何人都能打開（無需登入）

7. 按「部署」
8. **複製部署 URL** - 形如:
   ```
   https://script.google.com/macros/d/[SCRIPT_ID]/userweb?v=1
   ```

**保存這個 URL**，下一步會用到！

---

## Step 2: 配置 Google Drive 照片儲存文件夾

### 2.1 設定文件夾權限

1. 在 Google Drive 中打開你的照片文件夾（`ALLY_LOTTE_Photos_2026`）
2. 點擊「共用」
3. 設定為「能編輯」(任何人可上傳)

   > 或限制只有授權的帳號可編輯

---

## Step 3: 部署 photo.html 到 GitHub Pages

### 3.1 準備 GitHub 倉庫

如果你還沒有 `ui-ux-pro-max-skill` 倉庫的 GitHub Pages：

1. 進入你的 GitHub 倉庫 Settings
2. 左側導覽找「Pages」
3. Build and deployment:
   - Source: 選擇「Deploy from a branch」
   - Branch: 選擇 `main` 和 `/ (root)`
4. 按「Save」

等待幾分鐘，GitHub 會生成你的 Pages URL：
```
https://[YOUR_GITHUB_USERNAME].github.io/ui-ux-pro-max-skill/
```

### 3.2 上傳 photo.html

1. **編輯 photo.html**:
   - 打開 `/photo.html`
   - 修改第 ~115 行的 GAS 部署 URL：
     ```javascript
     const GAS_DEPLOY_URL = 'https://script.google.com/macros/d/[YOUR_SCRIPT_ID]/userweb?v=1';
     ```
   - 替換為你在 Step 1.5 複製的部署 URL

2. **提交到 GitHub**:
   ```bash
   git add photo.html
   git commit -m "feat: QR-triggered photo capture with GAS backend integration"
   git push -u origin claude/amazing-edison-w83hiu
   ```

3. **建立 Pull Request** (如果需要):
   - 或直接推送到 main（如果有權限）

4. **等待 GitHub Pages 部署** (~1-2 分鐘)

### 3.3 驗證 photo.html 已部署

打開瀏覽器訪問：
```
https://[YOUR_GITHUB_USERNAME].github.io/ui-ux-pro-max-skill/photo.html
```

你應該看到：
- 📷 標題「照相驗收」
- 「無效連結：缺少 id 參數」訊息 (因為沒有帶 ?id 參數)

✅ 這表示 photo.html 已正確部署！

---

## Step 4: 更新貼紙列印器 v8.3 配置

### 4.1 修改 PHOTO_PAGE_URL

打開 `ALLY_LOTTE_QR_PRINTER_v8.3_排序版.html`

找到最上方的設定區（約第 208-213 行）:
```javascript
const PHOTO_PAGE_URL = 'https://YOUR_GITHUB_PAGES_URL/photo.html';
```

**替換為你的 GitHub Pages URL**:
```javascript
const PHOTO_PAGE_URL = 'https://[YOUR_GITHUB_USERNAME].github.io/ui-ux-pro-max-skill/photo.html';
```

例如：
```javascript
const PHOTO_PAGE_URL = 'https://hill7218-svg.github.io/ui-ux-pro-max-skill/photo.html';
```

### 4.2 提交更改

```bash
git add ALLY_LOTTE_QR_PRINTER_v8.3_排序版.html
git commit -m "feat: QR codes now link to photo capture page via GitHub Pages"
git push -u origin claude/amazing-edison-w83hiu
```

---

## ✅ 測試工作流程

### 前置準備

1. ✅ GAS 後端已部署
2. ✅ Google Sheet 已有棧板資訊（包含 sourceId）
3. ✅ photo.html 已在 GitHub Pages 上
4. ✅ v8.3 已配置正確的 PHOTO_PAGE_URL

### 測試步驟

#### 測試 1: 驗證 GAS 後端

1. 在瀏覽器打開：
   ```
   https://script.google.com/macros/d/[YOUR_SCRIPT_ID]/userweb?v=1?action=test
   ```

2. 應該看到 JSON 回應：
   ```json
   {
     "success": true,
     "message": "✓ GAS 後端正常運作",
     "timestamp": "2026-06-20T10:30:00Z"
   }
   ```

#### 測試 2: 查詢棧板資訊

1. 在瀏覽器打開：
   ```
   https://script.google.com/macros/d/[YOUR_SCRIPT_ID]/userweb?v=1?action=getPallet&id=LOTTE-20260622-001
   ```

   > 替換 `LOTTE-20260622-001` 為你 Sheet 中真實存在的 sourceId

2. 應該看到棧板詳情（JSON）:
   ```json
   {
     "sourceId": "LOTTE-20260622-001",
     "sku": "BI012",
     "name": "商品名稱",
     "qtyBox": 5,
     "qtyPcs": 50,
     "destLocation": "BA-001-01",
     "orderId": "20260622-001"
   }
   ```

#### 測試 3: 完整工作流程（手機）

**須在 HTTPS/手機上測試**（file:// 協議不支援相機）

1. 用手機打開 v8.3 貼紙列印器（或預覽一張貼紙）
2. 用手機相機掃描 QR Code
3. **應該自動打開**:
   ```
   https://[your-github-pages]/photo.html?id=LOTTE-20260622-001
   ```

4. 看到 photo.html 頁面，顯示:
   - 📷 標題
   - 棧板詳情（SKU, 商品名稱, 數量, 儲位）
   - 「拍照」按鈕

5. 點擊「拍照」→ 瀏覽器要求相機權限 → 按「允許」
6. 相機啟動，拍照 → 照片上傳
7. 看到「✅ 第 1 張照片已上傳」
8. 點擊「📋 下一板」或「✓ 完成」

#### 測試 4: 驗證 Google Drive 上傳

1. 打開 Google Drive 中的 `ALLY_LOTTE_Photos_2026` 文件夾
2. 應該看到新上傳的照片：
   ```
   LOTTE-20260622-001_1_20260620_153045.jpg
   ```

3. 打開 Google Sheet `ALLY_LOTTE_照相驗收_2026` → 分頁 `照相記錄`
4. 應該看到新記錄：

   | 時間戳 | 棧板ID | 圖片編號 | 圖片連結 | 狀態 | 操作時間 |
   |--------|--------|---------|---------|------|---------|
   | 2026-06-20T... | LOTTE-20260622-001 | 1 | https://drive.google.com/... | 成功 | 2026-06-20 15:30:45 |

✅ **如果所有測試都通過，工作流程已完全就緒！**

---

## 🔧 常見問題與排查

### 問題 1: 掃描 QR Code 後沒有打開 photo.html

**原因**: PHOTO_PAGE_URL 配置錯誤

**解決**:
1. 確認 v8.3 中的 `PHOTO_PAGE_URL` 已正確設定
2. 重新產生貼紙
3. 用手機瀏覽器直接訪問該 URL 測試

### 問題 2: photo.html 打開後相機沒啟動

**原因**: 
- 可能用 file:// 協議（需用 HTTPS）
- 瀏覽器未授予相機權限
- 裝置沒有相機

**解決**:
1. 確認通過 HTTPS 訪問（GitHub Pages）
2. 檢查瀏覽器設定允許相機存取
3. 點擊「拍照」按鈕，手動授予權限

### 問題 3: 照片上傳失敗

**原因**: 
- GAS_DEPLOY_URL 配置錯誤
- GAS 後端未部署
- Google Drive 文件夾權限不足

**解決**:
1. 驗證 photo.html 中的 `GAS_DEPLOY_URL` 正確
2. 檢查 GAS 後端是否已部署（用 ?action=test 測試）
3. 檢查 Google Drive 文件夾是否公開

### 問題 4: GAS 執行時出現 "DriveApp.getFolderById 失敗"

**原因**: PHOTO_FOLDER_ID 配置錯誤

**解決**:
1. 重新確認 PHOTO_FOLDER_ID 的值
2. 檢查 Google Drive 文件夾是否存在且可存取
3. 在 GAS 編輯器執行 `test()` 函數查看日誌

### 問題 5: 無法在 Sheet 中查到棧板資訊

**原因**: 
- `棧板資訊` 分頁欄位名稱不匹配
- sourceId 拼寫不同

**解決**:
1. 檢查 Sheet 第一行標頭是否包含：`sourceId`, `sku`, `name`, `qtyBox`, `qtyPcs`, `destLocation`
2. 確認 sourceId 拼寫與 QR Code 一致

---

## 🔐 安全建議

### 當前設定（開發用）
- GAS Web App: 「任何人」可存取（無需登入）
- Google Drive: 公開
- API 金鑰: 無（使用 GAS 原生權限）

### 生產環境建議

1. **GAS Web App 存取權**: 改為「只有指定帳號」
2. **Google Drive**: 限制只有公司 Google Workspace 帳號可存取
3. **添加簽核流程**: 照片上傳前需主管確認
4. **添加驗收狀態**: 「待驗收」→「已驗收」→「已確認」
5. **日誌審計**: 記錄操作人、時間、上傳檔案連結

---

## 📞 技術支援

如遇問題，請檢查：

1. **Browser Console** (F12):
   - 是否有 JavaScript 錯誤
   - 相機權限狀態
   - 網路請求失敗

2. **GAS Logs** (Ctrl+Enter):
   - 執行 `test()` 查看日誌
   - 檢查 PHOTO_FOLDER_ID 和 Sheet ID 配置

3. **Google Sheet**:
   - 檢查 `照相記錄` 分頁是否記錄上傳
   - 檢查錯誤訊息欄位

---

**版本**: v1.0  
**最後更新**: 2026-06-20  
**需要説明**: 詳見各函數頭部註解或聯絡技術支援
