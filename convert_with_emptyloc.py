#!/usr/bin/env python3
"""
6/27 起：移倉明細 + 空儲位清單 → v8.3 列印格式 + 含入庫單號 + 智能儲位配發。

配發邏輯（依使用者確認）：
  1. 常溫倉才配儲位；恆溫倉(空調)不配。
  2. 空儲位來源：EmptyLoc 檔（自動篩選尾數 2/3/4）。
  3. 缺口處理：若常溫張數 > 可用空位，將「數量最小」的 N 張不配發(留空)，
     其餘按由大到小取得儲位。
  4. 走道順序：空位「最多」的走道優先，配完自動跳「次多」走道；
     走道內由小到大編號。
  5. 入庫單號：lotte + YYYYMMDD + 車趟代碼 + 3碼流水號（每車趟重編）。
  6. 排序輸出：車次 > 品號小到大 > 數量小到大。
  7. 條碼 ean：贈品→單品條碼；其他→外箱條碼。

欄位自動偵測（容忍每日檔案欄位位移）：以表頭名稱比對。
"""

import sys, os, csv, re
from collections import Counter, defaultdict
try:
    import openpyxl
except ImportError:
    os.system("pip install openpyxl")
    import openpyxl

# ── 預設輸入 ──
U = "/root/.claude/uploads/cc3263d7-cb46-55b2-8ea0-151cb63cd9f8/"
DEFAULT_CUST = U + "a8f237fe-0627___2.xlsx"
DEFAULT_EMPTY = U + "eb3afac8-EmptyLoc_1.xlsx"
DEFAULT_MASTER = U + "a0d64486-jtu0612____________20260605__.xlsm"
DEFAULT_OUT = "/home/user/ui-ux-pro-max-skill/ALLY_LOTTE_WH/DATA/0627_棧板資訊"

CUST = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CUST
EMPTY = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_EMPTY
MASTER = sys.argv[3] if len(sys.argv) > 3 else DEFAULT_MASTER
OUT_BASE = sys.argv[4] if len(sys.argv) > 4 else DEFAULT_OUT

JUNK = {'', 'NO', 'N/A', 'NA', 'NONE', 'NO ', '#VALUE!', '0', '#N/A'}
VALID_UNITS = set('234')  # 倉儲現況：只配尾數 2/3/4


# ── 入庫單號 ──
def parse_trip(trip):
    """6/27-1 -> ('20260627','-1')；6/27空調-1 -> ('20260627','aircon-1')"""
    s = str(trip or '').strip()
    m = re.match(r'(\d{1,2})/(\d{1,2})(.*)$', s)
    if m:
        mm, dd = m.group(1).zfill(2), m.group(2).zfill(2)
        suffix = re.sub(r'空調|恆溫', 'aircon', m.group(3) or '')
        return '2026' + mm + dd, suffix
    suffix = re.sub(r'\s+', '', re.sub(r'空調|恆溫', 'aircon', s))
    return '2026', suffix


def build_order_id(trip, serial):
    date, suffix = parse_trip(trip)
    oid = 'lotte' + date + suffix + serial
    oid = ''.join(c for c in oid if 0x20 <= ord(c) <= 0x7E)  # CODE128 僅 ASCII
    return oid[:30]


def is_aircon(trip):
    return ('空調' in str(trip)) or ('恆溫' in str(trip)) or ('aircon' in str(trip).lower())


def clean_barcode(v):
    if v is None:
        return ''
    s = str(v).strip()
    if s.endswith('.0'):
        s = s[:-2]
    if s.upper() in JUNK:
        return ''
    return s if s.isdigit() else ''


