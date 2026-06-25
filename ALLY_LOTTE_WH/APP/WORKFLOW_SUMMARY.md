# 🚀 完整工作流程 - v8.3 + photo.html 整合

## 📋 流程概述

```
v8.3 列印機
  ↓ 產生貼紙 + QR 條碼
  ↓ QR 指向 photo.html?id={orderId}
  ↓
用戶使用手機原生掃描 (Google Lens / 系統掃描)
  ↓ 自動開啟 photo.html
  ↓
photo.html
  ↓ 從 URL 參數讀取 orderId (?id=lotte20260626-1001)
  ↓ 自動查詢 Google Sheet「棧板資訊」分頁
  ↓ 顯示商品資訊 (品號、品名、數量、條碼)
  ↓
用戶確認商品資訊
  ↓ 進入拍照模式
  ↓
相機功能
  ✓ 硬體變焦 (track.applyConstraints API)
  ✓ 連續自動對焦 (focusMode: 'continuous')
  ✓ 拍攝預覽
  ↓
上傳 Google Drive
  ↓ 檔名格式: {orderId}_{count}_{timestamp}.jpg
  ↓ 儲存位置: 雲端儲存/ALLY_LOTTE_WH/{orderId}/
```

---

## 🏷️ v8.3 更新（新功能）

### 1️⃣ 儲位配置 - BI→BJ→BK 自動預設

**新增功能**：
- 預設模式：自動使用 BI→BJ→BK 依序配發（無需手動設定）
- 手動模式：備用選項，可自訂走道 + 編號範圍

**配置規則**：
- 每個走道（BI/BJ/BK）共 72 個儲位
- 範圍：012 ~ 244，僅保留尾數 2/3/4（跳過 0/1/5~9）
- 排序：由小到大（012 → 244）

**使用方式**：
1. 選擇「預設（BI→BJ→BK 自動配發）」（預設勾選）
2. 匯入 CSV/XLSX 資料
3. 點擊「產生貼紙」
4. 儲位自動分配完成 ✓

**範例**：
- 前 72 張 → BI012 ~ BI244
- 第 73~144 張 → BJ012 ~ BJ244
- 第 145~216 張 → BK012 ~ BK244

### 2️⃣ QR Code 規範（鎖定）

- **內容**：入庫單號（orderId）= `lotte20260626-1001`
- **格式**：`lotte + YYYYMMDD + 趟次代碼 + 3碼流水號`
- **編碼**：CODE128（ASCII only，≤30 字）
- **掃描後**：自動打開 photo.html?id=orderId

### 3️⃣ 匯出功能（保持原有）

- 入庫單 XLSX → WMS 匯入
- 棧板資訊 CSV → Google Sheet 貼紙

---

## 📱 photo.html 功能

### 啟動方式

**方式 1**：掃描 QR Code
- v8.3 貼紙掃描 → 自動開啟 photo.html

**方式 2**：手動輸入
- 選擇車輛類型（常溫/恆溫）
- 輸入 4 碼流水號
- 自動填入 orderId（如 lotte20260626-1001）

### 相機功能

✅ **硬體變焦**
- 使用設備原生硬體變焦
- 若不支援，隱藏滑桿提示用戶調整距離

✅ **連續自動對焦**
- focusMode: 'continuous' 保持焦點
- 應用硬體變焦時自動啟用

✅ **點擊對焦**（若支援）
- 長按相機預覽進行區域對焦

### 拍照流程

1. 輸入 orderId（掃描或手動）
2. 自動顯示商品資訊（來自 Google Sheet）
3. 確認無誤後進入拍照模式
4. 最多拍攝 4 張照片（含硬體變焦）
5. 每張上傳到 Google Drive

### 檔案命名

```
{orderId}_{count}_{timestamp}.jpg
```

**範例**：`lotte20260626-1001_1_2026-06-26T10:30:45Z.jpg`

---

## 🔧 設定檢查清單

### ✓ v8.3 HTML
- [x] QR Code 指向 photo.html（帶 ?id= 參數）
- [x] BI→BJ→BK 預設配置已啟用
- [x] 儲位自動分配
- [x] PHOTO_PAGE_URL 已正確設定
- [x] orderId 格式正確（≤30 字）

### ✓ photo.html
- [x] URL 參數解析 (?id=orderId)
- [x] Google Sheet 連線設定
- [x] 硬體變焦實現
- [x] 連續自動對焦
- [x] Google Drive 上傳
- [x] 檔名格式：{orderId}_{count}_{timestamp}.jpg

### ✓ Google Sheet（棧板資訊分頁）
- [x] 必要欄位：orderId, sourceId, sku, name, qtyBox, qtyPcs, trip, expDate, ean
- [x] orderId 作為主鍵查詢商品資訊

### ✓ Google Drive（權限設定）
- [x] 允許寫入 ALLY_LOTTE_WH/{orderId}/ 路徑
- [x] 檔案命名符合規範

---

## 🧪 測試步驟

### 1. 本地測試（印標籤）

```bash
# v8.3 打開本地檔案
file:///home/user/ui-ux-pro-max-skill/ALLY_LOTTE_WH/APP/ALLY_LOTTE_QR_PRINTER_v8.3_排序版.html

1. 匯入 0626_棧板資訊_v8.3匯入.csv
2. 確認「預設配置」已勾選
3. 點擊「產生貼紙」
4. 應顯示 253 張貼紙（含儲位自動配發）
5. 列印或保存 PDF
```

### 2. 手機掃描測試

```
1. 用手機掃描列印好的 QR 貼紙
2. 應自動開啟 photo.html
3. URL 應包含 ?id=lotte20260626-XXXX
4. orderId 應自動填入
```

### 3. 手動輸入測試（備用）

```
1. 直接開啟 photo.html
2. 選擇「常溫」或「恆溫」
3. 輸入「1001」
4. 按下「搜尋」
5. 應自動查詢並顯示商品資訊
```

### 4. 拍照上傳測試

```
1. 確認 Google Drive API 已啟用
2. 確認授權令牌有效
3. 拍攝 1-4 張照片
4. 點擊「上傳完成」
5. 檢查 Google Drive 是否有新檔案（命名規範）
```

---

## 📊 資料對照表

| 階段 | 檔案 | 功能 |
|------|------|------|
| **資料轉換** | convert_detail_xlsx.py | 明細 → v8.3 格式 |
| **列印貼紙** | v8.3_排序版.html | QR + 條碼 + 儲位 |
| **拍照驗收** | photo.html | 相機 + 上傳 + 自動對焦 |
| **資料記錄** | Google Sheet | 棧板資訊 + 照片 LOG |

---

## 🎯 關鍵鎖定規範

### orderId 格式（不可更改）
```
lotte + YYYYMMDD + 趟次代碼 + 3碼流水號
例：lotte20260626-1001（常溫）
例：lotte20260625aircon-1001（恆溫）
```

### 儲位配置規則（不可更改）
```
BI→BJ→BK 依序配發
每走道 72 個儲位（012-244，尾數 2/3/4 only）
無特殊需求勿更改
```

### QR Code 內容（不可更改）
```
QR = 入庫單號（orderId）only
不綁定儲位位置（destLoc）
掃描後自動開啟 photo.html?id={orderId}
```

---

## 🚀 更新日期

**v8.3 更新**：2026-06-25  
**功能**：BI→BJ→BK 預設儲位配置 + 自動分配  
**狀態**：✅ 已完成，可投入使用

---

**下一步**：用 6/26 訂單資料（253 張）進行完整端到端流程測試。
