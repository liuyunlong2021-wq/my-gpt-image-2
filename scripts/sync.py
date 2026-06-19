#!/usr/bin/env python3
"""
sync.py — 搭子提示词库数据同步脚本
从 EvoLink + YouMind 公开源抓取提示词，去重后输出 data/index.json + data/{model}.json

用法:
  python scripts/sync.py              # 完整同步（EvoLink + YouMind）
  python scripts/sync.py --migrate    # 仅从现有 data.json 迁移
  python scripts/sync.py --dry-run    # 预览不写入

依赖: pip install requests
"""

import json
import os
import re
import sys
import time
import hashlib
import argparse
import xml.etree.ElementTree as ET
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlparse

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False
    print("⚠️ 需要安装 requests: pip install requests", file=sys.stderr)

# ── 配置 ───────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DATA_JSON = ROOT / "data.json"

USER_AGENT = (
    "DaziStudio-Sync/1.0 (+https://dazi.studio; data aggregation bot)"
)

# 请求控制
MAX_CONCURRENT = 5
REQUEST_DELAY = 0.25   # 请求间隔（秒）
REQUEST_TIMEOUT = 30   # 单次请求超时（秒）
MAX_RETRIES = 2

# ── 模型定义 ───────────────────────────────────────────────

MODEL_DEFS = [
    {"id": "gpt-image-2",    "file": "gpt-image-2.json",    "label_zh": "GPT Image 2",    "label_en": "GPT Image 2",    "color": "#7c5cff"},
    {"id": "nano-banana",    "file": "nano-banana.json",    "label_zh": "Nano Banana Pro","label_en": "Nano Banana Pro","color": "#f5c542"},
    {"id": "seedream",       "file": "seedream.json",       "label_zh": "Seedream 4.5",   "label_en": "Seedream 4.5",   "color": "#5ccc7c"},
    {"id": "seedance",       "file": "seedance.json",       "label_zh": "Seedance 2.0",   "label_en": "Seedance 2.0",   "color": "#4a9fff"},
    {"id": "grok-imagine",   "file": "grok-imagine.json",   "label_zh": "Grok Imagine",   "label_en": "Grok Imagine",   "color": "#ff5c9e"},
]

# YouMind 模型名 → 我们的 model id
YOUMIND_MODEL_MAP = {
    "gpt image 2":          "gpt-image-2",
    "gpt-image-2":          "gpt-image-2",
    "nano banana pro":      "nano-banana",
    "nano banana":          "nano-banana",
    "seedream 4.5":         "seedream",
    "seedream":             "seedream",
    "seedance 2.0":         "seedance",
    "seedance":             "seedance",
    "grok imagine":         "grok-imagine",
    "flux":                 None,  # 不收录
    "gemini 3 pro":         None,
    "gpt image 1.5":        None,
}

# EvoLink 分类 → 文件名映射
EVOLINK_CATEGORIES = {
    "ecommerce":    "E-commerce",
    "ad-creative":  "Ad Creative",
    "portrait":     "Portrait & Photography",
    "poster":       "Poster & Illustration",
    "character":    "Character Design",
    "ui":           "UI & Social Media",
    "comparison":   "Comparison & Community",
}

EVOLINK_BASE = "https://raw.githubusercontent.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts/main"
EVOLINK_CASES_URL = f"{EVOLINK_BASE}/cases"
EVOLINK_IMAGES_BASE = f"{EVOLINK_BASE}/images"

# YouMind sitemap
YOUMIND_SITEMAP_TEMPLATE = "https://youmind.com/sitemaps/prompts/sitemap/{}.xml"
YOUMIND_SITEMAP_INDICES = [0, 1, 2]

# YouMind README repos (owner/repo)
YOUMIND_README_REPOS = [
    ("YouMind-OpenLab", "awesome-gpt-image-2"),
    ("YouMind-OpenLab", "awesome-nano-banana-pro-prompts"),
    ("YouMind-OpenLab", "awesome-seedream-4.5"),
    ("YouMind-OpenLab", "awesome-seedance-2-prompts"),
    ("YouMind-OpenLab", "awesome-grok-imagine-prompts"),
]

