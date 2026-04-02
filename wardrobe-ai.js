/**
 * wardrobe-ai.js — AI Wardrobe Controller for ST Interactive
 *
 * Импорт в script.js:
 *   import { wardrobeAI } from './wardrobe-ai.js';
 *
 * ── Что делает этот файл ────────────────────────────────────────────────────
 *  1. Инжектирует текущее состояние гардероба + каталог команд в промпт
 *  2. Парсит команды из ответов модели и применяет слойную логику:
 *       — [wear:maid_costume]  → все outerwear скрываются автоматически
 *       — [wear:shirt] когда надет костюм → костюм снимается автоматически
 *  3. Управляет UI-панелью гардероба с секциями по категориям
 *  4. Создаёт кнопки динамически при добавлении новой одежды
 *
 * ── Синтаксис команд ────────────────────────────────────────────────────────
 *   [wear:shirt]       — надеть предмет (с авто-логикой слоёв)
 *   [remove:bra]       — снять предмет
 *   [toggle:panties]   — переключить
 *   [dressAll]         — одеть всё
 *   [undressAll]       — снять всё
 * ───────────────────────────────────────────────────────────────────────────
 */

// ── Метки кнопок ─────────────────────────────────────────────────────────────
const LABELS = {
    panties: '🩲 Трусики',
    bra:     '👙 Лифчик',
    short:   '🩳 Шорты',
    shorts:  '🩳 Шорты',
    shirt:   '👕 Рубашка',
};

const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1).replace(/[_-]/g, ' ');

// ── Категории ─────────────────────────────────────────────────────────────────
// Используется как fallback если asset-scanner ещё не запустился
const UNDERWEAR_NAMES = new Set(['bra', 'panties', 'panty', 'thong', 'stockings', 'socks', 'lingerie']);

function getCategoryOf(name) {
    // Сначала смотрим в asset-scanner если он есть
    const cat = window.assetScanner?.categoryOf(name);
    if (cat) return cat;
    // Fallback по имени
    if (UNDERWEAR_NAMES.has(name.toLowerCase())) return 'underwear';
    if (name.toLowerCase().includes('costume') ||
        name.toLowerCase().includes('uniform') ||
        name.toLowerCase().includes('outfit'))  return 'costume';
    return 'outerwear';
}

function getClothing() {
    return window.stInteractive?.clothing ?? [];
}

// ── Слойная логика надевания ──────────────────────────────────────────────────

/**
 * Надеть предмет с учётом слоёв:
 *   - Надеваем костюм → скрываем всю верхнюю одежду (outerwear)
 *   - Надеваем верхнюю одежду → снимаем все костюмы
 */
function smartWear(name) {
    const clothing = getClothing();
    const item = clothing.find(c => c.name === name);
    if (!item) {
        console.warn(`[WardrobeAI] smartWear: предмет "${name}" не найден`);
        return;
    }

    const category = getCategoryOf(name);

    if (category === 'costume') {
        // Скрыть всю верхнюю одежду (не бельё, не другие костюмы)
        for (const c of clothing) {
            if (getCategoryOf(c.name) === 'outerwear') c.visible = false;
        }
    } else if (category === 'outerwear') {
        // Снять все надетые костюмы
        for (const c of clothing) {
            if (getCategoryOf(c.name) === 'costume' && c.visible) c.visible = false;
        }
    }

    item.visible = true;
    window.stInteractive?.renderVisibleLayers();
}

function smartRemove(name) {
    const item = getClothing().find(c => c.name === name);
    if (item) {
        item.visible = false;
        window.stInteractive?.renderVisibleLayers();
    }
}

function smartToggle(name) {
    const item = getClothing().find(c => c.name === name);
    if (!item) return;
    if (!item.visible) {
        smartWear(name);
    } else {
        smartRemove(name);
    }
}

// ── Паттерн команд ────────────────────────────────────────────────────────────
const CMD_PATTERN = /\[(wear|remove|toggle|dressAll|undressAll)(?::([^\]]+))?\]/gi;

// ── Системная инструкция ──────────────────────────────────────────────────────

