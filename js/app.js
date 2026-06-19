const JIUCAIHEZI_URL = 'https://jiucaihezi.studio/';

const MODELS = [
  { id: 'gpt-image-2', color: '#7c5cff', name: { zh: 'GPT Image 2', en: 'GPT Image 2' } },
  { id: 'nano-banana', color: '#f5c542', name: { zh: 'Nano Banana', en: 'Nano Banana' } },
  { id: 'seedream', color: '#5ccc7c', name: { zh: 'Seedream 4.5', en: 'Seedream 4.5' } },
  { id: 'seedance', color: '#4a9fff', name: { zh: 'Seedance 2.0', en: 'Seedance 2.0' } },
  { id: 'grok-imagine', color: '#ff5c9e', name: { zh: 'Grok Imagine', en: 'Grok Imagine' } },
];

const categoryNames = {
  zh: {
    'E-commerce': '电商',
    'Ad Creative': '广告创意',
    'Portrait & Photography': '人像摄影',
    'Poster & Illustration': '海报插画',
    'Character Design': '角色设计',
    'UI & Social Media': 'UI 与社交媒体',
    'Comparison & Community': '对比与社区',
  },
  en: {
    'E-commerce': 'E-commerce',
    'Ad Creative': 'Ad Creative',
    'Portrait & Photography': 'Portrait & Photography',
    'Poster & Illustration': 'Poster & Illustration',
    'Character Design': 'Character Design',
    'UI & Social Media': 'UI & Social Media',
    'Comparison & Community': 'Comparison & Community',
  }
};

function tCat(cat) {
  return categoryNames[lang][cat] || cat;
}

function tModel(modelId) {
  const m = MODELS.find(x => x.id === modelId);
  return m ? m.name[lang] : modelId;
}

const i18n = {
  zh: {
    siteTitle: '搭子提示词库',
    logoText: '提示词',
    navGallery: '画廊',
    navGithub: 'GitHub',
    searchPlaceholder: '搜索提示词、分类、作者...',
    allCategories: '全部分类',
    typeAll: '全部',
    typeImage: '🖼 图片',
    typeVideo: '🎬 视频',
    promptsFound: '个提示词',
    noResults: '没有找到匹配的提示词',
    modelComingSoon: '该模型数据即将上线，敬请期待',
    noVideosYet: '当前模型暂无视频条目',
    loadMore: '加载更多',
    remaining: '剩余',
    by: '作者',
    source: '来源',
    case: '案例',
    prompt: '提示词',
    copy: '📋 复制提示词',
    copied: '已复制！',
    createCta: '去韭菜盒子创作 →',
    failedToLoad: '数据加载失败，请重试',
    heroBrand: '搭子',
    heroTitle: '提示词库',
    heroDesc: '参考图 / 参考视频 + 提示词，一站浏览、一键复制，去韭菜盒子创作',
    heroCta: '去韭菜盒子创作 →',
    statPrompts: '提示词',
    statModels: '模型',
    statMedia: '参考图/视频',
    syncHint: '数据每周自动同步',
    tagVideo: '视频',
    footerMain: '由搭子工作室聚合整理 · 数据来自社区贡献 ·',
    footerStudio: '韭菜盒子',
    footerStudioSuffix: '创作主站',
    footerSub: '无生成能力 · 仅展示 + 复制引流',
  },
  en: {
    siteTitle: 'Dazi Prompt Hub',
    logoText: 'Prompts',
    navGallery: 'Gallery',
    navGithub: 'GitHub',
    searchPlaceholder: 'Search prompts, categories, authors...',
    allCategories: 'All Categories',
    typeAll: 'All',
    typeImage: '🖼 Images',
    typeVideo: '🎬 Videos',
    promptsFound: 'prompts',
    noResults: 'No prompts found matching your search.',
    modelComingSoon: 'This model is coming soon.',
    noVideosYet: 'No video prompts for this model yet.',
    loadMore: 'Load More',
    remaining: 'remaining',
    by: 'by',
    source: 'Source',
    case: 'Case',
    prompt: 'Prompt',
    copy: '📋 Copy Prompt',
    copied: 'Copied!',
    createCta: 'Create on Jiucaihezi →',
    failedToLoad: 'Failed to load data. Please try again.',
    heroBrand: 'Dazi',
    heroTitle: 'Prompt Hub',
    heroDesc: 'Reference images & videos with copyable prompts — browse, copy, then create on Jiucaihezi.',
    heroCta: 'Create on Jiucaihezi →',
    statPrompts: 'Prompts',
    statModels: 'Models',
    statMedia: 'References',
    syncHint: 'Data syncs weekly',
    tagVideo: 'Video',
    footerMain: 'Curated by Dazi Studio · Community-sourced data ·',
    footerStudio: 'Jiucaihezi',
    footerStudioSuffix: '— create here',
    footerSub: 'No generation here · Browse & copy only',
  }
};

