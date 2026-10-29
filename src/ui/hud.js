/* UI-обвязка: меню, HUD, магазин, тосты */
import { getState, setState, save, owns, purchase, xpForLevel } from '../core/storage.js';

const $ = (s) => document.querySelector(s);

export const ui = {
  onPlay: null,
  onExitToMenu: null,
  onRespawn: null,
};

const SHOP_ITEMS = [
  { id: 'hat_red',   ico: '🎩', nm: 'Красная шапка', ds: 'Стильный помпон', price: 150, cur: 'coins', apply: (st) => { st.hatColor = '#e74c3c'; } },
  { id: 'hat_blue',  ico: '🧢', nm: 'Синяя шапка', ds: 'Для самых холодных', price: 150, cur: 'coins', apply: (st) => { st.hatColor = '#3498db'; } },
  { id: 'suit_pink', ico: '🧥', nm: 'Розовый костюм', ds: 'Яркий на склоне', price: 30, cur: 'gems', apply: (st) => { st.suitColor = '#ff6b9d'; } },
  { id: 'suit_mint', ico: '🥶', nm: 'Мятный костюм', ds: 'Цвет леденца', price: 30, cur: 'gems', apply: (st) => { st.suitColor = '#7CFCDB'; } },
  { id: 'speed1',    ico: '👟', nm: 'Кроссовки +', ds: '+скорость бега', price: 200, cur: 'coins', apply: (st) => { st.speedBoost = 1; } },
  { id: 'speed2',    ico: '⛷️', nm: 'Лыжи про', ds: '++скорость', price: 60, cur: 'gems', apply: (st) => { st.speedBoost = 2; }, req: 'speed1' },
  { id: 'jump1',     ico: '🦘', nm: 'Пружины', ds: '+высота прыжка', price: 200, cur: 'coins', apply: (st) => { st.jumpBoost = 1; } },
  { id: 'jump2',     ico: '🚀', nm: 'Реактивный ранец', ds: '++прыжок', price: 60, cur: 'gems', apply: (st) => { st.jumpBoost = 2; }, req: 'jump1' },
];

export function refreshCurrency() {
  const st = getState();
  document.querySelectorAll('.coins-live').forEach((el) => (el.textContent = st.coins));
  document.querySelectorAll('.gems-live').forEach((el) => (el.textContent = st.gems));
  $('#stat-coins').textContent = st.coins;
  $('#stat-gems').textContent = st.gems;
  $('#stat-level').textContent = st.level;
}

export function refreshPlayerPanel() {
  const st = getState();
  $('#hud-level').textContent = st.level;
  $('#xp-fill').style.width = Math.min(100, (st.xp / xpForLevel(st.level)) * 100) + '%';
  refreshCurrency();
}

export function setHP(hp) {
  $('#hp-fill').style.width = hp + '%';
  $('#hp-text').textContent = Math.round(hp);
}

export function setStamina(st) {
  $('#st-fill').style.width = st + '%';
}

export function toast(text, gold = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (gold ? ' gold' : '');
  el.textContent = text;
  $('#toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

export function showInteractHint(show) {
  $('#interact-hint').classList.toggle('hidden', !show);
}

export function showDeath(show) {
  $('#death-overlay').classList.toggle('hidden', !show);
}

export function showScreen(id) {
  ['#main-menu', '#shop-screen'].forEach((s) => $(s).classList.add('hidden'));
  if (id) $(id).classList.remove('hidden');
}

export function setHUD(show) {
  $('#hud').classList.toggle('hidden', !show);
}

function buildShop() {
  const grid = $('#shop-items');
  grid.innerHTML = '';
  const st = getState();
  for (const item of SHOP_ITEMS) {
    const owned = owns(item.id);
    const locked = item.req && !owns(item.req);
    const div = document.createElement('div');
    div.className = 'shop-item' + (item.cur === 'gems' ? ' gem-price' : '') + (owned ? ' owned' : '');
    div.innerHTML = `
      <div class="ico">${item.ico}</div>
      <div class="nm">${item.nm}</div>
      <div class="ds">${locked ? '🔒 Нужен: ' + SHOP_ITEMS.find(i => i.id === item.req).nm : item.ds}</div>
      <div class="pr">${owned ? '✓ Куплено' : (item.cur === 'coins' ? '🪙 ' : '💎 ') + item.price}</div>`;
    div.addEventListener('click', () => {
      if (owned || locked) return;
      if (purchase(item.id, item.price, item.cur)) {
        const s = getState();
        item.apply(s);
        save();
        toast('Куплено: ' + item.nm + '!', true);
        buildShop();
        refreshCurrency();
        if (ui.onInventoryChanged) ui.onInventoryChanged();
      } else {
        toast('Недостаточно ' + (item.cur === 'coins' ? 'монет 🪙' : 'кристаллов 💎'));
      }
    });
    grid.appendChild(div);
  }
}

export function initUI() {
  const st = getState();
  $('#player-name').value = st.name;
  $('#player-name').addEventListener('input', (e) => { setState({ name: e.target.value || 'Hubbi' }); });
  refreshCurrency();

  $('#btn-play').addEventListener('click', () => {
    showScreen(null);
    setHUD(true);
    if (ui.onPlay) ui.onPlay();
  });
  $('#btn-shop').addEventListener('click', () => { buildShop(); showScreen('#shop-screen'); });
  $('#btn-shop-close').addEventListener('click', () => showScreen('#main-menu'));
  $('#btn-settings').addEventListener('click', () => toast('Настройки появятся в следующем обновлении ❄'));
  $('#btn-respawn').addEventListener('click', () => { showDeath(false); if (ui.onRespawn) ui.onRespawn(); });
  $('#btn-to-menu').addEventListener('click', () => {
    showDeath(false); setHUD(false); showScreen('#main-menu');
    if (ui.onExitToMenu) ui.onExitToMenu();
  });
  $('#btn-pause').addEventListener('click', () => {
    setHUD(false); showScreen('#main-menu');
    if (ui.onExitToMenu) ui.onExitToMenu();
  });
}
