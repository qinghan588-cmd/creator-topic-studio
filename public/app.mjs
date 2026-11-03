import { generateTopics, normalizeProfile } from './topic-engine.mjs';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const STORAGE_KEY = 'idea-editor-wechat-v1';
const CATEGORIES = ['全部', '实用干货', '避坑指南', '清单合集', '观点讨论', '真实记录'];
const VIEW_NAMES = { studio: '选题工作台', library: '我的选题库', calendar: '发布日历', settings: '生成设置' };
const DEFAULT_PROFILE = {
  niche: 'AI 工具与效率生活', audience: '想把 AI 用到实际工作中的职场新人',
  platform: '公众号', goal: '涨粉', tone: '实用干货',
  keywords: 'AI 工作流，信息整理，效率工具', material: '',
};
const ICONS = {
  sparkles: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/><path d="m20 2 .6 1.4L22 4l-1.4.6L20 6l-.6-1.4L18 4l1.4-.6L20 2Z"/>',
  bookmark: '<path d="M6 4h12v17l-6-4-6 4V4Z"/><path d="M9 7h6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M7 3v4M17 3v4M7 14h2M12 14h2M7 17h2"/>',
  settings: '<path d="M4 7h16M4 17h16M8 4v6M16 14v6"/><circle cx="8" cy="7" r="2" fill="currentColor"/><circle cx="16" cy="17" r="2" fill="currentColor"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  refresh: '<path d="M20 7a8 8 0 0 0-14-2L3 8m0-5v5h5M4 17a8 8 0 0 0 14 2l3-3m0 5v-5h-5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
};
const icon = name => '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
function hydrateIcons(root = document) { $$('[data-icon]', root).forEach(el => el.innerHTML = icon(el.dataset.icon)); }
let toastTimer;
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4000);
}
function validTopic(t) {
  return t && typeof t.id === 'string' && t.id.length < 200 &&
    ['title','angle','category','format','reason','hook','materialHint'].every(k => typeof t[k] === 'string' && t[k].length <= 12000) &&
    ['outline','titles','tags'].every(k => Array.isArray(t[k]) && t[k].length <= 30 && t[k].every(s => typeof s === 'string' && s.length <= 12000));
}
function validateSaved(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.saved) || raw.saved.length > 1000 || !raw.saved.every(validTopic)) throw new Error('备份格式不正确');
  if (raw.topics && (!Array.isArray(raw.topics) || raw.topics.length > 50 || !raw.topics.every(validTopic))) throw new Error('备份中的选题格式不正确');
  return {
    profile: normalizeProfile(raw.profile || DEFAULT_PROFILE),
    topics: raw.topics || [],
    saved: raw.saved.map(t => ({
      ...t,
      status: ['待创作','创作中','已发布'].includes(t.status) ? t.status : '待创作',
      scheduledDate: /^\d{4}-\d{2}-\d{2}$/.test(t.scheduledDate || '') ? t.scheduledDate : '',
    })),
    generation: Number.isSafeInteger(raw.generation) && raw.generation >= 0 ? raw.generation : 0,
    mode: raw.mode === 'ai' ? 'ai' : 'template',
    resultMode: raw.resultMode === 'ai' ? 'ai' : 'template',
    analysis: typeof raw.analysis === 'string' ? raw.analysis.slice(0, 3000) : '',
  };
}
function initialState() {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (text) return validateSaved(JSON.parse(text));
  } catch { setTimeout(() => toast('本地记录暂时无法读取，已打开新工作台。'), 500); }
  const result = generateTopics(DEFAULT_PROFILE);
  return { profile: normalizeProfile(DEFAULT_PROFILE), ...result, saved: [], generation: 0, resultMode: 'template' };
}
let state = initialState();
let view = 'studio', filter = '全部', busy = false, connection = { configured: false, model: null };
let weekOffset = 0, detailId = null, detailSnapshot = null, scheduleDay = '';
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; }
  catch { toast('浏览器存储已满或不可用，请先导出备份，避免丢失。'); return false; }
}
function fillForm() {
  const form = $('#brief-form');
  Object.entries(state.profile).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value; });
}
function readProfile() { return normalizeProfile(Object.fromEntries(new FormData($('#brief-form')))); }
function updateMode() {
  $$('[data-mode]').forEach(b => {
    const active = b.dataset.mode === state.mode;
    b.classList.toggle('selected', active);
    b.setAttribute('aria-pressed', String(active));
  });
  $('#global-mode').innerHTML = '<i></i>' + (state.mode === 'ai' ? 'AI 选题模式' : '灵感模板模式');
  $('#mode-description').textContent = state.mode === 'ai'
    ? (connection.configured ? '由 ' + connection.model + ' 构思 · 根据你的定位和素材生成' : '需先在「生成设置」连接自己的模型服务')
    : '无需连接模型 · 根据你的公众号定位组合选题切入角度';
  if (!busy) $('#generate-label').textContent = state.mode === 'ai' ? '用 AI 构思选题' : '生成我的选题';
}
function setView(next) {
  view = Object.hasOwn(VIEW_NAMES, next) ? next : 'studio';
  $$('.view').forEach(el => el.hidden = el.id !== 'view-' + view);
  $$('.nav-item').forEach(b => {
    const active = b.dataset.view === view;
    b.classList.toggle('active', active);
    if (active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  $('#breadcrumb-title').textContent = VIEW_NAMES[view];
  document.title = VIEW_NAMES[view] + ' · 灵感编辑部';
  if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
  if (view === 'library') renderLibrary();
  if (view === 'calendar') renderCalendar();
  if (view === 'settings') checkConnection();
}
function emptyState(title, copy, cta = true) {
  return '<div class="empty-state"><span>✧</span><h3>' + esc(title) + '</h3><p>' + esc(copy) + '</p>' +
    (cta ? '<button class="button button-white" data-view="studio">去找一个好选题 →</button>' : '') + '</div>';
}
function findTopic(id) { return state.saved.find(t => t.id === id) || state.topics.find(t => t.id === id); }
function cardHTML(topic, savedView = false) {
  const saved = state.saved.find(t => t.id === topic.id);
  const t = saved || topic;
  return '<article class="topic-card"><div class="card-top"><span class="category" data-category="' + esc(t.category) + '">' + esc(t.category) +
    '</span><button class="save-button ' + (saved ? 'saved' : '') + '" data-save="' + esc(t.id) + '" aria-label="' + (saved ? '取消收藏：' : '收藏选题：') + esc(t.title) + '" aria-pressed="' + Boolean(saved) + '">' + icon('bookmark') +
    '</button></div><button class="topic-title" data-open="' + esc(t.id) + '">' + esc(t.title) + '</button><p class="card-angle">' + esc(t.angle) +
    '</p><div class="card-tags">' + t.tags.slice(0, 3).map(tag => '<span># ' + esc(tag) + '</span>').join('') +
    '</div>' + (savedView ? '<div class="saved-status">' + esc(t.status || '待创作') + (t.scheduledDate ? ' · ' + esc(t.scheduledDate) : ' · 尚未排期') + '</div>' : '') +
    '<div class="card-bottom"><span class="card-meta">' + icon('clock') + esc(t.format) + ' · 公众号</span><button class="card-open" data-open="' + esc(t.id) + '">展开选题 <span>↗</span></button></div></article>';
}
function renderTopics() {
  const topics = state.topics.filter(t => filter === '全部' || t.category === filter);
  $('#topic-grid').innerHTML = topics.length ? topics.map(t => cardHTML(t)).join('') : emptyState('这个分类还没有选题', '换个分类，或再生成一批灵感。', false);
  $('#result-count').textContent = state.topics.length;
  $('#topic-filters').innerHTML = CATEGORIES.map(c => '<button class="filter-chip ' + (filter === c ? 'active' : '') + '" data-filter="' + esc(c) + '" aria-pressed="' + (filter === c) + '">' + esc(c) + '</button>').join('');
  $('#results-description').textContent = state.analysis
    ? (state.resultMode === 'ai' ? state.analysis : '围绕「' + state.profile.niche + '」，为你的公众号找到不同的表达角度。')
    : '从一个方向，找到不同的表达可能。';
  $('#result-source').textContent = state.resultMode === 'ai' ? 'AI 构思 · 事实仍需核实' : '灵感模板 · 非实时热点';
  $('#library-count').textContent = state.saved.length;
}
function renderLibrary() {
  const q = $('#library-search').value.trim().toLowerCase();
  const status = $('#library-status').value;
  const visible = state.saved.filter(t => (!q || [t.title,t.angle,...t.tags].join(' ').toLowerCase().includes(q)) && (status === '全部' || t.status === status));
  $('#saved-summary').textContent = '共 ' + state.saved.length + ' 个选题';
  $('#saved-grid').innerHTML = visible.length ? visible.map(t => cardHTML(t, true)).join('') :
    emptyState(state.saved.length ? '没有找到匹配的选题' : '先为一个灵感留个位置', state.saved.length ? '试试其他关键词或创作状态。' : '在选题卡片上点击书签，把想写的文章收进来。', !state.saved.length);
}
function toggleSave(id) {
  const index = state.saved.findIndex(t => t.id === id);
  if (index >= 0) {
    state.saved.splice(index, 1);
    toast('已取消收藏，当前批次中的选题仍会保留。');
  } else {
    const topic = findTopic(id);
    if (!topic) return;
    state.saved.unshift({ ...topic, savedAt: new Date().toISOString(), status: '待创作', scheduledDate: '', sourceMode: state.resultMode, profile: { ...state.profile } });
    toast('已收藏到选题库，可以继续编辑和排期。');
  }
  persist(); renderTopics();
  if (view === 'library') renderLibrary();
  if (view === 'calendar') renderCalendar();
}
async function generate() {
  if (busy || !$('#brief-form').reportValidity()) return;
  const profile = readProfile();
  busy = true;
  const mode = state.mode;
  document.body.classList.add('generating');
  $('#generate-button').disabled = true;
  $$('[data-mode]').forEach(b => b.disabled = true);
  $('#generate-label').textContent = mode === 'ai' ? 'AI 正在构思…' : '正在整理灵感…';
  try {
    if (mode === 'ai') {
      await checkConnection();
      if (!connection.configured) { setView('settings'); toast('先连接模型服务，再使用 AI 选题。'); return; }
    }
    const seed = state.generation + 1;
    let result;
    if (mode === 'ai') {
      const response = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, seed }), signal: AbortSignal.timeout(95000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '生成失败，请稍后重试。');
      if (!Array.isArray(data.topics) || data.topics.length !== 9 || !data.topics.every(validTopic)) throw new Error('AI 返回的内容不完整，请重试。');
      result = data;
    } else {
      await new Promise(resolve => requestAnimationFrame(resolve));
      result = generateTopics(profile, seed);
    }
    state.profile = profile;
    state.generation = seed;
    state.topics = result.topics;
    state.analysis = result.analysis;
    state.resultMode = mode;
    filter = '全部';
    const stored = persist(); renderTopics();
    if (stored) toast(mode === 'ai' ? '9 个新选题已准备好，打开一个继续打磨。' : '灵感已更新，挑一个你有话可说的角度。');
  } catch (e) {
    toast(e.name === 'TimeoutError' ? '模型响应超时，请稍后再试。' : e.message || '暂时无法生成，请重试。');
  } finally {
    busy = false; document.body.classList.remove('generating');
    $('#generate-button').disabled = false;
    $$('[data-mode]').forEach(b => b.disabled = false);
    updateMode();
  }
}
async function checkConnection() {
  try {
    const response = await fetch('/api/status', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error();
    connection = await response.json();
  } catch { connection = { configured: false, model: null }; }
  const el = $('#connection-status');
  el.textContent = connection.configured ? '已配置模型：' + connection.model + ' · 生成时将发起真实请求' : '尚未连接 AI · 灵感模板与选题管理可以直接使用';
  el.classList.toggle('ready', Boolean(connection.configured));
  updateMode();
  return connection;
}
function openDetail(id) {
  const t = findTopic(id);
  if (!t) return;
  detailId = id;
  detailSnapshot = { ...structuredClone(t), profile: t.profile || { ...state.profile }, sourceMode: t.sourceMode || state.resultMode };
  $('#detail-content').innerHTML = '<div class="detail-body"><div class="detail-meta"><span class="category" data-category="' + esc(t.category) + '">' + esc(t.category) + '</span><span>公众号 · ' + esc(t.format) + '</span></div>' +
    '<label><span class="sr-only">文章标题</span><input class="detail-title" id="detail-title" maxlength="180" value="' + esc(t.title) + '"></label><p class="detail-angle">' + esc(t.angle) +
    '</p><div class="detail-block"><h3>为什么值得写</h3><p>' + esc(t.reason) + '</p></div><div class="detail-block"><h3>标题，还可以这样写</h3>' +
    t.titles.map((s,i) => '<div class="alternate-title"><span>' + esc(s) + '</span><button data-title-index="' + i + '" title="用作文章标题">采用 ↗</button></div>').join('') +
    '</div><div class="detail-block"><label for="detail-hook"><h3>文章开头 · 可以继续改写</h3></label><textarea id="detail-hook" maxlength="12000">' + esc(t.hook) +
    '</textarea></div><div class="detail-block"><label for="detail-outline"><h3>分段大纲 · 每行一段</h3></label><textarea id="detail-outline" class="outline-edit" maxlength="30000">' + esc(t.outline.join('\n')) +
    '</textarea></div><div class="material-hint"><strong>动笔前准备什么</strong><br>' + esc(t.materialHint) +
    '</div><div class="schedule-fields"><label>发布日期<input type="date" id="detail-date" value="' + esc(t.scheduledDate || '') + '"></label><label>创作状态<select id="detail-status">' +
    ['待创作','创作中','已发布'].map(s => '<option' + (s === t.status ? ' selected' : '') + '>' + s + '</option>').join('') +
    '</select></label></div></div><div class="dialog-actions"><button class="text-button" id="copy-prompt">复制 AI 写作提示词 ↗</button><div><button class="button button-white" id="copy-brief">复制简报</button><button class="button button-primary" id="save-detail">保存选题 ' + icon('bookmark') + '</button></div></div>';
  if (!$('#detail-dialog').open) $('#detail-dialog').showModal();
}
function editedDetail() {
  const t = detailSnapshot;
  return {
    ...t, title: $('#detail-title').value.trim(), hook: $('#detail-hook').value.trim(),
    outline: $('#detail-outline').value.split('\n').map(s => s.trim()).filter(Boolean),
    scheduledDate: $('#detail-date').value, status: $('#detail-status').value,
  };
}
function saveDetail() {
  const updated = editedDetail();
  if (!updated.title || !updated.outline.length) { toast('给文章保留一个标题和至少一段大纲。'); return; }
  if (!validTopic(updated)) { toast('大纲最多 30 段，每段不超过 12000 字；请精简后再保存。'); return; }
  const old = state.saved.find(t => t.id === detailId);
  const saved = { ...updated, profile: old?.profile || updated.profile || { ...state.profile }, savedAt: old?.savedAt || new Date().toISOString(), sourceMode: old?.sourceMode || updated.sourceMode || state.resultMode };
  if (old) state.saved = state.saved.map(t => t.id === detailId ? saved : t);
  else state.saved.unshift(saved);
  state.topics = state.topics.map(t => t.id === detailId ? { ...t, ...updated } : t);
  const stored = persist(); renderTopics();
  if (view === 'library') renderLibrary();
  if (view === 'calendar') renderCalendar();
  $('#detail-dialog').close();
  if (stored) toast(saved.scheduledDate ? '选题已保存，并安排在 ' + saved.scheduledDate + '。' : '选题已保存，你的修改也一起留下了。');
}
function briefMarkdown(t) {
  return '## ' + t.title + '\n\n' +
    '- 平台：公众号\n- 类型：' + t.category + ' / ' + t.format + '\n' +
    (t.status ? '- 状态：' + t.status + '\n' : '') + (t.scheduledDate ? '- 发布日期：' + t.scheduledDate + '\n' : '') +
    '\n### 切入角度\n' + t.angle + '\n\n### 为什么值得写\n' + t.reason +
    '\n\n### 备选标题\n' + t.titles.map(s => '- ' + s).join('\n') +
    '\n\n### 文章开头\n' + t.hook + '\n\n### 分段大纲\n' + t.outline.map((s,i) => (i+1) + '. ' + s).join('\n') +
    '\n\n### 写作素材准备\n' + t.materialHint + '\n\n' + t.tags.map(s => '#' + s).join(' ') + '\n';
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const area = document.createElement('textarea');
    area.value = text; area.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.append(area); area.select();
    const success = document.execCommand('copy'); area.remove();
    if (!success) { toast('复制不可用，请使用导出功能。'); return; }
  }
  toast('已复制，可以粘贴到你的写作工具。');
}
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportTopics() {
  const topics = view === 'library' || view === 'calendar' ? state.saved : state.topics.map(t => findTopic(t.id) || t);
  if (!topics.length) { toast('先收藏或生成一个选题，再来导出。'); return; }
  const text = '# 灵感编辑部 · 公众号选题\n\n' +
    '> 导出时间：' + new Date().toLocaleString('zh-CN') + '。灵感和 AI 构思均需结合真实资料核实。\n\n' +
    topics.map(briefMarkdown).join('\n---\n\n');
  download('公众号选题-' + dayKey(new Date()) + '.md', text, 'text/markdown;charset=utf-8');
  toast('已导出 ' + topics.length + ' 个选题的 Markdown 简报。');
}
function dayKey(date) { return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-'); }
function weekStart() {
  const date = new Date(); date.setHours(12,0,0,0);
  date.setDate(date.getDate() - (date.getDay()+6)%7 + weekOffset*7);
  return date;
}
function renderCalendar() {
  const start = weekStart(), end = new Date(start); end.setDate(start.getDate()+6);
  $('#calendar-title').textContent = start.getFullYear() + ' 年 ' + (start.getMonth()+1) + ' 月 ' + start.getDate() + ' 日 — ' + (end.getMonth()+1) + ' 月 ' + end.getDate() + ' 日';
  const today = dayKey(new Date());
  $('#calendar-grid').innerHTML = Array.from({length:7}, (_,i) => {
    const date = new Date(start); date.setDate(start.getDate()+i);
    const key = dayKey(date);
    const scheduled = state.saved.filter(t => t.scheduledDate === key);
    return '<section class="calendar-day ' + (key === today ? 'today' : '') + '"><div class="day-heading"><span>周' + '一二三四五六日'[i] + '</span><b>' + date.getDate() + '</b></div>' +
      scheduled.map(t => '<button class="schedule-card" data-open="' + esc(t.id) + '"><strong>' + esc(t.title) + '</strong><span>' + esc(t.status) + '</span></button>').join('') +
      '<button class="add-schedule" data-schedule-day="' + key + '">＋ 添加选题</button></section>';
  }).join('');
  const unscheduled = state.saved.filter(t => !t.scheduledDate);
  $('#unscheduled-count').textContent = unscheduled.length;
  $('#unscheduled-grid').innerHTML = unscheduled.length ? unscheduled.map(t => cardHTML(t, true)).join('') :
    emptyState(state.saved.length ? '每个灵感都有了自己的时间' : '日历还在等你的第一个选题', '先收藏一个选题，再给它安排一个发布日期。');
}
function openSchedule(date) {
  scheduleDay = date;
  $('#schedule-day-label').textContent = '发布日期：' + date;
  $('#schedule-options').innerHTML = state.saved.length
    ? state.saved.map(t => '<button class="schedule-option" data-schedule-topic="' + esc(t.id) + '">' + esc(t.title) + (t.scheduledDate ? '（原定 ' + esc(t.scheduledDate) + '）' : '') + '</button>').join('')
    : '<p class="help-note">还没有收藏的选题。先去工作台，留住一个好灵感。</p><button class="button button-primary" data-view="studio">去工作台 →</button>';
  $('#schedule-dialog').showModal();
}

document.addEventListener('click', e => {
  const target = e.target.closest('button, a, [data-action]');
  if (!target) return;
  if (target.matches('[data-view]')) { $$('dialog[open]').forEach(d => d.close()); setView(target.dataset.view); window.scrollTo({top:0,behavior:'instant'}); }
  if (target.matches('[data-filter]')) { filter = target.dataset.filter; renderTopics(); }
  if (target.matches('[data-open]')) openDetail(target.dataset.open);
  if (target.matches('[data-save]')) toggleSave(target.dataset.save);
  if (target.matches('[data-mode]')) { state.mode = target.dataset.mode; persist(); updateMode(); }
  if (target.matches('[data-action="export"]')) exportTopics();
  if (target.matches('.close-dialog')) target.closest('dialog').close();
  if (target.matches('[data-title-index]')) {
    const t = detailSnapshot; $('#detail-title').value = t.titles[Number(target.dataset.titleIndex)];
  }
  if (target.matches('[data-schedule-day]')) openSchedule(target.dataset.scheduleDay);
  if (target.matches('[data-schedule-topic]')) {
    state.saved = state.saved.map(t => t.id === target.dataset.scheduleTopic ? { ...t, scheduledDate: scheduleDay } : t);
    const stored = persist(); renderCalendar(); $('#schedule-dialog').close(); if (stored) toast('已安排在 ' + scheduleDay + '。');
  }
  if (target.id === 'save-detail') saveDetail();
  if (target.id === 'copy-brief') copyText(briefMarkdown(editedDetail()));
  if (target.id === 'copy-prompt') {
    const t = editedDetail(), p = t.profile || state.profile;
    copyText('你是一名公众号编辑。请根据以下简报协助我写一篇中文公众号文章。\n目标读者：' + p.audience + '\n账号方向：' + p.niche + '\n语气：' + p.tone +
      '\n先指出素材缺口，再给文章草稿。不要虚构我的亲身经历、数据、案例或引用；缺少依据的地方用【待补充】标注，标题不要夸大承诺。\n\n' + briefMarkdown(t));
  }
});
$('#brief-form').addEventListener('submit', e => { e.preventDefault(); generate(); });
$('#refresh-button').addEventListener('click', generate);
$('#library-search').addEventListener('input', renderLibrary);
$('#library-status').addEventListener('change', renderLibrary);
$('#help-button').addEventListener('click', () => $('#help-dialog').showModal());
$('#check-connection').addEventListener('click', async () => { await checkConnection(); toast(connection.configured ? '模型配置已就绪。' : '还没有检测到模型配置，可先使用灵感模板。'); });
$('#use-template').addEventListener('click', () => { state.mode = 'template'; persist(); updateMode(); setView('studio'); });
$('#prev-week').addEventListener('click', () => { weekOffset--; renderCalendar(); });
$('#next-week').addEventListener('click', () => { weekOffset++; renderCalendar(); });
$('#this-week').addEventListener('click', () => { weekOffset = 0; renderCalendar(); });
let exampleIndex = 0;
$('#example-button').addEventListener('click', () => {
  const examples = [
    { niche:'AI 工具与效率生活', audience:'想把 AI 用到实际工作中的职场新人', keywords:'会议纪要，周报，AI 工作流', material:'读者最近常问：AI 生成的周报太空泛，怎么让它写出具体工作成果？我想从这个问题开始写。' },
    { niche:'独居生活与轻量收纳', audience:'下班后想把生活过得轻松一点的独居上班族', keywords:'小厨房，收纳，省心家务', material:'最近整理了出租屋的小厨房，发现最常用的工具反而放在最不好拿的地方。想写一篇关于取放动线的文章。' },
    { niche:'日常穿搭与理性消费', audience:'想用现有衣服搭出通勤风格的职场女性', keywords:'衣橱整理，基础款，通勤', material:'有读者留言说：收藏了很多穿搭图，回到自己的衣橱还是不知道怎么选。我想从已有衣物的使用场景来写。' },
  ];
  state.profile = normalizeProfile({ ...readProfile(), ...examples[exampleIndex++ % examples.length] });
  fillForm(); if (persist()) toast('示例已填入，点击「生成我的选题」试试。');
});
$('#backup-button').addEventListener('click', () => {
  download('公众号选题工作台备份-' + dayKey(new Date()) + '.json', JSON.stringify({version:1,...state}, null, 2), 'application/json;charset=utf-8');
  toast('已导出工作台备份，包含定位、选题和排期。');
});
$('#import-input').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    if (file.size > 8 * 1024 * 1024) throw new Error('备份文件太大，请选择 8 MB 以内的 JSON 备份。');
    const imported = validateSaved(JSON.parse(await file.text()));
    const merged = new Map(state.saved.map(t => [t.id,t]));
    let added = 0;
    imported.saved.forEach(t => { if (!merged.has(t.id)) { merged.set(t.id,t); added++; } });
    if (merged.size > 1000) throw new Error('合并后选题过多，请分开备份保存。');
    state = { ...imported, saved: [...merged.values()] };
    fillForm(); updateMode();
    const stored = persist(); renderTopics(); renderLibrary(); renderCalendar();
    if (stored) toast('已恢复定位与当前批次，合并 ' + added + ' 个收藏；已有收藏的修改已保留。');
  } catch (e) { toast(e.message || '备份无法读取，请检查文件格式。'); }
  e.target.value = '';
});
window.addEventListener('hashchange', () => setView(location.hash.slice(1)));
hydrateIcons(); fillForm(); renderTopics(); updateMode(); setView(location.hash.slice(1)); checkConnection();

