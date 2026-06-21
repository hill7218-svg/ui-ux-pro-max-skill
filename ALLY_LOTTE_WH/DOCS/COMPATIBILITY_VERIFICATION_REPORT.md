# Cross-Verification Report: ALLY_LOTTE_QR_PRINTER_v8.3 ↔ ALLY_LOTTE_點驗_v8

**Date:** 2026-06-19  
**Scope:** Data consistency and compatibility between Printer v8.3 and Photo APP v8  
**Files Analyzed:**
- `/home/user/ui-ux-pro-max-skill/ALLY_LOTTE_QR_PRINTER_v8.3.html` (Printer)
- `/home/user/ui-ux-pro-max-skill/ALLY_LOTTE_點驗_v8.html` (Photo APP)

---

## Executive Summary

**Status:** PASS with CRITICAL integration gaps ⚠️

Both systems use consistent data structures for core identifiers (sourceId, SKU, EAN) but there are significant architectural mismatches:
- **QR Code format:** ✅ COMPATIBLE (both encode sourceId as plain text)
- **Code128 barcode:** ✅ COMPATIBLE (both use sourceId for invoice/order numbers)
- **Data structure:** ✅ ALIGNED (sourceId, SKU, product names, EAN match)
- **Photo grid:** ⚠️ PARTIAL (v8 supports 32-slot grid, but metadata binding incomplete)
- **GAS backend:** ❌ NOT IMPLEMENTED (TODO comment in v8; no backend endpoint defined)

---

## 1. QR Code Format Verification

### v8.3 Printer - QR Code Generation
**File:** `/home/user/ui-ux-pro-max-skill/ALLY_LOTTE_QR_PRINTER_v8.3.html`, Line 313

```javascript
try { 
  new QRCode(document.getElementById('qr-'+p.no), {
    text: p.sourceId,  // Plain sourceId string
    width: 142,
    height: 142,
    correctLevel: QRCode.CorrectLevel.M
  }); 
} catch(e){}
```

**QR Payload:** Plain text string containing `sourceId`  
**Example:** `LOTTE-20260622-Air_con622_1-001`

### v8 APP - QR Code Scanning
**File:** `/home/user/ui-ux-pro-max-skill/ALLY_LOTTE_點驗_v8.html`, Lines 100, 206-221

```javascript
// Input field for pallet QR code (sourced from printer sticker)
<input id="srcInput" class="inp" placeholder="刷入庫單條碼…">

// Scan handler
function onScanSrc(){
  var src = $('srcInput').value.trim();
  var p = SOURCE_INDEX[src];  // Direct lookup by sourceId
  if(!p){ 
    setDisp('s1-check','err','❌ 查無此入庫單號：'+src); 
    return; 
  }
}
```

**Resolution:** `SOURCE_INDEX[sourceId]` → Pallet object  
**Compatibility:** ✅ **PASS**

**Finding:**
- v8.3 generates QR codes containing plain `sourceId` (no JSON wrapper)
- v8 APP expects to scan and lookup by `sourceId` using `SOURCE_INDEX` hash
- **Status:** FULLY COMPATIBLE - Both use sourceId as primary identifier

---

## 2. Barcode (Code128) Compatibility

### v8.3 Printer - Code128 Generation
**File:** `/home/user/ui-ux-pro-max-skill/ALLY_LOTTE_QR_PRINTER_v8.3.html`, Line 311

```javascript
try{
  JsBarcode('#ob-'+p.no, p.sourceId, {
    format:'CODE128',
    width:1.6,
    height:42.5,
    displayValue:false,
    margin:0
  });
} catch(e){}
```

**Barcode Content:** `sourceId` string  
**Example Encoding:** `LOTTE-20260622-Air_con622_1-001`

### v8 APP - Barcode Scanning
**File:** `/home/user/ui-ux-pro-max-skill/ALLY_LOTTE_點驗_v8.html`, Line 100

```html
<input id="srcInput" class="inp" placeholder="刷入庫單條碼…">
```

