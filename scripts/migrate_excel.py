#!/usr/bin/env python3
"""
Standalone Migration Script: La Mulana 2 - Maps.xlsm -> migrated-excel-backup.zip
---------------------------------------------------------------------------------
Streams XML, RichData in-cell screenshots, InkML vector drawings, and Threaded Comments
from `migration-input/La Mulana 2 - Maps.xlsm` and builds a complete portable `.zip`
backup archive ready to import into the La-Mulana 2 Web App.
"""

import zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict, Counter
import numpy as np
from PIL import Image, ImageDraw
import io
import json
import math
import re
import time
import os

XLSM_PATH = r"c:\Users\falco\Programming\La Mulana 2 Web App\migration-input\La Mulana 2 - Maps.xlsm"
OUTPUT_ZIP_PATH = r"c:\Users\falco\Programming\La Mulana 2 Web App\migration-input\migrated-excel-backup.zip"

NS = {
    'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'xdr': 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',
    'xdr14': 'http://schemas.microsoft.com/office/excel/2010/spreadsheetDrawing',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006',
    'inkml': 'http://www.w3.org/2003/InkML',
    'tc': 'http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments',
}

COL_W_EMU = 2247900.0
ROW_H_EMU = 1290917.5

def col_to_letter(col_idx):
    res = ""
    c = col_idx + 1
    while c > 0:
        c, rem = divmod(c - 1, 26)
        res = chr(65 + rem) + res
    return res

def letter_to_col(letters):
    c = 0
    for ch in letters.upper():
        if 'A' <= ch <= 'Z':
            c = c * 26 + (ord(ch) - 64)
    return c - 1

def parse_cell_ref(ref_str):
    clean = ref_str.replace('$', '').strip()
    m = re.match(r'^([A-Za-z]+)(\d+)$', clean)
    if not m:
        return None, None
    return letter_to_col(m.group(1)), int(m.group(2)) - 1

def format_cell_coord(row_idx, col_idx):
    return f"{col_to_letter(col_idx)}{row_idx + 1}"

def decode_inkml_trace(trace_str):
    pts = []
    x = y = 0.0
    vx = vy = 0.0
    mode = 'abs'
    for part in trace_str.strip().split(','):
        part = part.strip()
        if not part:
            continue
        if part.startswith("'"):
            mode = 'vel'
        elif part.startswith('"'):
            mode = 'acc'
        nums = [float(v) for v in re.findall(r'[-+]?\d+(?:\.\d+)?', part)]
        if len(nums) < 2:
            continue
        dx, dy = nums[0], nums[1]
        if mode == 'abs':
            x, y = dx, dy
            vx, vy = 0.0, 0.0
        elif mode == 'vel':
            vx, vy = dx, dy
            x += vx
            y += vy
        elif mode == 'acc':
            vx += dx
            vy += dy
            x += vx
            y += vy
        pts.append((x, y))
    return pts

def extract_mask_features(png_bytes):
    im = Image.open(io.BytesIO(png_bytes)).convert('RGBA')
    alpha = np.array(im)[:, :, 3] > 30
    if not alpha.any():
        return None
    ys, xs = np.where(alpha)
    y0, y1 = ys.min(), ys.max() + 1
    x0, x1 = xs.min(), xs.max() + 1
    crop = alpha[y0:y1, x0:x1]
    crop_im = Image.fromarray((crop * 255).astype(np.uint8)).resize((32, 32), Image.Resampling.BILINEAR)
    norm_grid = (np.array(crop_im) > 64).astype(np.float32)
    fill_ratio = float(crop.mean())
    aspect = float(x1 - x0) / max(1.0, float(y1 - y0))
    return {
        'grid': norm_grid,
        'fill': fill_ratio,
        'aspect': aspect,
        'w_px': int(x1 - x0),
        'h_px': int(y1 - y0)
    }

# Marker definitions matching the 25 Legend items + standard built-ins
MARKER_DEFINITIONS = [
    # Orange (#F6630D) - Lore, Save & Reading Spots
    {
        'id': 'legend_tablet',
        'name': 'Tablet',
        'description': 'Stone tablets and readable inscriptions.',
        'iconKey': 'tablet',
        'defaultColor': '#F6630D',
        'showShortLabelOnMacro': True,
        'isBuiltIn': True,
    },
    {
        'id': 'legend_skeleton',
        'name': 'Skeleton with Info',
        'description': 'Explorer skeletons with notes or items.',
        'iconKey': 'skull',
        'defaultColor': '#F6630D',
        'showShortLabelOnMacro': False,
        'isBuiltIn': True,
    },
    {
        'id': 'legend_save',
        'name': 'Save Tablet',
        'description': 'Holy Grail save tablets / warp points.',
        'iconKey': 'star',
        'defaultColor': '#F6630D',
        'defaultSymbol': 'S',
        'showShortLabelOnMacro': False,
        'isBuiltIn': True,
    },
    {
        'id': 'legend_statue',
        'name': 'Mural / Statue',
        'description': 'Readable statues, background murals, or goddess statues.',
        'iconKey': 'tablet',
        'defaultColor': '#F6630D',
        'defaultSymbol': 'M',
        'showShortLabelOnMacro': True,
        'isBuiltIn': True,
    },
    {
        'id': 'legend_totem',
        'name': 'Totem Pole',
        'description': 'Warp totem poles.',
        'iconKey': 'flag',
        'defaultColor': '#F6630D',
        'defaultSymbol': 'T',
        'showShortLabelOnMacro': False,
        'isBuiltIn': True,
    },
    # Green (#66CC00) - Puzzles, Gates, Bosses & Key Mechanics
    {
        'id': 'legend_question',
        'name': 'Open Question (?)',
        'description': 'Unsolved riddles, suspicious mechanisms, or open questions.',
        'iconKey': 'mystery',
        'defaultColor': '#66CC00',
        'defaultSymbol': '?',
        'showShortLabelOnMacro': True,
        'isBuiltIn': True,
    },
    {
        'id': 'legend_return',
        'name': 'Return Later (Missing Item)',
        'description': 'Spot requiring a future item or ability.',
        'iconKey': 'flag',
        'defaultColor': '#66CC00',
        'defaultSymbol': '!',
        'showShortLabelOnMacro': True,
        'isBuiltIn': True,
    },
    {
        'id': 'legend_soul_gate',
        'name': 'Soul Gate',
        'description': 'Soul Gate requiring Guardian defeats.',
        'iconKey': 'skull',
        'defaultColor': '#66CC00',
        'showShortLabelOnMacro': True,
        'isBuiltIn': True,
    },
    {
        'id': 'legend_candlestick',
        'name': 'Candlestick of Time',
        'description': 'Candlestick of Time flame spot.',
        'iconKey': 'flame',
        'defaultColor': '#66CC00',
        'showShortLabelOnMacro': False,
        'isBuiltIn': True,
    },
    {
        'id': 'legend_mimir',
        'name': 'Bust of Mimir (Incantation)',
        'description': 'Bust of Mimir mantra incantation statue.',
        'iconKey': 'star',
        'defaultColor': '#66CC00',
        'defaultSymbol': '♪',
        'showShortLabelOnMacro': True,
        'isBuiltIn': True,
    },
    {
        'id': 'legend_seal',
        'name': 'Seal (Inside Changes)',
        'description': 'Life/Birth/Origin/Death seal or sigil.',
        'iconKey': 'key',
        'defaultColor': '#66CC00',
        'showShortLabelOnMacro': True,
        'isBuiltIn': True,
    },
    {
        'id': 'legend_mural',
        'name': 'Mural (Puzzle / Lore)',
        'description': 'Wall mural with puzzle clues or mantras.',
        'iconKey': 'eye',
        'defaultColor': '#66CC00',
        'defaultSymbol': '~',
        'showShortLabelOnMacro': True,
        'isBuiltIn': True,
    },
    {
        'id': 'legend_boss',
        'name': 'Boss / Guardian',
        'description': 'Room bosses, sub-bosses, and area Guardians.',
        'iconKey': 'boss',
        'defaultColor': '#66CC00',
        'showShortLabelOnMacro': True,
        'isBuiltIn': True,
    },
    {
        'id': 'legend_ankh',
        'name': 'Ankh',
        'description': 'Guardian Ankh spawn spot.',
        'iconKey': 'star',
        'defaultColor': '#66CC00',
        'defaultSymbol': '♀',
        'showShortLabelOnMacro': True,
        'isBuiltIn': True,
    },
    {
        'id': 'legend_fairy',
        'name': 'Fairy Point',
        'description': 'Fairy summoning circle.',
        'iconKey': 'star',
        'defaultColor': '#66CC00',
        'defaultSymbol': 'F',
        'showShortLabelOnMacro': False,
        'isBuiltIn': True,
    },
    {
        'id': 'legend_tree_gate',
        'name': 'Tree of Life Gate',
        'description': 'Yggdrasil / Tree of Life Gate.',
        'iconKey': 'warp',
        'defaultColor': '#66CC00',
        'showShortLabelOnMacro': True,
        'isBuiltIn': True,
    },
    {
        'id': 'legend_altar_gate',
        'name': 'Altar Gate',
        'description': 'Altar Gate transition.',
        'iconKey': 'warp',
        'defaultColor': '#66CC00',
        'showShortLabelOnMacro': True,
        'isBuiltIn': True,
    },
    {
        'id': 'legend_reverse_gate',
        'name': 'Reverse Gate',
        'description': 'Front/Backside Reverse Gate transition.',
        'iconKey': 'warp',
        'defaultColor': '#66CC00',
        'showShortLabelOnMacro': True,
        'isBuiltIn': True,
    },
    # Cyan (#33CCFF) - Room Mechanics, Switches, Doors & Traps
    {
        'id': 'legend_switch',
        'name': 'Switch',
        'description': 'Floor button, weight pedestal, or switch.',
        'iconKey': 'key',
        'defaultColor': '#33CCFF',
        'showShortLabelOnMacro': True,
        'isBuiltIn': True,
    },
    {
        'id': 'legend_eye',
        'name': 'Eye',
        'description': 'Eye detection statue or Beherit/komainu mechanism.',
        'iconKey': 'eye',
        'defaultColor': '#33CCFF',
        'showShortLabelOnMacro': False,
        'isBuiltIn': True,
    },
    {
        'id': 'legend_treasure',
        'name': 'Treasure Chest',
        'description': 'Treasure chest or item pickup.',
        'iconKey': 'chest',
        'defaultColor': '#33CCFF',
        'showShortLabelOnMacro': True,
        'isBuiltIn': True,
    },
    {
        'id': 'legend_shop',
        'name': 'Shop ($)',
        'description': 'Merchant shop room.',
        'iconKey': 'chest',
        'defaultColor': '#33CCFF',
        'defaultSymbol': '$',
        'showShortLabelOnMacro': True,
        'isBuiltIn': True,
    },
    {
        'id': 'legend_npc',
        'name': 'NPC Room (Δ)',
        'description': 'NPC dialogue doorway / tent.',
        'iconKey': 'tablet',
        'defaultColor': '#33CCFF',
        'defaultSymbol': 'Δ',
        'showShortLabelOnMacro': True,
        'isBuiltIn': True,
    },
    {
        'id': 'legend_map_switch',
        'name': 'Map Switch',
        'description': 'Switch that alters map structure or water/lava levels.',
        'iconKey': 'flag',
        'defaultColor': '#33CCFF',
        'showShortLabelOnMacro': True,
        'isBuiltIn': True,
    },
    {
        'id': 'legend_trap',
        'name': 'Trap (X^T)',
        'description': 'Trap trigger, crusher, or false floor.',
        'iconKey': 'trap',
        'defaultColor': '#33CCFF',
        'defaultSymbol': 'X',
        'showShortLabelOnMacro': False,
        'isBuiltIn': True,
    },
    {
        'id': 'legend_switch_door',
        'name': '1 or 2 Way Switch Door',
        'description': 'One-way or two-way gate/shutter door.',
        'iconKey': 'key',
        'defaultColor': '#33CCFF',
        'defaultSymbol': '|',
        'showShortLabelOnMacro': False,
        'isBuiltIn': True,
    },
    {
        'id': 'legend_breakable_wall',
        'name': 'Breakable Wall',
        'description': 'Destructible wall, ceiling, or floor block.',
        'iconKey': 'trap',
        'defaultColor': '#33CCFF',
        'defaultSymbol': '≈',
        'showShortLabelOnMacro': False,
        'isBuiltIn': True,
    },
    {
        'id': 'warp_door',
        'name': 'Area Gate / Warp',
        'description': 'Cross-map doorway, gate, or transition.',
        'iconKey': 'warp',
        'defaultColor': '#33CCFF',
        'showShortLabelOnMacro': True,
        'isBuiltIn': True,
    },
]

