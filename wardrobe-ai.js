/**
 * wardrobe-ai.js — AI Wardrobe Controller for ST Interactive
 *
 * ── Что делает этот файл ────────────────────────────────────────────────────
 *  1. Парсит команды [wear:x] [remove:x] [toggle:x] [dressAll] [undressAll]
 *     из ответов модели и применяет слойную логику одевания/снятия
 *  2. УДАЛЯЕТ теги из текста сообщения ДО рендера (MESSAGE_RECEIVED)
 *     и зачищает DOM если тег всё же просочился (CHARACTER_MESSAGE_RENDERED)
 *  3. Инжектирует состояние гардероба в системный промпт
 *  4. Рендерит панель кнопок гардероба в меню расширений (волшебная палочка)
 *  5. Создаёт кнопки динамически при добавлении новой одежды (сканирование)
 *
 * ── Синтаксис команд ────────────────────────────────────────────────────────
 *   [wear:shirt]       — надеть предмет (с авто-логикой слоёв)
 *   [remove:bra]       — снять предмет
 *   [toggle:panties]   — переключить
 *   [dressAll]         — одеть всё
 *   [undressAll]       — снять всё
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

// ── Категории ──────────────────────────────────────────────────────────────
const UNDERWEAR_NAMES = new Set(['bra', 'panties', 'panty', 'thong', 'stockings', 'socks', 'lingerie']);

function getCategoryOf(name) {
    const cat = window.assetScanner?.categoryOf(name);
    if (cat) return cat;
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

function smartWear(name) {
    const clothing = getClothing();
    const item = clothing.find(c => c.name === name);
    if (!item) {
        console.warn(`[WardrobeAI] smartWear: предмет "${name}" не найден`);
        return;
    }
    const category = getCategoryOf(name);
    if (category === 'costume') {
        for (const c of clothing) {
            if (getCategoryOf(c.name) === 'outerwear') c.visible = false;
        }
    } else if (category === 'outerwear') {
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
    if (!item.visible) smartWear(name);
    else smartRemove(name);
}

// ── Паттерн команд ────────────────────────────────────────────────────────────
// Используем фабрику — флаг 'g' сбрасывает lastIndex при каждом new вызове
function makeCmdPattern() {
    return /\[(wear|remove|toggle|dressAll|undressAll)(?::([^\]]+))?\]/gi;
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

/**
 * Выполняет все команды из текста и возвращает очищенный текст без тегов.
 * @param {string} text
 * @param {boolean} executeActions — выполнять ли команды (false = только удалить теги)
 */