README_MODEL_MAP = {
    "awesome-gpt-image-2":                    "gpt-image-2",
    "awesome-nano-banana-pro-prompts":        "nano-banana",
    "awesome-seedream-4.5":                   "seedream",
    "awesome-seedance-2-prompts":             "seedance",
    "awesome-grok-imagine-prompts":           "grok-imagine",
}


# ── HTTP 工具 ───────────────────────────────────────────────

def get_session():
    """创建带重试的 requests session"""
    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT})
    return s


def fetch_url(session, url, allow_404=False):
    """获取 URL 内容，带重试"""
    last_err = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            if attempt > 0:
                time.sleep(REQUEST_DELAY * (attempt + 1))
            resp = session.get(url, timeout=REQUEST_TIMEOUT)
            if resp.status_code == 200:
                return resp.text
            elif resp.status_code == 404 and allow_404:
                return None
            elif resp.status_code == 429:
                wait = int(resp.headers.get("Retry-After", 10))
                print(f"  ⚠️ 429 限速，等待 {wait}s ...", file=sys.stderr)
                time.sleep(wait)
                continue
            else:
                last_err = f"HTTP {resp.status_code}"
        except requests.RequestException as e:
            last_err = str(e)
    print(f"  ❌ 获取失败 {url}: {last_err}", file=sys.stderr)
    return None


# ── Twitter ID 提取 ─────────────────────────────────────────

def extract_twitter_status_id(url: str) -> str | None:
    """从 Twitter/X URL 提取 status ID"""
    if not url:
        return None
    m = re.search(r'/status(?:es)?/(\d+)', url)
    return m.group(1) if m else None


# ── Prompt 清理 ─────────────────────────────────────────────

def clean_prompt(text: str) -> str:
    """清理提示词文本"""
    if not text:
        return ""
    # 去除首尾空白和代码块标记
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r'^```\w*\s*', '', text)
        text = re.sub(r'\s*```$', '', text)
    return text.strip()


# ── ID 生成 ─────────────────────────────────────────────────

def make_id(model: str, twitter_id: str | None, fallback: str) -> str:
    """生成唯一 ID"""
    if twitter_id:
        return f"{model}_{twitter_id}"
    h = hashlib.md5(fallback.encode()).hexdigest()[:12]
    return f"{model}_{h}"


# ═══════════════════════════════════════════════════════════════
#  EvoLink 同步
# ═══════════════════════════════════════════════════════════════