let lang = localStorage.getItem('dazi-lang') || 'zh';

function t(key) {
  return i18n[lang][key] || key;
}

function setLang(l) {
  lang = l;
  localStorage.setItem('dazi-lang', l);
  document.documentElement.lang = l;
  document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === l));
  translateUI();
  renderModelBar();
  if (state.cases.length) {
    renderCategories();
    filterAndRender();
  }
}

function translateUI() {
  document.title = t('siteTitle');
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
}

const state = {
  indexData: null,
  modelData: {},
  cases: [],
  filtered: [],
  activeModel: 'gpt-image-2',
  activeMediaType: 'all',
  activeCategory: 'All',
  searchQuery: '',
  currentPage: 1,
  perPage: 24,
  loading: false
};

const els = {
  gallery: document.getElementById('gallery'),
  categoryBar: document.getElementById('categoryBar'),
  modelBar: document.getElementById('modelBar'),
  typeBar: document.getElementById('typeBar'),
  searchInput: document.getElementById('searchInput'),
  resultCount: document.getElementById('resultCount'),
  modalOverlay: document.getElementById('modalOverlay'),
  modalContent: document.getElementById('modalContent'),
  closeModal: document.getElementById('closeModal'),
  heroStatPrompts: document.getElementById('heroStatPrompts'),
  heroStatModels: document.getElementById('heroStatModels'),
  heroStatMedia: document.getElementById('heroStatMedia'),
  loadMore: document.getElementById('loadMore')
};

function normalizeCase(c) {
  return {
    ...c,
    model: c.model || 'gpt-image-2',
    mediaType: c.mediaType || 'image',
    imageUrls: Array.isArray(c.imageUrls) ? c.imageUrls : (c.imageUrls ? [c.imageUrls] : []),
    thumbnail: c.thumbnail || (c.imageUrls && c.imageUrls[0]) || '',
    videoUrl: c.videoUrl || null,
  };
}

async function loadData() {
  try {
    const idxRes = await fetch('data/index.json');
    state.indexData = await idxRes.json();

    if (state.indexData.models) {
      state.indexData.models.forEach(im => {
        const m = MODELS.find(x => x.id === im.id);
        if (m) {
          if (im.label) {
            m.name.zh = im.label.zh || m.name.zh;
            m.name.en = im.label.en || m.name.en;
          }
          if (im.color) m.color = im.color;
        }
      });
    }

    await loadModelData(state.activeModel);
    init();
  } catch (err) {
    console.error(err);
    els.gallery.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${t('failedToLoad')}</p></div>`;
  }
}

async function loadModelData(modelId) {
  if (state.modelData[modelId]) {
    state.cases = state.modelData[modelId];
    return;
  }

  const im = state.indexData && state.indexData.models
    ? state.indexData.models.find(m => m.id === modelId)
    : null;
  const file = im ? im.file : `${modelId}.json`;

  try {
    showSkeleton();
    const res = await fetch(`data/${file}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const normalized = data.map(normalizeCase);
    state.modelData[modelId] = normalized;
    state.cases = normalized;
  } catch (err) {
    console.error(`Failed to load model ${modelId}:`, err);
    state.modelData[modelId] = [];
    state.cases = [];
  }
}

function init() {
  renderModelBar();
  renderCategories();
  updateHeroStats();
  filterAndRender();
}

function getModelCounts() {
  const counts = {};
  MODELS.forEach(m => { counts[m.id] = 0; });
  if (state.indexData && state.indexData.models) {
    state.indexData.models.forEach(im => {
      if (counts[im.id] !== undefined) counts[im.id] = im.count || 0;
    });
  }
  Object.entries(state.modelData).forEach(([mid, records]) => {
    if (counts[mid] !== undefined && records.length > 0) {
      counts[mid] = records.length;
    }
  });
  return counts;
}

function renderModelBar() {
  const counts = getModelCounts();
  els.modelBar.innerHTML = MODELS.map(m => {
    const active = m.id === state.activeModel ? ' active' : '';
    const count = counts[m.id] || 0;
    return `<button class="model-btn${active}" data-model="${m.id}">
      <span class="dot" style="background:${m.color}"></span>
      ${escHtml(tModel(m.id))} <span class="count">${count}</span>
    </button>`;
  }).join('');
}

function getCategories() {
  const pool = state.cases.filter(c => c.model === state.activeModel);
  const cats = new Set(pool.map(c => c.category).filter(Boolean));
  return ['All', ...cats];
}

