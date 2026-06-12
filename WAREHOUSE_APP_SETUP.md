# 移倉時點驗 APP - 完整部署指南

## 📱 APP 概況

基於 PDA (Android + OCR掃描器) 的倉庫驗收應用，支持：
- ✅ 條碼掃描點驗
- ✅ 商品實時列表更新  
- ✅ 問題反饋拍照上傳
- ✅ 簽名確認
- ✅ Google Sheets 數據同步
- ✅ Firebase 照片存儲

---

## 🚀 快速開始

### 第一步：打開 HTML DEMO
```bash
# 用瀏覽器打開
open warehouse-verification-app.html
# 或在 Android/PDA 中通過 WebView 打開
```

**預設測試數據：** 10個商品 (SKU001 - SKU010)

---

## 📋 功能演示

### 1️⃣ 掃描屏幕 (Scan)
- **輸入方式**: 直接輸入條碼或商品ID (例: `SKU001`)
- **按鍵**: 按 Enter 確認
- **反饋**: 實時更新進度條、已掃/未掃商品分類

**測試流程:**
```
掃描: SKU001 → Enter
掃描: SKU002 → Enter
掃描: SKU003 → Enter
```

### 2️⃣ 驗收屏幕 (Verify)
- 顯示所有商品清單 (已驗收/未驗收)
- 進度條展示驗收率
- 點擊「下一步：標記問題」

### 3️⃣ 問題反饋 (Issues)
- 輸入有問題商品的編號
- 詳細描述問題 (數量不符、商品損壞等)
- 點擊「+ 添加問題」添加到清單

### 4️⃣ 簽名確認 (Confirm)
- **簽名**: 在簽名區域手寫簽名 (滑鼠/觸控筆均可)
- **拍照**: 點擊 📷 按鈕上傳4張照片 (可選)
- **提交**: 點擊「完成驗收並同步」

---

## 🔧 集成指南

### A. Google Sheets 集成

#### 步驟1: 建立 Google Sheet
1. 打開 [Google Sheet](https://sheets.google.com)
2. 新建表格，命名為 `移倉驗收記錄`
3. 創建列:
```
| 時間戳 | 移倉單號 | 掃描商品數 | 總商品數 | 驗收率 | 問題數 | 驗收員 | 簽名URL | 狀態 |
```

#### 步驟2: 設定 Google Apps Script
```javascript
// 在 Google Sheet 中點擊「擴充功能」→「Apps Script」
// 貼入以下代碼:

function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSheet();
  const data = JSON.parse(e.postData.contents);
  
  sheet.appendRow([
    new Date(),
    data.shipmentId,
    data.scannedCount,
    data.totalCount,
    (data.scannedCount / data.totalCount * 100).toFixed(2) + '%',
    data.issues.length,
    data.operator || '未知',
    data.signatureUrl || '',
    'completed'
  ]);
  
  return ContentService.createTextOutput(JSON.stringify({success: true}))
    .setMimeType(ContentService.MimeType.JSON);
}

// 部署為 Web 應用:
// 1. 點擊「部署」→「新的部署」
// 2. 類型選擇「Web 應用」
// 3. 執行身份: 你的帳號
// 4. 誰可以訪問: 任何人
// 5. 複製部署ID (會用到)
```

#### 步驟3: 在 HTML 中添加 Google Sheets 同步
在 `submitVerification()` 函數中添加:
```javascript
async function submitVerification() {
  // ... existing code ...
  
  // 同步到 Google Sheets
  const sheetResponse = await fetch('YOUR_GOOGLE_APPS_SCRIPT_URL', {
    method: 'POST',
    body: JSON.stringify({
      shipmentId: appData.shipmentId,
      scannedCount: appData.scanned.length,
      totalCount: appData.products.length,
      issues: appData.issues,
      operator: 'PDA_User_01',
      signatureUrl: appData.signature
    })
  });
  
  const result = await sheetResponse.json();
  if (result.success) {
    showToast('✓ 數據已同步到 Google Sheets', 'success');
  }
}
```

---

### B. Firebase 集成 (照片存儲)

#### 步驟1: 設定 Firebase 項目
1. 打開 [Firebase Console](https://console.firebase.google.com)
2. 新建項目 (或使用現有項目)
3. 啟用 **Storage** (Cloud Storage for Firebase)
4. 設定存儲規則:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /warehouse-verification/{shipmentId}/{allPaths=**} {
      allow read, write: if true; // 生產環境請改為認證用戶
    }
  }
}
```

#### 步驟2: 在 HTML 中添加 Firebase SDK
在 `<head>` 中添加:
```html
<script src="https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.5.0/firebase-storage.js"></script>

<script>
// 初始化 Firebase (複製你的配置)
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_BUCKET.appspot.com",
};

