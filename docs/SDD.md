# SDD — 搭子提示词库（dazi.studio）软件设计说明

| 元数据 | 值 |
|--------|-----|
| 版本 | 0.1 Draft |
| 日期 | 2026-06-19 |
| 状态 | **已批准** — 阶段 A 实施中（2026-06-19 用户拍板） |
| 分支 | `docs/prompt-hub-sdd` |
| 作者 | Dazi Studio / AI 协作起草 |

---

## 1. 背景与目标

### 1.1 业务背景

- **dazi.studio**：静态提示词展示站，隶属「搭子 / 韭菜盒子」生态。
- **jiucaihezi.studio**：主站，提供生图、生视频等创作能力。
- 用户路径：在 dazi.studio **看参考图/视频 → 复制提示词 → 去主站创作**。

### 1.2 设计目标

| ID | 目标 | 优先级 |
|----|------|--------|
| G1 | 展示参考媒体（图/视频）与完整可复制提示词 | P0 |
| G2 | 数据在免费前提下尽量全，并可持续增量更新 | P0 |
| G3 | 明确引流至 jiucaihezi.studio（Logo、CTA、Modal） | P0 |
| G4 | 移除 API / 生成能力 / 第三方商业推广 | P0 |
| G5 | 多 AI 模型提示词统一入口（Tab 切换） | P1 |
| G6 | 实施与维护成本低（无后端、无构建链） | P1 |

### 1.3 非目标（明确不做）

- 不在 dazi.studio 调用生图/生视频 API
- 不付费申请 YouMind CMS API（除非未来业务策略变更）
- 不引入 Airbyte、数据库、后端服务
- 不把媒体文件批量下载到仓库（首期外链 CDN）

---

## 2. 现状分析（As-Is）

### 2.1 架构

```
Browser → 静态文件 (HTML/CSS/JS) → fetch data.json → 渲染画廊
```

### 2.2 数据

- 单文件 `data.json`，**763 条**，来源 EvoLinkAI 仓库整理。
- 仅 **GPT Image 2**，仅 **图片**，7 个内容分类。
- 图片托管：GitHub raw（EvoLinkAI 仓库）。

### 2.3 功能清单

| 功能 | 状态 |
|------|------|
| 搜索 | ✅ |
| 分类筛选 | ✅ |
| 分页加载更多 | ✅ |
| 图片懒加载 | ✅ |
| Modal + 复制 prompt | ✅ |
| 中英文切换 | ✅ |
| 视频展示 | ❌ |
| 多模型 | ❌ |
| 引流主站 CTA | ⚠️ 仅 Logo |
| API 推广区 | ✅ 存在（计划删除） |

### 2.4 痛点

1. 数据单一模型、规模小（763 vs 社区数万级）。
2. 与主站引流路径不清晰（缺 Modal/ Hero 级 CTA）。
3. `data.json` 无自动同步，需手工维护。
4. API 区与产品定位冲突。

---

## 3. 目标架构（To-Be）

### 3.1 逻辑架构

```
┌─────────────────────────────────────────────────────────┐
│                    dazi.studio (静态)                    │
│  index.html + app.js + style.css                        │
│  · 模型 Tab · 类型筛选 · 搜索 · 卡片 · Modal(图/视频)     │
│  · 复制 prompt · CTA → jiucaihezi.studio                │
└───────────────────────────┬─────────────────────────────┘
                            │ fetch
┌───────────────────────────▼─────────────────────────────┐
│  data/index.json  +  data/{model}.json  (构建产物)       │
└───────────────────────────┬─────────────────────────────┘
                            │ 生成
┌───────────────────────────▼─────────────────────────────┐
│  scripts/sync.py  (本地 / GitHub Actions)                │
│  · EvoLink cases/*.md                                    │
│  · YouMind sitemap → 详情页 JSON-LD                      │
│  · YouMind README (增量)                                 │
│  · 去重 · 按 model 分文件输出                             │
└─────────────────────────────────────────────────────────┘
```

### 3.2 部署架构

- 与现网相同：GitHub Pages / Cloudflare Pages / 任意静态托管。
- CI：GitHub Actions 定时 `sync.py` → commit `data/` → 触发 Pages 部署。

