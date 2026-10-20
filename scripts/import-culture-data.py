"""Import the official BNS workbook. Default is reproducible and offline."""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen
from zipfile import ZipFile
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SOURCE = "https://stat.gov.kz/upload/iblock/c02/1oqfioovi1vu8kmxa252sxgzb84eeu5r/%D1%80%D1%83%D1%81.xlsx"
PAGE = "https://stat.gov.kz/ru/industries/social-statistics/stat-culture/publications/341122/"
FILE = ROOT / "data/open/culture-2025-source.xlsx"
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
parser = argparse.ArgumentParser()
parser.add_argument("--refresh", action="store_true", help="Download source again")
args = parser.parse_args()
if args.refresh:
    with urlopen(SOURCE, timeout=30) as response:
        raw = response.read(2_000_001)
    if len(raw) > 2_000_000 or not raw.startswith(b"PK"):
        raise ValueError("Expected a small XLSX workbook from BNS")
    FILE.write_bytes(raw)
with ZipFile(FILE) as z:
    strings = ["".join(s.itertext()) for s in ET.fromstring(z.read("xl/sharedStrings.xml"))]
    sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    rows = []
    for row in sheet.findall(".//s:row", NS):
        values = {}
        for cell in row.findall("s:c", NS):
            col = "".join(c for c in cell.attrib["r"] if c.isalpha())
            value = cell.findtext("s:v", default="", namespaces=NS)
            values[col] = strings[int(value)] if cell.attrib.get("t") == "s" and value else value
        rows.append(values)
    if not any(row.get("C") == "Театры" and row.get("D") == "Музеи" for row in rows):
        raise ValueError("BNS schema changed: inspect headers before import")
    regions = {}
    for source_name, city, name in [("Абай", "semey", "Область Абай"), ("г. Алматы", "almaty", "Город Алматы")]:
        matches = [r for r in rows if r.get("B") == source_name]
        if len(matches) != 1:
            raise ValueError(f"Expected one region: {source_name}")
        r = matches[0]
        regions[city] = {"name": name, "museums": int(r["D"]), "theatres": int(r["C"])}
    result = {
        "title": "Сеть учреждений культуры на 1 января 2026 года",
        "publisher": "Бюро национальной статистики Республики Казахстан",
        "as_of": "2026-01-01", "checked_at": "2026-10-21",
        "source_url": PAGE, "download_url": SOURCE,
        "sha256": hashlib.sha256(FILE.read_bytes()).hexdigest(),
        "sheet": "рус", "columns": {"region": "B", "theatres": "C", "museums": "D"},
        "regions": regions,
    }
    (ROOT / "data/open/culture-2025.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    public = ROOT / "apps/web/public/open"
    public.mkdir(parents=True, exist_ok=True)
    (public / FILE.name).write_bytes(FILE.read_bytes())
    (public / "culture-2025.json").write_bytes((ROOT / "data/open/culture-2025.json").read_bytes())
    print(json.dumps(regions, ensure_ascii=False))
