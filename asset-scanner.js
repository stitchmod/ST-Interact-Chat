/**
 * asset-scanner.js — Сканер папки assets для ST Interactive
 *
 * Так как ST-расширения работают в браузере (нет прямого доступа к FS),
 * сканирование реализовано двумя способами:
 *   1. Автоскан: пробует загрузить известные имена из папки assets/
 *      (работает если сервер ST отдаёт файлы по прямому URL)
 *   2. Ручной список: пользователь указывает файлы в настройках —
 *      scanner парсит их и категоризирует автоматически по имени.
 *
 * Категории определяются по имени файла:
 *   underwear  — содержит: bra, panties, thong, stockings, socks, lingerie
 *   costumes   — содержит суффикс: _costume, _outfit, _uniform, _suit
 *   outerwear  — всё остальное
 *
 * Использование в script.js:
 *   import { AssetScanner } from './asset-scanner.js';
 *   // После window.stInteractive = stInteractive;
 *   window.assetScanner = new AssetScanner(stInteractive, extDir);
 *   await window.assetScanner.scan();
 */

// ── Правила категоризации ────────────────────────────────────────────────────

const UNDERWEAR_KEYWORDS = [
    'bra', 'panties', 'panty', 'thong', 'stockings', 'stocking',
    'socks', 'sock', 'lingerie', 'underwear', 'undies',
];

const COSTUME_KEYWORDS = [
    '_costume', '_outfit', '_uniform', '_suit', '_dress',
];

// Известные базовые имена для автосканирования
const KNOWN_FILENAMES = [
    'bra.png', 'panties.png', 'panty.png', 'thong.png',
    'stockings.png', 'socks.png', 'lingerie.png',
    'shirt.png', 'shorts.png', 'short.png', 'pants.png',
    'skirt.png', 'jacket.png', 'coat.png', 'dress.png',
    'top.png', 'blouse.png', 'sweater.png', 'hoodie.png',
    'maid_costume.png', 'nurse_costume.png', 'school_uniform.png',
    'bunny_suit.png', 'swimsuit.png', 'bikini.png',
];

// zIndex по категории
const Z_INDEX = {
    underwear: 2,
    outerwear: 5,
    costume:   8,
};

// ── Утилиты ──────────────────────────────────────────────────────────────────

function classify(filename) {
    const lower = filename.toLowerCase().replace(/\.png$/i, '');

    if (COSTUME_KEYWORDS.some(kw => lower.includes(kw))) return 'costume';
    if (UNDERWEAR_KEYWORDS.some(kw => lower === kw || lower.startsWith(kw))) return 'underwear';
    return 'outerwear';
}

function nameFromFile(filename) {
    return filename.replace(/\.png$/i, '').replace(/[-\s]/g, '_');
}

function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1).replace(/[_-]/g, ' ');
}

// ── Основной класс ────────────────────────────────────────────────────────────

export class AssetScanner {
    /**
     * @param {InteractiveMapManager} manager
     * @param {string} extDir — базовый URL расширения (import.meta.url без имени файла)
     */
    constructor(manager, extDir) {
        this.mgr    = manager;
        this.extDir = extDir.replace(/\/+$/, '');

        /** Результат последнего скана: { underwear: [], outerwear: [], costume: [] } */
        this.catalog = { underwear: [], outerwear: [], costume: [] };

        /** Все найденные предметы в плоском виде */
        this.items = [];
    }

    // ── Сканирование ──────────────────────────────────────────────────────────