The same input field receives both:
1. QR Code scan (decoded sourceId)
2. Code128 barcode scan (raw sourceId)

**Compatibility:** ✅ **PASS**

**Finding:**
- Both systems use sourceId for Code128 encoding
- Invoice number format: `20260622-001` (orderId in printer data)
- v8 APP treats both QR and Code128 identically: as sourceId lookup key
- No format validation issues detected

---

## 3. Data Structure Alignment

### Printer Data Schema (v8.3)
**File:** `/home/user/ui-ux-pro-max-skill/ALLY_LOTTE_QR_PRINTER_v8.3.html`, Line 146

```json
{
  "no": 1,
  "orderId": "20260622-001",
  "sourceId": "LOTTE-20260622-Air_con622_1-001",
  "sku": "BK9275",
  "name": "LOTTE Pepero 杏仁巧克力口味餅乾棒32g",
  "qtyBox": 80,
  "qtyPcs": 3200,
  "srcLoc": "C05A0194-0",
  "destLoc": "",
  "trip": "Air-con6/22-1",
  "expDate": "2027/03/20",
  "ean": "28801062478907"
}
```

### APP Data Schema (v8)
**File:** `/home/user/ui-ux-pro-max-skill/ALLY_LOTTE_點驗_v8.html`, Line 138

```json
{
  "sku": "BK9275",
  "name": "LOTTE Pepero 杏仁巧克力口味餅乾棒32g",
  "qtyBox": 80,
  "qtyPcs": 3200,
  "loc": "C05A0194-0",
  "sourceId": "LOTTE-20260622-Air_con622_1-001",
  "expDate": "2027/03/20"
}
```

### Field Mapping Analysis

| Field | Printer (v8.3) | APP (v8) | Format | Status |
|-------|---|---|---|---|
| **sourceId** | ✅ Present | ✅ Present | `LOTTE-YYYYMMDD-{trip}-{###}` | ✅ **MATCH** |
| **SKU** | ✅ `sku` | ✅ `sku` | `BK9275` | ✅ **MATCH** |
| **Product Name** | ✅ `name` | ✅ `name` | Full product string | ✅ **MATCH** |
| **Quantity (boxes)** | ✅ `qtyBox` | ✅ `qtyBox` | Integer | ✅ **MATCH** |
| **Quantity (pieces)** | ✅ `qtyPcs` | ✅ `qtyPcs` | Integer | ✅ **MATCH** |
| **Storage Location** | ✅ `srcLoc` (source) | ✅ `loc` (dest) | `C05A0194-0` | ⚠️ **DIFFERENT USE** |
| **Destination Location** | ✅ `destLoc` (empty) | ❌ Not present | — | ⚠️ **GAP** |
| **EAN (International)** | ✅ `ean` | ❌ Not stored | `28801062478907` | ❌ **MISSING** |
| **Expiration Date** | ✅ `expDate` | ✅ `expDate` | `YYYY/MM/DD` | ✅ **MATCH** |
| **orderId** | ✅ `orderId` | ❌ Not stored | `20260622-001` | ⚠️ **MISSING** |
| **Trip** | ✅ `trip` | ❌ Not stored | `Air-con6/22-1` | ⚠️ **MISSING** |

**Critical Findings:**

1. **SKU and Product Name:** ✅ FULLY COMPATIBLE
   - Both use identical SKU values (e.g., `BK9275`)
   - Product names match exactly between systems
   - No data loss or mismatch

2. **Quantity Fields:** ✅ FULLY COMPATIBLE
   - `qtyBox` and `qtyPcs` present and consistent in both
   - No type mismatches or format differences

3. **EAN (International Barcode):** ❌ DATA LOSS
   - **Problem:** Printer generates and stores EAN codes (`ean` field)
   - **Problem:** v8 APP does NOT store or reference EAN values
   - **Impact:** No way to validate scanned items against international barcode numbers
   - **Recommendation:** Add `ean` field to v8 APP's PALLETS_6_22 data structure