function buildSystemInstruction() {
    return `[WARDROBE SYSTEM — read carefully]
You control your character's visible clothing on a live puppet. You MUST use the commands below whenever clothing changes or is referenced.

Commands (embed anywhere in your reply — they are invisible to the user):
  [wear:<name>]     — put item on (smart: wearing a costume hides outerwear; wearing outerwear removes costumes)
  [remove:<name>]   — take item off
  [toggle:<name>]   — flip state
  [dressAll]        — put all items on
  [undressAll]      — remove all items

LAYER RULES (automatic, you don't need to handle manually):
  • Wearing a COSTUME automatically hides all outerwear items.
  • Wearing OUTERWEAR while a costume is on automatically removes the costume.
  • Underwear is never affected by costume/outerwear logic.

CRITICAL RULES:
1. Treat the state block below as GROUND TRUTH.
2. Always issue a command when clothing changes in your narration.
3. Item names are case-sensitive and must match EXACTLY.
[/WARDROBE SYSTEM]`;
}

// ── Чтение состояния ─────────────────────────────────────────────────────────

function getClothingState() {
    return getClothing().map(c => ({
        name:     c.name,
        visible:  c.visible,
        category: getCategoryOf(c.name),
    }));
}

function buildStateBlock() {
    const state = getClothingState();
    if (!state.length) return buildSystemInstruction();

    const worn    = state.filter(c =>  c.visible).map(c => c.name).join(', ') || '—';
    const removed = state.filter(c => !c.visible).map(c => c.name).join(', ') || '—';

    // Группируем доступную одежду по категориям
    const byCategory = { underwear: [], outerwear: [], costume: [] };
    for (const c of state) byCategory[c.category]?.push(c.name);

    const catalogBlock = window.assetScanner
        ? window.assetScanner.buildCatalogBlock()
        : [
            `Underwear: ${byCategory.underwear.join(', ') || '—'}`,
            `Outerwear: ${byCategory.outerwear.join(', ') || '—'}`,
            `Costumes:  ${byCategory.costume.join(', ')  || '—'}`,
          ].join('\n');

    return [
        buildSystemInstruction(),
        '',
        '── Clothing catalog ──',
        catalogBlock,
        '',
        `Currently worn:    ${worn}`,
        `Currently removed: ${removed}`,
    ].join('\n');
}

// ── Выполнение команд ─────────────────────────────────────────────────────────

function executeCommand(action, name) {
    const act = action.toLowerCase();
    const n   = name?.trim();

    switch (act) {
        case 'wear':       smartWear(n);   break;
        case 'remove':     smartRemove(n); break;
        case 'toggle':     smartToggle(n); break;
        case 'dressall':
            getClothing().forEach(c => { c.visible = true; });
            window.stInteractive?.renderVisibleLayers();
            break;
        case 'undressall':
            getClothing().forEach(c => { c.visible = false; });
            window.stInteractive?.renderVisibleLayers();
            break;
        default:
            console.warn(`[WardrobeAI] Неизвестная команда: ${act}`);
    }
}