    /**
     * Основной метод сканирования.
     * Сначала пробует автоскан известных имён, затем добавляет предметы из
     * ручного wardrobeString из настроек. Дубликаты по имени отбрасываются.
     *
     * @returns {Promise<{ underwear: [], outerwear: [], costume: [] }>}
     */
    async scan() {
        const ctx      = window.SillyTavern?.getContext();
        const settings = ctx?.extensionSettings?.['st-interact-chat'] ?? {};

        this.catalog  = { underwear: [], outerwear: [], costume: [] };
        this.items    = [];
        const seen    = new Set();

        // ── 1. Автоскан известных имён ────────────────────────────────────────
        const autoResults = await Promise.allSettled(
            KNOWN_FILENAMES.map(file => this._probeFile(file))
        );
        for (const r of autoResults) {
            if (r.status === 'fulfilled' && r.value) {
                const item = r.value;
                if (!seen.has(item.name)) {
                    seen.add(item.name);
                    this._register(item);
                }
            }
        }

        // ── 2. Ручной список из настроек (underwear / outerwear / costume) ────
        const manualSources = [
            { key: 'wardrobeUnderwear',  forceCategory: 'underwear'  },
            { key: 'wardrobeOuterwear',  forceCategory: 'outerwear'  },
            { key: 'wardrobeCostumes',   forceCategory: 'costume'    },
            { key: 'wardrobeString',     forceCategory: null          }, // авто
        ];

        for (const { key, forceCategory } of manualSources) {
            const raw = settings[key];
            if (!raw) continue;

            for (const entry of raw.split(',').map(s => s.trim()).filter(Boolean)) {
                const parts = entry.split(':').map(s => s.trim());
                let name, rawPath;

                if (parts.length === 2) {
                    [name, rawPath] = parts;
                } else {
                    // Просто имя файла без алиаса
                    rawPath = parts[0];
                    name    = nameFromFile(rawPath.split('/').pop());
                }

                if (seen.has(name)) continue;

                const category = forceCategory ?? classify(rawPath.split('/').pop());
                const url      = this._resolveUrl(rawPath);
                const img      = new Image();

                try {
                    await this._loadImg(img, url);
                    const item = this._makeItem(name, rawPath, category, img);
                    seen.add(name);
                    this._register(item);
                } catch {
                    console.warn(`[AssetScanner] Не загружено: ${rawPath}`);
                }
            }
        }

        // ── 3. Синхронизация с clothing в manager ────────────────────────────
        this._syncToManager();

        console.log('[AssetScanner] Каталог:', this.catalog);
        return this.catalog;
    }

    // ── Проба одного файла ────────────────────────────────────────────────────

    async _probeFile(filename) {
        const url = `${this.extDir}/assets/${filename}`;
        const img = new Image();
        try {
            await this._loadImg(img, url);
            const name     = nameFromFile(filename);
            const category = classify(filename);
            return this._makeItem(name, filename, category, img);
        } catch {
            return null; // файл не существует — норма
        }
    }

    _makeItem(name, file, category, img) {
        // Проверяем, не загружен ли уже этот предмет в manager
        const existing = this.mgr.clothing.find(c => c.name === name);
        return {
            name,
            file,
            category,
            zIndex:  Z_INDEX[category] ?? 5,
            img:     existing?.img ?? img,
            visible: existing?.visible ?? (category !== 'costume'),
            label:   capitalize(name),
        };
    }

    _register(item) {
        this.items.push(item);
        if (item.category === 'underwear') this.catalog.underwear.push(item);
        else if (item.category === 'costume') this.catalog.costume.push(item);
        else this.catalog.outerwear.push(item);
    }

    // ── Синхронизация с manager.clothing ─────────────────────────────────────

    _syncToManager() {
        for (const item of this.items) {
            const existing = this.mgr.clothing.find(c => c.name === item.name);
            if (existing) {
                // Обновить категорию и zIndex если нашли
                existing.category = item.category;
                existing.zIndex   = item.zIndex;
            } else {
                // Новый предмет — добавить
                this.mgr.clothing.push(item);
                window.wardrobeAI?.registerClothingItem(item);
            }
        }

        // Пересортировать по zIndex
        this.mgr.clothing.sort((a, b) => a.zIndex - b.zIndex);
    }

    // ── URL ───────────────────────────────────────────────────────────────────

    _resolveUrl(rawPath) {
        const clean = rawPath.trim().replace(/^\/+/, '');
        if (clean.startsWith('assets/')) return `${this.extDir}/${clean}`;
        return `${this.extDir}/assets/${clean}`;
    }

    _loadImg(img, src) {
        return new Promise((res, rej) => {
            img.onload  = () => res(img);
            img.onerror = () => rej(new Error(src));
            img.src     = src;
        });
    }

    // ── Публичное API ─────────────────────────────────────────────────────────

    /** Получить предмет по имени */
    find(name) {
        return this.items.find(i => i.name === name) ?? null;
    }

    /** Получить категорию предмета */
    categoryOf(name) {
        return this.find(name)?.category ?? null;
    }

    /** Все имена в формате для AI-промпта, сгруппированные по категориям */
    buildCatalogBlock() {
        const fmt = arr => arr.map(i => i.name).join(', ') || '—';
        return [
            `Underwear items:  ${fmt(this.catalog.underwear)}`,
            `Outerwear items:  ${fmt(this.catalog.outerwear)}`,
            `Costume items:    ${fmt(this.catalog.costume)}`,
        ].join('\n');
    }
}
