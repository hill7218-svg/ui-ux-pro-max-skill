/**
 * ALLY LOTTE 照相驗收 v1 - Google Apps Script 後端
 *
 * 功能：
 * 1. 接收照片 + 元數據 (sourceId, timestamp)
 * 2. 上傳照片到 Google Drive 文件夾
 * 3. 記錄到 Google Sheet (時間戳, sourceId, 相片連結, 狀態)
 * 4. 提供 API 查詢棧板資訊 (根據 sourceId)
 *
 * 部署步驟：
 * 1. 複製以下程式碼到 Google Apps Script
 * 2. 設定常數：PHOTO_FOLDER_ID, LOG_SHEET_ID, PALLET_DATA_SHEET_ID
 * 3. 部署為 Web App (Execute as: 你的帳號, Who has access: Anyone)
 * 4. 複製部署 URL 貼到 photo.html 的 GAS_DEPLOY_URL
 */

// ============ 常數設定 ============
// 修改這些常數為你的 Google Drive 和 Sheet ID

// 照片儲存文件夾 ID (Google Drive folder ID)
// 格式：從 https://drive.google.com/drive/folders/[ID] 取得
const PHOTO_FOLDER_ID = 'YOUR_PHOTO_FOLDER_ID';

// 驗收記錄 Sheet ID
// 格式：從 https://docs.google.com/spreadsheets/d/[ID]/edit 取得
const LOG_SHEET_ID = 'YOUR_LOG_SHEET_ID';
const LOG_SHEET_NAME = '照相記錄';

// 棧板資訊 Sheet ID (同一個 Sheet 的不同分頁)
// 這個 Sheet 應該包含：sourceId, sku, name, qtyBox, qtyPcs, destLocation, orderId
const PALLET_DATA_SHEET_ID = 'YOUR_PALLET_DATA_SHEET_ID';
const PALLET_SHEET_NAME = '棧板資訊';

// 時區設定
const TIMEZONE = 'Asia/Taipei';

// ============ 主入口點 ============

function doGet(e) {
  try {
    const action = e.parameter.action || 'test';

    // 允許跨域 (CORS)
    const output = JSON.stringify(handleGetRequest(action, e.parameter));
    return ContentService
      .createTextOutput(output)
      .setMimeType(ContentService.MimeType.JSON)
      .setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      .setHeader('Access-Control-Allow-Headers', 'Content-Type');
  } catch (error) {
    return sendError(error.toString());
  }
}

function doPost(e) {
  try {
    const action = e.parameter.action || 'upload';
    const output = JSON.stringify(handlePostRequest(action, e));

    return ContentService
      .createTextOutput(output)
      .setMimeType(ContentService.MimeType.JSON)
      .setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      .setHeader('Access-Control-Allow-Headers', 'Content-Type');
  } catch (error) {
    return sendError(error.toString());
  }
}