LEGEND_CELL_TO_TYPE_ID = {
    'E2': 'legend_tablet',
    'E3': 'legend_skeleton',
    'E4': 'legend_save',
    'E5': 'legend_statue',
    'E6': 'legend_totem',
    'A2': 'legend_question',
    'A3': 'legend_return',
    'A4': 'legend_soul_gate',
    'A5': 'legend_candlestick',
    'A6': 'legend_mimir',
    'A7': 'legend_seal',
    'A8': 'legend_mural',
    'A9': 'legend_boss',
    'A10': 'legend_ankh',
    'A11': 'legend_fairy',
    'A12': 'legend_tree_gate',
    'A13': 'legend_altar_gate',
    'A14': 'legend_reverse_gate',
    'C2': 'legend_switch',
    'C4': 'legend_eye',
    'C5': 'legend_treasure',
    'C6': 'legend_shop',
    'C7': 'legend_npc',
    'C8': 'legend_map_switch',
    'C9': 'legend_trap',
    'C10': 'legend_switch_door',
    'C11': 'legend_breakable_wall',
}

MARKER_COLOR_BY_ID = {d['id']: d['defaultColor'] for d in MARKER_DEFINITIONS}

COMMENT_CATEGORIES = [
    {'id': 'tablet', 'code': 'T', 'name': 'Tablet / Mural', 'badgeColor': '#3b82f6', 'supportsResolved': False},
    {'id': 'npc', 'code': 'NPC', 'name': 'NPC Dialogue', 'badgeColor': '#10b981', 'supportsResolved': False},
    {'id': 'todo', 'code': 'TODO', 'name': 'Reminder / TODO', 'badgeColor': '#f59e0b', 'supportsResolved': True},
    {'id': 'shortcut_hint', 'code': 'Sk', 'name': 'Skeleton', 'badgeColor': '#06b6d4', 'supportsResolved': False},
    {'id': 'general', 'code': 'NOTE', 'name': 'General Note', 'badgeColor': '#94a3b8', 'supportsResolved': False},
]

def sanitize_migrated_payload(payload):
    """
    Applies one-off migration normalizations directly to the exported backup payload
    (formerly run on app startup in database.ts):
    - Strips legacy '$' signs from cell coordinates, pin shortLabels, and comment cellCoords
    - Strips "(' = ...)" annotations from marker definition names
    - Ensures 'Sk' comment category is named 'Skeleton'
    - Migrates any legacy raceOrTribeOptions / comment.raceOrTribe values into the
      filterable Custom Select Field ('field-race-tribe')
    """
    config = payload.get('config', {})

    # 1. Clean marker definition names and comment category names
    for m_def in config.get('markerDefinitions', []):
        m_def['name'] = re.sub(r"\s*\('?\s*=\s*[^)]+\)", "", m_def.get('name', ''), flags=re.IGNORECASE).strip()

    for cat in config.get('commentCategories', []):
        if cat.get('code') == 'Sk' and cat.get('name') == 'Shortcut / Hint':
            cat['name'] = 'Skeleton'

    # 2. Strip '$' from cell coordinates and pin shortLabels
    for cell in payload.get('cells', []):
        if 'coord' in cell and cell['coord']:
            cell['coord'] = cell['coord'].replace('$', '')
        for pin in cell.get('markers', []):
            if pin.get('shortLabel') and '$' in pin['shortLabel']:
                pin['shortLabel'] = re.sub(r'\$([A-Z]+)\$(\d+)', r'\1\2', pin['shortLabel'])

    # 3. Strip '$' from comment cellCoords and fold any legacy raceOrTribe into customFields
    legacy_options = list(config.pop('raceOrTribeOptions', []) or [])
    custom_fields = config.setdefault('customCommentFields', [])
    race_field = next(
        (f for f in custom_fields if f.get('id') in ('field-race-tribe', 'cf-race-tribe') or f.get('name', '').lower() == 'race / tribe'),
        None
    )

    for comm in payload.get('comments', []):
        if 'cellCoord' in comm and comm['cellCoord']:
            comm['cellCoord'] = comm['cellCoord'].replace('$', '')
        legacy_race = (comm.pop('raceOrTribe', None) or '').strip()
        if legacy_race:
            legacy_options.append(legacy_race)
            if race_field is None:
                race_field = {
                    'id': 'field-race-tribe',
                    'name': 'Race / Tribe',
                    'type': 'select',
                    'options': [],
                    'showInTable': True,
                    'filterable': True,
                }
                custom_fields.append(race_field)
            cf = comm.setdefault('customFields', {})
            cf.setdefault(race_field['id'], legacy_race)

    if race_field is not None and legacy_options:
        merged_opts = sorted(set((race_field.get('options') or []) + legacy_options))
        race_field['options'] = merged_opts
        race_field['filterable'] = True

    return payload


def normalize_race_tribe(raw_val):
    if not raw_val:
        return ""
    s = raw_val.strip()
    upper = s.upper()
    if 'ANNUN' in upper or 'ANUN' in upper or upper == '1 ANU':
        return '1st Children (Annunaki)'
    if 'KOTO' in upper:
        return '1st Children (Kotoamatsukami)'
    if 'TITAN' in upper:
        return '2nd Children (Titan)'
    if 'GIGAS' in upper:
        return '3rd Children (Gigas)'
    if 'OLYM' in upper:
        return '3rd Children (Olympian)'
    if 'AMARNA' in upper:
        return '5th Children (Amarna)'
    if 'ENNEAD' in upper:
        return '5th Children (Ennead)'
    if 'AESIR' in upper:
        return '6th Children (Aesir)'
    if 'ALFR' in upper:
        return '6th Children (Alfr)'
    if 'LOK' in upper:
        return '6th Children (Lokapala)'
    if 'VANIR' in upper:
        return '6th Children (Vanir)'
    if 'UNDERWORLD' in upper:
        return 'Underworld'
    return s

