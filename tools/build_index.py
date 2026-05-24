from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import shutil
import unicodedata
from dataclasses import dataclass
from pathlib import Path

import fitz
import pdfplumber
from fontTools import subset as font_subset
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SITE_DIR = ROOT / "site"
DATA_DIR = SITE_DIR / "data"
GLYPH_DIR = SITE_DIR / "assets" / "glyphs"
FONT_DIR = SITE_DIR / "assets" / "fonts"
FONT_CSS = FONT_DIR / "fonts.css"
INLINE_GLYPH_DIR = SITE_DIR / "assets" / "inline-glyphs"
INLINE_GLYPH_JSON = DATA_DIR / "inline_glyphs.json"
CID_GLYPH_DIR = SITE_DIR / "assets" / "cid-glyphs"
CID_GLYPH_JSON = DATA_DIR / "cid_glyphs.json"
RARE_FONT_UNICODE_RANGE = (
    "U+3400-4DBF, "
    "U+20000-2A6DF, U+2A700-2B73F, U+2B740-2B81F, U+2B820-2CEAF, "
    "U+2CEB0-2EBEF, U+2EBF0-2EE5F, U+30000-3134F, U+31350-323AF, "
    "U+E000-F8FF, U+F0000-FFFFD, U+100000-10FFFD"
)
RARE_FALLBACK_FONT_CANDIDATES = [
    Path(r"C:\Windows\Fonts\simsunb.ttf"),
    Path(r"C:\Windows\Fonts\NotoSerifSC-VF.ttf"),
    Path(r"C:\Windows\Fonts\NotoSansSC-VF.ttf"),
]

PDF_ORDER = {
    "正文": 0,
    "合文": 1,
    "單一族徽": 2,
    "複合族徽": 3,
}

PERIOD_ORDER = [
    "商代",
    "商代早期",
    "商代中期",
    "商代晚期",
    "西周",
    "西周早期",
    "西周中期",
    "西周晚期",
    "春秋",
    "春秋早期",
    "春秋中期",
    "春秋晚期",
    "戰國",
    "戰國早期",
    "戰國中期",
    "戰國晚期",
    "秦代",
    "漢代",
]
PERIODS = PERIOD_ORDER
PERIOD_RANK = {period: index for index, period in enumerate(PERIOD_ORDER)}

PERIOD_RE = re.compile(
    "(" + "|".join(re.escape(item) for item in sorted(PERIODS, key=len, reverse=True)) + r")$"
)
SOURCE_RE = re.compile(r"(集成|銘圖|銘三|銘續|銘補|近出|新收|\d)")
CID_RE = re.compile(r"\(cid:\d+\)")
IDS_OPERATORS = set("⿰⿱⿲⿳⿴⿵⿶⿷⿸⿹⿺⿻㇯")
IDS_PUNCT = set("#{}();.,ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789[]<>/\\|:-_+=")

TEXT_FIXES = {
    "(cid:19342)": "集",
    "(cid:19269)": "陽",
    "(cid:4599)": "師",
    "(cid:6893)": "春",
    "(cid:6946)": "晚",
}
PERIOD_TEXT_FIXES = {
    "(cid:6893)": "春",
    "(cid:6946)": "晚",
}


@dataclass(frozen=True)
class Segment:
    text: str
    x0: float
    x1: float
    top: float
    bottom: float


@dataclass(frozen=True)
class Marker:
    top: float
    index: str | None
    main: str | None
    sub: str | None
    kind: str


@dataclass(frozen=True)
class PairedText:
    title: str
    period: str
    source: str
    title_top: float
    title_x0: float


@dataclass(frozen=True)
class ImageBlock:
    bbox: tuple[float, float, float, float]
    image_bytes: bytes
    ext: str
    number: int


def clean_text(value: str) -> str:
    for source, target in TEXT_FIXES.items():
        value = (value or "").replace(source, target)
    return re.sub(r"\s+", " ", value or "").strip()


def classify_pdf(path: Path) -> str:
    name = path.name
    if "正文" in name:
        return "正文"
    if "合文" in name:
        return "合文"
    if "單一" in name or "单一" in name:
        return "單一族徽"
    if "複合" in name or "复合" in name:
        return "複合族徽"
    return path.stem


def discover_pdfs() -> list[Path]:
    pdfs = [path for path in ROOT.glob("*.pdf") if path.is_file()]
    return sorted(pdfs, key=lambda path: (PDF_ORDER.get(classify_pdf(path), 99), path.name))


def load_ids_map() -> dict[str, str]:
    ids_map: dict[str, str] = {}
    for file_name in ("ids_lv0.txt", "ids_lv1.txt", "ids_lv2.txt"):
        path = ROOT / file_name
        if not path.exists():
            continue
        with path.open("r", encoding="utf-8-sig", errors="replace") as handle:
            for line in handle:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                parts = line.split("\t")
                if len(parts) < 2:
                    continue
                char, ids = parts[0], parts[1]
                if char and ids:
                    ids_map[char] = ids
    return ids_map


def is_manual_ids_token(token: str, ids_map: dict[str, str]) -> bool:
    if not token:
        return False
    if CID_RE.fullmatch(token):
        return True
    if len(token) != 1:
        return False
    if token in ids_map:
        return False
    category = unicodedata.category(token)
    return category in {"Co", "Cn", "Cs"} or token == "\ufffd"


