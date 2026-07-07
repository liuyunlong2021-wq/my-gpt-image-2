#!/usr/bin/env python3
"""Parse JC-GPT-Image2-Skill gallery markdown → dazi-studio JSON format."""
import json, re, os
from datetime import datetime, timezone

SKILL_DIR = "/Users/by3/Documents/jiucaihezi-app/public/skills/JC-GPT-Image2-Skill/gpt-image/references"
GH_RAW_BASE = "https://raw.githubusercontent.com/liuyunlong2021-wq/JC-GPTImage2-skill/main/JC-GPT-Image2-Skill"
DOCS_DIR = "/Users/by3/Documents/JC-GPTImage2-skill/JC-GPT-Image2-Skill"
OUTPUT = "/Users/by3/Documents/dazi-studio/data/jc-gpt2-gallery.json"

def parse_gallery_file(filepath, counter):
    with open(filepath, 'r', encoding='utf-8') as f:
        text = f.read()

    entries = []
    cat_match = re.search(r'^#\s+(.+?)$', text, re.MULTILINE)
    category = cat_match.group(1).strip() if cat_match else "Uncategorized"
    category = re.sub(r'^[^\w\s]+', '', category).strip()

    # Determine the docs folder name from the filename
    cat_dir_name = re.sub(r'^gallery-|\.md$', '', os.path.basename(filepath))
    # Fix common name mismatches between gallery-*.md and docs/ directory names
    NAME_ALIASES = {'anime-and-manga': 'anime-manga'}
    cat_dir_name = NAME_ALIASES.get(cat_dir_name, cat_dir_name)
    docs_folder = f"docs/{cat_dir_name}"
    # Full path to docs folder in the repo
    full_docs = os.path.join(DOCS_DIR, 'docs', cat_dir_name)
    all_docs_files = {}
    if os.path.isdir(full_docs):
        for fname in os.listdir(full_docs):
            if fname.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp')):
                all_docs_files[fname] = f"{docs_folder}/{fname}"

    sections = re.split(r'\n###\s+', text)
    for section in sections[1:]:
        lines = section.strip().split('\n')
        title_line = lines[0].strip()
        title = re.sub(r'^No\.\s*\d+\s*[·•]\s*', '', title_line).strip()

        img_match = re.search(r'`(docs/[^`]+\.(?:png|jpg|jpeg|gif|webp))`', section)
        image_path = img_match.group(1) if img_match else ""

        # Fallback: find image by matching the first 10 chars of title
        if not image_path and all_docs_files:
            title_key = title[:10].lower().replace(' ', '').replace('-', '')
            for fname, fpath in all_docs_files.items():
                fname_key = fname.lower().replace(' ', '').replace('-', '').replace('.png', '').replace('.jpg', '')
                if title_key in fname_key or fname_key in title_key:
                    image_path = fpath
                    break
            # If still not found, try matching by removing parenthetical suffixes
            if not image_path:
                bare_title = re.sub(r'\s*\(.*?\)\s*', '', title).strip()[:10].lower()
                for fname, fpath in all_docs_files.items():
                    fname_key = fname.lower().replace(' ', '').replace('-', '').replace('.png', '').replace('.jpg', '')
                    if bare_title.replace(' ', '') in fname_key:
                        image_path = fpath
                        break

        author_match = re.search(r'Author:\s*(.+?)(?:\s*·|\s*$)', section)
        author = author_match.group(1).strip() if author_match else ""

        source_match = re.search(r'Source:\s*\[([^\]]+)\]\(([^)]+)\)', section)
        source_url = source_match.group(2) if source_match else ""

        prompt_match = re.search(r'```text\s*\n(.*?)\n```', section, re.DOTALL)
        prompt = prompt_match.group(1).strip() if prompt_match else ""

        if not prompt:
            continue

        thumbnail = f"{GH_RAW_BASE}/{image_path}" if image_path else ""

        counter[0] += 1
        entries.append({
            "id": f"jc-gallery-{counter[0]:04d}",
            "model": "gpt-image-2",
            "mediaType": "image",
            "title": title,
            "prompt": prompt,
            "thumbnail": thumbnail,
            "videoUrl": None,
            "category": category,
            "author": author,
            "authorUrl": "",
            "sourceUrl": source_url or "https://github.com/liuyunlong2021-wq/JC-GPTImage2-skill",
            "imageUrls": [thumbnail] if thumbnail else [],
            "syncedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        })

    return entries

def main():
    all_entries = []
    counter = [0]  # mutable counter for global ID tracking
    for fname in sorted(os.listdir(SKILL_DIR)):
        if fname.startswith('gallery-') and fname.endswith('.md') and fname != 'gallery.md':
            filepath = os.path.join(SKILL_DIR, fname)
            entries = parse_gallery_file(filepath, counter)
            print(f"  {fname}: {len(entries)} entries")
            all_entries.extend(entries)

    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(all_entries, f, ensure_ascii=False, indent=2)

    print(f"\nTotal: {len(all_entries)} entries → {OUTPUT}")
    cats = {}
    for e in all_entries:
        cats[e['category']] = cats.get(e['category'], 0) + 1
    for cat, count in sorted(cats.items()):
        print(f"  {cat}: {count}")

if __name__ == '__main__':
    main()
