/**
 * wardrobe-ai.js — AI Wardrobe Controller for ST Interactive
 *
 * Импорт в script.js (первая строка файла):
 *   import { wardrobeAI } from './wardrobe-ai.js';
 *
 * ── Что делает этот файл ────────────────────────────────────────────────────
 *  1. Инжектирует текущее состояние гардероба в промпт перед каждой генерацией
 *  2. Парсит команды из ответов модели и применяет их к манекену
 *  3. Управляет UI-панелью гардероба (перенесено из script.js)
 *  4. Создаёт кнопки динамически при добавлении новой одежды
 *
 * ── Синтаксис команд в ответах модели ──────────────────────────────────────
 *   [wear:shirt]       — надеть предмет
 *   [remove:bra]       — снять предмет
 *   [toggle:panties]   — переключить
 *   [dressAll]         — одеть всё
 *   [undressAll]       — снять всё
 *
 * Команды автоматически удаляются из отображаемого текста.
 * ───────────────────────────────────────────────────────────────────────────
 */

// ── Метки кнопок для базового гардероба ──────────────────────────────────────
const LABELS = {
    panties: '🩲 Трусики',
    bra:     '👙 Лифчик',
    short:   '🩳 Шорты',
    shirt:   '👕 Рубашка',
};

const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1).replace(/[-_]/g, ' ');

// ── Паттерн команд ───────────────────────────────────────────────────────────
const CMD_PATTERN = /\[(wear|remove|toggle|dressAll|undressAll)(?::([^\]]+))?\]/gi;

// ── Системная инструкция для модели ─────────────────────────────────────────
const SYSTEM_INSTRUCTION = `[WARDROBE SYSTEM — read carefully]
You control your character's visible clothing on a live puppet. You MUST use the commands below whenever clothing changes or is referenced.

Commands (embed anywhere in your reply — they are invisible to the user):
  [wear:<n>]    — put item on
  [remove:<n>]  — take item off
  [toggle:<n>]  — flip state
  [dressAll]       — put all items on
  [undressAll]     — remove all items

CRITICAL RULES:
1. Treat the "Currently worn / Currently removed" list below as GROUND TRUTH. Do not invent or assume clothing state from conversation history.
2. Always issue the appropriate command when clothing changes in your narration.
3. Item names are case-sensitive and must match the list EXACTLY.
[/WARDROBE SYSTEM]`;

// ── Чтение состояния ─────────────────────────────────────────────────────────

function getClothingState() {
    return window.stInteractive?.clothing?.map(c => ({
        name:    c.name,
        visible: c.visible,
    })) ?? [];
}

function buildStateBlock() {
    const state = getClothingState();
    if (!state.length) return SYSTEM_INSTRUCTION;

    const worn    = state.filter(c =>  c.visible).map(c => c.name).join(', ') || '—';
    const removed = state.filter(c => !c.visible).map(c => c.name).join(', ') || '—';
    const all     = state.map(c => c.name).join(', ');

    return [
        SYSTEM_INSTRUCTION,
        '',
        `Available clothing (exact names): ${all}`,
        `Currently worn:                   ${worn}`,
        `Currently removed:                ${removed}`,
    ].join('\n');
}

// ── Выполнение команд ─────────────────────────────────────────────────────────

function executeCommand(action, name) {
    const act = action.toLowerCase();
    const n   = name?.trim();

    switch (act) {
        case 'wear':       window.wearClothing?.(n);   break;
        case 'remove':     window.removeClothing?.(n); break;
        case 'toggle':     window.toggleClothing?.(n); break;
        case 'dressall':   window.dressAll?.();         break;
        case 'undressall': window.undressAll?.();       break;
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
        console.log('[WardrobeAI] Команды применены:', getClothingState());
    }

    return cleaned.replace(/[ \t]{2,}/g, ' ').trim();
}

// ── UI: панель гардероба ──────────────────────────────────────────────────────

let _btnRow  = null;
let _panelEl = null;

function createWardrobeButton(item) {
    const btn = document.createElement('button');
    btn.id            = `st-ward-btn-${item.name}`;
    btn.className     = 'menu_button';
    btn.style.cssText = 'padding:3px 9px; font-size:0.8em; transition:opacity .15s';
    btn.textContent   = LABELS[item.name] ?? capitalize(item.name);
    btn.style.opacity = item.visible ? '1' : '0.35';
    btn.title         = item.visible ? 'Снять' : 'Надеть';
    btn.addEventListener('click', () => window.toggleClothing?.(item.name));

    if (_btnRow) _btnRow.appendChild(btn);
    return btn;
}