无服务器运行时。

---

## 4. 数据设计

### 4.1 记录 Schema（v2）

```typescript
interface PromptRecord {
  id: string;              // 全局唯一，如 "evolink_113" | "ym_13460"
  model: ModelId;          // 见 4.2
  mediaType: "image" | "video";
  title: string;
  prompt: string;            // 完整提示词正文
  thumbnail: string;       // 卡片/Modal 封面
  videoUrl?: string | null; // 视频直链（若有）
  category?: string;       // 内容分类（可选，兼容旧 7 类 + 新类）
  author?: string;
  authorUrl?: string;
  sourceUrl?: string;      // 原始推文等，用于去重
  syncedAt?: string;         // ISO8601，同步时间
}

type ModelId =
  | "gpt-image-2"
  | "nano-banana"
  | "seedream"
  | "seedance"
  | "grok-imagine";
```

### 4.2 模型与文件映射

| model | 输出文件 | 媒体类型 | 主要数据源 |
|-------|----------|----------|-----------|
| gpt-image-2 | `data/gpt-image-2.json` | 图 | EvoLink cases + YouMind |
| nano-banana | `data/nano-banana.json` | 图 | YouMind |
| seedream | `data/seedream.json` | 图 | YouMind（无独立 GitHub 仓） |
| seedance | `data/seedance.json` | 视频 | YouMind |
| grok-imagine | `data/grok-imagine.json` | 视频 | YouMind |

### 4.3 `data/index.json`

```json
{
  "version": 1,
  "syncedAt": "2026-06-19T12:00:00Z",
  "models": [
    { "id": "gpt-image-2", "label": { "zh": "GPT Image 2", "en": "GPT Image 2" }, "file": "gpt-image-2.json", "count": 612, "mediaType": "image" },
    { "id": "seedance", "label": { "zh": "Seedance 2.0", "en": "Seedance 2.0" }, "file": "seedance.json", "count": 412, "mediaType": "video" }
  ],
  "total": 1847
}
```

### 4.4 去重策略

1. 从 `sourceUrl` / JSON-LD `isBasedOn` 提取 Twitter `status_id`。
2. 同一 `status_id` 保留一条，优先级：
   - 有 `videoUrl` > 仅图
   - `prompt` 更长更完整
   - `thumbnail` 有效 URL
3. 无 `sourceUrl` 时用 `id`（slug 末尾数字）作次级键。

### 4.5 数据量预期（免费方案）