def parse_evolink_case(md_text: str, category: str, filename: str) -> list[dict]:
    """解析单个 EvoLink markdown 文件中的所有 case"""
    results = []
    
    # 按 ### Case N: 分割
    case_blocks = re.split(r'\n### Case \d+:', md_text)
    
    for block in case_blocks:
        if not block.strip():
            continue
        
        # 预处理：恢复被换行打断的行（Markdown 中 URL 可能跨行）
        block_clean = block.strip()
        
        # 提取标题和 Twitter 链接
        # 格式: [Title](twitter_url) (by [@author](author_url))
        title_match = re.search(r'\[([^\]]+)\]\((https://x\.com/[^/]+/status/\d+)\)', block_clean)
        if not title_match:
            # 尝试另一种格式（Case 164+）
            title_match = re.search(r'^([^\n(]+?)\s*\n\*\*Source\*\*', block_clean, re.MULTILINE)
            if not title_match:
                # 再试: Case 164 格式 "Döner Commercial..."
                title_match = re.search(r'^([A-Z][^\n(]{5,80}?)\s*\n', block_clean)
        
        title = title_match.group(1).strip() if title_match else ""
        source_url = ""
        if title_match and title_match.lastindex >= 2:
            try:
                source_url = title_match.group(2)
            except IndexError:
                pass
        
        # 如果没找到标准格式，尝试从 block 中直接提取 Twitter 链接
        if not source_url:
            tw_match = re.search(r'https://x\.com/[^/\s]+/status/(\d+)', block_clean)
            if tw_match:
                source_url = tw_match.group(0)
        
        # 提取作者
        author_match = re.search(r'\[@(\w+)\]\((https://x\.com/\w+)\)', block_clean)
        author = f"@{author_match.group(1)}" if author_match else ""
        author_url = author_match.group(2) if author_match else ""
        
        # 如果没找到标准作者格式，尝试 Source 格式
        if not author:
            src_match = re.search(r'\*\*Source\*\*:\s*\[@(\w+)\]\((https://x\.com/\w+)\)', block_clean)
            if src_match:
                author = f"@{src_match.group(1)}"
                author_url = src_match.group(2)
        
        # 提取图片 URL
        img_match = re.search(r'<img\s+src="([^"]+)"', block_clean)
        if not img_match:
            img_match = re.search(r'!\[.*?\]\(([^)]+\.(?:jpg|jpeg|png|webp|gif))', block_clean, re.IGNORECASE)
        if not img_match:
            # 尝试相对路径 ../images/
            img_match = re.search(r'src="(\.\./images/[^"]+)"', block_clean)
        
        image_url = ""
        if img_match:
            img_url = img_match.group(1)
            if img_url.startswith("../"):
                # 相对路径 → 转绝对 GitHub raw URL
                img_url = img_url.replace("../images/", f"{EVOLINK_IMAGES_BASE}/")
            elif img_url.startswith("http"):
                pass
            else:
                img_url = f"{EVOLINK_IMAGES_BASE}/{img_url}"
            image_url = img_url
        
        # 提取 Prompt
        # 格式1: **Prompt:** 后跟 ``` 代码块
        prompt = ""
        prompt_match = re.search(r'\*\*Prompt:\*\*\s*\n\s*```\s*\n(.*?)```', block_clean, re.DOTALL)
        if not prompt_match:
            # 格式2: **Prompt:** 后跟普通文本
            prompt_match = re.search(r'\*\*Prompt:\*\*\s*\n(.*?)(?=\n---|\n###|\n\*\*|$)', block_clean, re.DOTALL)
        if not prompt_match:
            # 格式3: "prompt:" or "Full prompt:"
            prompt_match = re.search(r'(?:Full\s+)?[Pp]rompt:\s*\n\s*```\s*\n(.*?)```', block_clean, re.DOTALL)
        if not prompt_match:
            # 格式4: "Full prompt:" 无代码块
            prompt_match = re.search(r'(?:Full\s+)?[Pp]rompt:\s*\n(.*?)(?=\n---|\n###|\Z)', block_clean, re.DOTALL)
        
        if prompt_match:
            prompt = clean_prompt(prompt_match.group(1))
        
        if not title or not prompt:
            # 可能不是有效 case
            if title or prompt:
                # 有部分信息，仍然保留
                pass
            else:
                continue
        
        # 提取 case number
        case_num = None
        cn_match = re.search(r'### Case (\d+):', md_text)
        # 修复：在 block 前后搜索
        cn_match2 = re.search(r'Case (\d+)', block[:50] if len(block) > 50 else block)
        if cn_match2:
            try:
                case_num = int(cn_match2.group(1))
            except ValueError:
                pass
        
        twitter_id = extract_twitter_status_id(source_url)
        record_id = make_id("gpt-image-2", twitter_id, f"evolink_{category}_{title}")
        
        record = {
            "id": record_id,
            "model": "gpt-image-2",
            "mediaType": "image",
            "title": title.strip(),
            "prompt": prompt,
            "thumbnail": image_url,
            "videoUrl": None,
            "category": category,
            "author": author,
            "authorUrl": author_url,
            "sourceUrl": source_url,
            "imageUrls": [image_url] if image_url else [],
            "syncedAt": None,
        }
        results.append(record)
    
    return results


