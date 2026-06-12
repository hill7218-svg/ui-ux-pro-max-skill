# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Antigravity Kit is an AI-powered design intelligence toolkit providing searchable databases of UI styles, color palettes, font pairings, chart types, and UX guidelines. It works as a skill/workflow for AI coding assistants (Claude Code, Windsurf, Cursor, etc.).

## Search Command

```bash
python3 src/ui-ux-pro-max/scripts/search.py "<query>" --domain <domain> [-n <max_results>]
```

**Domain search:**
- `product` - Product type recommendations (SaaS, e-commerce, portfolio)
- `style` - UI styles (glassmorphism, minimalism, brutalism) + AI prompts and CSS keywords
- `typography` - Font pairings with Google Fonts imports
- `color` - Color palettes by product type
- `landing` - Page structure and CTA strategies
- `chart` - Chart types and library recommendations
- `ux` - Best practices and anti-patterns

**Stack search:**
```bash
python3 src/ui-ux-pro-max/scripts/search.py "<query>" --stack <stack>
```
Available stacks: `html-tailwind` (default), `react`, `nextjs`, `astro`, `vue`, `nuxtjs`, `nuxt-ui`, `svelte`, `swiftui`, `react-native`, `flutter`, `shadcn`, `jetpack-compose`

## Architecture

```
src/ui-ux-pro-max/                # Source of Truth
├── data/                         # Canonical CSV databases
│   ├── products.csv, styles.csv, colors.csv, typography.csv, ...
│   └── stacks/                   # Stack-specific guidelines
├── scripts/
│   ├── search.py                 # CLI entry point
│   ├── core.py                   # BM25 + regex hybrid search engine
│   └── design_system.py          # Design system generation
└── templates/
    ├── base/                     # Base templates (skill-content.md, quick-reference.md)
    └── platforms/                # Platform configs (claude.json, cursor.json, ...)

cli/                              # CLI installer (uipro-cli on npm)
├── src/
│   ├── commands/init.ts          # Install command with template generation
│   └── utils/template.ts         # Template rendering engine
└── assets/                       # Bundled assets (~564KB)
    ├── data/                     # Copy of src/ui-ux-pro-max/data/
    ├── scripts/                  # Copy of src/ui-ux-pro-max/scripts/
    └── templates/                # Copy of src/ui-ux-pro-max/templates/

.claude/skills/ui-ux-pro-max/     # Claude Code skill (symlinks to src/)
.factory/skills/ui-ux-pro-max/   # Droid (Factory) skill (symlinks to src/)
.shared/ui-ux-pro-max/            # Symlink to src/ui-ux-pro-max/
.claude-plugin/                   # Claude Marketplace publishing
```

The search engine uses BM25 ranking combined with regex matching. Domain auto-detection is available when `--domain` is omitted.

## Sync Rules

**Source of Truth:** `src/ui-ux-pro-max/`

When modifying files:

1. **Data & Scripts** - Edit in `src/ui-ux-pro-max/`:
   - `data/*.csv` and `data/stacks/*.csv`
   - `scripts/*.py`
   - Changes automatically available via symlinks in `.claude/`, `.factory/`, `.shared/`

2. **Templates** - Edit in `src/ui-ux-pro-max/templates/`:
   - `base/skill-content.md` - Common SKILL.md content
   - `base/quick-reference.md` - Quick reference section (Claude only)
   - `platforms/*.json` - Platform-specific configs

3. **CLI Assets** - Run sync before publishing:
   ```bash
   cp -r src/ui-ux-pro-max/data/* cli/assets/data/
   cp -r src/ui-ux-pro-max/scripts/* cli/assets/scripts/
   cp -r src/ui-ux-pro-max/templates/* cli/assets/templates/
   ```

4. **Reference Folders** - No manual sync needed. The CLI generates these from templates during `uipro init`.

## Prerequisites

Python 3.x (no external dependencies required)

## Git Workflow

Never push directly to `main`. Always:

1. Create a new branch: `git checkout -b feat/...` or `fix/...`
2. Commit changes
3. Push branch: `git push -u origin <branch>`
4. Create PR: `gh pr create`

---

# ALLY LOTTE 移倉對點 APP v5

## 📦 Project Overview

**Project Type**: Warehouse Inventory Management System  
**Purpose**: Complete warehouse transfer verification & pallet receiving system  
**Target Platform**: PDA/Android WebView (390×844px)  
**Status**: Production-ready (requires Firebase + Google Sheets configuration)

### What It Does

Real-time warehouse pallet receiving system with:
- Multi-screen workflow (S0-S4): Truck setup → Pallet scanning → Verification → Closure
- **NEW v5**: Firebase photo upload + Google Sheets LOG with timestamps + QR Code SVG per pallet

---

## 🎯 Core Features

### Workflow Screens (S0-S4)
- **S0**: 開工設定 - Truck #, Aisle selection (BA-BP), Trip size
- **S1**: 掃描棧板 - Pallet scanning + **NEW**: Photos, QR codes, operation log
- **S2**: 棧板管理 - Pallet list management
- **S3**: 詳細對點 - Item-by-item verification
- **S4**: 摘要檢查 - Summary & shipment closure

### v5 New Features
1. **📷 Photo Upload** (4 slots) → Firebase Storage: `warehouse/{truck}/{timestamp}/photo_*.jpg`
2. **📋 Operation Log** → Real-time timestamp logging of all actions
3. **🔳 QR Code Generation** → SVG/PNG per pallet (JSON: truck, pallet ID, location, timestamp)
4. **☁️ Google Sheets Sync** → One-click data upload

---

## 📁 File Structure

```
ALLY_LOTTE_WAREHOUSE_v5_INTEGRATED.html        # Main app (~1200 lines)
├─ Lines 1-450: HTML Structure (5 screens)
├─ Lines 7-265: CSS Styles + NEW sections
└─ Lines 451-1011: JavaScript Logic
   ├─ Core: Pallet management, scanning, verification
   ├─ NEW L950-970: Firebase init
   ├─ NEW L975-1010: Log management
   ├─ NEW L1015-1055: Google Sheets sync
   ├─ NEW L1060-1110: Photo upload
   └─ NEW L1115-1145: QR code generation

ALLY_LOTTE_v5_INTEGRATION_GUIDE.md             # Setup guide
```

---

## 🔧 Critical Setup (Must Configure Before Use)

### 1. Firebase Configuration (Line ~950)
```javascript
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",              // Required
  projectId: "YOUR_PROJECT_ID",                 // Required
  storageBucket: "YOUR_BUCKET.appspot.com",     // Required
  appId: "YOUR_APP_ID"                          // Required
};
```
**Get from**: Firebase Console → Project Settings → Your App

### 2. Google Sheets Configuration (Line ~955)
```javascript
const GOOGLE_SHEETS_API_KEY = "YOUR_API_KEY";   // Required
const GOOGLE_SHEETS_ID = "YOUR_SHEET_ID";       // Required
```
**Sheet ID**: Extracted from URL `/d/[ID]/edit`  
**Required Columns**: 時間戳, 車號, 棧板ID, 位置, 商品數, 狀態, 操作時間

### 3. Firebase Storage Rules
```
match /warehouse/{allPaths=**} {
  allow read, write: if true;  // Dev only - add auth for production
}
```

---

## 💾 Key Data Structures

### Application State (ST)
```javascript
{
  truck: "BBB-2262",                    // Selected truck
  aisle: "BA",                          // Primary aisle (BA-BP)
  overflow: null,                       // Overflow aisle
  pallets: {
    "PA0001": {
      id, location, items{}, status, expectedQty{}
    }
  },
  closed: false
}
```

### Operation Log (operationLog[])
```javascript
{
  timestamp: "2026-06-12 10:30:45",     // Auto-generated
  action: "照片上傳" | "QR Code 生成" | "Google Sheets 同步",
  details: "索引 0",
  palletCount: 32,
  scannedItems: 156
}
```