function doOptions() {
  return ContentService
    .createTextOutput('')
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ============ GET 請求處理 ============

function handleGetRequest(action, params) {
  if (action === 'getPallet') {
    return getPalletInfo(params.id);
  } else if (action === 'test') {
    return {
      success: true,
      message: '✓ GAS 後端正常運作',
      timestamp: new Date().toISOString()
    };
  } else if (action === 'config') {
    return getConfig();
  }

  return { error: '未知的 action: ' + action };
}

function getPalletInfo(sourceId) {
  try {
    if (!sourceId) {
      return { error: '缺少 sourceId 參數' };
    }

    // 檢查配置
    if (!PALLET_DATA_SHEET_ID || PALLET_DATA_SHEET_ID.includes('YOUR_')) {
      return { error: '棧板資訊 Sheet 未配置' };
    }

    const sheet = SpreadsheetApp.openById(PALLET_DATA_SHEET_ID)
      .getSheetByName(PALLET_SHEET_NAME);

    if (!sheet) {
      return { error: `找不到分頁：${PALLET_SHEET_NAME}` };
    }

    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    // 找到 sourceId 欄位索引
    const sourceIdIndex = headers.indexOf('sourceId');
    if (sourceIdIndex === -1) {
      return { error: '找不到 sourceId 欄位' };
    }

    // 搜尋符合的列
    for (let i = 1; i < data.length; i++) {
      if (data[i][sourceIdIndex] == sourceId) {
        // 建構回應物件
        const row = data[i];
        return {
          sourceId: row[headers.indexOf('sourceId')] || sourceId,
          orderId: row[headers.indexOf('orderId')] || '',
          sku: row[headers.indexOf('sku')] || '',
          name: row[headers.indexOf('name')] || '',
          qtyBox: row[headers.indexOf('qtyBox')] || 0,
          qtyPcs: row[headers.indexOf('qtyPcs')] || 0,
          destLocation: row[headers.indexOf('destLocation')] || '',
          foundAt: new Date().toISOString()
        };
      }
    }

    return { error: `找不到棧板：${sourceId}` };
  } catch (error) {
    return { error: '查詢失敗：' + error.toString() };
  }
}

function getConfig() {
  return {
    photoFolderId: PHOTO_FOLDER_ID || 'NOT_SET',
    logSheetId: LOG_SHEET_ID || 'NOT_SET',
    palletDataSheetId: PALLET_DATA_SHEET_ID || 'NOT_SET',
    timezone: TIMEZONE
  };
}

// ============ POST 請求處理 ============

function handlePostRequest(action, e) {
  if (action === 'uploadPhoto') {
    return uploadPhotoHandler(e);
  } else if (action === 'testUpload') {
    return testUploadHandler(e);
  }

  return { error: '未知的 action: ' + action };
}

function uploadPhotoHandler(e) {
  try {
    // 檢查必要參數
    if (!PHOTO_FOLDER_ID || PHOTO_FOLDER_ID.includes('YOUR_')) {
      return { error: '照片文件夾未配置' };
    }

    const sourceId = e.parameter.sourceId;
    const timestamp = e.parameter.timestamp;
    const photoCount = e.parameter.photoCount || 1;

    if (!sourceId) {
      return { error: '缺少 sourceId 參數' };
    }

    // 取得上傳的照片
    const blob = e.parameter.photo;
    if (!blob) {
      return { error: '缺少照片檔案' };
    }

    // 建立檔案名稱
    const photoName = `${sourceId}_${photoCount}_${Utilities.formatDate(new Date(), TIMEZONE, 'yyyyMMdd_HHmmss')}.jpg`;

    // 上傳到 Google Drive
    const folder = DriveApp.getFolderById(PHOTO_FOLDER_ID);
    const file = folder.createFile(blob.setName(photoName));
    const fileUrl = file.getUrl();

    // 記錄到 Sheet
    logPhotoToSheet(sourceId, photoCount, timestamp, fileUrl, '成功');

    return {
      success: true,
      fileId: file.getId(),
      fileUrl: fileUrl,
      fileName: photoName,
      uploadTime: Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss'),
      message: `✅ 第 ${photoCount} 張照片已上傳`
    };
  } catch (error) {
    // 記錄錯誤
    logPhotoToSheet(
      e.parameter.sourceId || 'UNKNOWN',
      e.parameter.photoCount || 0,
      e.parameter.timestamp,
      '',
      '失敗：' + error.toString()
    );

    return { error: '上傳失敗：' + error.toString() };
  }
}

function testUploadHandler(e) {
  // 測試 upload 流程（不上傳實際檔案）
  const sourceId = e.parameter.sourceId || 'TEST-001';
  const timestamp = e.parameter.timestamp || new Date().toISOString();

  return {
    success: true,
    message: '✓ 測試上傳成功',
    sourceId: sourceId,
    timestamp: timestamp,
    note: '這是測試回應，未上傳實際檔案'
  };
}

// ============ Sheet 記錄 ============

function logPhotoToSheet(sourceId, photoCount, timestamp, fileUrl, status) {
  try {
    if (!LOG_SHEET_ID || LOG_SHEET_ID.includes('YOUR_')) {
      console.warn('[警告] LOG_SHEET_ID 未配置，跳過記錄');
      return;
    }

    const ss = SpreadsheetApp.openById(LOG_SHEET_ID);
    let sheet = ss.getSheetByName(LOG_SHEET_NAME);

    // 若分頁不存在，建立
    if (!sheet) {
      sheet = ss.insertSheet(LOG_SHEET_NAME);
      // 寫入標頭
      sheet.appendRow([
        '時間戳',
        '棧板ID (sourceId)',
        '圖片編號',
        '圖片連結',
        '狀態',
        '操作時間'
      ]);
    }

    // 新增一列記錄
    const operationTime = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
    sheet.appendRow([
      timestamp || new Date().toISOString(),
      sourceId,
      photoCount,
      fileUrl,
      status,
      operationTime
    ]);

  } catch (error) {
    console.error('[記錄錯誤]', error);
  }
}

// ============ 輔助函數 ============

function sendError(message) {
  return ContentService
    .createTextOutput(JSON.stringify({ error: message }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============ 初始設置助手 ============

function setupSheet() {
  // 這個函數幫助設置記錄 Sheet
  // 直接執行此函數即可建立必要的分頁和標頭

  if (!LOG_SHEET_ID || LOG_SHEET_ID.includes('YOUR_')) {
    return '❌ 請先設定 LOG_SHEET_ID';
  }

  try {
    const ss = SpreadsheetApp.openById(LOG_SHEET_ID);
    let sheet = ss.getSheetByName(LOG_SHEET_NAME);

    if (!sheet) {
      sheet = ss.insertSheet(LOG_SHEET_NAME);
      sheet.appendRow([
        '時間戳',
        '棧板ID (sourceId)',
        '圖片編號',
        '圖片連結',
        '狀態',
        '操作時間'
      ]);
      return `✓ 已建立 "${LOG_SHEET_NAME}" 分頁`;
    } else {
      return `✓ "${LOG_SHEET_NAME}" 分頁已存在`;
    }
  } catch (error) {
    return '❌ 設置失敗：' + error.toString();
  }
}

// ============ 測試函數 ============

function test() {
  Logger.log('=== GAS 後端測試開始 ===');

  // 測試 1: 檢查配置
  Logger.log('配置檢查:');
  Logger.log('  PHOTO_FOLDER_ID: ' + (PHOTO_FOLDER_ID || 'NOT_SET'));
  Logger.log('  LOG_SHEET_ID: ' + (LOG_SHEET_ID || 'NOT_SET'));
  Logger.log('  PALLET_DATA_SHEET_ID: ' + (PALLET_DATA_SHEET_ID || 'NOT_SET'));

  // 測試 2: 嘗試取得棧板資訊
  if (PALLET_DATA_SHEET_ID && !PALLET_DATA_SHEET_ID.includes('YOUR_')) {
    Logger.log('棧板查詢測試:');
    const result = getPalletInfo('LOTTE-20260622-001');
    Logger.log('  結果: ' + JSON.stringify(result));
  }

  // 測試 3: 嘗試設置 Sheet
  Logger.log('Sheet 設置:');
  Logger.log('  ' + setupSheet());

  Logger.log('=== 測試完成 ===');
}