# ── 商品主檔（條碼/贈品）──
def build_master_lookup():
    wb = openpyxl.load_workbook(MASTER, data_only=True, read_only=True)
    lookup = {}
    dsv = wb['DSV系統 商品資料']
    drows = dsv.iter_rows(values_only=True)
    dh = next(drows)
    di = {n: i for i, n in enumerate(dh)}
    for r in drows:
        sku = r[0]
        if not sku:
            continue
        sku = str(sku).strip()
        lookup.setdefault(sku, {'single': '', 'box': '', 'is_gift': False, 'name': r[1] or ''})
        s = clean_barcode(r[di.get('條碼')]) if '條碼' in di else ''
        b = clean_barcode(r[di.get('箱條碼')]) if '箱條碼' in di else ''
        if s and not lookup[sku]['single']:
            lookup[sku]['single'] = s
        if b and not lookup[sku]['box']:
            lookup[sku]['box'] = b
    for sn in wb.sheetnames:
        if sn in ('分析', 'DSV系統 商品資料'):
            continue
        ws = wb[sn]
        rws = list(ws.iter_rows(values_only=True))
        hrow = None
        for i, r in enumerate(rws[:4]):
            if r and any(c and 'Item Code' in str(c) for c in r):
                hrow = i
                break
        if hrow is None:
            continue
        h = rws[hrow]
        ci = {}
        for i, c in enumerate(h):
            if not c:
                continue
            cs = str(c)
            if '產品條碼' in cs: ci['single'] = i
            if '外箱條碼' in cs: ci['box'] = i
            if '產品細分類' in cs: ci['cat'] = i
        for r in rws[hrow + 1:]:
            sku = r[0]
            if not sku:
                continue
            sku = str(sku).strip()
            ent = lookup.setdefault(sku, {'single': '', 'box': '', 'is_gift': False, 'name': ''})
            if 'single' in ci:
                s = clean_barcode(r[ci['single']])
                if s and not ent['single']:
                    ent['single'] = s
            if 'box' in ci:
                b = clean_barcode(r[ci['box']])
                if b and not ent['box']:
                    ent['box'] = b
            if 'cat' in ci and r[ci['cat']] and '贈品' in str(r[ci['cat']]):
                ent['is_gift'] = True
    return lookup


def is_gift(sku, name, ent):
    if ent and ent.get('is_gift'):
        return True
    if str(sku).upper().startswith('SW'):
        return True
    if name and '贈品' in str(name):
        return True
    return False


def pick_barcode(sku, name, ent):
    if not ent:
        return '', 'none'
    if is_gift(sku, name, ent):
        bc = ent['single'] or ent['box']
        return bc, 'single' if ent['single'] else ('box' if ent['box'] else 'none')
    bc = ent['box'] or ent['single']
    return bc, 'box' if ent['box'] else ('single' if ent['single'] else 'none')