function renderCategories() {
  const cats = getCategories();
  if (state.activeCategory !== 'All' && !cats.includes(state.activeCategory)) {
    state.activeCategory = 'All';
  }
  els.categoryBar.innerHTML = cats.map(cat =>
    `<button class="cat-btn${cat === state.activeCategory ? ' active' : ''}" data-cat="${cat}">${cat === 'All' ? t('allCategories') : tCat(cat)}</button>`
  ).join('');
}

function filterCases() {
  let result = state.cases.filter(c => c.model === state.activeModel);

  if (state.activeMediaType === 'image') {
    result = result.filter(c => c.mediaType === 'image');
  } else if (state.activeMediaType === 'video') {
    result = result.filter(c => c.mediaType === 'video');
  }

  if (state.activeCategory !== 'All') {
    result = result.filter(c => c.category === state.activeCategory);
  }

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    result = result.filter(c =>
      c.title.toLowerCase().includes(q) ||
      c.prompt.toLowerCase().includes(q) ||
      (c.author || '').toLowerCase().includes(q) ||
      (c.category || '').toLowerCase().includes(q) ||
      tCat(c.category).toLowerCase().includes(q)
    );
  }
  return result;
}

function filterAndRender() {
  state.filtered = filterCases();
  state.currentPage = 1;
  renderGallery();
  updateResultCount();
  // 只有当前模型有分类数据时才显示分类栏
  const cats = getCategories();
  els.categoryBar.style.display = cats.length > 1 ? '' : 'none';
}

function getDisplayCases() {
  return state.filtered.slice(0, state.currentPage * state.perPage);
}

function emptyMessage() {
  const cached = state.modelData[state.activeModel];
  if (cached && cached.length === 0) return t('modelComingSoon');
  if (state.activeMediaType === 'video') return t('noVideosYet');
  return t('noResults');
}

function renderGallery() {
  const display = getDisplayCases();
  if (display.length === 0) {
    els.gallery.innerHTML = `<div class="empty-state"><div class="icon">${state.cases.length === 0 && state.modelData[state.activeModel] ? '🚀' : '🔍'}</div><p>${emptyMessage()}</p></div>`;
    els.loadMore.style.display = 'none';
    return;
  }
  els.gallery.innerHTML = display.map(c => createCard(c)).join('');
  els.gallery.querySelectorAll('img').forEach(img => {
    if (img.dataset.src) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            img.src = img.dataset.src;
            img.onload = () => img.classList.add('loaded');
            img.onerror = () => { img.src = ''; img.classList.add('loaded'); };
            observer.unobserve(img);
          }
        });
      }, { rootMargin: '200px' });
      observer.observe(img);
    }
  });
  const remaining = state.filtered.length - display.length;
  if (remaining > 0) {
    els.loadMore.style.display = 'inline-block';
    els.loadMore.textContent = `${t('loadMore')} (${remaining} ${t('remaining')})`;
  } else {
    els.loadMore.style.display = 'none';
  }
}

function createCard(c) {
  const imgUrl = c.thumbnail || (c.imageUrls && c.imageUrls[0]) || '';
  const isVideo = c.mediaType === 'video';
  const model = MODELS.find(m => m.id === c.model);
  const modelColor = model ? model.color : 'var(--accent)';
  return `
    <div class="card" data-id="${c.id}" onclick="openModal('${c.id}')">
      <div class="card-img-wrap">
        <img data-src="${imgUrl}" alt="${escHtml(c.title)}" loading="lazy">
        ${isVideo ? '<div class="card-play">▶</div>' : ''}
      </div>
      <div class="card-body">
        <div class="card-tags">
          <span class="tag tag-model" style="color:${modelColor};background:${modelColor}22">${escHtml(tModel(c.model))}</span>
          ${isVideo ? `<span class="tag tag-video">${t('tagVideo')}</span>` : ''}
        </div>
        <h3>${escHtml(c.title)}</h3>
        <div class="card-author">${t('by')} <a href="${escHtml(c.authorUrl)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${escHtml(c.author)}</a></div>
      </div>
    </div>
  `;
}

function updateResultCount() {
  els.resultCount.textContent = `${state.filtered.length} ${t('promptsFound')}`;
}

function updateHeroStats() {
  if (state.indexData) {
    els.heroStatPrompts.textContent = state.indexData.total || 0;
  } else {
    els.heroStatPrompts.textContent = state.cases.length;
  }
  els.heroStatModels.textContent = MODELS.length;
  let mediaCount = 0;
  Object.values(state.modelData).forEach(records => {
    records.forEach(c => {
      if (c.mediaType === 'video') mediaCount++;
      else mediaCount += (c.imageUrls ? c.imageUrls.length : 0);
    });
  });
  els.heroStatMedia.textContent = mediaCount || '--';
}