def iter_text_tokens(text: str):
    for cid in CID_RE.findall(text or ""):
        yield cid
    text = CID_RE.sub("", text or "")
    for char in text:
        if not char.isspace():
            yield char


def group_segments(page: pdfplumber.page.Page) -> list[Segment]:
    chars = [char for char in page.chars if char.get("text") and char.get("text") != "\x00"]
    chars.sort(key=lambda char: (char["top"], char["x0"]))
    lines: list[dict] = []

    for char in chars:
        placed = False
        for line in lines:
            if abs(char["top"] - line["top"]) < 2.5:
                line["chars"].append(char)
                line["top"] = min(line["top"], char["top"])
                line["bottom"] = max(line["bottom"], char["bottom"])
                placed = True
                break
        if not placed:
            lines.append({"top": char["top"], "bottom": char["bottom"], "chars": [char]})

    segments: list[Segment] = []
    for line in lines:
        line_chars = sorted(line["chars"], key=lambda char: char["x0"])
        current: list[dict] = []
        last_x1: float | None = None

        for char in line_chars:
            gap = 0 if last_x1 is None else char["x0"] - last_x1
            if current and gap > 18:
                segment = make_segment(current)
                if segment:
                    segments.append(segment)
                current = []
            current.append(char)
            last_x1 = char["x1"]

        segment = make_segment(current)
        if segment:
            segments.append(segment)

    return sorted(segments, key=lambda seg: (seg.top, seg.x0))


def make_segment(chars: list[dict]) -> Segment | None:
    text = clean_text("".join(char.get("text", "") for char in chars))
    if not text:
        return None
    return Segment(
        text=text,
        x0=min(char["x0"] for char in chars),
        x1=max(char["x1"] for char in chars),
        top=min(char["top"] for char in chars),
        bottom=max(char["bottom"] for char in chars),
    )


def line_groups(page: pdfplumber.page.Page, max_x: float = 150, y_tolerance: float = 10) -> list[dict]:
    chars = [
        char
        for char in page.chars
        if char.get("text")
        and not char.get("text", "").isspace()
        and char["x0"] < max_x
        and 55 < char["top"] < 770
    ]
    chars.sort(key=lambda char: (char["top"], char["x0"]))

    lines: list[dict] = []
    for char in chars:
        center = (char["top"] + char["bottom"]) / 2
        placed = False
        for line in lines:
            if abs(center - line["center"]) < y_tolerance:
                line["chars"].append(char)
                line["top"] = min(line["top"], char["top"])
                line["bottom"] = max(line["bottom"], char["bottom"])
                line["center"] = (line["top"] + line["bottom"]) / 2
                placed = True
                break
        if not placed:
            lines.append({"top": char["top"], "bottom": char["bottom"], "center": center, "chars": [char]})
    return lines


def head_markers(page: pdfplumber.page.Page, pdf_kind: str) -> list[Marker]:
    markers: list[Marker] = []

    for line in line_groups(page):
        chars = sorted(line["chars"], key=lambda char: char["x0"])
        joined = "".join(char["text"] for char in chars if not char["text"].isspace())
        if not joined:
            continue
        if "金文字形" in joined or (line["top"] < 170 and "編" in joined):
            continue

        if pdf_kind == "正文":
            index = marker_index_text(chars, 60)
            main = "".join(
                char["text"]
                for char in chars
                if 58 <= char["x0"] < 92 and not char["text"].isspace() and not is_marker_index_char(char["text"])
            )
            main = clean_text(main)
            sub = clean_text(
                "".join(char["text"] for char in chars if 92 <= char["x0"] < 145 and not char["text"].isspace())
            )
            if index and main:
                markers.append(Marker(line["top"], index, main, sub or main, "main"))
            elif sub and not index and not main:
                markers.append(Marker(line["top"], None, None, sub, "sub"))
        elif pdf_kind in {"合文", "複合族徽"}:
            index = marker_index_text(chars, 60)
            head = "".join(
                char["text"]
                for char in chars
                if 58 <= char["x0"] < 150 and not char["text"].isspace() and not is_marker_index_char(char["text"])
            )
            head = clean_text(head)
            if index and head:
                markers.append(Marker(line["top"], index, head, head, "main"))
        elif pdf_kind == "單一族徽":
            index = marker_index_text(chars, 90)
            non_digit = "".join(
                char["text"]
                for char in chars
                if char["x0"] < 145 and not is_marker_index_char(char["text"]) and not char["text"].isspace()
            )
            if index and not non_digit:
                label = f"單一族徽第{index}組"
                markers.append(Marker(line["top"], index, label, label, "main"))

    return sorted(markers, key=lambda marker: marker.top)


def is_marker_index_char(text: str) -> bool:
    return text.isdigit() or text in {".", "．"}


def marker_index_text(chars: list[dict], max_x: float) -> str:
    pieces = []
    for char in chars:
        text = char["text"]
        if char["x0"] >= max_x or not is_marker_index_char(text):
            continue
        pieces.append("." if text == "．" else text)
    return "".join(pieces).strip(".")


