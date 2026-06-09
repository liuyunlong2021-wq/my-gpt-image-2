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

const i18n = {
  zh: {
    siteTitle: 'GPT Image 2 提示词画廊',
    navGallery: '画廊',
    navApi: 'API',
    navGithub: 'GitHub',
    searchPlaceholder: '搜索提示词、分类、作者...',
    allCategories: '全部分类',
    promptsFound: '个提示词',
    noResults: '没有找到匹配的提示词',
    loadMore: '加载更多',
    remaining: '剩余',
    by: '作者',
    source: '来源',
    case: '案例',
    prompt: '提示词',
    copy: '复制',
    copied: '已复制！',
    failedToLoad: '数据加载失败，请重试',
    heroTitle: 'GPT Image 2',
    heroSubtitle: '提示词画廊',
    heroDesc: '精心整理的 GPT-Image-2 生产级提示词、API 使用模式和可复用视觉工作流集合。',
    statPrompts: '精选提示词',
    statCategories: '分类',
    statImages: '输出图片',
    apiSectionTitle: '🔌 使用 GPT Image 2 API',
    apiSectionSub: '一次 API 调用即可完成生成和编辑 — 兼容 OpenAI 标准格式。',
    apiQuickStart: '快速开始',
    apiQuickStartDesc: '使用单条 curl 命令通过 GPT Image 2 API 生成图片。',
    apiInstallSkill: '安装 Skill',
    apiInstallSkillDesc: '一行命令安装 GPT-Image-2 Gen Skill，无缝集成。',
    apiCapabilities: '核心功能',
    apiCapabilitiesDesc: '✦ 文生图\n✦ 图片编辑（内补、外补、风格迁移）\n✦ 多轮迭代优化\n✦ 高保真文字渲染\n✦ 角色一致性生成\n✦ 原生比例和透明度支持',
    viewOnGithub: '查看 GitHub',
    tryOnEvolink: '在 Evolink 上体验',
    footer: '基于 EvoLinkAI 的 awesome-gpt-image-2-API-and-Prompts · 由 Dazi Studio 整理制作',
  },
  en: {
    siteTitle: 'GPT Image 2 Prompt Gallery',
    navGallery: 'Gallery',
    navApi: 'API',
    navGithub: 'GitHub',
    searchPlaceholder: 'Search prompts, categories, authors...',
    allCategories: 'All Categories',
    promptsFound: 'prompts found',
    noResults: 'No prompts found matching your search.',
    loadMore: 'Load More',
    remaining: 'remaining',
    by: 'by',
    source: 'Source',
    case: 'Case',
    prompt: 'Prompt',
    copy: 'Copy',
    copied: 'Copied!',
    failedToLoad: 'Failed to load data. Please try again.',
    heroTitle: 'GPT Image 2',
    heroSubtitle: 'Prompt Gallery',
    heroDesc: 'A curated collection of production-ready GPT-Image-2 prompts, API usage patterns, and reusable visual workflows for AI image generation.',
    statPrompts: 'Curated Prompts',
    statCategories: 'Categories',
    statImages: 'Output Images',
    apiSectionTitle: '🔌 Use GPT Image 2 API',
    apiSectionSub: 'One API call for both generation and editing — works with OpenAI standard format.',
    apiQuickStart: 'Quick Start',
    apiQuickStartDesc: 'Generate an image with a single curl command using the GPT Image 2 API.',
    apiInstallSkill: 'Install the Skill',
    apiInstallSkillDesc: 'One-line install of the GPT-Image-2 Gen Skill for seamless integration.',
    apiCapabilities: 'Key Capabilities',
    apiCapabilitiesDesc: '✦ Text-to-image generation\n✦ Image editing (inpainting, outpainting, style transfer)\n✦ Multi-turn iterative refinement\n✦ High fidelity text rendering\n✦ Consistent character generation\n✦ Native aspect ratio & transparency support',
    viewOnGithub: 'View on GitHub',
    tryOnEvolink: 'Try on Evolink',
    footer: 'Based on awesome-gpt-image-2-API-and-Prompts by EvoLinkAI · Curated by Dazi Studio',
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
  // Hero sub title span
  const heroSpan = document.querySelector('.hero h1 span');
  if (heroSpan) heroSpan.textContent = t('heroSubtitle');
}

const state = {
  cases: [],
  filtered: [],
  activeCategory: 'All',
  searchQuery: '',
  currentPage: 1,
  perPage: 24,
  loading: false
};

const els = {
  gallery: document.getElementById('gallery'),
  categoryBar: document.getElementById('categoryBar'),
  searchInput: document.getElementById('searchInput'),
  resultCount: document.getElementById('resultCount'),
  modalOverlay: document.getElementById('modalOverlay'),
  modalContent: document.getElementById('modalContent'),
  closeModal: document.getElementById('closeModal'),
  heroStatPrompts: document.getElementById('heroStatPrompts'),
  heroStatCategories: document.getElementById('heroStatCategories'),
  heroStatImages: document.getElementById('heroStatImages'),
  loadMore: document.getElementById('loadMore')
};

async function loadData() {
  try {
    const res = await fetch('data.json');
    state.cases = await res.json();
    state.cases = state.cases.map(c => ({
      ...c,
      imageUrls: Array.isArray(c.imageUrls) ? c.imageUrls : (c.imageUrls ? [c.imageUrls] : [])
    }));
    init();
  } catch (err) {
    els.gallery.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${t('failedToLoad')}</p></div>`;
  }
}

function init() {
  renderCategories();
  updateHeroStats();
  filterAndRender();
}

function getCategories() {
  const cats = new Set(state.cases.map(c => c.category));
  return ['All', ...cats];
}

function renderCategories() {
  const cats = getCategories();
  els.categoryBar.innerHTML = cats.map(cat => 
    `<button class="cat-btn${cat === state.activeCategory ? ' active' : ''}" data-cat="${cat}">${cat === 'All' ? t('allCategories') : tCat(cat)}</button>`
  ).join('');
  
  els.categoryBar.addEventListener('click', e => {
    const btn = e.target.closest('.cat-btn');
    if (!btn) return;
    state.activeCategory = btn.dataset.cat;
    state.currentPage = 1;
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filterAndRender();
  });
}

function filterCases() {
  let result = state.cases;
  if (state.activeCategory !== 'All') {
    result = result.filter(c => c.category === state.activeCategory);
  }
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    result = result.filter(c => 
      c.title.toLowerCase().includes(q) ||
      c.prompt.toLowerCase().includes(q) ||
      c.author.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q) ||
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
}

function getDisplayCases() {
  return state.filtered.slice(0, state.currentPage * state.perPage);
}

function renderGallery() {
  const display = getDisplayCases();
  if (display.length === 0) {
    els.gallery.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><p>${t('noResults')}</p></div>`;
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
    els.loadMore.style.display = 'block';
    els.loadMore.textContent = `${t('loadMore')} (${remaining} ${t('remaining')})`;
  } else {
    els.loadMore.style.display = 'none';
  }
}

function createCard(c) {
  const imgUrl = c.imageUrls && c.imageUrls[0] ? c.imageUrls[0] : '';
  return `
    <div class="card" data-id="${c.id}" onclick="openModal('${c.id}')">
      <div class="card-img-wrap">
        <img data-src="${imgUrl}" alt="${escHtml(c.title)}" loading="lazy">
      </div>
      <div class="card-body">
        <div class="card-category">${tCat(c.category)}</div>
        <h3>${escHtml(c.title)}</h3>
        <div class="card-author">${t('by')} <a href="${escHtml(c.authorUrl)}" target="_blank" onclick="event.stopPropagation()">${escHtml(c.author)}</a></div>
      </div>
    </div>
  `;
}

function updateResultCount() {
  els.resultCount.textContent = `${state.filtered.length} ${t('promptsFound')}`;
}

function updateHeroStats() {
  els.heroStatPrompts.textContent = state.cases.length;
  els.heroStatCategories.textContent = getCategories().length - 1;
  const imgCount = state.cases.reduce((sum, c) => sum + (c.imageUrls ? c.imageUrls.length : 0), 0);
  els.heroStatImages.textContent = imgCount;
}

function openModal(id) {
  const c = state.cases.find(x => x.id === id);
  if (!c) return;
  const imgUrl = c.imageUrls && c.imageUrls[0] ? c.imageUrls[0] : '';
  const escapedPrompt = escHtml(c.prompt);
  els.modalContent.innerHTML = `
    ${imgUrl ? `<img class="modal-img" src="${imgUrl}" alt="${escHtml(c.title)}">` : ''}
    <div class="modal-body">
      <div class="modal-category">${tCat(c.category)}</div>
      <h2>${escHtml(c.title)}</h2>
      <div class="modal-meta">
        ${t('case')} #${c.caseNum} &middot; ${t('by')} <a href="${escHtml(c.authorUrl)}" target="_blank">${escHtml(c.author)}</a>
        ${c.sourceUrl ? `&middot; <a href="${escHtml(c.sourceUrl)}" target="_blank">${t('source')} →</a>` : ''}
      </div>
      <div class="modal-prompt-label">${t('prompt')}</div>
      <div class="modal-prompt">
        <button class="copy-btn" onclick="copyPrompt(this)">${t('copy')}</button>
        ${escapedPrompt}
      </div>
    </div>
  `;
  els.modalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModalFn() {
  els.modalOverlay.classList.remove('open');
  document.body.style.overflow = '';
}

els.closeModal.addEventListener('click', closeModalFn);
els.modalOverlay.addEventListener('click', e => {
  if (e.target === els.modalOverlay) closeModalFn();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModalFn();
});

function copyPrompt(btn) {
  const prompt = btn.parentElement.textContent.replace(t('copy'), '').trim();
  navigator.clipboard.writeText(prompt).then(() => {
    btn.textContent = t('copied');
    setTimeout(() => { btn.textContent = t('copy'); }, 2000);
  });
}

els.searchInput.addEventListener('input', e => {
  state.searchQuery = e.target.value;
  state.currentPage = 1;
  filterAndRender();
});

els.loadMore.addEventListener('click', () => {
  state.currentPage++;
  renderGallery();
  updateResultCount();
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

// Init language
document.documentElement.lang = lang;
document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
translateUI();
showSkeleton();
loadData();