4. **Storage Location:** ⚠️ SEMANTIC DIFFERENCE
   - **Printer:** Tracks both source (`srcLoc`) and destination (`destLoc`) locations
   - **APP:** Uses single `loc` field (represents pre-printed pallet location)
   - **Impact:** v8 APP cannot record final destination/aisle assignment
   - **Recommendation:** Extend v8 APP to support `destLoc` field for placement confirmation

5. **orderId & Trip:** ⚠️ METADATA LOSS
   - **Printer:** Stores `orderId` (format: `20260622-001`) and `trip` identifier
   - **APP:** Only uses `sourceId` for all lookups
   - **Impact:** Trip-level reporting and order tracing not available in v8 APP
   - **Recommendation:** Include `orderId` and `trip` in APP data for audit trails

---

## 4. Photo Grid Integrity

### v8 APP Photo Grid Layout
**File:** `/home/user/ui-ux-pro-max-skill/ALLY_LOTTE_點驗_v8.html`, Lines 55-60, 125-126, 276-293

```javascript
// 4-column grid, 32 slots total (8 rows x 4 columns)
.pgrid { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; }

// Grid rendering
for(let i=0; i<32; i++){
  var s=document.createElement('div'); 
  s.className='pslot';
  if(ST.photos[i]){ 
    s.classList.add('filled'); 
    s.style.backgroundImage='url('+ST.photos[i]+')';
    s.innerHTML='<span class="num">板'+(i+1)+'</span><span class="chk">✓</span>'; 
  }
  g.appendChild(s);
}

// Photo capture (FileReader → base64)
inp.onchange=function(e){ 
  var f=e.target.files[0]; 
  var r=new FileReader(); 
  r.onload=function(ev){ 
    ST.photos[i] = ev.target.result;  // base64 data URL
    buildGrid(); 
    toast('✓ 板 '+(i+1)+' 已拍照'); 
  }; 
  r.readAsDataURL(f); 
};
```

### Photo Metadata Structure
**Current State (v8):** `ST.photos = []` (array of 32 base64 data URLs)

```javascript
ST.photos = [
  "data:image/jpeg;base64,/9j/4AAQSkZJRg...",  // Photo 1
  "data:image/jpeg;base64,/9j/4AAQSkZJRg...",  // Photo 2
  null,                                          // Photo 3 (empty slot)
  // ... up to 32 slots
]
```

### v8.3 Printer Sticker Physical Layout
**Sticker Dimensions:** 125mm x 125mm per pallet  
**Grid Coordinate System:** Not explicitly defined in v8.3  
**Binding Missing:** No coordination between printer's physical sticker layout and APP's 32-grid

### Findings

**Status:** ⚠️ PARTIAL COMPATIBILITY

1. **Grid Capacity:** ✅ ALIGNED
   - v8 APP supports 32-slot photo grid (matches 32 pallet expectation per shipment)
   - Photo numbering: slots 1-32 correspond to pallet indices 1-32

2. **Photo Storage:** ✅ IMPLEMENTED
   - Photos stored as base64 data URLs in memory (`ST.photos[]`)
   - FileReader API used for capture
   - Grid UI displays thumbnails with "板N" labels and checkmarks

3. **Metadata Binding:** ❌ INCOMPLETE
   - **Problem:** Photos are indexed by slot number (1-32) only
   - **Problem:** No binding to `sourceId` or pallet identity
   - **Problem:** No timestamp, operator info, or location context attached
   - **Impact:** Photo grid cannot be linked back to specific pallets when data is transmitted
   - **Recommendation:** Extend `ST.photos` structure:
     ```javascript
     ST.photos = [
       { index: 1, sourceId: "LOTTE-20260622-Air_con622_1-001", data: "base64...", ts: "2026-06-19 10:30:45" },
       // ... per pallet metadata
     ]
     ```

4. **Sticker Physical Alignment:** ⚠️ NOT DEFINED
   - v8.3 Printer generates 125mm x 125mm stickers
   - Sticker placement/numbering not coordinated with APP's grid
   - No guidance for users on which photo corresponds to which physical sticker position
   - **Recommendation:** Define sticker placement map (e.g., sticker position = photo slot)

