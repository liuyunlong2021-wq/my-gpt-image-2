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

## 2. 当前实现（2026-06-19，阶段 B/C 已完成）

```
dazi-studio/
├── index.html              # 单页：Hero + 模型 Tab + 画廊 + Footer
├── css/style.css           # 暗色主题，#7c5cff 主色
├── js/app.js               # 全部交互逻辑（~500 行）
├── data/                   # 构建产物（由 scripts/sync.py 生成）
│   ├── index.json          # 模型索引 + 总数
│   ├── gpt-image-2.json    # ~1,016 条
│   ├── nano-banana.json    # ~129 条
│   ├── seedream.json       # 0 条（待补充）
│   ├── seedance.json       # ~106 条（视频）
│   └── grok-imagine.json   # ~103 条
├── scripts/
│   └── sync.py             # 数据同步脚本（EvoLink + YouMind README + 去重）
├── .github/workflows/
│   └── sync-prompts.yml    # 每周一自动同步
├── LICENSE
├── mockup.html             # UI 示意（长期保留）
├── CLAUDE.md
└── docs/SDD.md
```

### 数据流（现版）

```
fetch('data/index.json') → 按需 fetch('data/{model}.json') → 缓存 → 搜索/筛选 → 卡片网格 → Modal 复制 prompt
```

- **多模型**：5 个 Tab（GPT Image 2 / Nano Banana / Seedream / Seedance / Grok Imagine）
- **懒加载**：仅首屏加载 index + 当前模型 JSON，切换 Tab 时按需 fetch + 缓存
- **媒体**：支持图片 + 视频卡片，Modal 内 `<video>` 播放
- **去重**：按 Twitter status ID 去重（EvoLink + YouMind README 交叉数据）

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

### `app.js` 要点

- **i18n**：中英文，`localStorage` 键 `dazi-lang`，默认 `zh`
- **分类**：7 类 EvoLink 分类，`categoryNames` 中英文映射（仅当前模型有分类时显示）
- **分页**：`perPage: 24`，加载更多
- **懒加载**：`IntersectionObserver` 加载卡片图
- **Modal**：图片 / 视频；复制 prompt +「去韭菜盒子创作」CTA
- **模型缓存**：`state.modelData = {}`，切换 Tab 复用

## 3. 改版完成情况

| 阶段 | 状态 | 内容 |
|------|------|------|
| **A** | ✅ 已完成 | UI 改版（删 API 区、Hero CTA、Modal 引流、模型 Tab） |
| **B** | ✅ 已完成 | `scripts/sync.py` + `data/` 分模型文件 + 前端多模型加载 |
| **C** | ✅ 已完成 | `.github/workflows/sync-prompts.yml` 每周一自动同步 |
| **D** | ⏳ 可选 | 分类映射优化、UTM 参数、Seedream 数据补充 |

### 同步覆盖

| 源 | 方式 | 状态 |
|----|------|------|
| EvoLink `cases/*.md` | 解析 Markdown（7 类） | ✅ ~895 条 |
| YouMind README ×4 | 解析 `#### 📝 Prompt` 块 | ✅ ~464 条 |
| YouMind sitemap + 详情页 | 爬公开 SEO 页 JSON-LD | ⚠️ sitemap URL 已获取，详情爬取待运行 |
| 去重/分模型输出 | `sync.py` 自动处理 | ✅ |

**总数据量**：~1,354 条（4/5 模型有数据，Seedream 待补充）

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
| 加提示词（临时） | `data/{model}.json` |
| 批量更新数据 | `python3 scripts/sync.py` → 生成 `data/` |
| 加模型 Tab | `index.html`, `app.js`, `style.css` |
| 视频 Modal | `app.js`, `style.css` |
| 加模型 Tab | `index.html`, `app.js`, `style.css` |
| 视频 Modal | `app.js`, `style.css` |

---

## 10. 调研产物（勿提交）

以下文件为本地调研缓存，已应在 `.gitignore` 中忽略：

`.ym-page.html`, `.ps*.xml`, `.sitemap.xml`, `.prompt-page.html`, `.api.js` 等点开头的临时文件。