def image_blocks(doc: fitz.Document, page_index: int) -> list[ImageBlock]:
    raw = doc[page_index].get_text("rawdict")
    blocks: list[ImageBlock] = []
    for block in raw.get("blocks", []):
        if block.get("type") != 1:
            continue
        x0, y0, x1, y1 = block["bbox"]
        width, height = x1 - x0, y1 - y0
        if width < 10 or height < 10:
            continue
        if not (50 < y0 < 770 and 70 < x0 < 540):
            continue
        blocks.append(
            ImageBlock(
                bbox=(float(x0), float(y0), float(x1), float(y1)),
                image_bytes=block["image"],
                ext=block.get("ext", "png"),
                number=int(block.get("number", len(blocks))),
            )
        )
    return sorted(blocks, key=lambda block: (block.bbox[1], block.bbox[0]))


def pair_image_to_text(
    image: ImageBlock,
    segments: list[Segment],
    page_width: float,
) -> PairedText | None:
    x0, y0, x1, y1 = image.bbox
    left_column = x0 < page_width / 2
    if left_column:
        candidates = [
            seg
            for seg in segments
            if seg.x0 >= x1 + 3 and seg.x0 < 335 and y0 - 12 <= seg.top <= y1 + 8
        ]
    else:
        candidates = [seg for seg in segments if seg.x0 >= x1 + 3 and y0 - 12 <= seg.top <= y1 + 8]

    def title_rank(seg: Segment):
        has_period = any(period in seg.text for period in PERIODS)
        return (0 if has_period else 1, abs(seg.top - (y0 + 8)), seg.x0)

    candidates = sorted(candidates, key=title_rank)
    if not candidates:
        return None

    title_seg = candidates[0]
    title = title_seg.text
    source = ""

    below = sorted(
        [
            seg
            for seg in segments
            if abs(seg.x0 - title_seg.x0) < 14 and title_seg.bottom < seg.top < y1 + 40
        ],
        key=lambda seg: seg.top,
    )

    for seg in below:
        if title.endswith("戰國") and seg.text in {"早期", "中期", "晚期"}:
            title += seg.text
            continue
        if SOURCE_RE.search(seg.text):
            source = seg.text
            break

    name, period = split_title_period(title)
    if not name and not period:
        return None
    return PairedText(name, period, source, title_seg.top, title_seg.x0)


def split_title_period(title: str) -> tuple[str, str]:
    title = clean_text(title)
    match = PERIOD_RE.search(title)
    if match:
        return clean_text(title[: match.start()]), normalize_period(match.group(1))
    parts = title.rsplit(" ", 1)
    if len(parts) == 2 and any(mark in parts[1] for mark in ("代", "周", "秋", "國", "国", "秦")):
        return clean_text(parts[0]), normalize_period(parts[1])
    return title, ""


def normalize_period(period: str) -> str:
    period = clean_text(period)
    for source, target in PERIOD_TEXT_FIXES.items():
        period = period.replace(source, target)
    if period.endswith(("早", "中", "晚")):
        period = f"{period}期"
    return period


def period_sort_key(period: str) -> tuple[int, str]:
    if not period:
        return (999, "")
    return (PERIOD_RANK.get(period, 900), period)


def extract_print_page_number(page: pdfplumber.page.Page) -> str:
    footer_chars = [
        char
        for char in page.chars
        if char.get("text") and char.get("text").isdigit() and 760 < char["top"] < page.height
    ]
    if not footer_chars:
        return ""
    footer_chars.sort(key=lambda char: char["x0"])
    return "".join(char["text"] for char in footer_chars)


def crop_nonwhite(image: Image.Image) -> Image.Image:
    rgb = image.convert("RGB")
    gray = rgb.convert("L")
    mask = gray.point(lambda pixel: 255 if pixel < 246 else 0)
    bbox = mask.getbbox()
    if not bbox:
        return rgb
    width, height = rgb.size
    # Keep dark-background rubbings intact; the mask will already span almost the whole image.
    area_ratio = ((bbox[2] - bbox[0]) * (bbox[3] - bbox[1])) / max(1, width * height)
    if area_ratio > 0.82:
        return rgb
    pad = max(2, int(max(width, height) * 0.04))
    x0 = max(0, bbox[0] - pad)
    y0 = max(0, bbox[1] - pad)
    x1 = min(width, bbox[2] + pad)
    y1 = min(height, bbox[3] + pad)
    return rgb.crop((x0, y0, x1, y1))


def save_normalized_glyph(image: ImageBlock, output_path: Path, thumb_size: int) -> None:
    source = Image.open(io.BytesIO(image.image_bytes)).convert("RGB")
    source = crop_nonwhite(source)
    source = ImageOps.contain(source, (thumb_size - 10, thumb_size - 10), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (thumb_size, thumb_size), "white")
    x = (thumb_size - source.width) // 2
    y = (thumb_size - source.height) // 2
    canvas.paste(source, (x, y))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output_path, "WEBP", quality=78, method=6)


def font_name_variants(value: str) -> set[str]:
    variants = {value}
    try:
        variants.add(value.encode("latin1").decode("utf-8"))
    except (UnicodeEncodeError, UnicodeDecodeError):
        pass
    return variants