---

## 5. Binding Table Dependency

### v8 APP Lookup Index
**File:** `/home/user/ui-ux-pro-max-skill/ALLY_LOTTE_點驗_v8.html`, Lines 147-153

```javascript
var SOURCE_INDEX = {};  // sourceId -> pallet
var SKU_REMAIN = {};    // sku -> remaining qty
var ALL_PALLETS = [];

Object.keys(PALLETS_6_22).forEach(function(trip){
  PALLETS_6_22[trip].forEach(function(p){
    p.trip = trip;
    SOURCE_INDEX[p.sourceId] = p;  // Primary lookup key
    // ... SKU_REMAIN calculation
  });
});
```

### Lookup Flow
1. **User scans QR code or Code128 barcode** → sourceId string
2. **APP queries `SOURCE_INDEX[sourceId]`** → Pallet object `p`
3. **Pallet object contains:** `{ sku, name, qtyBox, qtyPcs, loc, sourceId, expDate }`

### Cross-System Verification
**sourceId Consistency:**
- Printer generates: `LOTTE-20260622-Air_con622_1-001`
- v8 Data contains: `"sourceId": "LOTTE-20260622-Air_con622_1-001"`
- ✅ **MATCH**

**destLocation Mapping (Incomplete):**
- Printer field: `destLoc` (empty string `""` for Air-con units)
- APP field: `loc` (represents source/pre-printed location, e.g., `"C05A0194-0"`)
- **Issue:** No bidirectional mapping for destination aisle assignments
- **Recommendation:** Implement lookup table for sourceId ↔ destLocation binding

### GAS Backend Integration
**File:** `/home/user/ui-ux-pro-max-skill/ALLY_LOTTE_點驗_v8.html`, Line 304

```javascript
// TODO: 接 GAS append「操作記錄」分頁
if(!confirm('結束點驗並關單？\n已封板 '+n+' 板 · 照片 '+ST.photos.filter(Boolean).length+' 張\n（log 將回填 Google Sheet）')) return;
```

**Status:** ❌ NOT IMPLEMENTED

**What's Needed:**
1. **GAS Script Endpoint:** Define WebApp.doPost() handler
2. **Payload Structure:**
   ```javascript
   {
     truck: "BBB-2262",
     trip: "Air-con6/22-1",
     sealed: { "LOTTE-...": { qty, unit, ts } },
     photos: { sourceId: "base64 data" },
     timestamp: "2026-06-19T10:30:00Z"
   }
   ```
3. **Sheet Columns:** Already defined in v8 data (LOG array structure):
   ```
   [時間戳, 車號, Trip, 操作, sourceId, sku, qty, unit, loc]
   ```

**Finding:**
- ❌ GAS backend endpoint NOT DEFINED
- ❌ Photo upload mechanism NOT IMPLEMENTED (photos remain in browser memory)
- ⚠️ LOG array exists locally but never transmitted to backend
- **Recommendation:** Implement `endTrip()` function to append LOG + photos to Google Sheets

---

## 6. Summary of Compatibility Issues

### GREEN (Fully Compatible)
| Check | Finding | Evidence |
|-------|---------|----------|
| **QR Code Format** | sourceId encoding aligned | Both use plain sourceId text |
| **Code128 Barcode** | sourceId barcode aligned | Both encode sourceId identically |
| **SKU Values** | SKU field consistency | BK9275, BK9276, etc. match exactly |
| **Product Names** | Product name alignment | LOTTE Pepero names match |
| **Quantity Fields** | qtyBox/qtyPcs consistency | Format and values match |
| **Expiration Dates** | expDate format aligned | YYYY/MM/DD format consistent |

