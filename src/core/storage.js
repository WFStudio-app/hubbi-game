/* Сохранение прогресса игрока в localStorage */
const KEY = 'hubbi-frozen-heights-save-v1';

const DEFAULTS = {
  name: 'Hubbi',
  level: 1,
  xp: 0,
  coins: 0,
  gems: 50,
  owned: {},          // id скинов/улучшений из магазина
  suitColor: '#f7c948',
  hatColor: null,
  speedBoost: 0,      // уровень улучшения скорости
  jumpBoost: 0,
  bestTrickScore: 0,
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (e) { /* ignore */ }
  return { ...DEFAULTS };
}

export function getState() { return state; }

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}

export function setState(patch) {
  Object.assign(state, patch);
  save();
}

export function addCoins(n) { state.coins += n; save(); }
export function addGems(n) { state.gems += n; save(); }

export function xpForLevel(lvl) { return Math.floor(80 * Math.pow(lvl, 1.35)); }

/** Начисляет XP, возвращает массив событий повышения уровня */
export function addXp(n) {
  const events = [];
  state.xp += n;
  while (state.xp >= xpForLevel(state.level)) {
    state.xp -= xpForLevel(state.level);
    state.level += 1;
    state.gems += 5;
    events.push({ type: 'levelup', level: state.level });
  }
  save();
  return events;
}

export function owns(id) { return !!state.owned[id]; }

export function purchase(id, price, currency) {
  if (owns(id)) return true;
  if (currency === 'coins') {
    if (state.coins < price) return false;
    state.coins -= price;
  } else {
    if (state.gems < price) return false;
    state.gems -= price;
  }
  state.owned[id] = true;
  save();
  return true;
}