def should_export_font(
    base_name: str,
    font_bytes: bytes | None = None,
    needed_codepoints: set[int] | None = None,
) -> bool:
    if font_bytes and needed_codepoints:
        return font_coverage_count(font_bytes, needed_codepoints) > 0
    for name in font_name_variants(base_name):
        lowered = name.lower()
        if "shiwen" in lowered or "simsun-ext" in lowered or "集大字库" in name or "集大字庫" in name:
            return True
    return False


def safe_font_stem(value: str) -> str:
    for name in font_name_variants(value):
        if "集大字库" in name or "集大字庫" in name:
            suffix = "".join(char for char in name if char.isdigit())
            return f"JidaZiku{suffix}" if suffix else "JidaZiku"
    value = re.sub(r"^[A-Z]{6}\+", "", value)
    value = re.sub(r"[^0-9A-Za-z._-]+", "_", value).strip("._-")
    return value or "pdf-font"


def browser_safe_font_bytes(font_bytes: bytes) -> bytes:
    try:
        font = TTFont(io.BytesIO(font_bytes), recalcBBoxes=True, recalcTimestamp=False)
        if "cmap" in font:
            for table in font["cmap"].tables:
                if hasattr(table, "language"):
                    table.language = 0
        output = io.BytesIO()
        font.save(output)
        return output.getvalue()
    except Exception:
        return font_bytes


def is_browser_safe_font(font_bytes: bytes) -> bool:
    try:
        font = TTFont(io.BytesIO(font_bytes), recalcBBoxes=False, recalcTimestamp=False)
        if "loca" in font:
            locations = font["loca"].locations
            if any(right < left for left, right in zip(locations, locations[1:])):
                return False
        return True
    except Exception:
        return False


def rare_font_codepoint(codepoint: int) -> bool:
    return (
        0x3400 <= codepoint <= 0x4DBF
        or codepoint > 0xFFFF
        or 0xE000 <= codepoint <= 0xF8FF
    )


def font_export_codepoints(records: list[dict] | None) -> set[int]:
    codepoints: set[int] = set()
    for record in records or []:
        for field in ("main", "sub", "title"):
            for char in record.get(field, ""):
                codepoint = ord(char)
                if rare_font_codepoint(codepoint):
                    codepoints.add(codepoint)
    return codepoints


def font_coverage_count(font_bytes: bytes, needed_codepoints: set[int]) -> int:
    return len(font_covered_codepoints(font_bytes, needed_codepoints))


def font_covered_codepoints(font_bytes: bytes, needed_codepoints: set[int]) -> set[int]:
    if not needed_codepoints:
        return set()
    try:
        font = TTFont(io.BytesIO(font_bytes), fontNumber=0, recalcBBoxes=False, recalcTimestamp=False)
        if "cmap" not in font:
            return set()
        cmap = font["cmap"].getBestCmap()
        glyf = font.get("glyf")
        covered: set[int] = set()
        for codepoint in needed_codepoints:
            glyph_name = cmap.get(codepoint)
            if not glyph_name:
                continue
            if glyf is not None:
                glyph = glyf[glyph_name]
                if getattr(glyph, "numberOfContours", None) == 0:
                    continue
            covered.add(codepoint)
        return covered
    except Exception:
        return set()


def css_unicode_range(codepoints: set[int]) -> str:
    if not codepoints:
        return RARE_FONT_UNICODE_RANGE
    ranges: list[tuple[int, int]] = []
    start = previous = None
    for codepoint in sorted(codepoints):
        if start is None:
            start = previous = codepoint
            continue
        if codepoint == previous + 1:
            previous = codepoint
            continue
        ranges.append((start, previous))
        start = previous = codepoint
    if start is not None and previous is not None:
        ranges.append((start, previous))
    return ", ".join(
        f"U+{start:X}" if start == end else f"U+{start:X}-{end:X}"
        for start, end in ranges
    )


def parse_css_unicode_range(value: str) -> set[int]:
    codepoints: set[int] = set()
    for token in value.split(","):
        token = token.strip().upper()
        match = re.fullmatch(r"U\+([0-9A-F]+)(?:-([0-9A-F]+))?", token)
        if not match:
            continue
        start = int(match.group(1), 16)
        end = int(match.group(2), 16) if match.group(2) else start
        codepoints.update(range(start, end + 1))
    return codepoints


def inline_image_codepoint(codepoint: int) -> bool:
    return (
        0xE000 <= codepoint <= 0xF8FF
        or 0xF0000 <= codepoint <= 0x10FFFF
        or codepoint > 0x323AF
    )


