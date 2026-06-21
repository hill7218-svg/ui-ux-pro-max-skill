# ALLY × LOTTE 移倉對點系統

**版本**：v8.3（生產版）  
**日期**：2026-06-22  
**部署**：GitHub Pages + Google Apps Script + Google Drive

---

## 📁 資料夾結構

```
ALLY_LOTTE_WH/
├── APP/        ← 現行版本 APP（直接開啟使用）
├── DATA/       ← CSV/JSON 資料（棧板資訊、入庫單）
├── DOCS/       ← 說明文件、開發規格、可重用指南
├── GAS/        ← Google Apps Script 後端代碼
├── OLD/        ← v5、v6.x 舊版（封存）
└── TEST/       ← 自動化測試腳本
```

---

## 🚀 快速入口

| 用途 | 檔案 |
|------|------|
| 📷 **拍照驗收**（手機使用） | `APP/photo.html` |
| 🏷️ **列印貼紙**（v8.3 排序版） | `APP/ALLY_LOTTE_QR_PRINTER_v8.3_排序版.html` |
| 🎬 **操作示範動畫** | `APP/demo_動畫.html` |
| ✅ **掃描驗證貼紙** | `APP/check_貼紙.html` |
| 📊 **棧板資訊 CSV** | `DATA/棧板資訊_20260622.csv` |
| ☁️  **GAS 後端代碼** | `GAS/ALLY_LOTTE_GAS_照相驗收_v1.gs` |

---

## 📚 文件

| 文件 | 說明 |
|------|------|
| `DOCS/REUSABLE_GUIDES/` | 可重用開發指南（3份，供下次開發參考） |
| `DOCS/使用說明_v8.3排序版.md` | 操作手冊 |
| `DOCS/ALLY_LOTTE_GAS_完整部署清單.md` | GAS 部署步驟 |
| `DOCS/ALLY_LOTTE_v7.1_完整開發規格書.md` | 完整技術規格 |
| `DOCS/交付總結_v8.3排序版.md` | 交付清單與功能說明 |

---

## 🗂️ OLD 資料夾（封存）

v5、v6.x 舊版以及中間過渡版本，統一封存於 `OLD/`：
- v5 INTEGRATED、v6.1~v6.8、v6_UX_OPTIMIZED
- 舊版列印器（v7.0、v8.2、v8.2修訂、v8.3 非排序版）
- v5/v6 文件
- `_RELEASE_v7.0/` 發布包

---

## 🌐 GitHub Pages URL

| 頁面 | URL |
|------|-----|
| 拍照驗收 | `https://hill7218-svg.github.io/ui-ux-pro-max-skill/ALLY_LOTTE_WH/APP/photo.html` |
| 操作示範 | `https://hill7218-svg.github.io/ui-ux-pro-max-skill/ALLY_LOTTE_WH/APP/demo_動畫.html` |
| 貼紙驗證 | `https://hill7218-svg.github.io/ui-ux-pro-max-skill/ALLY_LOTTE_WH/APP/check_貼紙.html` |