def classify_comment_text(raw_text):
    txt = raw_text.strip()
    if txt.startswith('/'):
        txt = txt[1:].strip()
    resolved = ('->' in txt and txt.upper().startswith(('TODO', 'Q:', 'QUESTION:', 'SK:')))
    if ':' in txt:
        prefix, rest = txt.split(':', 1)
        p_up = prefix.strip().upper()
        rest_clean = rest.strip()
        if p_up in ('T', 'T1', 'T2', 'T3', 'TABLET', 'STATUE', 'MURAL', 'MU', 'WALL ART', 'SAVE T'):
            speaker = prefix.strip() if p_up not in ('T', 'TABLET') else 'Tablet'
            return 'tablet', speaker, rest_clean, False
        if p_up.startswith('NPC') or p_up.startswith('STATUE OF') or p_up.startswith('MAIL'):
            return 'npc', prefix.strip(), rest_clean, False
        if p_up in ('SK', 'SKELETON', 'SHORTCUT'):
            return 'shortcut_hint', 'Skeleton', rest_clean, resolved
        if p_up in ('TODO', 'Q', 'QUESTION'):
            return 'todo', prefix.strip(), rest_clean, resolved
        if p_up in ('TR', 'CH', 'GATE', 'NOTE', 'BOSS', 'SHOP', 'EYE', 'MI'):
            return 'general', prefix.strip(), rest_clean, resolved
    return 'general', None, txt, False

