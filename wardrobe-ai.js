/**
 * wardrobe-ai.js — AI Wardrobe Controller for ST Interactive
 *
 * Подключается к SillyTavern через eventSource.
 * Даёт ИИ-модели знание о текущем гардеробе и возможность
 * управлять одеждой манекена через специальные команды в тексте.
 *
 * Импорт в script.js (первая строка файла):
 *   import { wardrobeAI } from './wardrobe-ai.js';
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

// ── Константы ────────────────────────────────────────────────────────────────

/** Паттерн для поиска команд внутри ответа модели */
const CMD_PATTERN = /\[(wear|remove|toggle|dressAll|undressAll)(?::([^\]]+))?\]/gi;

/**
 * Системная инструкция, которая вшивается в промпт перед каждой генерацией.
 * Содержит правила использования команд и текущий список одежды.
 */
const SYSTEM_INSTRUCTION = `
[WARDROBE SYSTEM]
You control your character's appearance via puppet commands embedded in your response text.
Commands are invisible to the user — strip them into text naturally.

Available commands:
  [wear:<name>]    — put on a clothing item
  [remove:<name>]  — take off a clothing item
  [toggle:<name>]  — toggle on/off
  [dressAll]       — put everything on
  [undressAll]     — remove everything

Rules:
- Commands must match clothing item names EXACTLY (see "Available clothing" below).
- Place commands anywhere inside your reply. They will be stripped before display.
- You can use multiple commands in one reply.
- Always reflect what is currently worn in your narration.
`.trim();

// ── Вспомогательные функции ──────────────────────────────────────────────────

/**
 * Возвращает массив { name, visible } для всей одежды манекена.
 * Безопасно вернёт [] если stInteractive ещё не готов.
 */
function getClothingState() {
    return window.stInteractive?.clothing?.map(c => ({
        name:    c.name,
        visible: c.visible,
    })) ?? [];
}

/**
 * Строит текстовый блок о текущем состоянии гардероба для инъекции в промпт.
 * Пример:
 *   Available clothing: panties, bra, short, shirt
 *   Currently worn: panties, bra
 *   Currently removed: short, shirt
 */
function buildStateBlock() {
    const state = getClothingState();
    if (!state.length) return '';

    const all     = state.map(c => c.name).join(', ');
    const worn    = state.filter(c =>  c.visible).map(c => c.name).join(', ') || 'none';
    const removed = state.filter(c => !c.visible).map(c => c.name).join(', ') || 'none';

    return [
        SYSTEM_INSTRUCTION,
        '',
        `Available clothing: ${all}`,
        `Currently worn:     ${worn}`,
        `Currently removed:  ${removed}`,
        '[/WARDROBE SYSTEM]',
    ].join('\n');
}

/**
 * Выполняет одну найденную команду, вызывая глобальное API манекена.
 * @param {string} action  — 'wear' | 'remove' | 'toggle' | 'dressAll' | 'undressAll'
 * @param {string} [name]  — имя предмета (если применимо)
 */
