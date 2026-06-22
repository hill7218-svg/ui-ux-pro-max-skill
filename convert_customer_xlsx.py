#!/usr/bin/env python3
"""
Convert customer XLSX (總表 + 工作表1) to v8.3 printer import format
Deduplicates by storage location (儲位) - each unique location = one pallet
"""

import sys
import os

try:
    import openpyxl
except ImportError:
    print("❌ openpyxl not found. Installing...")
    os.system("pip install openpyxl")
    import openpyxl

def read_customer_xlsx(filepath):
    """Read customer XLSX with 總表 and 工作表1"""
    try:
        wb = openpyxl.load_workbook(filepath, data_only=True)
        sheets = wb.sheetnames
        print(f"✅ Found sheets: {sheets}\n")

        # Read 工作表1 (details)
        details = []
        if '工作表1' in sheets:
            ws = wb['工作表1']
            headers = [cell.value for cell in ws[1]]
            print(f"Column headers: {headers}\n")

            for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
                if not row[0]:  # Skip empty rows
                    continue
                details.append(dict(zip(headers, row)))

        return details, sheets
    except Exception as e:
        print(f"❌ Error reading file: {e}")
        sys.exit(1)

def deduplicate_by_location(details):
    """
    Group by unique storage location (儲位)
    Each unique 儲位 = one pallet
    Return deduplicated data with aggregated quantities
    """
    pallet_map = {}

    for row in details:
        location = row.get('儲位', '').strip() if row.get('儲位') else ''
        if not location:
            print(f"⚠️  Skipping row with missing 儲位: {row}")
            continue

        # Each location becomes one pallet entry
        if location not in pallet_map:
            pallet_map[location] = {
                'sourceId': location,  # Use storage location as sourceId
                'sku': row.get('品號', '').strip() or '',
                'name': row.get('品名', '').strip() or '',
                'trip': row.get('移倉', '').strip() or '',
                'expDate': row.get('到期日', '') or '',
                'qtyBox': 0,
                'qtyPcs': 0,
                'srcLoc': '',  # Empty as per user request
                'destLoc': '',
                'ean': '',
                'rows': []  # Track original rows for verification
            }

        # Aggregate quantities
        qty_box = row.get('外箱', 0) or 0
        qty_pcs = row.get('數量', 0) or 0
        try:
            pallet_map[location]['qtyBox'] += int(qty_box) if qty_box else 0
            pallet_map[location]['qtyPcs'] += int(qty_pcs) if qty_pcs else 0
        except (ValueError, TypeError):
            pass

        pallet_map[location]['rows'].append(row)

    return pallet_map

def generate_csv(pallet_map, output_path):
    """Generate CSV in v8.3 printer import format"""
    import csv

    # v8.3 format columns: sourceId, sku, name, qtyBox, qtyPcs, srcLoc, destLoc, trip, expDate, ean
    with open(output_path, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=[
            'sourceId', 'sku', 'name', 'qtyBox', 'qtyPcs', 'srcLoc', 'destLoc', 'trip', 'expDate', 'ean'
        ])
        writer.writeheader()

        # Sort by trip then by sourceId for consistency
        sorted_pallets = sorted(pallet_map.values(), key=lambda x: (x['trip'], x['sourceId']))

        for pallet in sorted_pallets:
            writer.writerow({
                'sourceId': pallet['sourceId'],
                'sku': pallet['sku'],
                'name': pallet['name'],
                'qtyBox': pallet['qtyBox'],
                'qtyPcs': pallet['qtyPcs'],
                'srcLoc': pallet['srcLoc'],
                'destLoc': pallet['destLoc'],
                'trip': pallet['trip'],
                'expDate': pallet['expDate'],
                'ean': pallet['ean']
            })

    print(f"✅ Generated CSV: {output_path}")

def generate_xlsx(pallet_map, output_path):
    """Generate XLSX in v8.3 printer import format"""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "棧板資訊"

    # Headers
    headers = ['sourceId', 'sku', 'name', 'qtyBox', 'qtyPcs', 'srcLoc', 'destLoc', 'trip', 'expDate', 'ean']
    ws.append(headers)

    # Sort by trip then by sourceId
    sorted_pallets = sorted(pallet_map.values(), key=lambda x: (x['trip'], x['sourceId']))

    for pallet in sorted_pallets:
        ws.append([
            pallet['sourceId'],
            pallet['sku'],
            pallet['name'],
            pallet['qtyBox'],
            pallet['qtyPcs'],
            pallet['srcLoc'],
            pallet['destLoc'],
            pallet['trip'],
            pallet['expDate'],
            pallet['ean']
        ])

    wb.save(output_path)
    print(f"✅ Generated XLSX: {output_path}")

def main():
    input_file = "/root/.claude/uploads/cc3263d7-cb46-55b2-8ea0-151cb63cd9f8/e3d77ba7-0623__1_1.xlsx"

    if not os.path.exists(input_file):
        print(f"❌ Input file not found: {input_file}")
        sys.exit(1)

    print(f"📂 Reading: {input_file}\n")
    details, sheets = read_customer_xlsx(input_file)

    print(f"📊 Total rows in 工作表1: {len(details)}\n")

    # Deduplicate by storage location
    pallet_map = deduplicate_by_location(details)
    unique_pallets = len(pallet_map)

    print(f"🎯 Unique storage locations (pallets): {unique_pallets}\n")

    # Group summary by trip
    trips = {}
    for location, pallet in pallet_map.items():
        trip = pallet['trip'] or 'UNKNOWN'
        if trip not in trips:
            trips[trip] = 0
        trips[trip] += 1

    print("📈 Summary by trip:")
    for trip, count in sorted(trips.items()):
        print(f"  {trip}: {count} 張")
    print()

    # Generate outputs
    base_name = "/home/user/ui-ux-pro-max-skill/ALLY_LOTTE_WH/DATA/customer_converted"

    generate_csv(pallet_map, f"{base_name}.csv")
    generate_xlsx(pallet_map, f"{base_name}.xlsx")

    print(f"\n🎉 Conversion complete!")
    print(f"📌 Ready to import into v8.3 printer: {unique_pallets} sticker sheets will be printed")

if __name__ == "__main__":
    main()