def fetch_evolink(session) -> list[dict]:
    """获取所有 EvoLink cases"""
    print("📦 正在获取 EvoLink cases ...")
    all_records = []
    
    for slug, category in EVOLINK_CATEGORIES.items():
        url = f"{EVOLINK_CASES_URL}/{slug}.md"
        print(f"  → {slug}.md ...", end=" ", flush=True)
        md_text = fetch_url(session, url, allow_404=True)
        if md_text:
            records = parse_evolink_case(md_text, category, slug)
            print(f"{len(records)} 条")
            all_records.extend(records)
        else:
            print("跳过（404）")
        time.sleep(REQUEST_DELAY)
    
    print(f"  ✅ EvoLink 合计: {len(all_records)} 条\n")
    return all_records


# ═══════════════════════════════════════════════════════════════
#  YouMind Sitemap 同步
# ═══════════════════════════════════════════════════════════════

def fetch_youmind_sitemap_urls(session) -> list[str]:
    """从 YouMind sitemap 获取所有提示词页面 URL"""
    print("📦 正在获取 YouMind sitemap ...")
    all_urls = []
    
    for idx in YOUMIND_SITEMAP_INDICES:
        url = YOUMIND_SITEMAP_TEMPLATE.format(idx)
        print(f"  → sitemap/{idx}.xml ...", end=" ", flush=True)
        xml_text = fetch_url(session, url, allow_404=True)
        if not xml_text:
            print("跳过（404 或失败）")
            continue
        
        try:
            root = ET.fromstring(xml_text)
            # 处理命名空间
            ns = {"ns": "http://www.sitemaps.org/schemas/sitemap/0.9"}
            urls = []
            for url_el in root.findall(".//ns:url/ns:loc", ns):
                loc = url_el.text.strip() if url_el.text else ""
                urls.append(loc)
            if not urls:
                # 无命名空间
                for url_el in root.findall(".//{http://www.sitemaps.org/schemas/sitemap/0.9}url/{http://www.sitemaps.org/schemas/sitemap/0.9}loc"):
                    urls.append(url_el.text.strip())
            if not urls:
                # 纯文本搜索
                urls = re.findall(r'<loc>([^<]+)</loc>', xml_text)
            
            print(f"{len(urls)} URLs")
            all_urls.extend(urls)
        except ET.ParseError as e:
            print(f"XML 解析失败: {e}")
            # fallback: 正则提取
            urls = re.findall(r'<loc>([^<]+)</loc>', xml_text)
            print(f"  正则提取 {len(urls)} URLs")
            all_urls.extend(urls)
        
        time.sleep(REQUEST_DELAY)
    
    # 去重 & 只保留英文 URL（无语言前缀）
    seen = set()
    clean_urls = []
    for u in all_urls:
        if u in seen:
            continue
        seen.add(u)
        # 过滤语言变体：/zh-CN/, /zh-TW/, /ja-JP/, /ko-KR/, /tr-TR/, /es-419/
        if re.search(r'/(zh-CN|zh-TW|ja-JP|ko-KR|tr-TR|es-419)/', u):
            continue
        clean_urls.append(u)
    
    print(f"  ✅ YouMind sitemap 合计: {len(clean_urls)} 个唯一 URL\n")
    return clean_urls