function processResponse(text, executeActions = true) {
    if (!text) return text;
    let found = false;
    const cleaned = text.replace(makeCmdPattern(), (_, action, name) => {
        if (executeActions) {
            found = true;
            executeCommand(action, name);
        }
        return '';
    });
    if (found) {
        console.log('[WardrobeAI] Команды применены. Состояние:', getClothingState());
        syncWardrobeButtons();
    }
    return cleaned.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Зачистка тегов из DOM без пересборки innerHTML.
 * Вызывается как резервный механизм в CHARACTER_MESSAGE_RENDERED.
 */
function stripTagsFromDom(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    const nodes  = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    for (const n of nodes) {
        const cleaned = n.nodeValue.replace(makeCmdPattern(), '').replace(/[ \t]{2,}/g, ' ');
        if (cleaned !== n.nodeValue) n.nodeValue = cleaned;
    }
}

// ── Состояние гардероба ───────────────────────────────────────────────────────

function getClothingState() {
    return getClothing().map(c => ({
        name:     c.name,
        visible:  c.visible,
        category: getCategoryOf(c.name),
    }));
}

// ── Системная инструкция ──────────────────────────────────────────────────────

function buildSystemInstruction() {
    return `[WARDROBE SYSTEM — read carefully]
You control your character's visible clothing on a live puppet. You MUST use the commands below whenever clothing changes or is referenced.

Commands (embed anywhere in your reply — they are invisible to the user):
  [wear:<n>]     — put item on (smart: wearing a costume hides outerwear; wearing outerwear removes costumes)
  [remove:<n>]   — take item off
  [toggle:<n>]   — flip state
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

function buildStateBlock() {
    const state = getClothingState();
    if (!state.length) return buildSystemInstruction();

    const worn    = state.filter(c =>  c.visible).map(c => c.name).join(', ') || '—';
    const removed = state.filter(c => !c.visible).map(c => c.name).join(', ') || '—';

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

// ── Инъекция состояния в промпт ───────────────────────────────────────────────

function injectStateIntoPrompt(promptData) {
    if (!promptData) return;
    const block = buildStateBlock();

    // Формат 1: Chat Completion — массив prompts с role/content
    if (Array.isArray(promptData.prompts)) {
        const sys = promptData.prompts.find(p => p.role === 'system');
        if (sys) {
            if (typeof sys.content === 'string') {
                sys.content += '\n\n' + block;
            } else if (Array.isArray(sys.content)) {
                const textPart = sys.content.find(p => p.type === 'text');
                if (textPart) textPart.text += '\n\n' + block;
                else sys.content.push({ type: 'text', text: block });
            }
        } else {
            promptData.prompts.unshift({ role: 'system', content: block });
        }
        return;
    }

    // Формат 2: messages array (некоторые версии ST)
    if (Array.isArray(promptData.messages)) {
        const sys = promptData.messages.find(p => p.role === 'system');
        if (sys && typeof sys.content === 'string') {
            sys.content += '\n\n' + block;
            return;
        }
    }

    // Формат 3: строковые поля (TextGen / KoboldAI)
    for (const key of ['systemPrompt', 'system', 'prompt', 'instruction']) {
        if (typeof promptData[key] === 'string') {
            promptData[key] += '\n\n' + block;
            return;
        }
    }

    console.warn('[WardrobeAI] Не удалось найти поле для инъекции. Ключи:', Object.keys(promptData));
}

// ── UI: панель гардероба ──────────────────────────────────────────────────────

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
    btn.addEventListener('click', () => {
        smartToggle(item.name);
        syncWardrobeButtons();
    });

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

/**
 * Вставляет панель гардероба в #extensionsMenu (dropdown волшебной палочки).
 *
 * В SillyTavern кнопка волшебной палочки открывает dropdown с id="extensionsMenu".
 * Он присутствует в DOM всегда (hidden через CSS), поэтому poll найдёт его быстро.
 */
function injectWardrobePanel() {
    const poll = setInterval(() => {
        if (document.getElementById('st-wardrobe-panel')) { clearInterval(poll); return; }

        const extMenu = document.getElementById('extensionsMenu');
        if (!extMenu) return;
        clearInterval(poll);

        const panel = document.createElement('div');
        panel.id = 'st-wardrobe-panel';
        panel.style.cssText = [
            'padding:6px 10px 8px',
            'border-top:1px solid var(--SmartThemeBorderColor,#555)',
            'margin-top:4px',
        ].join(';');
        _panelEl = panel;
        _sections = {};

        // Заголовок
        const title = document.createElement('div');
        title.style.cssText = 'font-weight:600; margin-bottom:4px; font-size:0.82em; opacity:0.75; letter-spacing:.03em';
        title.textContent = '👗 Гардероб';
        panel.appendChild(title);

        // Ряд кнопок действий — всегда последний
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
        actionRow.appendChild(makeBtn('🔍 Дебаг',     () => showDebugState(), 'flex:0 0 auto; opacity:0.6;'));
        panel.appendChild(actionRow);

        // Кнопки для уже загруженной одежды
        for (const item of getClothing()) {
            createWardrobeButton(item);
        }

        extMenu.appendChild(panel);
        console.log('[WardrobeAI] Панель гардероба добавлена в extensionsMenu');
    }, 600);
}

// ── Перехват глобального API ──────────────────────────────────────────────────

function wrapGlobalAPI() {
    window.wearClothing   = (name) => { smartWear(name);   syncWardrobeButtons(); };
    window.removeClothing = (name) => { smartRemove(name); syncWardrobeButtons(); };
    window.toggleClothing = (name) => { smartToggle(name); syncWardrobeButtons(); };
    window.dressAll       = ()     => { executeCommand('dressall');   syncWardrobeButtons(); };
    window.undressAll     = ()     => { executeCommand('undressall'); syncWardrobeButtons(); };
}

// ── Основной класс ────────────────────────────────────────────────────────────

class WardrobeAI {
    constructor() {
        this._hooked = false;
        this._waitForST();
    }

    _waitForST() {
        const ctx = window.SillyTavern?.getContext();
        if (!ctx?.eventSource || !ctx?.event_types || !window.stInteractive) {
            setTimeout(() => this._waitForST(), 500);
            return;
        }
        this._hookEvents(ctx);
        wrapGlobalAPI();
        injectWardrobePanel();
        console.log('✅ [WardrobeAI] Инициализирован');
    }

    _hookEvents({ eventSource, event_types }) {

        // ── Инъекция состояния в промпт ───────────────────────────────────────
        // break после первого найденного — иначе блок задвоится
        const PRE_EVENTS = [
            'GENERATE_BEFORE_COMBINE_PROMPTS',
            'CHAT_COMPLETION_PROMPT_READY',
            'GENERATE_AFTER_COMBINE_PROMPTS',
        ];
        let injectionHooked = false;
        for (const evName of PRE_EVENTS) {
            const ev = event_types[evName];
            if (ev) {
                eventSource.on(ev, (data) => {
                    try { injectStateIntoPrompt(data); }
                    catch (e) { console.warn('[WardrobeAI] Ошибка инъекции:', e); }
                });
                console.log(`[WardrobeAI] Хук инъекции: ${evName}`);
                injectionHooked = true;
                break;
            }
        }
        if (!injectionHooked) {
            console.warn('[WardrobeAI] Нет событий инъекции. Доступные:', Object.keys(event_types));
        }

        // ── Основной хук: MESSAGE_RECEIVED ────────────────────────────────────
        // В ST этот ивент передаёт ИНДЕКС сообщения (число), не объект.
        // chat[idx].mes уже записан и можно мутировать ДО рендера.
        if (event_types.MESSAGE_RECEIVED) {
            eventSource.on(event_types.MESSAGE_RECEIVED, (msgId) => {
                const ctx  = window.SillyTavern?.getContext();
                const chat = ctx?.chat;
                if (!chat) return;

                const idx = Number(msgId);
                const msg = chat[idx];
                if (!msg || msg.is_user) return;

                const cleaned = processResponse(msg.mes, true);
                if (cleaned !== msg.mes) {
                    msg.mes = cleaned;
                    if (typeof ctx.saveSettingsDebounced === 'function') ctx.saveSettingsDebounced();
                }
            });
            console.log('[WardrobeAI] Хук парсинга: MESSAGE_RECEIVED (по индексу)');
        }

        // ── Резервный хук: убираем теги из DOM если они просочились ──────────
        // executeActions=false — команды уже выполнены в MESSAGE_RECEIVED
        if (event_types.CHARACTER_MESSAGE_RENDERED) {
            eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (msgId) => {
                const el = document.querySelector(`[mesid="${msgId}"] .mes_text`);
                if (!el) return;
                if (makeCmdPattern().test(el.textContent)) {
                    stripTagsFromDom(el);
                }
            });
            console.log('[WardrobeAI] Хук зачистки DOM: CHARACTER_MESSAGE_RENDERED');
        }

        // ── Стриминг: убираем теги из потока ─────────────────────────────────
        // ST 1.12.6+ — теги не видны пользователю во время стриминга
        if (event_types.STREAM_TOKEN_RECEIVED) {
            eventSource.on(event_types.STREAM_TOKEN_RECEIVED, (data) => {
                if (typeof data?.text === 'string') {
                    data.text = data.text.replace(makeCmdPattern(), '');
                }
            });
            console.log('[WardrobeAI] Хук стриминга: STREAM_TOKEN_RECEIVED');
        }

        this._hooked = true;
    }

    // ── Публичное API ─────────────────────────────────────────────────────────

    getState()         { return getClothingState(); }
    exec(action, name) { executeCommand(action, name); syncWardrobeButtons(); }
    syncButtons()      { syncWardrobeButtons(); }

    /**
     * Вызывается из asset-scanner когда найден новый предмет одежды.
     * Создаёт кнопку в панели если её ещё нет.
     */
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
