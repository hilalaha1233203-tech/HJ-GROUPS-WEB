#!/usr/bin/env python3
"""Generate content-hashed WebP cover variants from a manual Storage download.

This script never calls Supabase or modifies the production database/objects.
Install Pillow first: py -m pip install --user Pillow
Place bucket files under tools/cover-source/ and preserve their object paths.
"""
from __future__ import annotations

import hashlib
import json
import sys
from io import BytesIO
from pathlib import Path
from urllib.parse import quote

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "tools" / "cover-source"
OUTPUT_ROOT = ROOT / "public" / "covers"
SOURCE_MANIFEST = ROOT / "src" / "lib" / "cover-manifest.json"
PUBLIC_MANIFEST = ROOT / "public" / "cover-manifest.json"
SUPABASE_BUCKET_BASE = (
    "https://yajkfglagnyvenddyvok.supabase.co/"
    "storage/v1/object/public/story-covers/"
)
THUMB_MAX_BYTES = 80 * 1024
SUPPORTED = {".jpg", ".jpeg", ".png", ".webp", ".jfif", ".avif"}

EXPECTED_CURRENT_OBJECTS = [
    "stories/1790866658189-Epic-Fantasy-Warriors_-75M-Plays.png",
    "stories/1790951665948-Cinematic-King_-H7-Groups-Boss-Poster.png",
    "stories/1790951925575-Mythic-Cobra-Fortress-Heroes.png",
    "stories/1790952513979-Warrior-of-the-Golden-Battlefield.png",
]


def webp_bytes(image: Image.Image, width: int, qualities: list[int], max_bytes: int | None = None):
    target_width = min(width, image.width)
    target_height = max(1, round(image.height * target_width / image.width))
    resized = image.resize((target_width, target_height), Image.Resampling.LANCZOS)
    mode = "RGBA" if "A" in resized.getbands() or "transparency" in resized.info else "RGB"
    if resized.mode != mode:
        resized = resized.convert(mode)
    last = b""
    for quality in qualities:
        buffer = BytesIO()
        resized.save(buffer, format="WEBP", quality=quality, method=6)
        last = buffer.getvalue()
        if max_bytes is None or len(last) <= max_bytes:
            return last, target_width, target_height, quality
    if max_bytes is not None and len(last) > max_bytes:
        raise ValueError(
            f"Could not reach {max_bytes} bytes for {width}px thumbnail "
            f"(final size {len(last)} bytes)."
        )
    return last, target_width, target_height, qualities[-1]


def source_aliases(relative_path: str, original_url: str):
    aliases = {
        relative_path,
        "/" + relative_path,
        "story-covers/" + relative_path,
        "/story-covers/" + relative_path,
        original_url,
        "/storage/v1/object/public/story-covers/" + relative_path,
    }
    return aliases


def main() -> int:
    if not SOURCE_ROOT.exists():
        print(f"ERROR: cover source folder missing: {SOURCE_ROOT}", file=sys.stderr)
        return 2

    missing = [item for item in EXPECTED_CURRENT_OBJECTS if not (SOURCE_ROOT / item).is_file()]
    if missing:
        print("ERROR: required current cover objects are missing. No manifest/assets were written.")
        for item in missing:
            print("  MISSING " + item)
        print("Place the four active story cover files under tools/cover-source/stories/ with their exact relative paths.")
        return 2

    inputs = sorted(
        item for item in SOURCE_ROOT.rglob("*")
        if item.is_file() and item.suffix.lower() in SUPPORTED
    )
    if not inputs:
        print("ERROR: no supported image files found.")
        return 2

    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    manifest = {"version": 1, "covers": {}}
    total_before = 0
    total_after = 0
    converted_count = 0

    for source in inputs:
        rel = source.relative_to(SOURCE_ROOT).as_posix()
        if rel not in EXPECTED_CURRENT_OBJECTS:
            print("SKIP unexpected/unverified file: " + rel)
            continue
        original_bytes = source.read_bytes()
        with Image.open(BytesIO(original_bytes)) as opened:
            image = ImageOps.exif_transpose(opened).copy()
        original_width, original_height = image.size
        if not original_width or not original_height or max(original_width, original_height) > 30000:
            raise ValueError(f"Invalid image dimensions for {rel}: {image.size}")

        thumb, thumb_width, thumb_height, thumb_quality = webp_bytes(
            image, 400, [78, 70, 62, 54, 46, 38, 30, 22, 15], THUMB_MAX_BYTES
        )
        large, large_width, large_height, large_quality = webp_bytes(
            image, 800, [82, 76, 70, 64, 58, 50, 42, 34, 26, 18], 2 * 1024 * 1024
        )
        asset_hash = hashlib.sha256(thumb + b"\0" + large).hexdigest()
        thumb_name = asset_hash + "-400.webp"
        large_name = asset_hash + "-800.webp"
        (OUTPUT_ROOT / thumb_name).write_bytes(thumb)
        (OUTPUT_ROOT / large_name).write_bytes(large)

        original_url = SUPABASE_BUCKET_BASE + quote(rel, safe="/-._~")
        src = "/covers/" + large_name
        thumb_src = "/covers/" + thumb_name
        entry = {
            "src": src,
            "srcSet": f"{thumb_src} {thumb_width}w, {src} {large_width}w",
            "originalUrl": original_url,
            "path": rel,
            "width": original_width,
            "height": original_height,
            "thumbnailWidth": thumb_width,
            "thumbnailHeight": thumb_height,
            "largeWidth": large_width,
            "largeHeight": large_height,
            "thumbnailBytes": len(thumb),
            "largeBytes": len(large),
        }
        for key in source_aliases(rel, original_url):
            manifest["covers"][key] = entry

        total_before += len(original_bytes)
        total_after += len(thumb) + len(large)
        converted_count += 1
        print(
            f"OK {rel}: {len(original_bytes)} -> {len(thumb)} + {len(large)} bytes; "
            f"thumbnail quality={thumb_quality}, large quality={large_quality}; "
            f"dimensions={original_width}x{original_height}"
        )

    serialized = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    SOURCE_MANIFEST.write_text(serialized, encoding="utf-8")
    PUBLIC_MANIFEST.write_text(serialized, encoding="utf-8")
    print(f"Manifest entries: {len(manifest['covers'])}; source objects converted: {converted_count}")
    print(f"Input bytes: {total_before}; both WebP variants total: {total_after}")
    print(f"Output directory: {OUTPUT_ROOT}")
    print("No Supabase API or production database writes were made.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