def main():
    t0 = time.time()
    now_ms = int(t0 * 1000)

    print("Opening workbook:", XLSM_PATH)
    with zipfile.ZipFile(XLSM_PATH, 'r') as z, zipfile.ZipFile(OUTPUT_ZIP_PATH, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as out_zip:
        # 1. Load shared strings
        ss_xml = ET.fromstring(z.read('xl/sharedStrings.xml'))
        shared_strings = [''.join(t.text or '' for t in si.findall('.//main:t', NS)) for si in ss_xml.findall('main:si', NS)]

        # 2. Load RichData vm -> media image mapping
        meta_xml = ET.fromstring(z.read('xl/metadata.xml'))
        vm_blocks = meta_xml.findall('.//main:valueMetadata/main:bk', NS)
        rv_xml = ET.fromstring(z.read('xl/richData/rdrichvalue.xml'))
        rvs = list(rv_xml)
        rv_rel_xml = ET.fromstring(z.read('xl/richData/richValueRel.xml'))
        rv_rels_list = [rel.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'] for rel in rv_rel_xml]
        rv_target_map = {rel.attrib['Id']: rel.attrib['Target'] for rel in ET.fromstring(z.read('xl/richData/_rels/richValueRel.xml.rels'))}

        def vm_to_image(vm_idx_1based):
            bk = vm_blocks[vm_idx_1based - 1]
            rc = bk.find('main:rc', NS)
            rv_idx = int(rc.attrib['v'])
            rv = rvs[rv_idx]
            rel_idx = int(rv[0].text)
            rid = rv_rels_list[rel_idx]
            return 'xl/' + rv_target_map[rid].replace('../', '')

        # Helper to store WebP blobs in output zip and record metadata
        blob_meta_list = []
        media_cache = {}

        def save_webp_blob(pil_img, blob_id, max_size=(1280, 720), quality=90):
            im = pil_img.copy()
            if im.width > max_size[0] or im.height > max_size[1]:
                im.thumbnail(max_size, Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, format='WEBP', quality=quality)
            webp_bytes = buf.getvalue()
            out_zip.writestr(f"images/{blob_id}.webp", webp_bytes)
            blob_meta_list.append({
                'id': blob_id,
                'mimeType': 'image/webp',
                'width': im.width,
                'height': im.height,
                'byteSize': len(webp_bytes),
                'createdAt': now_ms,
            })
            return blob_id

        def process_room_screenshot(media_path, cell_id):
            if media_path in media_cache:
                return media_cache[media_path]
            raw_bytes = z.read(media_path)
            im = Image.open(io.BytesIO(raw_bytes)).convert('RGB')
            full_id = f"blob-full-{cell_id}"
            thumb_id = f"blob-thumb-{cell_id}"
            save_webp_blob(im, full_id, max_size=(1280, 720), quality=88)
            thumb_im = im.resize((320, 180), Image.Resampling.LANCZOS)
            save_webp_blob(thumb_im, thumb_id, max_size=(320, 180), quality=75)
            media_cache[media_path] = (full_id, thumb_id)
            return full_id, thumb_id

        # 3. Build Legend icon templates from drawing1.xml
        d1_rels = {rel.attrib['Id']: rel.attrib['Target'] for rel in ET.fromstring(z.read('xl/drawings/_rels/drawing1.xml.rels'))}
        d1 = ET.fromstring(z.read('xl/drawings/drawing1.xml'))
        legend_templates = []
        for anchor in d1.findall('xdr:twoCellAnchor', NS):
            f_col = int(anchor.find('xdr:from/xdr:col', NS).text)
            f_row = int(anchor.find('xdr:from/xdr:row', NS).text)
            cp = anchor.find('.//xdr:contentPart', NS)
            blip = anchor.find('.//a:blip', NS)
            rid = cp.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
            ink_path = 'xl/' + d1_rels[rid].replace('../', '')
            ink_xml = ET.fromstring(z.read(ink_path))
            brushes = [{p.attrib['name']: p.attrib.get('value') for p in br.findall('inkml:brushProperty', NS)} for br in ink_xml.findall('.//inkml:brush', NS)]
            traces = len(ink_xml.findall('.//inkml:trace', NS))
            png_path = 'xl/' + d1_rels[blip.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed']].replace('../', '')
            feat = extract_mask_features(z.read(png_path))
            cell_ref = f"{col_to_letter(f_col)}{f_row+1}"
            if cell_ref in LEGEND_CELL_TO_TYPE_ID and feat and (feat['w_px'] > 3 or feat['h_px'] > 3):
                legend_templates.append({
                    'ref': cell_ref,
                    'typeId': LEGEND_CELL_TO_TYPE_ID[cell_ref],
                    'color': brushes[0].get('color'),
                    'width': float(brushes[0].get('width', 0)),
                    'traces': traces,
                    'feat': feat
                })

        def match_legend_type(color, traces, feat):
            best_score = -1.0
            best_type = 'legend_question' if color == '#66CC00' else ('legend_tablet' if color == '#F6630D' else 'legend_switch')
            for tmpl in legend_templates:
                if tmpl['color'] != color:
                    continue
                g1 = feat['grid']
                g2 = tmpl['feat']['grid']
                inter = np.logical_and(g1 > 0.5, g2 > 0.5).sum()
                union = np.logical_or(g1 > 0.5, g2 > 0.5).sum()
                iou = inter / max(1.0, float(union))
                fill_diff = abs(feat['fill'] - tmpl['feat']['fill'])
                aspect_ratio = min(feat['aspect'], tmpl['feat']['aspect']) / max(0.01, max(feat['aspect'], tmpl['feat']['aspect']))
                trace_pen = 0.0 if traces == tmpl['traces'] else (0.08 if abs(traces - tmpl['traces']) == 1 else 0.22)
                score = iou * 0.55 + aspect_ratio * 0.25 + (1.0 - fill_diff) * 0.20 - trace_pen
                if score > best_score:
                    best_score = score
                    best_type = tmpl['typeId']
            return best_type, best_score

        # 4. Parse workbook sheets
        wb_xml = ET.fromstring(z.read('xl/workbook.xml'))
        wb_rels = {rel.attrib['Id']: rel.attrib['Target'] for rel in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}

        non_map_names = {'Legend', 'Tablet Images', 'General Notes', 'Comments', 'Map Template', 'Dark Star Lord Footprints'}
        map_sheet_infos = []
        sheet_by_name = {}
        for sheet in wb_xml.findall('.//main:sheet', NS):
            sname = sheet.attrib['name']
            rid = sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']
            spath = 'xl/' + wb_rels[rid]
            sheet_by_name[sname] = spath
            if sname not in non_map_names:
                map_sheet_infos.append((sname, spath))

        # 5. Build MapPage and GridCell tables
        maps_list = []
        cells_list = []
        map_by_code = {}
        map_by_fullname = {}
        cell_lookup = {} # (map_id, "$C$2") -> cell dict

        for order_idx, (sname, spath) in enumerate(map_sheet_infos):
            parts = sname.split(' ', 1)
            code_prefix = parts[0].strip()
            area_name = parts[1].strip() if len(parts) > 1 else code_prefix
            map_id = f"map-{code_prefix.lower().replace('_', '')}"

            s_xml = ET.fromstring(z.read(spath))
            max_r = 6
            max_c = 7
            raw_cells = {}
            for row in s_xml.findall('.//main:row', NS):
                for c in row.findall('main:c', NS):
                    c_idx, r_idx = parse_cell_ref(c.attrib['r'])
                    if c_idx is None:
                        continue
                    vm = c.attrib.get('vm')
                    v_el = c.find('main:v', NS)
                    val = None
                    if v_el is not None and v_el.text is not None:
                        val = shared_strings[int(v_el.text)] if c.attrib.get('t') == 's' else v_el.text
                    if vm is not None or (val is not None and str(val).strip() != ''):
                        max_r = max(max_r, r_idx)
                        max_c = max(max_c, c_idx)
                        raw_cells[(r_idx, c_idx)] = (vm, str(val).strip() if val is not None else '')

            rows_cnt = max_r + 1
            cols_cnt = max_c + 1
            map_obj = {
                'id': map_id,
                'codePrefix': code_prefix,
                'name': area_name,
                'rows': rows_cnt,
                'cols': cols_cnt,
                'order': order_idx,
                'gridArrows': [],
                'manualOutgoingMapIds': [],
                'createdAt': now_ms,
            }
            maps_list.append(map_obj)
            map_by_code[code_prefix.upper().rstrip('_')] = map_obj
            map_by_code[code_prefix.upper()] = map_obj
            map_by_fullname[sname] = map_obj

            for r_idx in range(rows_cnt):
                for c_idx in range(cols_cnt):
                    coord = format_cell_coord(r_idx, c_idx)
                    cell_id = f"cell-{map_id}-{r_idx}-{c_idx}"
                    vm, val_str = raw_cells.get((r_idx, c_idx), (None, ''))
                    state = 'empty'
                    full_blob_id = None
                    thumb_blob_id = None
                    if vm is not None:
                        state = 'room'
                        img_path = vm_to_image(int(vm))
                        full_blob_id, thumb_blob_id = process_room_screenshot(img_path, cell_id)
                    elif val_str.upper() == 'X':
                        state = 'blocked_x'

                    cell_obj = {
                        'id': cell_id,
                        'mapId': map_id,
                        'row': r_idx,
                        'col': c_idx,
                        'coord': coord,
                        'state': state,
                        'roomName': '',
                        'isCompleted': False,
                        'tags': [],
                        'markers': [],
                        'arrows': [],
                        'updatedAt': now_ms,
                    }
                    if full_blob_id:
                        cell_obj['screenshotBlobId'] = full_blob_id
                        cell_obj['thumbnailBlobId'] = thumb_blob_id
                    cells_list.append(cell_obj)
                    cell_lookup[(map_id, coord)] = cell_obj

        print(f"Processed {len(maps_list)} MapPages and {len(cells_list)} GridCells ({len(media_cache)} unique room screenshots).")

        # Helper to resolve fuzzy map prefix (e.g. 'YggA', 'IbA', 'SfA', 'Ac_', 'Hm_', 'Ds_')
        def resolve_map_code(raw_code):
            if not raw_code:
                return None
            clean = raw_code.strip().upper().rstrip('_')
            if clean in map_by_code:
                return map_by_code[clean]
            if clean == 'YGGA':
                return map_by_code.get('YGA')
            for k, m in map_by_code.items():
                if k.startswith(clean) or clean.startswith(k):
                    return m
            return None

        # 6. Parse Comments sheet (sheet19.xml) + Map Threaded Comments
        comments_list = []
        race_options_set = set()
        room_gates = defaultdict(list) # (map_id, coord) -> list of (target_map_obj, target_cell_obj, raw_gate_str)

        s19 = ET.fromstring(z.read(sheet_by_name['Comments']))
        for row_idx, row in enumerate(s19.findall('.//main:row', NS)[1:], start=2):
            vals = {}
            for c in row.findall('main:c', NS):
                col_l = ''.join(ch for ch in c.attrib['r'] if ch.isalpha())
                v = c.find('main:v', NS)
                if v is not None and v.text is not None:
                    vals[col_l] = shared_strings[int(v.text)] if c.attrib.get('t') == 's' else v.text
            sheet_name = vals.get('A', '').strip()
            raw_coord = vals.get('B', '').strip()
            room_name = vals.get('C', '').strip()
            reply_text = vals.get('D', '').strip()
            race_raw = vals.get('E', '').strip()

            map_obj = map_by_fullname.get(sheet_name) or resolve_map_code(sheet_name.split(' ')[0] if sheet_name else '')
            if not map_obj or not raw_coord:
                continue
            c_idx, r_idx = parse_cell_ref(raw_coord)
            if c_idx is None:
                continue
            coord = format_cell_coord(r_idx, c_idx)
            cell_obj = cell_lookup.get((map_obj['id'], coord))
            if cell_obj and room_name and not cell_obj['roomName']:
                cell_obj['roomName'] = room_name

            if not reply_text:
                continue

            cat_id, speaker, content_clean, is_resolved = classify_comment_text(reply_text)
            custom_fields = {}
            if race_raw:
                norm_race = normalize_race_tribe(race_raw)
                race_options_set.add(norm_race)
                custom_fields['field-race-tribe'] = norm_race

            # Check if this is a Gate comment (e.g. "Gate: AnA G4")
            if reply_text.strip().lstrip('/').upper().startswith('GATE:'):
                g_body = reply_text.split(':', 1)[1].strip()
                m_gate = re.match(r'^([A-Za-z_]+)[,\s]+([A-Za-z]+\d+)', g_body)
                t_map = None
                t_cell = None
                if m_gate:
                    t_map = resolve_map_code(m_gate.group(1))
                    tc_col, tc_row = parse_cell_ref(m_gate.group(2))
                    if t_map and tc_col is not None:
                        t_coord = format_cell_coord(tc_row, tc_col)
                        t_cell = cell_lookup.get((t_map['id'], t_coord))
                else:
                    # Try matching just map code
                    first_tok = g_body.split()[0].rstrip(',') if g_body else ''
                    t_map = resolve_map_code(first_tok)
                room_gates[(map_obj['id'], coord)].append((t_map, t_cell, g_body))

            comm_id = f"comment-{map_obj['id']}-{row_idx}"
            comm_entry = {
                'id': comm_id,
                'mapId': map_obj['id'],
                'cellId': cell_obj['id'] if cell_obj else None,
                'cellCoord': coord,
                'category': cat_id,
                'content': content_clean,
                'resolved': is_resolved,
                'attachmentBlobIds': [],
                'createdAt': now_ms,
                'updatedAt': now_ms,
            }
            if speaker:
                comm_entry['speakerOrTitle'] = speaker
            if custom_fields:
                comm_entry['customFields'] = custom_fields
            comments_list.append(comm_entry)

        # Also check map sheet threadedComments in case any room name was only in threadedComments
        for sname, spath in map_sheet_infos:
            map_obj = map_by_fullname[sname]
            s_rels_path = spath.replace('worksheets/', 'worksheets/_rels/') + '.rels'
            if s_rels_path not in z.namelist():
                continue
            s_rels = {rel.attrib['Id']: rel.attrib['Target'] for rel in ET.fromstring(z.read(s_rels_path))}
            for t in s_rels.values():
                if 'threadedComment' in t:
                    tc_path = 'xl/' + t.replace('../', '')
                    tc_xml = ET.fromstring(z.read(tc_path))
                    for tc_el in tc_xml.findall('tc:threadedComment', NS):
                        if 'parentId' not in tc_el.attrib:
                            ref = tc_el.attrib.get('ref', '')
                            c_idx, r_idx = parse_cell_ref(ref)
                            txt_el = tc_el.find('tc:text', NS)
                            if c_idx is not None and txt_el is not None and txt_el.text:
                                coord = format_cell_coord(r_idx, c_idx)
                                cell_obj = cell_lookup.get((map_obj['id'], coord))
                                if cell_obj and not cell_obj['roomName']:
                                    cell_obj['roomName'] = txt_el.text.strip()

        # 7. Parse General Notes (sheet18.xml) -> Floating Global CommentEntry records (mapId: 'global')
        s18 = ET.fromstring(z.read(sheet_by_name['General Notes']))
        current_section = 'Skulls'
        last_npc_speaker = 'NPC'
        section_headers_col_a = {
            'SKULLS:': 'Skulls',
            'JOURNAL:': 'Journal',
            'EMAIL NOTES': 'Email Notes',
            'SURFACE NOTES': 'Surface Notes',
            'OVERWORLD NPCS': 'Overworld NPCs',
        }
        section_headers_col_b = {
            'TODO:': 'General TODO',
            'THINGS I HAD TO LOOK ONLINE FOR:': 'Looked Up Online',
        }

        for r_idx, row in enumerate(s18.findall('.//main:row', NS), start=1):
            vals = {}
            for c in row.findall('main:c', NS):
                col_l = ''.join(ch for ch in c.attrib['r'] if ch.isalpha())
                v = c.find('main:v', NS)
                if v is not None and v.text is not None:
                    vals[col_l] = shared_strings[int(v.text)] if c.attrib.get('t') == 's' else v.text
            col_a = vals.get('A', '').strip()
            col_b = vals.get('B', '').strip()
            col_c = vals.get('C', '').strip()

            if col_a.upper() in section_headers_col_a and not col_b:
                current_section = section_headers_col_a[col_a.upper()]
                continue
            if col_b.upper() in section_headers_col_b and not col_a:
                current_section = section_headers_col_b[col_b.upper()]
                continue
            if not col_a and not col_b and not col_c:
                continue

            is_resolved = False
            if current_section == 'Skulls':
                cat_id = 'shortcut_hint'
                speaker = f"[Skulls] {col_a}" if col_a else "[Skulls]"
                content = col_b if col_b else col_a
            elif current_section == 'Overworld NPCs':
                cat_id = 'npc'
                if col_a:
                    last_npc_speaker = col_a
                speaker = f"[Overworld NPC] {last_npc_speaker}"
                content = col_b if col_b else col_a
            elif current_section == 'General TODO':
                cat_id = 'todo'
                speaker = '[General TODO]'
                content = f"{col_b} -> {col_c}" if col_c else col_b
                is_resolved = bool(col_c) or ('->' in col_b)
            elif current_section == 'Looked Up Online':
                cat_id = 'general'
                speaker = '[Looked Up Online]'
                content = col_b if col_b else col_a
            else:
                cat_id = 'general'
                speaker = f"[{current_section}] {col_a}" if col_a else f"[{current_section}]"
                content = col_b if col_b else col_a

            comments_list.append({
                'id': f"comment-general-notes-{r_idx}",
                'mapId': 'global',
                'cellCoord': '',
                'category': cat_id,
                'speakerOrTitle': speaker,
                'content': content,
                'resolved': is_resolved,
                'attachmentBlobIds': [],
                'createdAt': now_ms,
                'updatedAt': now_ms,
            })

        # 8. Extract & Convert All Ink Sketches on the 15 Map Sheets
        total_pins = 0
        total_intra_arrows = 0
        total_grid_arrows = 0

        for sname, spath in map_sheet_infos:
            map_obj = map_by_fullname[sname]
            map_id = map_obj['id']
            s_code = map_obj['codePrefix']
            s_rels_path = spath.replace('worksheets/', 'worksheets/_rels/') + '.rels'
            if s_rels_path not in z.namelist():
                continue
            s_rels = {rel.attrib['Id']: rel.attrib['Target'] for rel in ET.fromstring(z.read(s_rels_path))}
            drawing_files = [t for t in s_rels.values() if 'drawing' in t and t.endswith('.xml')]

            raw_sheet_inks = []
            for d_target in drawing_files:
                d_path = 'xl/' + d_target.replace('../', '')
                d_rels_path = d_path.replace('drawings/', 'drawings/_rels/') + '.rels'
                d_rels = {rel.attrib['Id']: rel.attrib['Target'] for rel in ET.fromstring(z.read(d_rels_path))} if d_rels_path in z.namelist() else {}
                d_xml = ET.fromstring(z.read(d_path))

                for idx, anchor in enumerate(d_xml.findall('xdr:twoCellAnchor', NS)):
                    cp = anchor.find('.//xdr:contentPart', NS)
                    if cp is None:
                        continue
                    f_col = int(anchor.find('xdr:from/xdr:col', NS).text)
                    f_row = int(anchor.find('xdr:from/xdr:row', NS).text)
                    f_colOff = int(anchor.find('xdr:from/xdr:colOff', NS).text)
                    f_rowOff = int(anchor.find('xdr:from/xdr:rowOff', NS).text)
                    t_col = int(anchor.find('xdr:to/xdr:col', NS).text)
                    t_row = int(anchor.find('xdr:to/xdr:row', NS).text)
                    t_colOff = int(anchor.find('xdr:to/xdr:colOff', NS).text)
                    t_rowOff = int(anchor.find('xdr:to/xdr:rowOff', NS).text)

                    ext = anchor.find('.//xdr14:xfrm/a:ext', NS)
                    cx = int(ext.attrib['cx']) if ext is not None else (t_colOff - f_colOff)
                    cy = int(ext.attrib['cy']) if ext is not None else (t_rowOff - f_rowOff)

                    # Filter tiny single-pixel stray dots
                    if cx < 15000 and cy < 15000:
                        continue

                    ink_rid = cp.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
                    ink_path = 'xl/' + d_rels[ink_rid].replace('../', '')
                    ink_xml = ET.fromstring(z.read(ink_path))
                    brushes = [{p.attrib['name']: p.attrib.get('value') for p in br.findall('inkml:brushProperty', NS)} for br in ink_xml.findall('.//inkml:brush', NS)]
                    traces_raw = [decode_inkml_trace(tr.text) for tr in ink_xml.findall('.//inkml:trace', NS) if tr.text]
                    blip = anchor.find('.//a:blip', NS)
                    png_path = 'xl/' + d_rels[blip.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed']].replace('../', '') if blip is not None else None
                    if not png_path or png_path not in z.namelist():
                        continue
                    feat = extract_mask_features(z.read(png_path))
                    if feat is None or (feat['w_px'] <= 3 and feat['h_px'] <= 3):
                        continue

                    x0 = f_col * COL_W_EMU + f_colOff
                    y0 = f_row * ROW_H_EMU + f_rowOff
                    x1 = x0 + cx
                    y1 = y0 + cy
                    center_col = max(0, min(map_obj['cols'] - 1, int(((x0 + x1) / 2) // COL_W_EMU)))
                    center_row = max(0, min(map_obj['rows'] - 1, int(((y0 + y1) / 2) // ROW_H_EMU)))
                    coord = format_cell_coord(center_row, center_col)

                    w_pct = cx / COL_W_EMU * 100.0
                    h_pct = cy / ROW_H_EMU * 100.0
                    fx_pct = max(0.0, min(100.0, ((x0 - center_col * COL_W_EMU) / COL_W_EMU) * 100.0))
                    fy_pct = max(0.0, min(100.0, ((y0 - center_row * ROW_H_EMU) / ROW_H_EMU) * 100.0))
                    cx_pct = max(2.0, min(98.0, fx_pct + w_pct / 2.0))
                    cy_pct = max(2.0, min(98.0, fy_pct + h_pct / 2.0))

                    m_type, m_score = match_legend_type(
                        brushes[0].get('color') if brushes else '#33CCFF',
                        len(traces_raw),
                        feat,
                    )
                    raw_sheet_inks.append({
                        'idx': idx,
                        'f_col': f_col, 'f_row': f_row, 't_col': t_col, 't_row': t_row,
                        'center_col': center_col, 'center_row': center_row,
                        'coord': coord,
                        'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1,
                        'cx': cx, 'cy': cy,
                        'w_pct': w_pct, 'h_pct': h_pct,
                        'fx_pct': fx_pct, 'fy_pct': fy_pct,
                        'cx_pct': cx_pct, 'cy_pct': cy_pct,
                        'color': brushes[0].get('color') if brushes else '#33CCFF',
                        'width': float(brushes[0].get('width', 0.05)) if brushes else 0.05,
                        'traces': traces_raw,
                        'trace_count': len(traces_raw),
                        'feat': feat,
                        'match_type': m_type,
                        'match_score': m_score,
                        'consumed': False,
                        'resolved_by_x': False,
                        'has_unread_tick': False,
                        'is_assigned_gate': False,
                    })

            # Group by cell to detect overlapping 'X' strokes (solved modifier), adjacent ''' ticks, and single Gate assignment
            by_cell = defaultdict(list)
            for item in raw_sheet_inks:
                by_cell[item['coord']].append(item)

            for coord, items in by_cell.items():
                # 1) Identify tiny "'" ticks (1 trace, narrow width < 3.5%, height < 13%)
                for i, tick in enumerate(items):
                    if tick['consumed']:
                        continue
                    if tick['trace_count'] == 1 and tick['w_pct'] < 3.2 and 1.5 <= tick['h_pct'] <= 12.5 and tick['feat']['aspect'] < 0.65:
                        best_host = None
                        best_dist = 15.0
                        for j, host in enumerate(items):
                            if i == j or host['consumed'] or host['color'] != tick['color']:
                                continue
                            dist = math.hypot(host['cx_pct'] - tick['cx_pct'], host['cy_pct'] - tick['cy_pct'])
                            if dist < best_dist:
                                best_dist = dist
                                best_host = host
                        if best_host is not None:
                            best_host['has_unread_tick'] = True
                            tick['consumed'] = True

                # 2) Identify overlapping 'X' strokes or 2-part overlapping green gate/seal drawings
                for i in range(len(items)):
                    for j in range(i + 1, len(items)):
                        a, b = items[i], items[j]
                        if a['consumed'] or b['consumed']:
                            continue
                        ix0 = max(a['x0'], b['x0'])
                        iy0 = max(a['y0'], b['y0'])
                        ix1 = min(a['x1'], b['x1'])
                        iy1 = min(a['y1'], b['y1'])
                        if ix1 > ix0 and iy1 > iy0:
                            inter = (ix1 - ix0) * (iy1 - iy0)
                            min_area = min(max(1, a['cx'] * a['cy']), max(1, b['cx'] * b['cy']))
                            if inter / min_area > 0.35:
                                if b['trace_count'] == 2 and b['color'] in ('#66CC00', '#33CCFF') and 0.45 <= b['feat']['aspect'] <= 2.2:
                                    a['resolved_by_x'] = True
                                    b['consumed'] = True
                                elif a['trace_count'] == 2 and a['color'] in ('#66CC00', '#33CCFF') and 0.45 <= a['feat']['aspect'] <= 2.2 and b['trace_count'] != 2:
                                    b['resolved_by_x'] = True
                                    a['consumed'] = True
                                elif a['color'] == '#66CC00' and b['color'] == '#66CC00':
                                    # Two overlapping green strokes forming a single gate/seal icon (e.g. arch + inner cross)
                                    if a['cx'] * a['cy'] >= b['cx'] * b['cy']:
                                        b['consumed'] = True
                                    else:
                                        a['consumed'] = True

                # 3) If this room has a Gate comment, assign AT MOST ONE stroke per Gate entry
                gates_in_room = room_gates.get((map_id, coord), [])
                if gates_in_room:
                    def is_line_or_arrow_stroke(it):
                        tr_c = it['trace_count']
                        w_c, h_c = it['w_pct'], it['h_pct']
                        asp = it['feat']['aspect']
                        if (it['f_col'] != it['t_col'] or it['f_row'] != it['t_row']) and (w_c > 22.0 or h_c > 28.0):
                            return True
                        if tr_c == 1 and (w_c >= 20.0 or h_c >= 22.0):
                            return True
                        if tr_c >= 3 and ((w_c < 7.0 and h_c >= 10.0 and asp < 0.85) or (h_c < 7.0 and w_c >= 12.0 and asp > 2.2)):
                            return True
                        if w_c >= 38.0 and h_c >= 35.0:
                            return True
                        return False

                    gate_candidates = [
                        it for it in items
                        if not it['consumed']
                        and it['color'] in ('#66CC00', '#33CCFF')
                        and not is_line_or_arrow_stroke(it)
                    ]
                    if gate_candidates:
                        green_gate_types = {'legend_tree_gate', 'legend_altar_gate', 'legend_reverse_gate', 'legend_seal'}
                        green_matches = [
                            it for it in gate_candidates
                            if it['color'] == '#66CC00' and it['match_type'] in green_gate_types and it['match_score'] >= 0.45
                        ]
                        if green_matches:
                            chosen_gate = max(green_matches, key=lambda it: it['match_score'])
                        else:
                            multi_trace = [it for it in gate_candidates if it['trace_count'] >= 3]
                            if multi_trace:
                                chosen_gate = max(multi_trace, key=lambda it: (it['trace_count'], -it['match_score']))
                            else:
                                chosen_gate = gate_candidates[0]

                        chosen_gate['is_assigned_gate'] = True
                        # Consume any extra handwritten area-code text strokes (tr >= 4, low legend similarity) in this gate room
                        for other in gate_candidates:
                            if other is not chosen_gate and other['trace_count'] >= 4 and other['match_score'] < 0.48:
                                other['consumed'] = True

            # Now convert each remaining ink object into MapGridArrow, VectorArrow, or PinMarker
            for item in raw_sheet_inks:
                if item['consumed']:
                    continue

                coord = item['coord']
                cell_obj = cell_lookup.get((map_id, coord))
                if not cell_obj:
                    continue

                c = item['color']
                tr = item['trace_count']
                w = item['w_pct']
                h = item['h_pct']
                feat = item['feat']
                aspect = feat['aspect']

                # Case 1: Cross-Cell Arrow / Path spanning two different cells significantly
                if (item['f_col'] != item['t_col'] or item['f_row'] != item['t_row']) and (w > 22.0 or h > 28.0):
                    fc = max(0, min(map_obj['cols'] - 1, item['f_col']))
                    fr = max(0, min(map_obj['rows'] - 1, item['f_row']))
                    tc = max(0, min(map_obj['cols'] - 1, item['t_col']))
                    tr_row = max(0, min(map_obj['rows'] - 1, item['t_row']))
                    from_coord = format_cell_coord(fr, fc)
                    to_coord = format_cell_coord(tr_row, tc)
                    from_cell = cell_lookup.get((map_id, from_coord))
                    to_cell = cell_lookup.get((map_id, to_coord))
                    if from_cell and to_cell and from_cell['id'] != to_cell['id']:
                        # Check if it's a border divider line rather than a cross-cell arrow
                        if tr == 1 and ((w < 4.0 and h > 20.0) or (h < 4.5 and w > 20.0)):
                            # Render as an arrowless divider line inside the primary cell
                            pts = [
                                {'xPercent': round(max(1.0, min(99.0, item['fx_pct'])), 1), 'yPercent': round(max(1.0, min(99.0, item['fy_pct'])), 1)},
                                {'xPercent': round(max(1.0, min(99.0, item['fx_pct'] + w)), 1), 'yPercent': round(max(1.0, min(99.0, item['fy_pct'] + h)), 1)},
                            ]
                            cell_obj['arrows'].append({
                                'id': f"arrow-{map_id}-{item['idx']}",
                                'points': pts,
                                'color': c,
                                'bidirectional': False,
                                'dashed': False,
                                'hasArrowhead': False,
                            })
                            total_intra_arrows += 1
                            continue

                        map_obj['gridArrows'].append({
                            'id': f"grid-arrow-{map_id}-{item['idx']}",
                            'fromCellId': from_cell['id'],
                            'toCellId': to_cell['id'],
                            'color': c,
                            'bidirectional': tr >= 3,
                            'dashed': False,
                        })
                        total_grid_arrows += 1
                        continue

                # Helper to sample 2..5 percentage points along the longest InkML trace
                def build_trace_points(traces_list):
                    if not traces_list:
                        return [
                            {'xPercent': round(item['fx_pct'], 1), 'yPercent': round(item['fy_pct'], 1)},
                            {'xPercent': round(min(99.0, item['fx_pct'] + w), 1), 'yPercent': round(min(99.0, item['fy_pct'] + h), 1)},
                        ]
                    all_pts = [p for t in traces_list for p in t]
                    min_x = min(p[0] for p in all_pts)
                    max_x = max(p[0] for p in all_pts)
                    min_y = min(p[1] for p in all_pts)
                    max_y = max(p[1] for p in all_pts)
                    span_x = max(1.0, max_x - min_x)
                    span_y = max(1.0, max_y - min_y)
                    # Pick the main (longest) trace
                    main_tr = max(traces_list, key=lambda t: len(t))
                    n = len(main_tr)
                    sample_indices = [0, n // 3, (2 * n) // 3, n - 1] if n >= 12 else [0, n - 1]
                    res_pts = []
                    for s_i in sample_indices:
                        px, py = main_tr[s_i]
                        xp = item['fx_pct'] + ((px - min_x) / span_x) * w
                        yp = item['fy_pct'] + ((py - min_y) / span_y) * h
                        pt = {'xPercent': round(max(1.0, min(99.0, xp)), 1), 'yPercent': round(max(1.0, min(99.0, yp)), 1)}
                        if not res_pts or (abs(res_pts[-1]['xPercent'] - pt['xPercent']) > 1.0 or abs(res_pts[-1]['yPercent'] - pt['yPercent']) > 1.0):
                            res_pts.append(pt)
                    if len(res_pts) < 2:
                        res_pts.append({'xPercent': round(min(99.0, item['fx_pct'] + w), 1), 'yPercent': round(min(99.0, item['fy_pct'] + h), 1)})
                    return res_pts

                # Case 2: Long Plain Divider / Barrier / Corridor Lines (Bucket 1B: tr == 1 and span >= 20%)
                if tr == 1 and c in ('#33CCFF', '#66CC00') and (w >= 20.0 or h >= 22.0):
                    cell_obj['arrows'].append({
                        'id': f"line-{map_id}-{item['idx']}",
                        'points': build_trace_points(item['traces']),
                        'color': c,
                        'bidirectional': False,
                        'dashed': False,
                        'hasArrowhead': False,
                    })
                    total_intra_arrows += 1
                    continue

                # Case 3: Dashed Horizontal/Vertical Lines (tr >= 3 and narrow vertical/horizontal span)
                if not item['is_assigned_gate'] and tr >= 3 and c in ('#33CCFF', '#66CC00') and (
                    (w < 7.0 and h >= 10.0 and aspect < 0.85) or
                    (h < 7.0 and w >= 12.0 and aspect > 2.2) or
                    ((aspect > 3.5 or aspect < 0.25) and (w > 18.0 or h > 18.0))
                ):
                    pts = [
                        {'xPercent': round(max(1.0, item['fx_pct']), 1), 'yPercent': round(item['cy_pct'], 1)},
                        {'xPercent': round(min(99.0, item['fx_pct'] + w), 1), 'yPercent': round(item['cy_pct'], 1)},
                    ] if aspect > 1.0 else [
                        {'xPercent': round(item['cx_pct'], 1), 'yPercent': round(max(1.0, item['fy_pct']), 1)},
                        {'xPercent': round(item['cx_pct'], 1), 'yPercent': round(min(99.0, item['fy_pct'] + h), 1)},
                    ]
                    cell_obj['arrows'].append({
                        'id': f"dashed-{map_id}-{item['idx']}",
                        'points': pts,
                        'color': c,
                        'bidirectional': False,
                        'dashed': True,
                        'hasArrowhead': False,
                    })
                    total_intra_arrows += 1
                    continue

                # Case 4: Directional Intra-Room Arrows (2..8 traces, large span)
                if not item['is_assigned_gate'] and c in ('#33CCFF', '#66CC00') and (
                    (2 <= tr <= 5 and (w > 20.0 or h > 30.0)) or
                    (tr >= 6 and w >= 38.0 and h >= 35.0)
                ):
                    cell_obj['arrows'].append({
                        'id': f"arrow-{map_id}-{item['idx']}",
                        'points': build_trace_points(item['traces']),
                        'color': c,
                        'bidirectional': False,
                        'dashed': tr >= 6,
                        'hasArrowhead': True,
                    })
                    total_intra_arrows += 1
                    continue

                # Case 5: Point Icons & Handwritten Gate/Boss Labels -> PinMarker
                type_id, score = item['match_type'], item['match_score']
                short_label = ''
                target_map_id = None
                target_cell_id = None
                resolved = item['resolved_by_x']

                # Check if this item was chosen as the room's Gate marker
                if item['is_assigned_gate']:
                    gates_in_room = room_gates.get((map_id, coord), [])
                    t_map, t_cell, g_body = gates_in_room[0]
                    if c == '#66CC00' and type_id in ('legend_tree_gate', 'legend_altar_gate', 'legend_reverse_gate'):
                        pass
                    elif c == '#66CC00':
                        type_id = 'legend_tree_gate'
                    else:
                        type_id = 'warp_door'
                    if t_map and t_cell:
                        target_map_id = t_map['id']
                        target_cell_id = t_cell['id']
                        short_label = f"-> {t_map['codePrefix']} {t_cell['coord']}"
                    else:
                        short_label = f"-> {g_body}"

                # Special rule for HmB orange "S" / "S'" Statues
                elif s_code == 'HmB' and c == '#F6630D' and (tr >= 2 or item['has_unread_tick']):
                    type_id = 'legend_statue'
                    short_label = "S'" if (tr >= 2 or item['has_unread_tick']) else 'S'

                # Special rule for Bucket 1A short lines (<20% span, 1 trace)
                elif tr == 1 and c == '#33CCFF' and ((w < 3.5 and h >= 5.0) or (h < 4.0 and w >= 5.0)):
                    if feat['fill'] > 0.30 and w >= 1.8:
                        type_id = 'legend_breakable_wall'
                    else:
                        type_id = 'legend_switch_door'

                # Multi-stroke green Boss label in rooms without a gate
                elif tr >= 4 and c == '#66CC00' and w > 18.0 and aspect > 1.2:
                    type_id = 'legend_boss'
                    if tr >= 5:
                        resolved = True

                if item['has_unread_tick'] and not short_label:
                    short_label = "'"

                pin_obj = {
                    'id': f"pin-{map_id}-{item['idx']}",
                    'xPercent': round(item['cx_pct'], 1),
                    'yPercent': round(item['cy_pct'], 1),
                    'typeId': type_id,
                    'color': MARKER_COLOR_BY_ID.get(type_id, c),
                    'resolved': resolved,
                }
                if short_label:
                    pin_obj['shortLabel'] = short_label
                if target_map_id:
                    pin_obj['targetMapId'] = target_map_id
                if target_cell_id:
                    pin_obj['targetCellId'] = target_cell_id
                    pin_obj['isBidirectionalWarp'] = True

                cell_obj['markers'].append(pin_obj)
                total_pins += 1

        print(f"Converted sketches into {total_pins} PinMarkers, {total_intra_arrows} VectorArrows/Lines, and {total_grid_arrows} MapGridArrows.")

        # 9. Process `Tablet Images` (sheet17.xml) -> Cross-link to room tablet comments or fallback SketchNotes
        sketches_list = []
        s17_path = sheet_by_name['Tablet Images']
        s17 = ET.fromstring(z.read(s17_path))
        s17_rels = {rel.attrib['Id']: rel.attrib['Target'] for rel in ET.fromstring(z.read(s17_path.replace('worksheets/', 'worksheets/_rels/') + '.rels'))}
        
        # Load threaded comments on Tablet Images
        s17_tc = {}
        for t in s17_rels.values():
            if 'threadedComment' in t:
                tc_xml = ET.fromstring(z.read('xl/' + t.replace('../', '')))
                for tc_el in tc_xml.findall('tc:threadedComment', NS):
                    ref = tc_el.attrib.get('ref', '')
                    txt_el = tc_el.find('tc:text', NS)
                    if txt_el is not None and txt_el.text:
                        s17_tc[ref] = txt_el.text.strip()

        # Load ink overlays on Tablet Images (drawing17.xml) grouped by cell ref
        s17_inks = defaultdict(list)
        for t in s17_rels.values():
            if 'drawing' in t and t.endswith('.xml'):
                d17_path = 'xl/' + t.replace('../', '')
                d17_rels = {rel.attrib['Id']: rel.attrib['Target'] for rel in ET.fromstring(z.read(d17_path.replace('drawings/', 'drawings/_rels/') + '.rels'))}
                d17 = ET.fromstring(z.read(d17_path))
                for anchor in d17.findall('xdr:twoCellAnchor', NS):
                    f_col = int(anchor.find('xdr:from/xdr:col', NS).text)
                    f_row = int(anchor.find('xdr:from/xdr:row', NS).text)
                    f_colOff = int(anchor.find('xdr:from/xdr:colOff', NS).text)
                    f_rowOff = int(anchor.find('xdr:from/xdr:rowOff', NS).text)
                    ext = anchor.find('.//xdr14:xfrm/a:ext', NS)
                    cx = int(ext.attrib['cx']) if ext is not None else 100000
                    cy = int(ext.attrib['cy']) if ext is not None else 100000
                    blip = anchor.find('.//a:blip', NS)
                    if blip is not None:
                        png_p = 'xl/' + d17_rels[blip.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed']].replace('../', '')
                        s17_inks[f"{col_to_letter(f_col)}{f_row+1}"].append((f_colOff, f_rowOff, cx, cy, png_p))

        # Parse column headers in Row 1 of Tablet Images
        col_area_map = {}
        rows_s17 = s17.findall('.//main:row', NS)
        for c in rows_s17[0].findall('main:c', NS):
            col_l = ''.join(ch for ch in c.attrib['r'] if ch.isalpha())
            v = c.find('main:v', NS)
            if v is not None and v.text is not None:
                area_str = shared_strings[int(v.text)] if c.attrib.get('t') == 's' else v.text
                col_area_map[col_l] = area_str.strip()

        linked_tablets_cnt = 0
        unlinked_tablets_cnt = 0
        for row in rows_s17[1:]:
            for c in row.findall('main:c', NS):
                if 'vm' not in c.attrib:
                    continue
                ref = c.attrib['r']
                col_l = ''.join(ch for ch in ref if ch.isalpha())
                area_code = col_area_map.get(col_l, '')
                target_map = resolve_map_code(area_code)
                tc_note = s17_tc.get(ref, '').strip()

                # Render the tablet image + any ink drawn on top of it
                img_path = vm_to_image(int(c.attrib['vm']))
                base_im = Image.open(io.BytesIO(z.read(img_path))).convert('RGBA').resize((640, 360), Image.Resampling.LANCZOS)
                for (f_x, f_y, icx, icy, ipng) in s17_inks.get(ref, []):
                    if ipng in z.namelist():
                        ink_im = Image.open(io.BytesIO(z.read(ipng))).convert('RGBA')
                        pw = max(6, int(icx / COL_W_EMU * 640))
                        ph = max(6, int(icy / ROW_H_EMU * 360))
                        ink_im = ink_im.resize((pw, ph), Image.Resampling.LANCZOS)
                        px = max(0, min(640 - pw, int(f_x / COL_W_EMU * 640)))
                        py = max(0, min(360 - ph, int(f_y / ROW_H_EMU * 360)))
                        base_im.alpha_composite(ink_im, (px, py))

                blob_id = f"blob-tablet-sheet17-{ref.lower()}"
                save_webp_blob(base_im.convert('RGB'), blob_id, max_size=(960, 540), quality=88)

                # Try to parse a room coordinate from tc_note (e.g. "D4 T1", "B5", "C2")
                m_coord = re.match(r'^([A-Ia-i]\d+)(?:\s+(T\d+))?$', tc_note)
                if m_coord and target_map:
                    tc_col, tc_row = parse_cell_ref(m_coord.group(1))
                    t_num = m_coord.group(2) # e.g. "T1", "T2"
                    coord_str = format_cell_coord(tc_row, tc_col)
                    # Find matching tablet comment in that room
                    room_comms = [cm for cm in comments_list if cm['mapId'] == target_map['id'] and cm['cellCoord'] == coord_str]
                    tablet_comms = [cm for cm in room_comms if cm['category'] == 'tablet']
                    chosen_comm = None
                    if t_num and tablet_comms:
                        idx_t = max(0, int(t_num[1:]) - 1)
                        chosen_comm = tablet_comms[idx_t] if idx_t < len(tablet_comms) else tablet_comms[0]
                    elif tablet_comms:
                        chosen_comm = tablet_comms[0]
                    elif room_comms:
                        chosen_comm = room_comms[0]

                    if chosen_comm:
                        chosen_comm['attachmentBlobIds'].append(blob_id)
                    else:
                        # Create a tablet comment in that room holding the tablet screenshot
                        t_cell = cell_lookup.get((target_map['id'], coord_str))
                        comments_list.append({
                            'id': f"comment-tablet-img-{ref.lower()}",
                            'mapId': target_map['id'],
                            'cellId': t_cell['id'] if t_cell else None,
                            'cellCoord': coord_str,
                            'category': 'tablet',
                            'speakerOrTitle': f"Unread / Symbol Tablet ({tc_note})",
                            'content': f"Migrated from Tablet Images tab ({area_code} column, cell {ref}).",
                            'resolved': False,
                            'attachmentBlobIds': [blob_id],
                            'createdAt': now_ms,
                            'updatedAt': now_ms,
                        })
                    linked_tablets_cnt += 1
                else:
                    # Save as SketchNote with clear flag that it is an unlinked tablet image
                    note_label = tc_note if tc_note else "Coordinate unknown"
                    sketches_list.append({
                        'id': f"sketch-unlinked-tablet-{ref.lower()}",
                        'title': f"[Unlinked Tablet Image] {area_code} ({ref}) — {note_label}",
                        'description': f"Tablet screenshot from 'Tablet Images' tab (Column {area_code}, Cell {ref}). Original note: '{note_label}'. Flagged because exact room/tablet coordinate was not specified.",
                        'mapId': target_map['id'] if target_map else None,
                        'imageBlobId': blob_id,
                        'createdAt': now_ms,
                        'updatedAt': now_ms,
                    })
                    unlinked_tablets_cnt += 1

        print(f"Processed Tablet Images tab: {linked_tablets_cnt} cross-linked to room comments, {unlinked_tablets_cnt} saved as flagged SketchNotes.")

        # 10. Process `Dark Star Lord Footprints` (sheet12.xml) -> Composite SketchNote
        s12_path = sheet_by_name['Dark Star Lord Footprints']
        s12 = ET.fromstring(z.read(s12_path))
        s12_rels = {rel.attrib['Id']: rel.attrib['Target'] for rel in ET.fromstring(z.read(s12_path.replace('worksheets/', 'worksheets/_rels/') + '.rels'))}
        s12_tc = {}
        for t in s12_rels.values():
            if 'threadedComment' in t:
                tc_xml = ET.fromstring(z.read('xl/' + t.replace('../', '')))
                for tc_el in tc_xml.findall('tc:threadedComment', NS):
                    ref = tc_el.attrib.get('ref', '')
                    txt_el = tc_el.find('tc:text', NS)
                    if txt_el is not None and txt_el.text:
                        s12_tc[ref] = txt_el.text.strip()

        # Render 8x4 grid composite of Dark Star Lord Footprints (320x180 per cell -> 2560x720 scaled to 1600x600)
        dsl_w, dsl_h = 240, 135
        dsl_canvas = Image.new('RGBA', (8 * dsl_w, 4 * dsl_h), (15, 23, 42, 255))
        dsl_draw = ImageDraw.Draw(dsl_canvas)
        dsl_notes_lines = ["Dark Star Lord Footprints Grid Clues:"]
        for row in s12.findall('.//main:row', NS):
            for c in row.findall('main:c', NS):
                ref = c.attrib['r']
                c_idx, r_idx = parse_cell_ref(ref)
                if c_idx is None or c_idx >= 8 or r_idx >= 4:
                    continue
                tx, ty = c_idx * dsl_w, r_idx * dsl_h
                if 'vm' in c.attrib:
                    im_p = vm_to_image(int(c.attrib['vm']))
                    im_cell = Image.open(io.BytesIO(z.read(im_p))).convert('RGBA').resize((dsl_w, dsl_h), Image.Resampling.LANCZOS)
                    dsl_canvas.alpha_composite(im_cell, (tx, ty))
                dsl_draw.rectangle([tx, ty, tx + dsl_w - 1, ty + dsl_h - 1], outline=(51, 65, 85, 255), width=1)
                clue = s12_tc.get(ref, '')
                dsl_draw.rectangle([tx + 2, ty + 2, tx + dsl_w - 2, ty + 20], fill=(2, 6, 23, 210))
                dsl_draw.text((tx + 5, ty + 4), f"{ref}: {clue[:28]}", fill=(251, 191, 36, 255))
                if clue:
                    dsl_notes_lines.append(f"• {ref}: {clue}")

        dsl_blob_id = "blob-sketch-dark-star-lord-footprints"
        save_webp_blob(dsl_canvas.convert('RGB'), dsl_blob_id, max_size=(1600, 900), quality=90)
        dsb_map = resolve_map_code('DsB')
        sketches_list.insert(0, {
            'id': 'sketch-dark-star-lord-footprints',
            'title': 'Dark Star Lord Footprints Puzzle Grid',
            'description': '\n'.join(dsl_notes_lines),
            'mapId': dsb_map['id'] if dsb_map else None,
            'imageBlobId': dsl_blob_id,
            'createdAt': now_ms,
            'updatedAt': now_ms,
        })

        # Also check if there is a floating picture in drawing12.xml (Dark Star Lord Footprints)
        for t in s12_rels.values():
            if 'drawing' in t and t.endswith('.xml'):
                d12_path = 'xl/' + t.replace('../', '')
                d12_rels = {rel.attrib['Id']: rel.attrib['Target'] for rel in ET.fromstring(z.read(d12_path.replace('drawings/', 'drawings/_rels/') + '.rels'))}
                d12 = ET.fromstring(z.read(d12_path))
                for anchor in d12.findall('xdr:twoCellAnchor', NS):
                    pic = anchor.find('xdr:pic', NS)
                    if pic is not None:
                        blip = pic.find('.//a:blip', NS)
                        if blip is not None:
                            p_img = 'xl/' + d12_rels[blip.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed']].replace('../', '')
                            if p_img in z.namelist():
                                diagram_im = Image.open(io.BytesIO(z.read(p_img))).convert('RGB')
                                diag_blob_id = "blob-sketch-dsl-diagram"
                                save_webp_blob(diagram_im, diag_blob_id, max_size=(1280, 720), quality=90)
                                sketches_list.insert(1, {
                                    'id': 'sketch-dsl-diagram',
                                    'title': 'Dark Star Lord Footprints — Reference Diagram',
                                    'description': 'Floating reference image extracted from the Dark Star Lord Footprints worksheet.',
                                    'mapId': dsb_map['id'] if dsb_map else None,
                                    'imageBlobId': diag_blob_id,
                                    'createdAt': now_ms,
                                    'updatedAt': now_ms,
                                })

        # 11. Build ProjectConfig and write project-data.json
        config_obj = {
            'id': 'singleton',
            'projectTitle': 'La-Mulana 2 Expedition Log (Migrated)',
            'markerDefinitions': MARKER_DEFINITIONS,
            'commentCategories': COMMENT_CATEGORIES,
            'roomFlagOptions': ['Save Point', 'Ankh', 'Boss / Guardian', 'Shop', 'Soul Gate', 'Bust of Mimir'],
            'customCommentFields': [
                {
                    'id': 'field-race-tribe',
                    'name': 'Race / Tribe',
                    'type': 'select',
                    'options': sorted(race_options_set),
                    'showInTable': True,
                    'filterable': True,
                }
            ],
            'updatedAt': now_ms,
        }

        payload = sanitize_migrated_payload({
            'version': 1,
            'exportedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(t0)),
            'config': config_obj,
            'maps': maps_list,
            'cells': cells_list,
            'comments': comments_list,
            'sketches': sketches_list,
            'blobMeta': blob_meta_list,
        })

        out_zip.writestr('project-data.json', json.dumps(payload, indent=2))

    elapsed = time.time() - t0
    zip_size_mb = os.path.getsize(OUTPUT_ZIP_PATH) / (1024 * 1024)
    print(f"\nMigration complete in {elapsed:.1f}s!")
    print(f"Output archive: {OUTPUT_ZIP_PATH} ({zip_size_mb:.2f} MB)")
    print(f"  Maps: {len(maps_list)}")
    print(f"  Cells: {len(cells_list)}")
    print(f"  Comments: {len(comments_list)}")
    print(f"  Sketches: {len(sketches_list)}")
    print(f"  WebP Blobs: {len(blob_meta_list)}")

if __name__ == '__main__':
    main()