function syncWardrobeButtons() {
    for (const item of (window.stInteractive?.clothing ?? [])) {
        const btn = document.getElementById(`st-ward-btn-${item.name}`);
        if (!btn) {
            if (_btnRow) createWardrobeButton(item); // новый предмет — создать кнопку
            continue;
        }
        btn.style.opacity = item.visible ? '1' : '0.35';
        btn.title         = item.visible ? 'Снять' : 'Надеть';
    }
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

        const title = document.createElement('div');
        title.style.cssText = 'font-weight:600; margin-bottom:5px; font-size:0.82em; opacity:0.75; letter-spacing:.03em';
        title.textContent = '👗 Гардероб';
        panel.appendChild(title);

        _btnRow = document.createElement('div');
        _btnRow.id = 'st-wardrobe-btnrow';
        _btnRow.style.cssText = 'display:flex; flex-wrap:wrap; gap:4px;';
        panel.appendChild(_btnRow);

        for (const item of (window.stInteractive?.clothing ?? [])) {
            createWardrobeButton(item);
        }

        const actionRow = document.createElement('div');
        actionRow.style.cssText = 'display:flex; gap:4px; margin-top:5px;';

        const makeBtn = (text, onClick) => {
            const b = document.createElement('button');
            b.className = 'menu_button';
            b.style.cssText = 'padding:3px 8px; font-size:0.8em; flex:1';
            b.textContent = text;
            b.addEventListener('click', onClick);
            return b;
        };

        actionRow.appendChild(makeBtn('✅ Одеть всё',  () => window.dressAll?.()));
        actionRow.appendChild(makeBtn('❌ Снять всё', () => window.undressAll?.()));
        panel.appendChild(actionRow);

        extMenu.appendChild(panel);
        _panelEl = panel;
    }, 600);
}

// ── Перехват глобального API для синхронизации кнопок ────────────────────────

function wrapGlobalAPI() {
    const wrap = (fn) => (...args) => { fn?.(...args); syncWardrobeButtons(); };

    window.wearClothing   = wrap(window.wearClothing);
    window.removeClothing = wrap(window.removeClothing);
    window.toggleClothing = wrap(window.toggleClothing);
    window.dressAll       = wrap(window.dressAll);
    window.undressAll     = wrap(window.undressAll);
}

// ── Инъекция состояния в промпт ───────────────────────────────────────────────

function injectStateIntoPrompt(promptData) {
    const block = buildStateBlock();

    // Chat Completion API: массив prompts[]
    if (Array.isArray(promptData?.prompts)) {
        const sys = promptData.prompts.find(p => p.role === 'system');
        if (sys) { sys.content += '\n\n' + block; return; }
        promptData.prompts.unshift({ role: 'system', content: block });
        return;
    }

    // Text Completion / Legacy: строка systemPrompt
    if (typeof promptData?.systemPrompt === 'string') {
        promptData.systemPrompt += '\n\n' + block;
        return;
    }

    // Fallback: любое строковое поле верхнего уровня
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
        // Инъекция состояния — пробуем несколько событий для совместимости
        const PRE_EVENTS = [
            'GENERATE_BEFORE_COMBINE_PROMPTS',
            'CHAT_COMPLETION_PROMPT_READY',
            'GENERATE_AFTER_COMBINE_PROMPTS',
        ];
        for (const evName of PRE_EVENTS) {
            const ev = event_types[evName];
            if (ev) {
                eventSource.on(ev, (data) => injectStateIntoPrompt(data));
                console.log(`[WardrobeAI] Хук инъекции: ${evName}`);
            }
        }

        // Парсинг ответа — до сохранения в chat[]
        if (event_types.MESSAGE_RECEIVED) {
            eventSource.on(event_types.MESSAGE_RECEIVED, (data) => {
                if (data?.mes) data.mes = processResponse(data.mes);
            });
        }

        // Финальный контроль — после рендера
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
        }

        this._hooked = true;
    }

    // ── Публичное API ─────────────────────────────────────────────────────────

    getState() { return getClothingState(); }

    exec(action, name) { executeCommand(action, name); }

    /** Зарегистрировать новый предмет одежды (добавляет кнопку если панель открыта) */
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
            c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase())
        );
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