### YELLOW (Partial/Needs Extension)
| Check | Gap | Impact |
|-------|-----|--------|
| **Photo Grid Metadata** | Photos indexed by slot, not sourceId | Cannot link photos to pallets during GAS transmission |
| **Storage Locations** | Printer has destLoc; APP only tracks loc | Destination aisle assignments not captured |
| **EAN Handling** | Printer stores EAN; APP doesn't | No barcode validation against international codes |
| **Trip Tracking** | Printer tracks trip; APP doesn't store it | Missing audit trail metadata |
| **orderId Storage** | Printer has orderId; APP only uses sourceId | Invoice number not stored for reporting |

### RED (Not Implemented)
| Check | Missing | Required |
|-------|---------|----------|
| **GAS Backend** | No Google Apps Script endpoint | Photos and LOG cannot be uploaded |
| **Photo Upload** | TODO comment; no implementation | Photos stay in browser memory only |
| **Metadata Binding** | sourceId ↔ photo grid linking | Cannot associate photos with specific pallets |
| **Timestamp Logging** | Photo timestamps not recorded | Cannot trace when photos were taken |

---

## 7. Recommendations & Fixes

### Priority 1: CRITICAL (Blocks GAS integration)
1. **Implement GAS Backend Endpoint**
   - Create Google Apps Script WebApp.doPost() handler
   - Accept payload with `truck`, `sealed`, `photos`, `timestamp`
   - Append records to "操作記錄" sheet
   - Return success/error response

2. **Implement Photo Upload Function**
   ```javascript
   async function endTrip(){
     const payload = {
       truck: ST.truck,
       trip: scanned.srcPallet?.trip,
       sealed: ST.sealed,  // { sourceId: {qty, unit, ts} }
       photos: ST.photos,  // [base64, base64, ...]
       timestamp: new Date().toISOString()
     };
     const resp = await fetch(GAS_ENDPOINT, {
       method: 'POST',
       body: JSON.stringify(payload)
     });
     // ... handle response
   }
   ```

### Priority 2: HIGH (Data quality)
3. **Add EAN Field to v8 APP Data**
   - Include `ean` in PALLETS_6_22 objects
   - Support EAN barcode scanning as alternative lookup key
   - Validate scanned EAN against inventory

4. **Add destLocation Field**
   - Extend v8 APP to capture destination aisle after verification
   - Store `destLoc` in sealed record
   - Transmit to GAS backend for placement confirmation

5. **Add Trip & orderId Metadata**
   - Include `trip` and `orderId` in SOURCE_INDEX lookups
   - Log these fields when sealing pallets
   - Provide in photo grid metadata payload

### Priority 3: MEDIUM (Photo Integrity)
6. **Enhance Photo Grid Metadata**
   ```javascript
   ST.photos = [
     {
       index: 1,
       sourceId: "LOTTE-20260622-Air_con622_1-001",
       sku: "BK9275",
       data: "data:image/jpeg;base64,...",
       timestamp: "2026-06-19T10:30:45Z",
       operator: "張三"  // If auth implemented
     },
     // ... 32 objects total
   ]
   ```

7. **Add Photo Timestamp Recording**
   - Capture `new Date().toISOString()` when photo is saved
   - Store alongside base64 data
   - Include in GAS payload for audit trail

8. **Define Sticker-to-Photo Mapping**
   - Document that photo slot N corresponds to pallet index N
   - Add visual guide in APP UI
   - Provide grid numbering overlay on camera preview

---

## Appendix: File References

### Printer (v8.3)
- **QR Generation:** Line 313
- **Code128 Generation:** Line 311
- **Data Schema:** Line 146 (PALLET_DATA array)
- **Sticker Dimensions:** Line 53 (125mm x 125mm)

### APP (v8)
- **QR Scanning:** Line 100 (input field), Lines 206-221 (handler)
- **Data Schema:** Line 138 (PALLETS_6_22 object)
- **Photo Grid:** Lines 55-60 (CSS), Lines 125-126 (HTML), Lines 276-293 (JS)
- **GAS Integration:** Line 304 (TODO comment)

---

**Status:** ✅ Core data structures are compatible  
**Action Required:** Implement GAS backend + photo metadata extensions  
**Timeline:** Complete Priority 1 before production deployment