function openModal(id) {
  let c = state.cases.find(x => x.id === id);
  if (!c) {
    for (const records of Object.values(state.modelData)) {
      c = records.find(x => x.id === id);
      if (c) break;
    }
  }
  if (!c) return;
  const imgUrl = c.thumbnail || (c.imageUrls && c.imageUrls[0]) || '';
  const isVideo = c.mediaType === 'video' && c.videoUrl;
  const model = MODELS.find(m => m.id === c.model);
  const modelColor = model ? model.color : 'var(--accent)';

  let mediaHtml = '';
  if (isVideo) {
    mediaHtml = `<video class="modal-media" controls poster="${escHtml(imgUrl)}" src="${escHtml(c.videoUrl)}"></video>`;
  } else if (imgUrl) {
    mediaHtml = `<img class="modal-media" src="${imgUrl}" alt="${escHtml(c.title)}">`;
  }

  els.modalContent.innerHTML = `
    ${mediaHtml}
    <div class="modal-body">
      <div class="card-tags">
        <span class="tag tag-model" style="color:${modelColor};background:${modelColor}22">${escHtml(tModel(c.model))}</span>
        ${c.mediaType === 'video' ? `<span class="tag tag-video">${t('tagVideo')}</span>` : ''}
      </div>
      <h2>${escHtml(c.title)}</h2>
      <div class="modal-meta">
        ${c.caseNum ? `${t('case')} #${c.caseNum} · ` : ''}${t('by')} <a href="${escHtml(c.authorUrl)}" target="_blank" rel="noopener noreferrer">${escHtml(c.author)}</a>
        ${c.sourceUrl ? ` · <a href="${escHtml(c.sourceUrl)}" target="_blank" rel="noopener noreferrer">${t('source')} →</a>` : ''}
      </div>
      <div class="modal-prompt-label">${t('prompt')}</div>
      <div class="modal-prompt" id="modalPromptText">${escHtml(c.prompt)}</div>
      <div class="modal-actions">
        <button class="btn-primary" id="copyPromptBtn">${t('copy')}</button>
        <a class="btn-secondary" href="${JIUCAIHEZI_URL}" target="_blank" rel="noopener noreferrer">${t('createCta')}</a>
      </div>
    </div>
  `;

  document.getElementById('copyPromptBtn').addEventListener('click', () => copyPrompt(c.prompt));
  els.modalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModalFn() {
  els.modalOverlay.classList.remove('open');
  document.body.style.overflow = '';
}

function copyPrompt(text) {
  const btn = document.getElementById('copyPromptBtn');
  navigator.clipboard.writeText(text).then(() => {
    if (btn) {
      btn.textContent = t('copied');
      setTimeout(() => { btn.textContent = t('copy'); }, 2000);
    }
  });
}

els.closeModal.addEventListener('click', closeModalFn);
els.modalOverlay.addEventListener('click', e => {
  if (e.target === els.modalOverlay) closeModalFn();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModalFn();
});

els.modelBar.addEventListener('click', async e => {
  const btn = e.target.closest('.model-btn');
  if (!btn) return;
  const modelId = btn.dataset.model;
  state.activeModel = modelId;
  state.activeCategory = 'All';
  state.activeMediaType = 'all';
  state.currentPage = 1;
  state.searchQuery = '';
  els.searchInput.value = '';

  document.querySelectorAll('.model-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === 'all'));

  if (!state.modelData[modelId]) {
    await loadModelData(modelId);
  } else {
    state.cases = state.modelData[modelId];
  }

  renderCategories();
  filterAndRender();
});

els.typeBar.addEventListener('click', e => {
  const btn = e.target.closest('.type-btn');
  if (!btn) return;
  state.activeMediaType = btn.dataset.type;
  state.currentPage = 1;
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filterAndRender();
});

els.categoryBar.addEventListener('click', e => {
  const btn = e.target.closest('.cat-btn');
  if (!btn) return;
  state.activeCategory = btn.dataset.cat;
  state.currentPage = 1;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filterAndRender();
});

els.searchInput.addEventListener('input', e => {
  state.searchQuery = e.target.value;
  state.currentPage = 1;
  filterAndRender();
});

els.loadMore.addEventListener('click', () => {
  state.currentPage++;
  renderGallery();
  const cards = els.gallery.querySelectorAll('.card');
  if (cards.length > 0) {
    cards[cards.length - state.perPage].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
});

function showSkeleton(count = 12) {
  els.gallery.innerHTML = Array(count).fill(`
    <div class="skeleton">
      <div class="skeleton-img"></div>
      <div class="skeleton-body">
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
      </div>
    </div>
  `).join('');
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

document.documentElement.lang = lang;
document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
translateUI();
showSkeleton();
loadData();