function processResponse(text) {
    if (!text) return text;

    let found = false;
    const cleaned = text.replace(CMD_PATTERN, (_, action, name) => {
        found = true;
        executeCommand(action, name);
        return '';
    });

    if (found) {
        console.log('[WardrobeAI] Команды применены. Состояние:', getClothingState());
        syncWardrobeButtons();
    }

    return cleaned.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

// ── UI: панель гардероба ──────────────────────────────────────────────────────

// Секции по категориям: { category -> div }
let _sections = {};
let _panelEl  = null;

const SECTION_META = {
    underwear: { icon: '🩲', label: 'Бельё'          },
    outerwear: { icon: '👕', label: 'Верхняя одежда' },
    costume:   { icon: '🎭', label: 'Костюмы'        },
};

function getOrCreateSection(category) {
    if (_sections[category]) return _sections[category];
    if (!_panelEl) return null;

    const meta = SECTION_META[category] ?? { icon: '👗', label: capitalize(category) };

    const wrapper = document.createElement('div');
    wrapper.id = `st-ward-section-${category}`;
    wrapper.style.cssText = 'margin-top:6px;';

    const label = document.createElement('div');
    label.style.cssText = 'font-size:0.75em; opacity:0.55; margin-bottom:3px;';
    label.textContent = `${meta.icon} ${meta.label}`;
    wrapper.appendChild(label);

    const row = document.createElement('div');
    row.id = `st-ward-row-${category}`;
    row.style.cssText = 'display:flex; flex-wrap:wrap; gap:4px;';
    wrapper.appendChild(row);

    // Вставляем перед рядом действий (actionRow — последний элемент)
    const actionRow = _panelEl.querySelector('#st-ward-action-row');
    _panelEl.insertBefore(wrapper, actionRow ?? null);

    _sections[category] = row;
    return row;
}

function createWardrobeButton(item) {
    if (document.getElementById(`st-ward-btn-${item.name}`)) return null;

    const category = getCategoryOf(item.name);
    const row      = getOrCreateSection(category);
    if (!row) return null;

    const btn = document.createElement('button');
    btn.id            = `st-ward-btn-${item.name}`;
    btn.className     = 'menu_button';
    btn.style.cssText = 'padding:3px 9px; font-size:0.8em; transition:opacity .15s';
    btn.textContent   = LABELS[item.name] ?? capitalize(item.name);
    btn.style.opacity = item.visible ? '1' : '0.35';
    btn.title         = item.visible ? 'Снять' : 'Надеть';
    btn.addEventListener('click', () => smartToggle(item.name) || syncWardrobeButtons());

    row.appendChild(btn);
    return btn;
}

function syncWardrobeButtons() {
    for (const item of getClothing()) {
        const btn = document.getElementById(`st-ward-btn-${item.name}`);
        if (!btn) {
            createWardrobeButton(item);
            continue;
        }
        btn.style.opacity = item.visible ? '1' : '0.35';
        btn.title         = item.visible ? 'Снять' : 'Надеть';
    }
}

function showDebugState() {
    const state = getClothingState();
    if (!state.length) {
        alert('[WardrobeAI] Гардероб пуст.');
        return;
    }
    const catIcon = { underwear: '🩲', outerwear: '👕', costume: '🎭' };
    const lines = state.map(c =>
        `${c.visible ? '✅' : '❌'} ${catIcon[c.category] ?? '👗'} ${c.name} (${c.category})`
    );
    const block = buildStateBlock();
    console.group('[WardrobeAI] Состояние гардероба');
    console.log(block);
    console.groupEnd();
    alert('Состояние гардероба:\n\n' + lines.join('\n') + '\n\n(Полный промпт-блок — в консоли)');
}

function injectWardrobePanel() {
    const poll = setInterval(() => {
        if (document.getElementById('st-wardrobe-panel')) { clearInterval(poll); return; }

        const extMenu = document.getElementById('extensionsMenu')
                     || document.getElementById('extensions_menu')
                     || document.querySelector('.extensions-menu');
        if (!extMenu) return;
        clearInterval(poll);

        const panel = document.createElement('div');
        panel.id = 'st-wardrobe-panel';
        panel.style.cssText = 'padding:6px 8px 8px; border-top:1px solid var(--SmartThemeBorderColor,#555)';
        _panelEl = panel;
        _sections = {};

        const title = document.createElement('div');
        title.style.cssText = 'font-weight:600; margin-bottom:4px; font-size:0.82em; opacity:0.75; letter-spacing:.03em';
        title.textContent = '👗 Гардероб';
        panel.appendChild(title);

        // Ряд действий — добавляем первым, секции будут вставляться перед ним
        const actionRow = document.createElement('div');
        actionRow.id = 'st-ward-action-row';
        actionRow.style.cssText = 'display:flex; gap:4px; margin-top:7px; flex-wrap:wrap;';

        const makeBtn = (text, onClick, extraStyle = '') => {
            const b = document.createElement('button');
            b.className = 'menu_button';
            b.style.cssText = `padding:3px 8px; font-size:0.8em; flex:1; ${extraStyle}`;
            b.textContent = text;
            b.addEventListener('click', onClick);
            return b;
        };

        actionRow.appendChild(makeBtn('✅ Одеть всё',  () => { executeCommand('dressall');   syncWardrobeButtons(); }));
        actionRow.appendChild(makeBtn('❌ Снять всё', () => { executeCommand('undressall'); syncWardrobeButtons(); }));
        actionRow.appendChild(makeBtn('🔍 Дебаг',     () => showDebugState(), 'flex:0; opacity:0.6;'));
        panel.appendChild(actionRow);

        // Создать кнопки для уже загруженной одежды
        for (const item of getClothing()) {
            createWardrobeButton(item);
        }

        extMenu.appendChild(panel);
    }, 600);
}

// ── Перехват глобального API ──────────────────────────────────────────────────

function wrapGlobalAPI() {
    // Оборачиваем оригинальные функции из script.js, добавляем слойную логику
    window.wearClothing   = (name) => { smartWear(name);   syncWardrobeButtons(); };
    window.removeClothing = (name) => { smartRemove(name); syncWardrobeButtons(); };
    window.toggleClothing = (name) => { smartToggle(name); syncWardrobeButtons(); };
    window.dressAll       = ()     => { executeCommand('dressall');   syncWardrobeButtons(); };
    window.undressAll     = ()     => { executeCommand('undressall'); syncWardrobeButtons(); };
}

// ── Инъекция состояния в промпт ───────────────────────────────────────────────

function injectStateIntoPrompt(promptData) {
    const block = buildStateBlock();

    if (Array.isArray(promptData?.prompts)) {
        const sys = promptData.prompts.find(p => p.role === 'system');
        if (sys) { sys.content += '\n\n' + block; return; }
        promptData.prompts.unshift({ role: 'system', content: block });
        return;
    }
    if (typeof promptData?.systemPrompt === 'string') {
        promptData.systemPrompt += '\n\n' + block;
        return;
    }
    for (const key of ['system', 'prompt', 'instruction']) {
        if (typeof promptData?.[key] === 'string') {
            promptData[key] += '\n\n' + block;
            return;
        }
    }
    console.warn('[WardrobeAI] Не удалось найти поле для инъекции:', Object.keys(promptData ?? {}));
}

// ── Основной класс ────────────────────────────────────────────────────────────

class WardrobeAI {
    constructor() {
        this._hooked = false;
        this._waitForST();
    }

    _waitForST() {
        const ctx = window.SillyTavern?.getContext();
        if (!ctx?.eventSource || !ctx?.event_types || !window.stInteractive || !window.wearClothing) {
            setTimeout(() => this._waitForST(), 500);
            return;
        }
        this._hookEvents(ctx);
        wrapGlobalAPI();       // заменяем window.wearClothing и т.д. на умные версии
        injectWardrobePanel();
        console.log('✅ [WardrobeAI] Инициализирован');
    }

    _hookEvents({ eventSource, event_types }) {
        const PRE_EVENTS = [
            'GENERATE_BEFORE_COMBINE_PROMPTS',
            'CHAT_COMPLETION_PROMPT_READY',
            'GENERATE_AFTER_COMBINE_PROMPTS',
        ];
        let injectionHooked = false;
        for (const evName of PRE_EVENTS) {
            const ev = event_types[evName];
            if (ev) {
                eventSource.on(ev, (data) => injectStateIntoPrompt(data));
                console.log(`[WardrobeAI] Хук инъекции: ${evName}`);
                injectionHooked = true;
            }
        }
        if (!injectionHooked) {
            console.warn('[WardrobeAI] Нет событий инъекции. Доступные:', Object.keys(event_types));
        }

        if (event_types.MESSAGE_RECEIVED) {
            eventSource.on(event_types.MESSAGE_RECEIVED, (data) => {
                if (data?.mes) data.mes = processResponse(data.mes);
            });
            console.log('[WardrobeAI] Хук парсинга: MESSAGE_RECEIVED');
        }

        if (event_types.CHARACTER_MESSAGE_RENDERED) {
            eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (msgId) => {
                const chat = window.SillyTavern.getContext().chat;
                const msg  = chat?.[msgId];
                if (!msg || msg.is_user) return;
                const cleaned = processResponse(msg.mes);
                if (cleaned === msg.mes) return;
                msg.mes = cleaned;
                const el = document.querySelector(`[mesid="${msgId}"] .mes_text`);
                if (el) el.innerHTML = cleaned;
            });
            console.log('[WardrobeAI] Хук зачистки: CHARACTER_MESSAGE_RENDERED');
        }

        this._hooked = true;
    }

    // ── Публичное API ─────────────────────────────────────────────────────────

    getState()             { return getClothingState(); }
    exec(action, name)     { executeCommand(action, name); syncWardrobeButtons(); }
    syncButtons()          { syncWardrobeButtons(); }

    registerClothingItem(item) {
        if (document.getElementById(`st-ward-btn-${item.name}`)) return;
        createWardrobeButton(item);
    }

    fuzzyFind(query) {
        if (!query) return null;
        const state = getClothingState();
        const q = query.toLowerCase().replace(/[_\-\s]+/g, '');
        const exact = state.find(c => c.name.toLowerCase() === q);
        if (exact) return exact.name;
        const sub = state.find(c =>
            c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase()));
        if (sub) return sub.name;
        let best = null, bestDist = Infinity;
        for (const c of state) {
            const d = levenshtein(c.name.toLowerCase(), q);
            if (d < bestDist && d <= 3) { bestDist = d; best = c.name; }
        }
        return best;
    }
}

function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 1; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
            dp[i][j] = a[i-1] === b[j-1]
                ? dp[i-1][j-1]
                : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    return dp[m][n];
}

// ── Экспорт ───────────────────────────────────────────────────────────────────

export const wardrobeAI = new WardrobeAI();
export default wardrobeAI;
window.wardrobeAI = wardrobeAI;
