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
    
    // Ensure all cases have imageUrls as array
    state.cases = state.cases.map(c => ({
      ...c,
      imageUrls: Array.isArray(c.imageUrls) ? c.imageUrls : (c.imageUrls ? [c.imageUrls] : [])
    }));
    
    init();
  } catch (err) {
    els.gallery.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>Failed to load data. Please try again.</p></div>`;
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
    `<button class="cat-btn${cat === state.activeCategory ? ' active' : ''}" data-cat="${cat}">${cat === 'All' ? 'All Categories' : cat}</button>`
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
      c.category.toLowerCase().includes(q)
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
    els.gallery.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><p>No prompts found matching your search.</p></div>`;
    els.loadMore.style.display = 'none';
    return;
  }
  
  els.gallery.innerHTML = display.map(c => createCard(c)).join('');
  
  // Lazy load images
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
  
  // Show/hide load more
  const remaining = state.filtered.length - display.length;
  if (remaining > 0) {
    els.loadMore.style.display = 'block';
    els.loadMore.textContent = `Load More (${remaining} remaining)`;
  } else {
    els.loadMore.style.display = 'none';
  }
}

function createCard(c) {
  const imgUrl = c.imageUrls && c.imageUrls[0] 
    ? c.imageUrls[0] 
    : '';
  const promptPreview = c.prompt ? c.prompt.slice(0, 80) + (c.prompt.length > 80 ? '...' : '') : '';
  
  return `
    <div class="card" data-id="${c.id}" onclick="openModal('${c.id}')">
      <div class="card-img-wrap">
        <img data-src="${imgUrl}" alt="${escHtml(c.title)}" loading="lazy">
      </div>
      <div class="card-body">
        <div class="card-category">${escHtml(c.category)}</div>
        <h3>${escHtml(c.title)}</h3>
        <div class="card-author">by <a href="${escHtml(c.authorUrl)}" target="_blank" onclick="event.stopPropagation()">${escHtml(c.author)}</a></div>
      </div>
    </div>
  `;
}

function updateResultCount() {
  els.resultCount.textContent = `${state.filtered.length} prompts found`;
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
      <div class="modal-category">${escHtml(c.category)}</div>
      <h2>${escHtml(c.title)}</h2>
      <div class="modal-meta">
        Case #${c.caseNum} &middot; by <a href="${escHtml(c.authorUrl)}" target="_blank">${escHtml(c.author)}</a>
        ${c.sourceUrl ? `&middot; <a href="${escHtml(c.sourceUrl)}" target="_blank">Source →</a>` : ''}
      </div>
      <div class="modal-prompt-label">Prompt</div>
      <div class="modal-prompt">
        <button class="copy-btn" onclick="copyPrompt(this)">Copy</button>
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
  const prompt = btn.parentElement.textContent.replace('Copy', '').trim();
  navigator.clipboard.writeText(prompt).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  });
}

// Search
els.searchInput.addEventListener('input', e => {
  state.searchQuery = e.target.value;
  state.currentPage = 1;
  filterAndRender();
});

// Load more
els.loadMore.addEventListener('click', () => {
  state.currentPage++;
  renderGallery();
  updateResultCount();
  
  // Scroll to reveal new items
  const cards = els.gallery.querySelectorAll('.card');
  if (cards.length > 0) {
    cards[cards.length - state.perPage].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
});

// Shimmer loading
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

// Start
showSkeleton();
loadData();