def parse_youmind_detail(html_text: str, url: str) -> dict | None:
    """
    从 YouMind 详情页提取提示词数据。
    
    尝试多种策略：
    1. JSON-LD (application/ld+json) → CreativeWork
    2. __NEXT_DATA__ 或 RSC payload
    3. Meta tags + 页面正文正则回退
    """
    if not html_text:
        return None
    
    prompt = ""
    title = ""
    image_url = ""
    author = ""
    author_url = ""
    source_url = ""
    model_id = "gpt-image-2"  # 默认
    media_type = "image"
    
    # ── 策略 1: JSON-LD ──
    ld_match = re.search(
        r'<script\s+type="application/ld\+json"[^>]*>(.*?)</script>',
        html_text, re.DOTALL
    )
    if ld_match:
        try:
            ld_data = json.loads(ld_match.group(1))
            if isinstance(ld_data, list):
                ld_data = ld_data[0] if ld_data else {}
            if ld_data.get("@type") == "CreativeWork":
                prompt = ld_data.get("text", "")
                image_url = ld_data.get("image", "")
                title = ld_data.get("name", "") or ld_data.get("headline", "")
                if ld_data.get("about") and isinstance(ld_data["about"], dict):
                    about_name = ld_data["about"].get("name", "").lower()
                    model_id = YOUMIND_MODEL_MAP.get(about_name, model_id)
                if ld_data.get("author"):
                    auth = ld_data["author"]
                    if isinstance(auth, dict):
                        author = auth.get("name", "")
                        author_url = auth.get("url", "")
                    elif isinstance(auth, str):
                        author = auth
                if ld_data.get("isBasedOn"):
                    source_url = ld_data["isBasedOn"] if isinstance(ld_data["isBasedOn"], str) else ld_data["isBasedOn"].get("url", "")
        except (json.JSONDecodeError, KeyError):
            pass
    
    # ── 策略 2: 从 URL 判断类型 ──
    if "/video-prompts/" in url or "/video/" in url:
        media_type = "video"
    
    # ── 策略 3: 正则提取标题 ──
    if not title:
        # 尝试 <title> 标签
        tm = re.search(r'<title>([^<]+)</title>', html_text)
        if tm:
            raw_title = tm.group(1)
            # 去除站点后缀
            raw_title = re.sub(r'\s*[-–|]\s*YouMind.*$', '', raw_title).strip()
            title = raw_title
    
    # ── 策略 4: 从 slug 提取标题 ──
    if not title:
        slug_match = re.search(r'/prompts/([^/]+)-\d+$', url)
        if slug_match:
            title = slug_match.group(1).replace("-", " ").title()
    
    # ── 策略 5: 提取图片 ──
    if not image_url:
        og_img = re.search(r'<meta\s+property="og:image"\s+content="([^"]+)"', html_text)
        if og_img:
            image_url = og_img.group(1)
    
    # ── 策略 6: 提取 prompt 正文 ──
    if not prompt:
        # 尝试找代码块或 pre 标签中的内容
        pre_match = re.search(r'<pre[^>]*>\s*<code[^>]*>(.*?)</code>', html_text, re.DOTALL)
        if pre_match:
            prompt = clean_prompt(pre_match.group(1))
    
    if not prompt and not title:
        return None
    
    # ── 策略 7: 提取 Twitter 来源 ──
    if not source_url:
        tw_match = re.search(r'https://x\.com/\w+/status/(\d+)', html_text)
        if tw_match:
            source_url = tw_match.group(0)
    
    twitter_id = extract_twitter_status_id(source_url)
    record_id = make_id(model_id, twitter_id, url)
    
    return {
        "id": record_id,
        "model": model_id,
        "mediaType": media_type,
        "title": title.strip() if title else "",
        "prompt": prompt.strip() if prompt else "",
        "thumbnail": image_url,
        "videoUrl": None,
        "category": None,
        "author": author,
        "authorUrl": author_url,
        "sourceUrl": source_url,
        "imageUrls": [image_url] if image_url else [],
        "syncedAt": None,
    }


def fetch_youmind_details(session, urls: list[str]) -> list[dict]:
    """批量获取 YouMind 详情页"""
    print(f"📦 正在获取 {len(urls)} 个 YouMind 详情页 ...")
    records = []
    failed = 0
    
    with ThreadPoolExecutor(max_workers=MAX_CONCURRENT) as executor:
        future_map = {}
        for i, url in enumerate(urls):
            future = executor.submit(fetch_url, session, url, allow_404=True)
            future_map[future] = (i, url)
            time.sleep(REQUEST_DELAY / MAX_CONCURRENT)
        
        for future in as_completed(future_map):
            i, url = future_map[future]
            try:
                html = future.result()
                if html:
                    record = parse_youmind_detail(html, url)
                    if record and record.get("title") and record.get("prompt"):
                        records.append(record)
                    elif record:
                        # 至少有一部分数据
                        records.append(record)
                    else:
                        failed += 1
                else:
                    failed += 1
            except Exception as e:
                failed += 1
            
            if (i + 1) % 50 == 0:
                print(f"  ... {i + 1}/{len(urls)} (已获取 {len(records)} 条, 失败 {failed})", flush=True)
    
    print(f"  ✅ YouMind 详情页: {len(records)} 条有效, {failed} 失败\n")
    return records