### QR Code Content (JSON)
```json
{
  "truck": "BBB-2262",
  "pallet": "PA0001",
  "location": "BA-001-01",
  "timestamp": "2026-06-12T10:30:00Z"
}
```

---

## 🔄 Data Flow

```
User Action (Scan/Photo/Sync)
  ↓
📷 Photo → Firebase Storage (warehouse/{truck}/{timestamp}/)
📋 Log → Local operationLog[]
🔳 QR → Google Chart API (JSON → PNG)
☁️  Sync → Google Sheets API v4 (append)
```

---

## 🛠️ Common Development Tasks

### Add Feature to S1 Screen
1. Add CSS (before line 265)
2. Add HTML (in S1 section around line 360-410)
3. Add JS handler (before line 945)
4. Wire event listener
5. Call `addLog('操作名稱', 'details')` to track operation

### Generate QR Code for Pallet
```javascript
displayPalletQRCode(palletId);  // Display in panel
downloadQRCodeSVG(palletId);    // Download as PNG
```

### Upload Photo to Firebase
```javascript
triggerPhotoCapture(photoIndex);  // Opens file picker + uploads
```

### Sync Data to Google Sheets
```javascript
syncToGoogleSheets();  // Uploads all pallets + operations
```

### Debug in Console
```javascript
console.log(ST);              // View full state
console.log(operationLog);    // View all operations
syncToGoogleSheets();         // Manual sync trigger
```

---

## 🧪 Testing Checklist

Before deploying:
- [ ] Firebase config is correct (test photo upload)
- [ ] Google Sheets API key works (test sync)
- [ ] Google Sheet has correct column headers
- [ ] QR codes generate and download
- [ ] Timestamps record accurately
- [ ] All S0-S4 screens work
- [ ] Network indicator updates
- [ ] Toast notifications appear

---

## 🔐 Security Notes

### Current (Development)
- Firebase rules: `allow read, write: if true` (open)
- API keys exposed in frontend (NOT production-safe)
- No user authentication

### For Production
1. Firebase Rules: Require authentication
2. Google API: Use OAuth 2.0 + backend proxy (never expose API key)
3. Photo Storage: Set expiration policies
4. Add operator login + role-based access

---

## 📚 Key Functions Reference

| Function | Line | Purpose |
|----------|------|---------|
| `addLog(action, details)` | ~980 | Record operation with timestamp |
| `syncToGoogleSheets()` | ~1015 | Upload pallets to Google Sheet |
| `triggerPhotoCapture(index)` | ~1065 | Open file picker for photo |
| `displayPalletQRCode(palletId)` | ~1120 | Generate & show QR code |
| `downloadQRCodeSVG(palletId)` | ~1145 | Download QR code as PNG |
| `toast(message, isError)` | ~962 | Show notification |
| `goS(screenNumber)` | ~983 | Navigate between screens |

---

## 🚀 Quick Deploy

### Local Testing
```bash
python3 -m http.server 8000
# Open: http://localhost:8000/ALLY_LOTTE_WAREHOUSE_v5_INTEGRATED.html
```

### Android/PDA WebView
```java
WebView webView = findViewById(R.id.webview);
webView.getSettings().setJavaScriptEnabled(true);
webView.loadUrl("file:///android_asset/ALLY_LOTTE_WAREHOUSE_v5_INTEGRATED.html");
```

---

## ⚠️ Important Limitations

- QR codes use external Google Charts API (no offline support)
- API keys exposed in frontend (development only)
- No user authentication
- Photos stored indefinitely (no retention policy)
- No encryption for sensitive data

### Recommended for Production
- Backend API gateway for Google/Firebase calls
- User authentication + operator tracking
- Firebase Realtime Database for live sync
- Service Worker for offline mode
- Photo expiration + archival policies

---

**Version**: v5 Integrated (Firebase + Google Sheets + QR Code)  
**Last Updated**: 2026-06-12  
**Remember**: Configure Firebase and Google Sheets before first use!