function executeCommand(action, name) {
    const act = action.toLowerCase();
    const n   = name?.trim().toLowerCase();

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

/**
 * Сканирует текст ответа модели, извлекает команды, выполняет их.
 * @param {string} text — сырой текст из ответа модели
 * @returns {string}    — текст с удалёнными командами
 */
function processResponse(text) {
    if (!text) return text;

    let matched = false;
    const cleaned = text.replace(CMD_PATTERN, (_, action, name) => {
        matched = true;
        executeCommand(action, name);
        return ''; // убираем команду из текста
    });

    if (matched) {
        console.log('[WardrobeAI] Команды выполнены. Состояние:', getClothingState());
    }

    return cleaned.replace(/\s{2,}/g, ' ').trim(); // убрать двойные пробелы после удаления
}

// ── Основной класс ───────────────────────────────────────────────────────────

class WardrobeAI {
    constructor() {
        this._hooked = false;
        this._init();
    }

    /** Подключается к ST eventSource */
    _init() {
        const ctx = window.SillyTavern?.getContext();
        if (!ctx?.eventSource || !ctx?.event_types) {
            // ST ещё не загружен — ждём
            console.warn('[WardrobeAI] SillyTavern context недоступен, повтор через 1с...');
            setTimeout(() => this._init(), 1000);
            return;
        }

        const { eventSource, event_types } = ctx;

        // ── 1. Инъекция состояния гардероба ДО генерации ──────────────────
        //    GENERATE_BEFORE_COMBINE_PROMPTS вызывается до сборки финального промпта.
        //    Добавляем наш блок в конец системного промпта.
        eventSource.on(event_types.GENERATE_BEFORE_COMBINE_PROMPTS, (promptData) => {
            const block = buildStateBlock();
            if (!block) return;

            if (typeof promptData.systemPrompt === 'string') {
                promptData.systemPrompt += '\n\n' + block;
            } else if (Array.isArray(promptData.prompts)) {
                // Chat Completion API: ищем system-слот и дописываем
                const sysSlot = promptData.prompts.find(p => p.role === 'system');
                if (sysSlot) {
                    sysSlot.content += '\n\n' + block;
                } else {
                    promptData.prompts.unshift({ role: 'system', content: block });
                }
            }
        });

        // ── 2. Парсинг ответа модели ───────────────────────────────────────
        //    MESSAGE_RECEIVED срабатывает когда модель закончила генерацию.
        eventSource.on(event_types.MESSAGE_RECEIVED, (data) => {
            if (data?.mes) {
                data.mes = processResponse(data.mes);
            }
        });

        // ── 3. Стриминг: команды применяются по завершению потока ─────────
        //    CHARACTER_MESSAGE_RENDERED — последний момент перед рендером.
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (msgId) => {
            const ctx2  = window.SillyTavern.getContext();
            const chat  = ctx2.chat;
            const msg   = chat?.[msgId];
            if (!msg?.mes || msg.is_user) return;

            const cleaned = processResponse(msg.mes);
            if (cleaned !== msg.mes) {
                msg.mes = cleaned;
                // Обновить DOM: перерендерить сообщение
                const msgEl = document.querySelector(`[mesid="${msgId}"] .mes_text`);
                if (msgEl) msgEl.innerHTML = cleaned;
            }
        });

        this._hooked = true;
        console.log('✅ [WardrobeAI] Подключён к SillyTavern');
    }

    // ── Публичное API ────────────────────────────────────────────────────────

    /** Возвращает текущее состояние гардероба */
    getState() {
        return getClothingState();
    }

    /** Ручной вызов: выполнить команду программно */
    exec(action, name) {
        executeCommand(action, name);
    }

    /**
     * Нечёткий поиск предмета по неточному имени.
     * Используется для будущего апдейта — см. комментарий в конце файла.
     * @param {string} query — например 'sweater', 'свитер', 'maid dress'
     * @returns {string|null} — точное имя из списка clothing или null
     */
    fuzzyFind(query) {
        if (!query) return null;
        const state = getClothingState();
        const q = query.toLowerCase().replace(/[_\-\s]+/g, '');

        // 1. Точное совпадение
        const exact = state.find(c => c.name.toLowerCase() === q);
        if (exact) return exact.name;

        // 2. Вхождение (substring)
        const sub = state.find(c =>
            c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase())
        );
        if (sub) return sub.name;

        // 3. Расстояние Левенштейна (для опечаток, например 'shrt' → 'short')
        let best = null, bestDist = Infinity;
        for (const c of state) {
            const dist = levenshtein(c.name.toLowerCase(), q);
            if (dist < bestDist && dist <= 3) {
                bestDist = dist;
                best = c.name;
            }
        }
        return best;
    }
}

/** Расстояние Левенштейна (Wagner–Fischer) */
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

// ── Экспорт ──────────────────────────────────────────────────────────────────

export const wardrobeAI = new WardrobeAI();
export default wardrobeAI;

/*
 * ════════════════════════════════════════════════════════════════════════════
 *  ЗАМЕТКИ ДЛЯ БУДУЩЕГО АПДЕЙТА: Умный подбор одежды по имени файла
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Когда пользователь загружает новый файл через file picker в настройках,
 * он регистрируется в stInteractive.clothing с именем = имя файла без расширения.
 * Пример: "maid-dress.png" → name = "maid-dress"
 *
 * ИИ-модель АВТОМАТИЧЕСКИ получает обновлённый список через buildStateBlock(),
 * потому что тот читает stInteractive.clothing в реальном времени.
 * Модель увидит: "Available clothing: panties, bra, shirt, maid-dress"
 * И сможет использовать: [wear:maid-dress]
 *
 * Для НЕЧЁТКОГО распознавания (когда модель пишет [wear:maid dress] вместо
 * [wear:maid-dress]) — уже реализован wardrobeAI.fuzzyFind(query).
 * Нужно только подключить его в processResponse():
 *
 *   // Заменить в executeCommand():
 *   const resolvedName = wardrobeAI.fuzzyFind(n) ?? n;
 *   window.wearClothing?.(resolvedName);
 *
 * Для маппинга РУССКИХ слов → имён файлов (например "свитер" → "sweater"):
 * добавить словарь в WardrobeAI и расширить fuzzyFind() языковым lookup-ом.
 * ════════════════════════════════════════════════════════════════════════════
 */