# ═══════════════════════════════════════════════════════════════
#  YouMind README 同步
# ═══════════════════════════════════════════════════════════════

def parse_youmind_readme(md_text: str, model_id: str, repo_name: str) -> list[dict]:
    """解析 YouMind README 中的 prompt 块"""
    results = []
    
    # 找 #### 📝 Prompt 或 #### Prompt 块
    blocks = re.split(r'####\s*(?:📝\s*)?[Pp]rompt', md_text)
    
    for block in blocks[1:]:  # 跳过第一个（标题之前的）
        prompt = ""
        title = ""
        image_url = ""
        source_url = ""
        author = ""
        
        # 提取 prompt 文本（代码块或纯文本）
        code_match = re.search(r'```\s*\n(.*?)```', block, re.DOTALL)
        if code_match:
            prompt = clean_prompt(code_match.group(1))
        else:
            # 取前几行作为 prompt
            lines = block.strip().split("\n")
            prompt_lines = []
            for line in lines:
                if line.startswith("![") or line.startswith("<img") or line.startswith("---"):
                    break
                if line.strip():
                    prompt_lines.append(line)
                if len(prompt_lines) > 3 and not line.strip():
                    break
            prompt = clean_prompt("\n".join(prompt_lines))
        
        # 提取图片：跳过 shields.io 徽章，找真正的生成图
        # 优先找 HTML <img> 标签中的真实图片
        for m in re.finditer(r'<img\s+src="([^"]+)"', block):
            url = m.group(1)
            if any(d in url for d in ('cms-assets.youmind.com', 'githubusercontent.com',
                                       'cloudflarestream.com', 'pbs.twimg.com')):
                image_url = url
                break
        
        # 如果没找到真实图，试试 markdown 图片（排除 shields.io）
        if not image_url:
            for m in re.finditer(r'!\[.*?\]\(([^)]+)\)', block):
                url = m.group(1)
                if 'shields.io' not in url and 'img.shields.io' not in url and 'awesome.re' not in url:
                    image_url = url
                    break
        
        # 提取 Twitter 链接
        tw_match = re.search(r'https://x\.com/\w+/status/(\d+)', block)
        if tw_match:
            source_url = tw_match.group(0)
            author_match = re.search(r'https://x\.com/(\w+)', source_url)
            if author_match:
                author = f"@{author_match.group(1)}"
                author_url = source_url.split("/status/")[0]
        
        # 提取标题
        h_match = re.search(r'^\*?\*?([^*\n]{5,80}?)\*?\*?\s*\n', block)
        if not h_match:
            h_match = re.search(r'^#+\s*(.{5,80})$', block, re.MULTILINE)
        if h_match:
            title = h_match.group(1).strip()
        
        if not title and prompt:
            title = prompt.split("\n")[0][:80].strip()
        
        if prompt:
            twitter_id = extract_twitter_status_id(source_url)
            record_id = make_id(model_id, twitter_id, f"ym_readme_{repo_name}_{hashlib.md5(prompt.encode()).hexdigest()[:8]}")
            
            results.append({
                "id": record_id,
                "model": model_id,
                "mediaType": "video" if "seedance" in model_id or "grok" in model_id else "image",
                "title": title.strip(),
                "prompt": prompt,
                "thumbnail": image_url,
                "videoUrl": None,
                "category": None,
                "author": author,
                "authorUrl": f"https://x.com/{author.lstrip('@')}" if author else "",
                "sourceUrl": source_url,
                "imageUrls": [image_url] if image_url else [],
                "syncedAt": None,
            })
    
    return results