def num(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


# ── 欄位自動偵測 ──
def find_col(header, *keywords):
    """回傳第一個含任一 keyword 的欄位 index（找不到回 -1）"""
    for i, c in enumerate(header):
        cs = str(c or '')
        if any(k in cs for k in keywords):
            return i
    return -1


# ── 空儲位讀取 + 走道排序 ──
def load_empty_locations():
    wb = openpyxl.load_workbook(EMPTY, data_only=True)
    # 優先用 EmptyLoc 分頁（欄位齊全），否則用第一個分頁
    sheet = 'EmptyLoc' if 'EmptyLoc' in wb.sheetnames else wb.sheetnames[0]
    ws = wb[sheet]
    rows = list(ws.iter_rows(values_only=True))
    header = rows[0]
    loc_idx = find_col(header, '儲位')
    if loc_idx == -1:
        loc_idx = 1 if len(header) > 1 else 0
    locs = []
    for r in rows[1:]:
        v = r[loc_idx]
        if not v:
            continue
        s = str(v).strip()
        if s and s[-1] in VALID_UNITS:  # 只取尾數 2/3/4
            locs.append(s)
    # 依走道分組
    by_aisle = defaultdict(list)
    for l in locs:
        m = re.match(r'([A-Z]+)', l)
        if m:
            by_aisle[m.group(1)].append(l)
    # 每走道內由小到大
    for a in by_aisle:
        by_aisle[a].sort()
    # 走道順序：空位「最多」優先
    aisle_order = sorted(by_aisle.keys(), key=lambda a: (-len(by_aisle[a]), a))
    # 串成最終配發序列
    ordered = []
    for a in aisle_order:
        ordered.extend(by_aisle[a])
    return ordered, by_aisle, aisle_order


def main():
    for f in (CUST, EMPTY, MASTER):
        if not os.path.exists(f):
            print(f"❌ 找不到輸入檔: {f}")
            sys.exit(1)

    master = build_master_lookup()
    print(f"✅ 條碼主檔載入：{len(master)} 個品號")

    empty_locs, by_aisle, aisle_order = load_empty_locations()
    print(f"✅ 空儲位載入：{len(empty_locs)} 格（尾數2/3/4）")
    print(f"   走道配發順序（空位多→少）：")
    for a in aisle_order:
        print(f"     {a}: {len(by_aisle[a])} 格")
    print()

    # ── 讀移倉明細（欄位自動偵測）──
    wb = openpyxl.load_workbook(CUST, data_only=True)
    sheet = '明細' if '明細' in wb.sheetnames else wb.sheetnames[0]
    ws = wb[sheet]
    rows = list(ws.iter_rows(values_only=True))
    header = rows[0]
    I_SKU = find_col(header, '品號')
    I_NAME = find_col(header, '品名')
    I_QTY = find_col(header, '數量')
    I_BIG = find_col(header, '大')         # 箱數
    I_EXP = find_col(header, '到期日', '效期')
    I_PLANT = find_col(header, 'Plant', '倉別')
    I_TRIP = find_col(header, '移倉')
    print(f"📋 明細欄位偵測：品號={I_SKU} 品名={I_NAME} 數量={I_QTY} 大={I_BIG} 到期日={I_EXP} Plant={I_PLANT} 移倉={I_TRIP}\n")

    pallets = []
    no_barcode = []
    for r in rows[1:]:
        sku = r[I_SKU] if I_SKU >= 0 else None
        if not sku:
            continue
        sku = str(sku).strip()
        name = (r[I_NAME] if I_NAME >= 0 else '') or ''
        trip = str((r[I_TRIP] if I_TRIP >= 0 else '') or '').strip()
        ent = master.get(sku)
        bc, src = pick_barcode(sku, name, ent)
        if not bc:
            no_barcode.append((sku, name, trip))
        pallets.append({
            'sourceId': '',
            'sku': sku, 'name': name,
            'qtyBox': num(r[I_BIG]) if I_BIG >= 0 else 0,
            'qtyPcs': num(r[I_QTY]) if I_QTY >= 0 else 0,
            'srcLoc': '', 'destLoc': '',
            'trip': trip,
            'plant': str((r[I_PLANT] if I_PLANT >= 0 else '') or '').strip(),
            'expDate': str((r[I_EXP] if I_EXP >= 0 else '') or '').strip(),
            'ean': bc, 'bc_src': src, 'is_gift': is_gift(sku, name, ent),
            'aircon': is_aircon(trip),
        })

    n = len(pallets)

    # ── 入庫單號：排序後每車趟流水 3 碼 ──
    pallets.sort(key=lambda p: (p['trip'], p['sku'], p['qtyPcs']))
    counters = {}
    for p in pallets:
        counters[p['trip']] = counters.get(p['trip'], 0) + 1
        p['orderId'] = build_order_id(p['trip'], str(counters[p['trip']]).zfill(3))

    # ── 智能儲位配發 ──
    regular = [p for p in pallets if not p['aircon']]
    aircon = [p for p in pallets if p['aircon']]
    avail = len(empty_locs)
    need = len(regular)
    skip_n = max(0, need - avail)  # 缺口：數量最小的不配發

    # 數量最小的 skip_n 張不配發（用 qtyPcs；同量用 qtyBox 再比）
    regular_by_qty = sorted(regular, key=lambda p: (p['qtyPcs'], p['qtyBox']))
    skip_ids = set(id(p) for p in regular_by_qty[:skip_n])

    # 其餘按 qtyPcs 由大到小取得儲位（大板先配）
    to_alloc = [p for p in regular_by_qty[skip_n:]]
    to_alloc.sort(key=lambda p: (-p['qtyPcs'], -p['qtyBox']))
    loc_iter = iter(empty_locs)
    for p in to_alloc:
        p['destLoc'] = next(loc_iter, '')

    # ── 報表 ──
    trips = Counter(p['trip'] for p in pallets)
    print(f"📊 明細 {n} 個品項 → {n} 張貼紙")
    print(f"   🌡️ 常溫(需配): {need} 張　❄️ 恆溫(不配): {len(aircon)} 張")
    print(f"   ✅ 已配發: {len(to_alloc)} 張　⚠️ 未配發(數量最小): {skip_n} 張\n")
    print("📈 各車次張數 / 入庫單號範例：")
    for t in sorted(trips):
        sample = next(p['orderId'] for p in pallets if p['trip'] == t)
        print(f"  {t}: {trips[t]} 張  (首張 {sample})")

    # 配發走道統計
    used_aisle = Counter(re.match(r'([A-Z]+)', p['destLoc']).group(1)
                         for p in pallets if p['destLoc'])
    print(f"\n🏢 實際配發走道分布：")
    for a in sorted(used_aisle, key=lambda x: -used_aisle[x]):
        print(f"  {a}: {used_aisle[a]} 板")

    if skip_n:
        skipped = regular_by_qty[:skip_n]
        print(f"\n⚠️ 未配發儲位的 {skip_n} 張（數量最小，需人工補位）：")
        for p in skipped[:30]:
            print(f"    [{p['trip']}] {p['orderId']}  {p['sku']}  {p['qtyPcs']}件  {str(p['name'])[:20]}")

    gifts = sum(1 for p in pallets if p['is_gift'])
    print(f"\n🎁 贈品(單品條碼)：{gifts}　📦 一般(外箱條碼)：{n-gifts}")
    if no_barcode:
        print(f"\n⚠️ 無條碼 {len(no_barcode)} 張(貼紙顯示「—」)：")
        for sku, name, trip in no_barcode[:15]:
            print(f"    [{trip}] {sku}  {str(name)[:24]}")
        if len(no_barcode) > 15:
            print(f"    ...其餘 {len(no_barcode)-15} 張")

    # 重新依「車次 > 品號 > 數量」排序輸出（貼紙順序）
    pallets.sort(key=lambda p: (p['trip'], p['sku'], p['qtyPcs']))

    # ── 輸出 1：v8.3 匯入格式（10 欄，含 destLoc）──
    cols = ['sourceId','sku','name','qtyBox','qtyPcs','srcLoc','destLoc','trip','expDate','ean']
    with open(f"{OUT_BASE}_v8.3匯入.csv", 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=cols); w.writeheader()
        for p in pallets:
            w.writerow({k: p[k] for k in cols})
    wb_out = openpyxl.Workbook(); sh = wb_out.active; sh.title = '棧板資訊'
    sh.append(cols)
    for p in pallets:
        sh.append([p[k] for k in cols])
    wb_out.save(f"{OUT_BASE}_v8.3匯入.xlsx")

    # ── 輸出 2：含入庫單號 + 倉別 + 配發儲位 → 貼 Google Sheet ──
    info_cols = ['orderId','sourceId','sku','name','qtyBox','qtyPcs','destLoc','trip','plant','expDate','ean']
    with open(f"{OUT_BASE}_含入庫單號.csv", 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=info_cols); w.writeheader()
        for p in pallets:
            w.writerow({k: p[k] for k in info_cols})
    wb_info = openpyxl.Workbook(); shi = wb_info.active; shi.title = '棧板資訊'
    shi.append(info_cols)
    for p in pallets:
        shi.append([p[k] for k in info_cols])
    wb_info.save(f"{OUT_BASE}_含入庫單號.xlsx")

    print(f"\n✅ 已輸出：")
    print(f"   {OUT_BASE}_v8.3匯入.xlsx/.csv  (匯入 v8.3 列印貼紙，含配發儲位)")
    print(f"   {OUT_BASE}_含入庫單號.xlsx/.csv  (貼 Google Sheet 棧板資訊分頁)")


if __name__ == '__main__':
    main()