firebase.initializeApp(firebaseConfig);
const storage = firebase.storage();
</script>
```

#### 步驟3: 修改照片上傳邏輯
```javascript
async function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(e) {
    // 1. 存本地預覽
    const photoEl = document.getElementById(`photo${currentPhotoIndex}`);
    photoEl.innerHTML = `<img src="${e.target.result}" alt="照片">`;
    appData.photos[currentPhotoIndex] = e.target.result;

    // 2. 上傳到 Firebase
    try {
      const timestamp = new Date().getTime();
      const filename = `${appData.shipmentId}_photo_${currentPhotoIndex}_${timestamp}.jpg`;
      const storageRef = storage.ref(`warehouse-verification/${appData.shipmentId}/${filename}`);
      
      await storageRef.put(file);
      const url = await storageRef.getDownloadURL();
      
      appData.photos[currentPhotoIndex] = url; // 保存 Firebase URL
      showToast('✓ 照片已上傳到 Firebase', 'success');
    } catch (error) {
      showToast('❌ 照片上傳失敗: ' + error.message, 'error');
    }
  };
  reader.readAsDataURL(file);
}
```

---

## 📱 PDA/Android 部署

### 方案 A: WebView (推薦)
```java
// Android Java 代碼
WebView webView = findViewById(R.id.webview);
webView.getSettings().setJavaScriptEnabled(true);
webView.loadUrl("file:///android_asset/warehouse-verification-app.html");

// 允許外部存儲權限
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.CAMERA" />
```

### 方案 B: 服務器部署
```bash
# 將 HTML 上傳到伺服器
# 在 PDA 中打開: http://your-server.com/warehouse-verification-app.html
```

---

## 🧪 測試流程

### 完整驗收流程:
1. **掃描** 5 個商品 (SKU001-SKU005)
2. **驗證** 查看清單
3. **添加** 1-2 個問題
4. **簽名** 在簽名區域簽名
5. **拍照** 上傳 2-4 張照片
6. **提交** 完成並同步

### 預期結果:
- ✅ 進度條達到 50% (5/10)
- ✅ 已掃商品卡片變綠色
- ✅ 問題列表顯示已添加的問題
- ✅ 簽名區域有筆跡
- ✅ 照片網格顯示上傳的圖片
- ✅ 提交後顯示成功消息
- ✅ 數據同步到 Google Sheets
- ✅ 照片存儲在 Firebase

---

## 🎨 UI 設計系統

### 配色方案
- **背景色**: #0F172A (深藍)
- **卡片色**: #1A2847 (深卡其)
- **強調色**: #FFD700 (金色) / #22C55E (綠色)
- **文本色**: #F8FAFC (亮白)
- **邊框色**: #334155 (深灰)

### 字體
- **標題**: Noto Sans TC (700px)
- **正文**: Noto Sans TC (400px)
- **代碼/掃描**: JetBrains Mono (600px)

### 間距標準
- 小: 8px
- 中: 12px
- 大: 16px
- 超大: 24px

---

## 📊 數據結構

### 應用數據模型
```javascript
{
  shipmentId: "SH2024061001",      // 移倉單號
  products: [                        // 商品列表
    {
      id: "SKU001",
      name: "商品名稱",
      qty: 10,
      category: "分類"
    }
  ],
  scanned: ["SKU001", "SKU002"],    // 已掃商品ID
  issues: [                          // 問題列表
    {
      productId: "SKU001",
      description: "數量不符"
    }
  ],
  photos: [null, null, null, null], // 4張照片
  signature: "canvas_data_url"       // 簽名 Base64
}
```

### Google Sheets 欄位
```
時間戳 | 移倉單號 | 掃描數 | 總數 | 驗收率 | 問題數 | 驗收員 | 簽名URL | 狀態
```

### Firebase 存儲路徑
```
warehouse-verification/
├── SH2024061001/
│   ├── SH2024061001_photo_0_1717945200000.jpg
│   ├── SH2024061001_photo_1_1717945300000.jpg
│   └── ...
└── SH2024061002/
    └── ...
```

---

## 🔒 安全建議

1. **Google Sheets**: 部署 Apps Script 時選擇「只有你」
2. **Firebase**: 設定認證規則，只允許授權用戶上傳
3. **HTTPS**: 生產環境必須使用 HTTPS
4. **認證**: 添加簡單的員工ID認證機制

---

## 📞 故障排除

| 問題 | 解決方案 |
|------|--------|
| 條碼無法掃描 | 確保PDA掃描器設定為文字輸入模式 |
| 簽名無法保存 | 瀏覽器需支持 Canvas API |
| 照片上傳失敗 | 檢查 Firebase 存儲規則和 Internet 連接 |
| Google Sheets 未同步 | 檢查 Apps Script 部署URL和 CORS 設定 |
| UI 在小屏幕上變形 | 確保 viewport 設定正確 |

---

## 📦 文件清單

```
warehouse-verification-app.html  → 主應用 (HTML + CSS + JS)
WAREHOUSE_APP_SETUP.md           → 本指南
```

**總文件大小**: ~28KB (可直接在 PDA 中運行)

---

## 🚀 下一步

1. ✅ 在瀏覽器中打開 HTML 測試功能
2. ⬜ 設定 Google Sheets + Apps Script
3. ⬜ 設定 Firebase Storage
4. ⬜ 集成 Google Sheets 同步代碼
5. ⬜ 集成 Firebase 照片上傳
6. ⬜ 部署到 Android PDA (WebView)
7. ⬜ 現場測試 (真實掃描器 + 網絡環境)

---

## 📝 修改記錄

| 版本 | 日期 | 更新內容 |
|------|------|--------|
| 1.0 | 2026-06-12 | 初始版本 - 完整功能 HTML DEMO |

---

**Happy Verification! 🎉**