def fetch_youmind_readme(session) -> list[dict]:
    """获取 YouMind README 仓库"""
    print("📦 正在获取 YouMind README ...")
    all_records = []
    
    for owner, repo in YOUMIND_README_REPOS:
        model_id = README_MODEL_MAP.get(repo)
        if not model_id:
            continue
        
        url = f"https://raw.githubusercontent.com/{owner}/{repo}/main/README.md"
        print(f"  → {repo} ...", end=" ", flush=True)
        md_text = fetch_url(session, url, allow_404=True)
        if md_text:
            records = parse_youmind_readme(md_text, model_id, repo)
            print(f"{len(records)} 条")
            all_records.extend(records)
        else:
            print("跳过（404）")
        time.sleep(REQUEST_DELAY)
    
    print(f"  ✅ YouMind README 合计: {len(all_records)} 条\n")
    return all_records


# ═══════════════════════════════════════════════════════════════
#  迁移: 现有 data.json → 新格式
# ═══════════════════════════════════════════════════════════════

def migrate_data_json() -> list[dict]:
    """从现有 data.json 迁移到新 schema"""
    if not DATA_JSON.exists():
        print(f"⚠️  {DATA_JSON} 不存在，跳过迁移")
        return []
    
    print(f"📦 正在迁移 {DATA_JSON} ...")
    with open(DATA_JSON, "r", encoding="utf-8") as f:
        old_data = json.load(f)
    
    records = []
    for item in old_data:
        source_url = item.get("sourceUrl", "")
        twitter_id = extract_twitter_status_id(source_url)
        record_id = make_id("gpt-image-2", twitter_id, item.get("id", ""))
        
        image_urls = item.get("imageUrls", [])
        if isinstance(image_urls, str):
            image_urls = [image_urls]
        
        record = {
            "id": record_id,
            "model": "gpt-image-2",
            "mediaType": "image",
            "title": item.get("title", ""),
            "prompt": item.get("prompt", ""),
            "thumbnail": image_urls[0] if image_urls else "",
            "videoUrl": None,
            "category": item.get("category"),
            "author": item.get("author", ""),
            "authorUrl": item.get("authorUrl", ""),
            "sourceUrl": source_url,
            "imageUrls": image_urls,
            "syncedAt": None,
        }
        records.append(record)
    
    print(f"  ✅ 迁移: {len(records)} 条\n")
    return records


# ═══════════════════════════════════════════════════════════════
#  去重
# ═══════════════════════════════════════════════════════════════

def dedupe(records: list[dict]) -> list[dict]:
    """去重：同一 Twitter status_id 保留最优一条"""
    print(f"🔍 去重前: {len(records)} 条")
    
    # 按 (twitter_id, model) 分组
    groups: dict[str, list[dict]] = {}
    no_twitter = []
    
    for r in records:
        source = r.get("sourceUrl", "")
        tid = extract_twitter_status_id(source)
        if tid:
            key = f"{r.get('model', 'unknown')}_{tid}"
            if key not in groups:
                groups[key] = []
            groups[key].append(r)
        else:
            no_twitter.append(r)
    
    # 每组保留最优
    deduped = []
    for key, group in groups.items():
        if len(group) == 1:
            deduped.append(group[0])
        else:
            # 优先级: 有 videoUrl > prompt 更长 > thumbnail 有效
            best = max(group, key=lambda r: (
                1 if r.get("videoUrl") else 0,
                len(r.get("prompt", "")),
                1 if r.get("thumbnail") else 0,
            ))
            deduped.append(best)
    
    # 无 Twitter ID 的记录：用 id + prompt hash 去重
    seen_no_tw = set()
    for r in no_twitter:
        h = hashlib.md5((r.get("id", "") + r.get("prompt", "")[:200]).encode()).hexdigest()
        if h not in seen_no_tw:
            seen_no_tw.add(h)
            deduped.append(r)
    
    print(f"  ✅ 去重后: {len(deduped)} 条")
    print(f"     (Twitter 去重组: {len(groups)}, 无 Twitter ID: {len(no_twitter)} → {len(seen_no_tw)})\n")
    return deduped


