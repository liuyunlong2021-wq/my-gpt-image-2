#!/usr/bin/env python3
"""Download JC gallery images into the static site and rewrite its data URLs."""
import hashlib
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from pathlib import Path
from urllib.error import URLError
from urllib.parse import quote, urlsplit, urlunsplit
from urllib.request import Request, urlopen

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "jc-gpt2-gallery.json"
ASSET_DIR = ROOT / "assets" / "jc-gallery"
SOURCE_MAP_PATH = ASSET_DIR / "source-map.json"
QUALITY = 88
WORKERS = 8


def local_path(url):
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:20]
    return f"assets/jc-gallery/{digest}.webp"


def encoded_url(url):
    parts = urlsplit(url)
    path = quote(parts.path, safe="/%:@!$&'()*+,;=-._~%")
    return urlunsplit((parts.scheme, parts.netloc, path, parts.query, parts.fragment))


def download_one(url):
    target = ROOT / local_path(url)
    if target.exists() and target.stat().st_size:
        return url, target.stat().st_size

    request = Request(encoded_url(url), headers={"User-Agent": "DaziStudioGallery/1.0"})
    last_error = None
    for attempt in range(4):
        try:
            with urlopen(request, timeout=45) as response:
                payload = response.read()
            with Image.open(BytesIO(payload)) as source:
                image = ImageOps.exif_transpose(source)
                if image.mode not in ("RGB", "RGBA"):
                    image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
                target.parent.mkdir(parents=True, exist_ok=True)
                temp = target.with_suffix(".tmp.webp")
                image.save(temp, "WEBP", quality=QUALITY, method=6)
                temp.replace(target)
            return url, target.stat().st_size
        except (URLError, TimeoutError, OSError, ValueError) as error:
            last_error = error
            if attempt < 3:
                time.sleep(attempt + 1)
    raise RuntimeError(f"Failed to mirror {url}: {last_error}")


def main():
    records = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    existing_map = {}
    if SOURCE_MAP_PATH.exists():
        existing_map = json.loads(SOURCE_MAP_PATH.read_text(encoding="utf-8"))
    source_urls = sorted(set(existing_map) | {
        url
        for record in records
        for url in [record.get("thumbnail", ""), *record.get("imageUrls", [])]
        if url.startswith("https://raw.githubusercontent.com/")
    })
    mapping = {url: local_path(url) for url in source_urls}

    errors = []
    total_bytes = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as executor:
        futures = {executor.submit(download_one, url): url for url in source_urls}
        for index, future in enumerate(as_completed(futures), start=1):
            url = futures[future]
            try:
                _, size = future.result()
                total_bytes += size
            except Exception as error:
                errors.append(str(error))
            if index % 20 == 0 or index == len(futures):
                print(f"Processed {index}/{len(futures)} images")

    if errors:
        raise SystemExit("\\n".join(errors))

    for record in records:
        thumbnail = record.get("thumbnail", "")
        if thumbnail in mapping:
            record["thumbnail"] = mapping[thumbnail]
        image_urls = record.get("imageUrls") or ([thumbnail] if thumbnail else [])
        record["imageUrls"] = [mapping.get(url, url) for url in image_urls]

    DATA_PATH.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    SOURCE_MAP_PATH.write_text(json.dumps(mapping, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Mirrored {len(source_urls)} unique images to WebP ({total_bytes} bytes).")


if __name__ == "__main__":
    main()
