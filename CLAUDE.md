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
| **许可** | CC0（`LICENSE`） |

### 商业目标（改动任何 UI 前请先理解）

1. 用户在本站浏览、搜索、查看参考媒体、**复制提示词**
2. 通过 Logo / Hero CTA / Modal 按钮 **跳转到 jiucaihezi.studio 创作**
3. 数据尽量全、可随上游仓库/公开源自动更新
4. **不**接入 Evolink/YouMind 等第三方 API 推广区（现有 `index.html` API 区计划删除）

---

## 2. 当前实现（main 基线，未改版前）

```
dazi-studio/
├── index.html          # 单页：Hero + 画廊 + API 区（将删除）+ Footer
├── css/style.css       # 暗色主题，#7c5cff 主色
├── js/app.js           # 全部交互逻辑（~370 行）
├── data.json           # 763 条 GPT Image 2 提示词（单文件）
├── LICENSE
└── mockup.html         # UI 示意（docs 分支，非生产）
```

### 数据流（现版）

```
fetch('data.json') → state.cases → 搜索/分类筛选 → 卡片网格 → Modal 复制 prompt
```

### `data.json` 单条 schema（现版）

```json
{
  "id": "e-commerce_113",
  "caseNum": 113,
  "title": "E-commerce Main Image - Luxury Amber Perfume Ad",
  "category": "E-commerce",
  "sourceUrl": "https://x.com/...",
  "author": "@Polanco_IA",
  "authorUrl": "https://x.com/Polanco_IA",
  "imageUrls": ["https://raw.githubusercontent.com/EvoLinkAI/.../output.jpg"],
  "prompt": "..."
}
```

### `app.js` 要点

- **i18n**：中英文，`localStorage` 键 `dazi-lang`，默认 `zh`
- **分类**：7 类 EvoLink 分类，`categoryNames` 中英文映射
- **分页**：`perPage: 24`，加载更多
- **懒加载**：`IntersectionObserver` 加载卡片图
- **Modal**：仅图片，复制 prompt 到剪贴板
- **无**模型维度、无视频、无多文件数据

### `index.html` 要点

- Logo 已链 `https://jiucaihezi.studio/`
- Nav：画廊 / API / GitHub
- Hero 统计数字由 `app.js` 从数据计算

---

## 3. 计划中的改版（见 docs/SDD.md，尚未实现）

代号：**搭子提示词库（Prompt Hub）**

| 维度 | 现版 | 目标 |
|------|------|------|
| 数据量 | 763 条 | 免费方案约 **1,500–2,000** 条（公开源去重后） |
| 模型 | 仅 GPT Image 2 | GPT Image 2、Nano Banana、Seedream、Seedance、Grok Imagine |
| 媒体 | 仅图片 | 图片 + 视频（缩略图 + 播放） |
| 数据文件 | 单 `data.json` | `data/index.json` + `data/{model}.json` |
| API 区 | 有 | **删除** |
| 引流 | 弱 | Modal 双按钮：复制 + 去韭菜盒子创作 |

### 免费数据同步（计划 `scripts/sync.py`）

| 源 | 方式 | 约条数 |
|----|------|--------|
| EvoLink `cases/*.md` | 解析 Markdown | ~895 |
| YouMind sitemap + 详情页 JSON-LD | 爬公开 SEO 页 | ~1,443 |
| YouMind README ×4 | 解析增量 | ~460（与上重叠） |

**重要限制**：YouMind 画廊声称 3 万+，但全量在私有 CMS；**不付费、无 API Key 时无法拿到 3 万+**。公开爬取上限约两千条级别。

### 目标数据 schema（计划）

```json
{
  "id": "ym_13460",
  "model": "gpt-image-2",
  "mediaType": "image",
  "title": "...",
  "prompt": "...",
  "thumbnail": "https://...",
  "videoUrl": null,
  "category": "...",
  "author": "...",
  "authorUrl": "...",
  "sourceUrl": "https://x.com/..."
}
```

去重键：Twitter `status` ID（从 `sourceUrl` / `isBasedOn` 提取）。

---

## 4. 开发约束

- **不要**引入 React/Vite/Webpack，除非 SDD 修订并用户确认
- **不要**恢复或扩展 API 推广区
- **不要**在本站调用任何生图/生视频 API
- 改动保持与现有 CSS 变量、命名风格一致
- 图片/视频 URL 保持外链（cms-assets.youmind.com、GitHub raw、cloudflarestream），不下载入库（除非 SDD 修订）
- 用户未要求时**不要**新建无关 markdown

---

## 5. 本地开发

```bash
# 任意静态服务器
cd /path/to/dazi-studio
python3 -m http.server 8080
# 打开 http://localhost:8080
```

无 `npm install`，无测试框架。

---

## 6. Git 与分支

| 分支 | 用途 |
|------|------|
| `main` | 当前生产基线 |
| `docs/prompt-hub-sdd` | SDD + CLAUDE.md + mockup 示意 |
| `website` | 历史分支，可能过时 |

远程：`origin` → `https://github.com/liuyunlong2021-wq/my-gpt-image-2.git`

---

## 7. 相关文件与链接

| 资源 | URL |
|------|-----|
| 设计方案 | [docs/SDD.md](docs/SDD.md) |
| UI 示意 | [mockup.html](mockup.html)（浏览器直接打开） |
| EvoLink 数据源 | https://github.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts |
| YouMind GPT Image 2 | https://github.com/YouMind-OpenLab/awesome-gpt-image-2 |
| YouMind sitemap | https://youmind.com/sitemaps/prompts/sitemap/0.xml（共 0–2） |
| 主站 | https://jiucaihezi.studio/ |

---

## 8. 建议实施顺序（用户已讨论、待拍板）

1. **阶段 A**：UI 改版（删 API、模型 Tab、Modal 引流），仍用现有 `data.json` — 约半天  
2. **阶段 B**：`scripts/sync.py` + `data/*.json` + 前端按模型加载 — 1–2 天  
3. **阶段 C**：`.github/workflows/sync-prompts.yml` 周同步 — 约 30 分钟  

**在用户阅读 SDD 并确认前，不要默认实施 B/C。**

---

## 9. 常见任务速查

| 任务 | 改哪些文件 |
|------|-----------|
| 改文案/结构 | `index.html`, `js/app.js`（`i18n`） |
| 改样式 | `css/style.css` |
| 加提示词（临时） | `data.json` 或未来 `data/{model}.json` |
| 批量更新数据 | 未来 `scripts/sync.py` → 生成 `data/` |
| 加模型 Tab | `index.html`, `app.js`, `style.css` |
| 视频 Modal | `app.js`, `style.css` |

---

## 10. 调研产物（勿提交）

以下文件为本地调研缓存，已应在 `.gitignore` 中忽略：

`.ym-page.html`, `.ps*.xml`, `.sitemap.xml`, `.prompt-page.html`, `.api.js` 等点开头的临时文件。