| 来源 | 原始 | 去重后贡献（估） |
|------|------|----------------|
| EvoLink cases/*.md | ~895 | ~700–850 |
| YouMind 公开详情页 (sitemap) | ~1,443 | ~900–1,200 |
| YouMind README | ~460 | 增量 <100 |
| **合计** | — | **~1,500–2,000** |

**不等于 YouMind 画廊显示的 3 万+**（全量在 CMS，需付费 API）。

### 4.6 同步源技术细节

#### A. EvoLink `cases/*.md`

- URL：`https://raw.githubusercontent.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts/main/cases/{file}.md`
- 文件：`ecommerce.md`, `ad-creative.md`, `portrait.md`, `poster.md`, `character.md`, `ui.md`, `comparison.md`
- 解析：`### Case N:`、`**Prompt:**` 代码块、`<img src="...">`

#### B. YouMind Sitemap + JSON-LD

- Sitemap：
  - `https://youmind.com/sitemaps/prompts/sitemap/0.xml`
  - `https://youmind.com/sitemaps/prompts/sitemap/1.xml`
  - `https://youmind.com/sitemaps/prompts/sitemap/2.xml`
- 仅采集英文 URL：
  - `https://youmind.com/prompts/{slug}-{id}`
  - `https://youmind.com/video-prompts/{slug}-{id}`
- 详情页 `<script type="application/ld+json">` 内 `CreativeWork`：
  - `text` → prompt
  - `image` → thumbnail
  - `about.name` → 模型映射
  - `author`, `isBasedOn`

#### C. YouMind README（增量）

- 仓库：`awesome-gpt-image-2`, `awesome-nano-banana-pro-prompts`, `awesome-seedance-2-prompts`, `awesome-grok-imagine-prompts`
- 解析 `#### 📝 Prompt` 块（与现网 README 结构一致）

#### D. 爬取礼仪

- 并发 ≤ 5，间隔 ≥ 200ms
- 遵守 `robots.txt`（`/api/*` 禁止，sitemap 允许）
- User-Agent 标识项目名 + 联系 URL

---

## 5. 前端设计

### 5.1 页面结构（改版后）

```
Header (Logo → jiucaihezi.studio | 画廊 | 语言)
Hero (搭子提示词库 | 副标题 | 主站 CTA | 统计)
Model Tab Bar (5 模型 + 数量)
Type Filter (全部 | 图片 | 视频)
Search
Category Bar (保留，按当前模型动态)
Gallery Grid
Load More
Footer (数据来源致谢 + 主站链接)
Modal (媒体 | 元信息 | prompt | 复制 | 去韭菜盒子创作)
```

**删除**：`#api-section` 整块。

### 5.2 交互说明

| 交互 | 行为 |
|------|------|
| 切换模型 Tab | `fetch(data/{model}.json)` 或使用已缓存；重置分类/搜索/分页 |
| 类型筛选 | 过滤 `mediaType` |
| 点击卡片 | 打开 Modal；视频显示 `<video controls>` |
| 复制提示词 | `navigator.clipboard.writeText`；Toast「已复制，去韭菜盒子粘贴生成」 |
| 去韭菜盒子创作 | 新标签打开 `https://jiucaihezi.studio/`（可加 UTM） |
| Logo 点击 | 同主站 |

### 5.3 UI 参考

见仓库根目录 `mockup.html`（可本地 `open mockup.html` 预览）。

### 5.4 `app.js` 改动概要

| 模块 | 改动 |
|------|------|
| `loadData` | 先加载 `data/index.json`，再按模型加载分文件 |
| `state` | 增加 `activeModel`, `mediaTypeFilter` |
| `renderCategories` | 基于当前模型数据动态生成 |
| `createCard` | 视频卡片加 ▶ 角标 |
| `openModal` | 支持 video 分支；增加主站 CTA |
| `i18n` | 更新文案；删除 API 相关键 |
| 删除 | API 区无对应逻辑 |

预估：**+120 行** 量级修改，非重写。

### 5.5 性能

- 分模型懒加载：首屏只拉一个 JSON（约 200–500KB），避免单次 50MB+
- 保留 IntersectionObserver 图片懒加载
- 视频：Modal 打开后再设置 `src`（避免列表页预加载）

---

## 6. 同步子系统设计

### 6.1 `scripts/sync.py`

```
main()
├── fetch_evolink()      → List[PromptRecord]
├── fetch_youmind_sitemap() → List[str]  # URLs
├── fetch_youmind_details(urls) → List[PromptRecord]
├── fetch_youmind_readme() → List[PromptRecord]
├── dedupe(all) → List[PromptRecord]
├── split_by_model() → Dict[model, list]
├── write data/*.json + data/index.json
└── print summary stats
```

依赖：Python 3.10+ 标准库 + `requests`（或 stdlib urllib）。

### 6.2 GitHub Actions

```yaml
name: Sync Prompts
on:
  schedule:
    - cron: '0 3 * * 1'  # 每周一 03:00 UTC
  workflow_dispatch:
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: pip install requests
      - run: python scripts/sync.py
      - run: git config user.name 'github-actions[bot]' && ...
      - run: git add data/ && git diff --staged --quiet || git commit -m "chore: sync prompts"
      - run: git push
```

### 6.3 迁移策略

1. 保留 `data.json` 直至前端切换完成（或 sync 产出后 rename）。
2. 首次 sync 与现 `data.json` 对比条数，人工 spot-check 10 条。
3. 上线后 `data.json` 标记 deprecated 并删除。

---

## 7. 实施计划

### 7.1 阶段划分

| 阶段 | 范围 | 工期（估） | 产出 |
|------|------|-----------|------|
| **A** | UI only：删 API、Hero、Tab、Modal CTA、mockup 落地 | 0.5 天 | 可演示引流路径 |
| **B** | `sync.py` + `data/` + 前端接多文件 | 1–2 天 | 免费数据全量上线 |
| **C** | GitHub Actions 自动同步 | 0.5 小时 | 周更 |
| **D**（可选） | 分类映射优化、UTM、统计 | 按需 | 运营增强 |

### 7.2 文件变更清单

| 文件 | 阶段 | 操作 |
|------|------|------|
| `index.html` | A | 修改 |
| `js/app.js` | A,B | 修改 |
| `css/style.css` | A | 修改 |
| `scripts/sync.py` | B | 新增 |
| `data/index.json` + `data/*.json` | B | 新增（生成） |
| `.github/workflows/sync-prompts.yml` | C | 新增 |
| `data.json` | B | 删除（迁移后） |
| `CLAUDE.md` | — | 已新增 |
| `docs/SDD.md` | — | 本文档 |

### 7.3 验收标准

| ID | 标准 |
|----|------|
| AC1 | 首页无 API 区；Logo 指向 jiucaihezi.studio |
| AC2 | ≥5 模型 Tab 可切换，列表与计数正确 |
| AC3 | 图片/视频条目可打开 Modal，prompt 可复制 |
| AC4 | Modal 含「去韭菜盒子创作」按钮 |
| AC5 | `sync.py` 一键生成 `data/`，条数在 1,400–2,200 区间（随上游波动） |
| AC6 | 周同步 workflow 可手动触发且成功 commit |
| AC7 | 移动端布局可用（Tab 换行、Modal 可滚动） |

---

## 8. 风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| YouMind 更改 HTML/JSON-LD 结构 | sync 失败或字段缺失 | 解析容错 + CI 失败告警；README/EvoLink 作兜底 |
| 外链图片/视频失效 | 卡片空白 | thumbnail 失败占位图；定期 sync 更新 URL |
| 爬取频率限制 | sync 中断 | 限速、重试、分片跑 |
| 数据量远低于用户预期「3万+」 | 产品预期落差 | **本文档 4.5 已说明**；UI 展示真实 `count`，不夸大 |
| sitemap 不覆盖全部 CMS 条目 | 永久缺口 | 接受免费上限；未来再议 CMS 合作 |
| 版权/社区素材 | 合规 | 保留作者与 sourceUrl；页脚注明教育用途与来源 |

---

## 9. 安全与合规

- 不存储用户数据；无登录。
- 不注入用户 HTML（现有 `escHtml` 保留）。
- 外链 `target="_blank"` 加 `rel="noopener noreferrer"`。
- 同步脚本不调用需认证的 `/api/v1/prompts/*`（已验证 401）。

---

## 10. 决策记录（2026-06-19 用户确认）

- [x] **D1**：批准整体方案（Prompt Hub + 免费 sync）
- [x] **D2**：接受数据规模 **~1,500–2,000**（免费上限）
- [x] **D3**：实施顺序 **A → B → C**
- [x] **D4**：B 阶段完成后删除 `data.json`，迁至 `data/{model}.json`
- [x] **D5**：主站链接**不加 UTM**，保持 `https://jiucaihezi.studio/` 干净 URL
- [x] **D6**：**保留** `mockup.html` 作长期 UI 对照参考

---

## 11. 附录

### A. 模型显示名与色标（建议）

| model | 色标 | 中文名 |
|-------|------|--------|
| gpt-image-2 | `#7c5cff` | GPT Image 2 |
| nano-banana | `#f5c542` | Nano Banana Pro |
| seedream | `#5ccc7c` | Seedream 4.5 |
| seedance | `#4a9fff` | Seedance 2.0 |
| grok-imagine | `#ff5c9e` | Grok Imagine |

### B. 上游仓库

- https://github.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts
- https://github.com/YouMind-OpenLab/awesome-gpt-image-2
- https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts
- https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts
- https://github.com/YouMind-OpenLab/awesome-grok-imagine-prompts

### C. 修订记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 0.1 | 2026-06-19 | 初稿：免费同步方案 + UI 改版 + 引流定位 |
| 0.2 | 2026-06-19 | 用户拍板 D1–D6；阶段 A UI 实施 |