def save_inline_glyph_image(font_path: Path, codepoint: int, output_path: Path) -> bool:
    try:
        font = ImageFont.truetype(str(font_path), 256)
        char = chr(codepoint)
        canvas = Image.new("RGBA", (640, 640), (0, 0, 0, 0))
        draw = ImageDraw.Draw(canvas)
        bbox = draw.textbbox((0, 0), char, font=font)
        draw.text((-bbox[0] + 32, -bbox[1] + 32), char, font=font, fill=(0, 0, 0, 255))
        ink_bbox = canvas.getchannel("A").getbbox()
        if not ink_bbox:
            return False
        glyph = canvas.crop(ink_bbox)
        pad = max(3, int(max(glyph.size) * 0.08))
        padded = Image.new("RGBA", (glyph.width + pad * 2, glyph.height + pad * 2), (0, 0, 0, 0))
        padded.alpha_composite(glyph, (pad, pad))
        padded = ImageOps.contain(padded, (120, 120), Image.Resampling.LANCZOS)
        output = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
        output.alpha_composite(padded, ((128 - padded.width) // 2, (128 - padded.height) // 2))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output.save(output_path, "PNG", optimize=True)
        return True
    except Exception:
        return False


def export_inline_glyph_images(records: list[dict], fonts: list[dict[str, object]]) -> dict[str, str]:
    if INLINE_GLYPH_DIR.exists():
        resolved = INLINE_GLYPH_DIR.resolve()
        expected = (SITE_DIR / "assets" / "inline-glyphs").resolve()
        if resolved == expected:
            shutil.rmtree(INLINE_GLYPH_DIR)
    INLINE_GLYPH_DIR.mkdir(parents=True, exist_ok=True)

    needed: set[int] = set()
    for record in records:
        for field in ("main", "sub", "title"):
            for char in record.get(field, ""):
                codepoint = ord(char)
                if inline_image_codepoint(codepoint):
                    needed.add(codepoint)

    font_coverage: list[tuple[Path, set[int]]] = []
    for font in fonts:
        if font.get("format") == "woff2":
            continue
        font_path = SITE_DIR / str(font.get("file", ""))
        if not font_path.exists():
            continue
        coverage = parse_css_unicode_range(str(font.get("unicodeRange", ""))) & needed
        if coverage:
            font_coverage.append((font_path, coverage))

    exported: dict[str, str] = {}
    for codepoint in sorted(needed):
        for font_path, coverage in font_coverage:
            if codepoint not in coverage:
                continue
            codepoint_label = f"U+{codepoint:X}"
            relative_path = Path("assets") / "inline-glyphs" / f"{codepoint:X}.png"
            if save_inline_glyph_image(font_path, codepoint, SITE_DIR / relative_path):
                exported[codepoint_label] = str(relative_path).replace("\\", "/")
            break
    return exported


def first_cid_sources(records: list[dict]) -> dict[str, dict[str, object]]:
    sources: dict[str, dict[str, object]] = {}
    for record in records:
        for field in ("main", "sub", "title", "source"):
            for token in CID_RE.findall(str(record.get(field, ""))):
                sources.setdefault(
                    token,
                    {
                        "book": record.get("book", ""),
                        "pdfPage": int(record.get("pdfPage") or 0),
                    },
                )
    return sources


def alpha_cid_image(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    gray = ImageOps.grayscale(image)
    alpha = ImageOps.invert(gray).point(lambda pixel: 255 if pixel > 28 else 0)
    ink_bbox = alpha.getbbox()
    if not ink_bbox:
        return image
    transparent = Image.new("RGBA", image.size, (20, 20, 20, 0))
    transparent.putalpha(alpha)
    cropped = transparent.crop(ink_bbox)
    padded = Image.new("RGBA", (cropped.width + 8, cropped.height + 8), (20, 20, 20, 0))
    padded.alpha_composite(cropped, (4, 4))
    return padded


def export_cid_glyph_images(pdfs: list[Path], records: list[dict]) -> dict[str, str]:
    cid_sources = first_cid_sources(records)
    if not cid_sources:
        return {}

    if CID_GLYPH_DIR.exists():
        resolved = CID_GLYPH_DIR.resolve()
        expected = (SITE_DIR / "assets" / "cid-glyphs").resolve()
        if resolved == expected:
            shutil.rmtree(CID_GLYPH_DIR)
    CID_GLYPH_DIR.mkdir(parents=True, exist_ok=True)

    by_book_page: dict[tuple[str, int], set[str]] = {}
    for token, source in cid_sources.items():
        book = str(source.get("book") or "")
        page_number = int(source.get("pdfPage") or 0)
        if book and page_number:
            by_book_page.setdefault((book, page_number), set()).add(token)

    positions: dict[str, dict[str, object]] = {}
    for pdf_path in pdfs:
        pdf_kind = classify_pdf(pdf_path)
        page_numbers = sorted(page for (book, page) in by_book_page if book == pdf_kind)
        if not page_numbers:
            continue
        with pdfplumber.open(pdf_path) as plumber_pdf:
            for page_number in page_numbers:
                targets = by_book_page[(pdf_kind, page_number)]
                page = plumber_pdf.pages[page_number - 1]
                for char in page.chars:
                    token = char.get("text", "")
                    if token in targets and token not in positions:
                        positions[token] = {
                            "pdf": pdf_path,
                            "pageIndex": page_number - 1,
                            "bbox": (
                                float(char["x0"]),
                                float(char["top"]),
                                float(char["x1"]),
                                float(char["bottom"]),
                            ),
                        }
                if hasattr(page, "flush_cache"):
                    page.flush_cache()

    output: dict[str, str] = {}
    open_docs: dict[Path, fitz.Document] = {}
    try:
        for token, source in sorted(positions.items(), key=lambda item: int(re.search(r"\d+", item[0]).group())):
            pdf_path = Path(source["pdf"])
            doc = open_docs.get(pdf_path)
            if doc is None:
                doc = fitz.open(pdf_path)
                open_docs[pdf_path] = doc
            page = doc[int(source["pageIndex"])]
            x0, top, x1, bottom = source["bbox"]
            pad = 2.5
            clip = fitz.Rect(max(0, x0 - pad), max(0, top - pad), x1 + pad, bottom + pad)
            pix = page.get_pixmap(matrix=fitz.Matrix(8, 8), clip=clip, alpha=False)
            image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            image = alpha_cid_image(image)
            digest = hashlib.sha1(token.encode("utf-8")).hexdigest()[:12]
            relative_path = Path("assets") / "cid-glyphs" / f"{digest}.webp"
            image.save(SITE_DIR / relative_path, "WEBP", lossless=True, quality=100, method=6)
            output[token] = str(relative_path).replace("\\", "/")
    finally:
        for doc in open_docs.values():
            doc.close()

    return output


def subset_font_bytes(font_path: Path, codepoints: set[int]) -> tuple[bytes, str] | None:
    for flavor, extension in (("woff2", "woff2"), (None, "ttf")):
        try:
            options = font_subset.Options()
            options.flavor = flavor
            options.layout_features = "*"
            font = font_subset.load_font(str(font_path), options)
            subsetter = font_subset.Subsetter(options=options)
            subsetter.populate(unicodes=codepoints)
            subsetter.subset(font)
            output = io.BytesIO()
            font_subset.save_font(font, output, options)
            return output.getvalue(), extension
        except Exception:
            continue
    return None


def export_fallback_font(
    family: str,
    needed_codepoints: set[int],
    covered_codepoints: set[int],
) -> dict[str, object] | None:
    remaining_codepoints = needed_codepoints - covered_codepoints
    if not remaining_codepoints:
        return None

    for font_path in RARE_FALLBACK_FONT_CANDIDATES:
        if not font_path.exists():
            continue
        font_bytes = font_path.read_bytes()
        fallback_codepoints = font_covered_codepoints(font_bytes, remaining_codepoints)
        if not fallback_codepoints:
            continue
        subset_result = subset_font_bytes(font_path, fallback_codepoints)
        if subset_result is None:
            continue
        subset_bytes, extension = subset_result
        digest = hashlib.sha1(subset_bytes).hexdigest()[:12]
        file_name = f"{safe_font_stem(font_path.stem)}-rare-{digest}.{extension}"
        output_path = FONT_DIR / file_name
        output_path.write_bytes(subset_bytes)
        font_format = "woff2" if extension == "woff2" else "truetype"
        return {
            "family": family,
            "file": f"assets/fonts/{file_name}",
            "source": "rare-fallback",
            "baseName": font_path.stem,
            "rareCoverage": len(fallback_codepoints),
            "unicodeRange": css_unicode_range(fallback_codepoints),
            "format": font_format,
        }
    return None


def export_pdf_fonts(pdfs: list[Path], records: list[dict] | None = None) -> list[dict[str, object]]:
    if FONT_DIR.exists():
        resolved = FONT_DIR.resolve()
        expected = (SITE_DIR / "assets" / "fonts").resolve()
        if resolved == expected:
            shutil.rmtree(FONT_DIR)
    FONT_DIR.mkdir(parents=True, exist_ok=True)

    exported: list[dict[str, object]] = []
    seen_hashes: set[str] = set()
    needed_codepoints = font_export_codepoints(records)
    covered_by_embedded: set[int] = set()

    for pdf_path in pdfs:
        pdf_kind = classify_pdf(pdf_path)
        with fitz.open(pdf_path) as doc:
            seen_xrefs: set[int] = set()
            for page in doc:
                for font in page.get_fonts(full=True):
                    xref = int(font[0])
                    base_name = str(font[3])
                    if xref in seen_xrefs:
                        continue
                    seen_xrefs.add(xref)
                    extracted_name, ext, _, font_bytes = doc.extract_font(xref)
                    if not font_bytes or ext == "n/a":
                        continue
                    covered_codepoints = font_covered_codepoints(font_bytes, needed_codepoints)
                    coverage_count = len(covered_codepoints)
                    if not should_export_font(base_name, font_bytes, needed_codepoints):
                        continue
                    digest = hashlib.sha1(font_bytes).hexdigest()[:12]
                    if digest in seen_hashes:
                        continue
                    seen_hashes.add(digest)
                    font_bytes = browser_safe_font_bytes(font_bytes)
                    if not is_browser_safe_font(font_bytes):
                        continue
                    covered_by_embedded.update(covered_codepoints)
                    extension = "ttf" if ext.lower() in {"ttf", "ttc"} else ext.lower()
                    file_name = f"{safe_font_stem(extracted_name)}-{digest}.{extension}"
                    output_path = FONT_DIR / file_name
                    output_path.write_bytes(font_bytes)
                    exported.append(
                        {
                            "family": f"JinwenPdf{len(exported) + 1}",
                            "file": f"assets/fonts/{file_name}",
                            "source": pdf_kind,
                            "baseName": extracted_name,
                            "rareCoverage": coverage_count,
                            "unicodeRange": css_unicode_range(covered_codepoints),
                            "format": "truetype",
                        }
                    )

    fallback_font = export_fallback_font(
        f"JinwenPdf{len(exported) + 1}",
        needed_codepoints,
        covered_by_embedded,
    )
    if fallback_font is not None:
        exported.append(fallback_font)

    css_lines = []
    for font in exported:
        font_format = font.get("format") or "truetype"
        css_lines.extend(
            [
                "@font-face {",
                f"  font-family: \"{font['family']}\";",
                f"  src: url(\"./{Path(str(font['file'])).name}\") format(\"{font_format}\");",
                f"  unicode-range: {font.get('unicodeRange') or RARE_FONT_UNICODE_RANGE};",
                "  font-display: swap;",
                "}",
            ]
        )
    if exported:
        stack = ", ".join(f"\"{font['family']}\"" for font in exported)
        css_lines.append(f":root {{ --pdf-fonts: {stack}; }}")
    else:
        css_lines.append(":root { --pdf-fonts: serif; }")
    FONT_CSS.write_text("\n".join(css_lines) + "\n", encoding="utf-8")
    return exported


def record_id(pdf_kind: str, page_index: int, image_index: int, bbox: tuple[float, float, float, float]) -> str:
    raw = f"{pdf_kind}:{page_index + 1}:{image_index}:{','.join(f'{value:.2f}' for value in bbox)}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def relative_glyph_path(identifier: str) -> Path:
    return Path("assets") / "glyphs" / identifier[:2] / f"{identifier}.webp"


def collect_manual_token(
    manual_tokens: dict[str, dict],
    token: str,
    context: dict,
    ids_map: dict[str, str],
) -> None:
    if not is_manual_ids_token(token, ids_map):
        return
    entry = manual_tokens.setdefault(
        token,
        {
            "token": token,
            "codepoint": codepoint_label(token),
            "category": category_label(token),
            "count": 0,
            "first_context": context,
        },
    )
    entry["count"] += 1


def codepoint_label(token: str) -> str:
    if CID_RE.fullmatch(token):
        return token
    return " ".join(f"U+{ord(char):04X}" for char in token)


def category_label(token: str) -> str:
    if CID_RE.fullmatch(token):
        return "CID"
    return " ".join(unicodedata.category(char) for char in token)


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def write_manual_ids_files(manual_tokens: dict[str, dict]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    rows = sorted(manual_tokens.values(), key=lambda item: (-item["count"], item["codepoint"]))

    with (DATA_DIR / "pua_chars.tsv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle, delimiter="\t")
        writer.writerow(["token", "codepoint", "category", "count", "first_book", "first_main", "first_sub", "first_title", "ids"])
        for row in rows:
            context = row["first_context"]
            writer.writerow(
                [
                    row["token"],
                    row["codepoint"],
                    row["category"],
                    row["count"],
                    context.get("book", ""),
                    context.get("main", ""),
                    context.get("sub", ""),
                    context.get("title", ""),
                    "",
                ]
            )

    template_path = DATA_DIR / "pua_ids.tsv"
    existing: dict[str, list[str]] = {}
    if template_path.exists():
        with template_path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle, delimiter="\t")
            for row in reader:
                token = row.get("token", "")
                if token:
                    existing[token] = [row.get("ids", ""), row.get("note", "")]

    with template_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, delimiter="\t")
        writer.writerow(["token", "codepoint", "ids", "note"])
        for row in rows:
            ids, note = existing.get(row["token"], ["", ""])
            writer.writerow([row["token"], row["codepoint"], ids, note])


def ids_components_text(char: str, ids_map: dict[str, str], cache: dict[str, str], depth: int = 3) -> str:
    if char in cache:
        return cache[char]
    seen: set[str] = set()

    def walk(current: str, remaining: int) -> list[str]:
        if not current or current in seen:
            return []
        seen.add(current)
        pieces = [current]
        ids = ids_map.get(current, "")
        if ids:
            pieces.append(ids)
        if remaining <= 0:
            return pieces
        for component in ids:
            if component in IDS_OPERATORS or component in IDS_PUNCT or component.isspace():
                continue
            if component == current:
                continue
            pieces.extend(walk(component, remaining - 1))
        return pieces

    value = " ".join(dict.fromkeys(walk(char, depth)))
    cache[char] = value
    return value


def build_char_index(records: list[dict], ids_map: dict[str, str]) -> dict[str, str]:
    head_chars = set()
    for record in records:
        head_text = record.get("componentHead", f"{record.get('main', '')}{record.get('sub', '')}")
        for char in head_text:
            if not char.isspace():
                head_chars.add(char)

    cache: dict[str, str] = {}
    output: dict[str, str] = {}
    for char in sorted(head_chars):
        text = ids_components_text(char, ids_map, cache)
        if text:
            output[char] = text
    return output


def build_index(limit_pages: int | None, thumb_size: int, keep_images: bool) -> None:
    ids_map = load_ids_map()
    pdfs = discover_pdfs()
    if not pdfs:
        raise SystemExit("No PDF files found in the current directory.")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    GLYPH_DIR.mkdir(parents=True, exist_ok=True)
    if not keep_images and GLYPH_DIR.exists():
        resolved = GLYPH_DIR.resolve()
        expected = (SITE_DIR / "assets" / "glyphs").resolve()
        if resolved == expected:
            shutil.rmtree(GLYPH_DIR)
            GLYPH_DIR.mkdir(parents=True, exist_ok=True)

    records: list[dict] = []
    manual_tokens: dict[str, dict] = {}
    periods: set[str] = set()
    books: set[str] = set()

    for pdf_path in pdfs:
        pdf_kind = classify_pdf(pdf_path)
        books.add(pdf_kind)
        print(f"[PDF] {pdf_kind}: {pdf_path.name}", flush=True)
        current_main = ""
        current_sub = ""
        current_index = ""

        with pdfplumber.open(pdf_path) as plumber_pdf:
            fitz_doc = fitz.open(pdf_path)
            page_total = len(plumber_pdf.pages)
            pages_to_read = min(page_total, limit_pages) if limit_pages else page_total

            for page_index in range(pages_to_read):
                if page_index and page_index % 50 == 0:
                    print(f"  - page {page_index + 1}/{pages_to_read}, records so far: {len(records)}", flush=True)
                    fitz.TOOLS.store_shrink(100)

                plumber_page = plumber_pdf.pages[page_index]
                segments = group_segments(plumber_page)
                markers = head_markers(plumber_page, pdf_kind)
                images = image_blocks(fitz_doc, page_index)
                print_page = extract_print_page_number(plumber_page)
                marker_index = 0

                for image_index, image in enumerate(images):
                    paired = pair_image_to_text(image, segments, plumber_page.width)
                    marker_anchor = paired.title_top + 2 if paired else image.bbox[1] + 2
                    while marker_index < len(markers) and markers[marker_index].top <= marker_anchor:
                        marker = markers[marker_index]
                        if marker.index:
                            current_index = marker.index
                        if marker.main:
                            current_main = marker.main
                        if marker.sub:
                            current_sub = marker.sub
                        marker_index += 1

                    if not paired:
                        continue
                    title = paired.title
                    period = paired.period
                    source = paired.source
                    if not current_main:
                        current_main = pdf_kind
                    if not current_sub:
                        current_sub = current_main

                    identifier = record_id(pdf_kind, page_index, image_index, image.bbox)
                    relative_path = relative_glyph_path(identifier)
                    glyph_output = SITE_DIR / relative_path
                    if not (keep_images and glyph_output.exists()):
                        save_normalized_glyph(image, glyph_output, thumb_size)
                    periods.add(period)

                    record = {
                        "id": identifier,
                        "book": pdf_kind,
                        "group": current_index,
                        "main": current_main,
                        "sub": current_sub,
                        "componentHead": "" if pdf_kind == "單一族徽" else f"{current_main}{current_sub}",
                        "title": title,
                        "period": period,
                        "source": source,
                        "pdfPage": page_index + 1,
                        "printPage": print_page,
                        "image": str(relative_path).replace("\\", "/"),
                    }
                    records.append(record)

                    context = {
                        "book": pdf_kind,
                        "main": current_main,
                        "sub": current_sub,
                        "title": title,
                    }
                    for field in ("main", "sub", "title", "source"):
                        for token in iter_text_tokens(record.get(field, "")):
                            collect_manual_token(manual_tokens, token, context, ids_map)

                if hasattr(plumber_page, "flush_cache"):
                    plumber_page.flush_cache()

            fitz_doc.close()

    char_index = build_char_index(records, ids_map)
    font_files = export_pdf_fonts(pdfs, records)
    inline_glyphs = export_inline_glyph_images(records, font_files)
    cid_glyphs = export_cid_glyph_images(pdfs, records)
    meta = {
        "recordCount": len(records),
        "bookCount": len(books),
        "books": sorted(books, key=lambda item: PDF_ORDER.get(item, 99)),
        "periods": [period for period in sorted(periods, key=period_sort_key) if period],
        "manualTokenCount": len(manual_tokens),
        "thumbSize": thumb_size,
        "fontCount": len(font_files),
        "fonts": font_files,
        "inlineGlyphCount": len(inline_glyphs),
        "cidGlyphCount": len(cid_glyphs),
    }

    write_json(DATA_DIR / "records.json", records)
    write_json(DATA_DIR / "chars.json", char_index)
    write_json(DATA_DIR / "meta.json", meta)
    write_json(INLINE_GLYPH_JSON, inline_glyphs)
    write_json(CID_GLYPH_JSON, cid_glyphs)
    write_manual_ids_files(manual_tokens)
    print(
        f"[DONE] {len(records)} records, {len(char_index)} indexed head chars, {len(manual_tokens)} manual IDS tokens.",
        flush=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a static Jinwen glyph search index from local PDFs.")
    parser.add_argument("--limit-pages", type=int, default=None, help="Only parse the first N pages of each PDF.")
    parser.add_argument("--thumb-size", type=int, default=112, help="Normalized square glyph thumbnail size.")
    parser.add_argument("--keep-images", action="store_true", help="Do not clear existing generated glyph images first.")
    args = parser.parse_args()
    build_index(args.limit_pages, args.thumb_size, args.keep_images)


if __name__ == "__main__":
    main()
