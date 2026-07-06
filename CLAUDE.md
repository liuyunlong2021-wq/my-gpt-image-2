# CLAUDE.md — dazi-studio 项目说明（AI 接手必读）

> 本文件供 Claude、Cursor、Copilot 等 AI 工具快速理解仓库上下文。  
> 人类读者请优先看 [docs/SDD.md](docs/SDD.md) 获取完整设计方案与决策记录。

---

## 1. 项目是什么

| 项 | 说明 |
|----|------|
| **仓库** | `dazi-studio` |
| **线上域名** | `dazi.studio`（静态站） |
| **主站（创作）** | [jiucaihezi.studio](https://jiucaihezi.studio/) — 用户复制提示词后去这里生图/生视频 |
| **定位** | **引流展示站**：参考图/视频 + 可复制提示词。**不提供 API、不提供生成能力** |
| **技术栈** | 纯静态 HTML + CSS + 原生 JS，无构建工具、无框架、无后端 |
| **许可** | CC0（本站）；源数据：EvoLinkAI MIT · YouMind CC BY 4.0 |

### 商业目标（改动任何 UI 前请先理解）

1. 用户在本站浏览、搜索、查看参考媒体、**复制提示词**
2. 通过 Logo / Hero CTA / Modal 按钮 **跳转到 jiucaihezi.studio 创作**
3. 数据尽量全、可随上游仓库/公开源自动更新
4. **不**接入 Evolink/YouMind 等第三方 API 推广区

---

## 2. 当前实现（v2，阶段 A/B/C 全部完成）

```
dazi-studio/
├── index.html              # 单页：Hero + 模型 Tab + 画廊 + Footer
├── css/style.css           # 暗色主题，#7c5cff 主色，响应式
├── js/app.js               # 全部交互逻辑（~550 行）
├── data/                   # 构建产物（由 scripts/sync.py 生成，勿手改）
│   ├── index.json          # 模型索引 + 总数
│   ├── gpt-image-2.json    # 991 条（图片）
│   ├── nano-banana.json    # 129 条（图片）
│   ├── seedream.json       # 111 条（图片）
│   ├── seedance.json       # 106 条（视频）
│   └── grok-imagine.json   # 103 条（视频）
├── scripts/
│   └── sync.py             # 数据同步脚本（见 §3）
├── .github/workflows/
│   └── sync-prompts.yml    # 每周一 03:00 UTC 自动同步
├── LICENSE
├── mockup.html             # UI 示意（长期保留）
├── CLAUDE.md
└── docs/SDD.md
```

### 数据流

```
fetch('data/index.json') → 按需 fetch('data/{model}.json') → 缓存 → 搜索/分类/分页 → 卡片网格 → Modal 复制 prompt
```

### 关键数字

| 指标 | 值 |
|------|-----|
| 总提示词 | **1,440** 条 |
| 模型 | 5/5 有数据 |
| 媒体类型 | 图片 4 模型 + 视频 2 模型 |
| 数据更新 | GitHub Actions 每周一自动同步 |
| 部署 | push `main` 分支 → GitHub Pages 自动部署 |

### `data/*.json` 单条 schema（v2）

```json
{
  "id": "gpt-image-2_2047689647967609037",
  "model": "gpt-image-2",
  "mediaType": "image",
  "title": "E-commerce Main Image - Luxury Amber Perfume Ad",
  "prompt": "...",
  "thumbnail": "https://raw.githubusercontent.com/.../output.jpg",
  "videoUrl": null,
  "category": "E-commerce",
  "author": "@Polanco_IA",
  "authorUrl": "https://x.com/Polanco_IA",
  "sourceUrl": "https://x.com/Polanco_IA/status/2047689647967609037",
  "imageUrls": ["https://..."],
  "syncedAt": "2026-06-19T11:00:32Z"
}
```

去重键：Twitter `status` ID（从 `sourceUrl` 提取）。无 sourceUrl 时用 prompt hash 次级键。

### `app.js` 核心概念

- **i18n**：`localStorage` 键 `dazi-lang`，`zh`/`en`，`t(key)` 获取翻译
- **state**：`indexData`（元数据）、`modelData = {}`（模型缓存）、`cases`（当前活跃）、`activeModel`、`activeMediaType`、`activeCategory`
- **分类**：7 类 EvoLink 分类，`categoryNames` 中英文映射；空分类时自动隐藏分类栏
- **分页**：`perPage: 24`，加载更多
- **懒加载**：`IntersectionObserver` 加载卡片图
- **Modal**：图片 `<img>` / 视频 `<video controls>`；复制 prompt + CTA 按钮 → jiucaihezi.studio
- **模型切换**：`loadModelData(modelId)` → 优先缓存，否则 fetch `data/{model}.json`

---

## 3. 同步系统

### 数据源

| 源 | 方式 | 归属模型 |
|----|------|---------|
| [EvoLinkAI `cases/*.md`](https://github.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts) | 解析 `### Case N:` 块 | gpt-image-2 |
| [YouMind README ×5](https://github.com/YouMind-OpenLab/) | 解析 `#### 📝 Prompt` 块 | gpt-image-2, nano-banana, seedream, seedance, grok-imagine |
| YouMind sitemap + 详情页 | 爬公开 SEO 页 JSON-LD | 各模型（待运行） |

### 运行

```bash
# 完整同步（EvoLink + YouMind README，不含慢速详情页爬取）
python3 scripts/sync.py --skip-youmind-detail

# 预览不写入
python3 scripts/sync.py --dry-run

# 所有选项
python3 scripts/sync.py --help
```

### 缩略图域

sync.py 从以下域提取缩略图（跳过 shields.io 徽章）：
- `cms-assets.youmind.com` — YouMind CDN
- `cloudflarestream.com` — Seedance/Grok 视频封面
- `pbs.twimg.com` — Twitter 视频封面
- `raw.githubusercontent.com` — EvoLink 图片

### 添加新模型

改 2 个文件：

1. **`scripts/sync.py`** — 在 `MODEL_DEFS` 加模型定义，在 `YOUMIND_README_REPOS` + `README_MODEL_MAP` 加仓库映射
2. **`js/app.js`** — 在 `MODELS` 数组加模型信息（id、color、中英文名）

---

## 4. 开发约束

- **不要**引入 React/Vite/Webpack，除非 SDD 修订并用户确认
- **不要**恢复或扩展 API 推广区
- **不要**在本站调用任何生图/生视频 API
- **不要**手改 `data/*.json`（应通过 `sync.py` 生成）
- 改动保持与现有 CSS 变量、命名风格一致
- 图片/视频 URL 保持外链，不下载入库（除非 SDD 修订）
- nav 栏只保留语言切换（已删除无意义的「画廊」「GitHub」链接）

---

## 5. 本地开发

```bash
cd /path/to/dazi-studio
python3 -m http.server 8080
# 打开 http://localhost:8080
```

无 `npm install`，无测试框架。

---

## 6. Git 与部署

| 分支 | 用途 |
|------|------|
| `main` | **生产基线**（push 即触发 GitHub Pages 部署到 dazi.studio） |
| `feat/phase-a-ui` | 阶段 A/B/C 开发分支 |
| `docs/prompt-hub-sdd` | SDD + mockup 示意 |

远程：`origin` → `https://github.com/liuyunlong2021-wq/my-gpt-image-2.git`

**部署流程**：`git push origin main` → GitHub Pages 自动构建（约 1-2 分钟）→ dazi.studio 更新

如需合并开发分支到 main：
```bash
git checkout main && git merge feat/xxx && git push origin main
```

---

## 7. 相关文件与链接

| 资源 | URL |
|------|-----|
| 设计方案 | [docs/SDD.md](docs/SDD.md) |
| UI 示意 | [mockup.html](mockup.html)（浏览器直接打开） |
| EvoLink 数据源 | https://github.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts |
| YouMind 组织 | https://github.com/YouMind-OpenLab/（含 5 个模型仓库） |
| YouMind sitemap | https://youmind.com/sitemaps/prompts/sitemap/0.xml（共 0–2） |
| 主站 | https://jiucaihezi.studio/ |
| 线上站 | https://dazi.studio/ |

---

## 8. 常见任务速查

| 任务 | 涉及文件 |
|------|---------|
| 改文案/结构 | `index.html`, `js/app.js`（`i18n` 对象） |
| 改样式 | `css/style.css` |
| 批量更新数据 | `python3 scripts/sync.py --skip-youmind-detail` |
| 添加新模型 Tab | `js/app.js`（`MODELS` 数组）+ `scripts/sync.py`（`MODEL_DEFS` + repo 映射） |
| 添加新数据源 | `scripts/sync.py`（加 fetch 函数 + 解析函数） |
| 改 Hero 统计 | `js/app.js`（`updateHeroStats()`） |
| 改 Modal 按钮 | `js/app.js`（`openModal()` 中的 `modal-actions` 区域） |
| 部署上线 | `git checkout main && git merge feat/xxx && git push origin main` |
| 手动触发 CI 同步 | GitHub → Actions → Sync Prompts → Run workflow |

---

## 9. 踩坑记录 & 经验沉淀

### sync.py 缩略图解析

- **问题**：YouMind README 的首个 `![...]()` 是 shields.io 语言徽章，不是真实图片
- **解法**：只接受 `cms-assets.youmind.com` / `cloudflarestream.com` / `pbs.twimg.com` / `githubusercontent.com` 域名的 `<img>` 或 `![...]()` URL
- **注意**：Seedance/Grok 的 README 图片在 `#### 🎬 Video` 小节而非 `#### 🖼️ Generated Images`

### 多模型懒加载

- `state.modelData = {}` 缓存所有已加载模型，切换 Tab 不重复 fetch
- 空模型（0 条数据时）显示 🚀 +「即将上线」
- `data/index.json` 提供模型列表和计数，前端据此渲染 Tab

### UI 精简

- 删除了 nav 的「画廊」链接（只是滚动到当前页，#gallery-section）
- 删除了 nav 的「GitHub」链接（指向外部 EvoLink 仓库，用户无感知）
- Footer 底部署名改为 `提示词来源：EvoLinkAI（MIT）· YouMind 社区（CC BY 4.0）· 本站 CC0`

### 许可合规

- YouMind README 仓库使用 CC BY 4.0，**要求署名**
- EvoLinkAI 仓库使用 MIT
- 本站 CC0，必须在页脚注明数据来源许可

### 部署

- `dazi.studio` 由 GitHub Pages 托管
- **只有 `main` 分支的变更会触发部署**
- 开发在功能分支（如 `feat/xxx`）进行，完成后 merge 到 `main`

---

## 10. 调研产物（勿提交）

以下文件为本地调研缓存，已在 `.gitignore` 中忽略：

`.ym-page.html`, `.ps*.xml`, `.sitemap.xml`, `.prompt-page.html`, `.api.js` 等点开头的临时文件。