# ═══════════════════════════════════════════════════════════════
#  写入文件
# ═══════════════════════════════════════════════════════════════

def write_output(records: list[dict], synced_at: str):
    """写入 data/index.json 和 data/{model}.json"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    
    # 按模型分组
    model_groups: dict[str, list[dict]] = {}
    for r in records:
        m = r.get("model", "unknown")
        if m not in model_groups:
            model_groups[m] = []
        model_groups[m].append(r)
    
    # 写入各模型文件
    for mdef in MODEL_DEFS:
        mid = mdef["id"]
        filepath = DATA_DIR / mdef["file"]
        items = model_groups.get(mid, [])
        
        # 设置 syncedAt
        for item in items:
            item["syncedAt"] = synced_at
        
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(items, f, ensure_ascii=False, indent=2)
        print(f"  📄 {mdef['file']}: {len(items)} 条")
    
    # 写入 index.json
    index = {
        "version": 2,
        "syncedAt": synced_at,
        "models": [],
        "total": len(records),
    }
    
    for mdef in MODEL_DEFS:
        mid = mdef["id"]
        count = len(model_groups.get(mid, []))
        media_type = model_groups[mid][0]["mediaType"] if model_groups.get(mid) else "image"
        index["models"].append({
            "id": mid,
            "label": {"zh": mdef["label_zh"], "en": mdef["label_en"]},
            "file": mdef["file"],
            "count": count,
            "mediaType": media_type,
            "color": mdef["color"],
        })
    
    with open(DATA_DIR / "index.json", "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    
    print(f"\n  📊 data/index.json: {len(records)} 条总计\n")


# ═══════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="搭子提示词库数据同步")
    parser.add_argument("--migrate", action="store_true", help="仅从 data.json 迁移")
    parser.add_argument("--dry-run", action="store_true", help="预览不写入")
    parser.add_argument("--skip-youmind", action="store_true", help="跳过 YouMind（仅 EvoLink）")
    parser.add_argument("--skip-youmind-detail", action="store_true", help="跳过 YouMind 详情页（只抓 sitemap URL 列表）")
    args = parser.parse_args()
    
    if not HAS_REQUESTS:
        print("❌ 需要安装 requests: pip install requests", file=sys.stderr)
        sys.exit(1)
    
    synced_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    all_records = []
    
    if args.migrate:
        all_records = migrate_data_json()
    else:
        session = get_session()
        
        # 1. EvoLink cases
        evolink_records = fetch_evolink(session)
        all_records.extend(evolink_records)
        
        # 2. YouMind sitemap + 详情页
        if not args.skip_youmind:
            ym_urls = fetch_youmind_sitemap_urls(session)
            if ym_urls and not args.skip_youmind_detail:
                ym_records = fetch_youmind_details(session, ym_urls)
                all_records.extend(ym_records)
            
            # 3. YouMind README
            ym_readme_records = fetch_youmind_readme(session)
            all_records.extend(ym_readme_records)
        
        # 4. 并入现有 data.json 迁移数据（避免丢失已有数据）
        if DATA_JSON.exists():
            migrated = migrate_data_json()
            # 以 EvoLink/YouMind 抓取数据为主，迁移数据补充
            existing_ids = {r["id"] for r in all_records}
            for r in migrated:
                if r["id"] not in existing_ids:
                    all_records.append(r)
    
    # 去重
    all_records = dedupe(all_records)
    
    if args.dry_run:
        print("🏁 [dry-run] 预览:")
        for mdef in MODEL_DEFS:
            count = sum(1 for r in all_records if r["model"] == mdef["id"])
            print(f"  {mdef['id']}: {count} 条")
        print(f"  总计: {len(all_records)} 条")
        return
    
    write_output(all_records, synced_at)
    print(f"🏁 同步完成: {len(all_records)} 条 → data/")
    
    # 如果 data.json 存在，标记为已迁移
    if DATA_JSON.exists() and not args.migrate:
        print(f"💡 提示: data.json 可删除（数据已迁移到 data/ 目录）")


if __name__ == "__main__":
    main()
