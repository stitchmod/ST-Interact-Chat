/**
 * ST Interactive — Character Puppet Overlay
 * Overlay appended directly to <body> (same as #expression-wrapper in ST),
 * click zone only covers the canvas, wardrobe exposed globally and via UI.
 */
// wardrobe-ai.js загружается через index.js отдельно и сам находит stInteractive
// через window.stInteractive — статический импорт здесь не нужен.
class InteractiveMapManager {
    constructor() {
        this.CANVAS_W = 832;
        this.CANVAS_H = 1216;

        // Main display canvas
        this.canvas     = document.createElement('canvas');
        this.canvas.width  = this.CANVAS_W;
        this.canvas.height = this.CANVAS_H;
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

        // Offscreen canvas for hit-testing the zone map — created once
        this.mapCanvas     = document.createElement('canvas');
        this.mapCanvas.width  = this.CANVAS_W;
        this.mapCanvas.height = this.CANVAS_H;
        this.mapCtx = this.mapCanvas.getContext('2d', { willReadFrequently: true });

        this.layers = {
            base: new Image(),
            map:  new Image(),
        };

        /**
         * Default clothing items.
         * zIndex controls draw order (higher = on top).
         * shirt.png always has the highest zIndex (10) and sits over everything else.
         */
        this.clothing = [
            { name: 'panties', file: 'panties.png', zIndex: 1,  img: new Image(), visible: true },
            { name: 'bra',     file: 'bra.png',     zIndex: 2,  img: new Image(), visible: true },
            { name: 'short',   file: 'shorts.png',  zIndex: 3,  img: new Image(), visible: true },
            { name: 'shirt',   file: 'shirt.png',   zIndex: 10, img: new Image(), visible: true },
        ];

        // Zone map: pixel colour (HEX) -> body part label
        this.zones = {
            'DEFF90': 'Волосы', '9AAAEF': 'Лицо',   '7F3300': 'Нос',
            'CCFFFA': 'Глаза',  '61A7AA': 'Глаза',   'F49788': 'Губы',
            'FFC9CD': 'Ухо',    '522D00': 'Шея',     '00FFFA': 'Плечи',
            'FFAF99': 'Плечи',  '57007F': 'Руки',    'F026FF': 'Руки',
            'E3A3FF': 'Руки',   '7F6A00': 'Руки',    '7F0000': 'Руки',
            '404040': 'Руки',   '5B7F00': 'Торс',    '07FF5E': 'Торс',
            '61FF00': 'Пупок',  '808080': 'Пах',     'FF004C': 'Вагина',
            '0A88FF': 'Грудь',  'E1FF00': 'Грудь',   '6A00FF': 'Ареола',
            'FF6D05': 'Ареола', 'FF00FF': 'Сосок',   'FF0037': 'Сосок',
            'A387FF': 'Бёдра',  '000000': 'Бёдра',   'B1FF2B': 'Ступня',
        };

        this.isReady         = false;
        this.isEnabled       = true;
        this._injectInterval = null;

        this.init();
    }

    // ── Initialization ────────────────────────────────────────────────────────

    async init() {
        const context  = window.SillyTavern.getContext();
        const settings = context.extensionSettings['st-interact-chat'] || {};

        // Respect the enable/disable checkbox
        this.isEnabled = settings.enabled !== false; // default ON
        if (!this.isEnabled) {
            console.log('[ST Interactive] Отключён настройками');
            return;
        }

        const scriptPath = import.meta.url;
        const extDir     = scriptPath.substring(0, scriptPath.lastIndexOf('/'));

        const fixPath = (p) => {
            if (!p) return '';
            const clean = p.trim().replace(/^\/+|\/+$/g, '');
            return clean.startsWith('assets/') ? clean : `assets/${clean}`;
        };

        const baseSrc = `${extDir}/${fixPath(settings.basePath || 'girl.png')}`;
        const mapSrc  = `${extDir}/${fixPath(settings.mapPath  || 'map.png')}`;

        // Read scale preference (0.1 to 1.0, default 0.45 = 45% of usable height)
        this.scale = Math.min(1, Math.max(0.1, Number(settings.scale) || 0.45));

        // Position offsets: posX = % from left (0-100), posY = % from bottom (0-100)
        this.posX = Math.min(100, Math.max(0, Number(settings.posX ?? 0)));
        this.posY = Math.min(100, Math.max(0, Number(settings.posY ?? 0)));

        try {
            // Load base image and zone map in parallel
            await Promise.all([
                this.loadImage(this.layers.base, baseSrc),
                this.loadImage(this.layers.map,  mapSrc),
            ]);

            // Load default clothing in parallel; one failure does not break the rest
            const clothingPromises = this.clothing.map(item =>
                this.loadImage(item.img, `${extDir}/assets/${item.file}`)
                    .catch(err => {
                        console.warn(`[ST Interactive] Одежда "${item.name}": ${err.message}`);
                        item.failedToLoad = true;
                    })
            );

            // Load optional custom wardrobe from settings string "name:path, name2:path2"
            const customPromises = [];
            if (settings.wardrobeString) {
                for (const entry of settings.wardrobeString.split(',').map(s => s.trim()).filter(Boolean)) {
                    const parts = entry.split(':');
                    if (parts.length !== 2) continue;
                    const [name, rawPath] = parts.map(s => s.trim());
                    const img = new Image();
                    customPromises.push(
                        this.loadImage(img, `${extDir}/${fixPath(rawPath)}`)
                            .then(() => {
                                const item = { name, file: rawPath, zIndex: 5, img, visible: false };
                                this.clothing.push(item);
                                // Уведомить wardrobe-ai чтобы добавить кнопку в панель
                                window.wardrobeAI?.registerClothingItem(item);
                            })
                            .catch(err => console.warn(`[ST Interactive] Кастом "${name}": ${err.message}`))
                    );
                }
            }

            await Promise.allSettled([...clothingPromises, ...customPromises]);

            // Bake zone map into offscreen canvas once — reused on every click
            this.mapCtx.drawImage(this.layers.map, 0, 0);

            this.renderVisibleLayers();
            this.isReady = true;
            console.log('✅ [ST Interactive] Готов');
        } catch (e) {
            console.error('❌ [ST Interactive] Ошибка загрузки:', e);
            return;
        }

        this.tryInject();
        this._injectInterval = setInterval(() => {
            if (this.tryInject()) clearInterval(this._injectInterval);
        }, 1000);
    }

    loadImage(img, src) {
        return new Promise((resolve, reject) => {
            img.onload  = () => resolve(img);
            img.onerror = () => reject(new Error(`Не загрузилось: ${src}`));
            img.src = src;
        });
    }

    // ── Rendering ─────────────────────────────────────────────────────────────

    renderVisibleLayers() {
        this.ctx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);

        if (this.layers.base.complete && this.layers.base.naturalWidth > 0) {
            this.ctx.drawImage(this.layers.base, 0, 0);
        }

        // Sort by zIndex ascending, draw only visible and successfully loaded items
        const sortedVisible = [...this.clothing]
            .filter(c => c.visible && !c.failedToLoad && c.img.complete && c.img.naturalWidth > 0)
            .sort((a, b) => a.zIndex - b.zIndex);

        for (const item of sortedVisible) {
            this.ctx.drawImage(item.img, 0, 0);
        }
    }

    // ── Public wardrobe API ───────────────────────────────────────────────────

    wear(name) {
        const item = this.clothing.find(c => c.name === name);
        if (item) { item.visible = true; this.renderVisibleLayers(); }
    }

    remove(name) {
        const item = this.clothing.find(c => c.name === name);
        if (item) { item.visible = false; this.renderVisibleLayers(); }
    }

    toggle(name) {
        const item = this.clothing.find(c => c.name === name);
        if (item) { item.visible = !item.visible; this.renderVisibleLayers(); }
    }

    dressAll() {
        this.clothing.forEach(c => { c.visible = true; });
        this.renderVisibleLayers();
    }

    undressAll() {
        this.clothing.forEach(c => { c.visible = false; });
        this.renderVisibleLayers();
    }

    // ── DOM Injection ─────────────────────────────────────────────────────────

    tryInject() {
        if (document.getElementById('st-interactive-puppet')) return true;

        // Measure reserved UI areas so we never overlap them
        const topBar   = document.getElementById('top-bar')
                      || document.getElementById('top-settings-holder')
                      || document.querySelector('header');
        const sendForm = document.getElementById('send_form')
                      || document.querySelector('#bottom-bar');

        const topH    = topBar   ? topBar.offsetHeight   : 50;
        const bottomH = sendForm ? sendForm.offsetHeight  : 80;
        const availH  = window.innerHeight - topH - bottomH;

        // Pixel size of the character canvas on screen, maintaining aspect ratio
        const charH = Math.round(availH * this.scale);
        const charW = Math.round(charH * (this.CANVAS_W / this.CANVAS_H));

        // ── Outer puppet shell ─────────────────────────────────────────────
        // posX (0-100) = % offset from left across available width
        // posY (0-100) = % offset upward from bottom of send form
        const leftPx   = Math.round((window.innerWidth - charW) * (this.posX / 100));
        const bottomPx = bottomH + Math.round((availH - charH) * (this.posY / 100));

        const puppet = document.createElement('div');
        puppet.id = 'st-interactive-puppet';
        puppet.style.cssText = [
            'position:fixed',
            `bottom:${bottomPx}px`,
            `left:${leftPx}px`,
            'z-index:50',
            'pointer-events:none',
            'display:flex',
            'align-items:flex-end',
        ].join(';');

        // ── Canvas wrapper: exact size of the rendered character ───────────
        // Only this element (and its children) are clickable.
        const wrap = document.createElement('div');
        wrap.id = 'st-puppet-wrap';
        wrap.style.cssText = [
            'position:relative',
            `width:${charW}px`,
            `height:${charH}px`,
            'pointer-events:auto',
            'overflow:hidden',
        ].join(';');

        this.canvas.style.cssText = [
            'display:block',
            'width:100%',
            'height:100%',
            'image-rendering:pixelated',
        ].join(';');

        // Transparent overlay covering ONLY the canvas — the real click target.
        // Touch events are forwarded so mobile taps work the same as mouse clicks.
        const overlay = document.createElement('div');
        overlay.id = 'st-interactive-overlay';
        overlay.style.cssText = [
            'position:absolute',
            'inset:0',
            'cursor:crosshair',
            'z-index:1',
            'touch-action:none',
        ].join(';');
        overlay.addEventListener('click',     e => this.handleClick(e));
        overlay.addEventListener('touchend',  e => {
            e.preventDefault();
            const t = e.changedTouches[0];
            this.handleClick({ clientX: t.clientX, clientY: t.clientY });
        }, { passive: false });

        wrap.appendChild(this.canvas);
        wrap.appendChild(overlay);
        this._injectResizeHandle(wrap);
        puppet.appendChild(wrap);
        document.body.appendChild(puppet);

        console.log(`[ST Interactive] Внедрён. Размер: ${charW}x${charH}px`);
        return true;
    }

    /**
     * Resize grip — drag up/down to scale the character.
     * Saves scale to extensionSettings so it survives reload.
     */
    _injectResizeHandle(wrap) {
        const grip = document.createElement('div');
        grip.id = 'st-puppet-resize';
        grip.title = 'Потяните вверх/вниз для изменения размера';
        grip.style.cssText = [
            'position:absolute',
            'top:0',
            'right:0',
            'width:20px',
            'height:20px',
            'background:rgba(255,255,255,0.2)',
            'border-bottom-left-radius:4px',
            'cursor:nwse-resize',
            'z-index:2',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'font-size:11px',
            'user-select:none',
            'color:rgba(255,255,255,0.7)',
        ].join(';');
        grip.textContent = '⤡';
        wrap.appendChild(grip);

        let startY, startH;

        grip.addEventListener('mousedown', e => {
            e.preventDefault();
            startY = e.clientY;
            startH = wrap.offsetHeight;

            const onMove = e => {
                const delta = startY - e.clientY;   // drag up = bigger
                const topBar   = document.getElementById('top-bar') || document.getElementById('top-settings-holder');
                const sendForm = document.getElementById('send_form');
                const topH     = topBar   ? topBar.offsetHeight   : 50;
                const bottomH  = sendForm ? sendForm.offsetHeight  : 80;
                const maxH     = window.innerHeight - topH - bottomH;

                const newH = Math.max(80, Math.min(maxH, startH + delta));
                const newW = Math.round(newH * (this.CANVAS_W / this.CANVAS_H));
                wrap.style.height = `${newH}px`;
                wrap.style.width  = `${newW}px`;
            };

            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup',  onUp);

                // Persist the new scale
                const topBar   = document.getElementById('top-bar') || document.getElementById('top-settings-holder');
                const sendForm = document.getElementById('send_form');
                const topH     = topBar   ? topBar.offsetHeight   : 50;
                const bottomH  = sendForm ? sendForm.offsetHeight  : 80;
                const availH   = window.innerHeight - topH - bottomH;
                const newScale = wrap.offsetHeight / availH;

                const context  = window.SillyTavern.getContext();
                const settings = context.extensionSettings['st-interact-chat'] || {};
                settings.scale = newScale;
                context.extensionSettings['st-interact-chat'] = settings;
                if (typeof context.saveSettingsDebounced === 'function') context.saveSettingsDebounced();
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup',   onUp);
        });
    }

    // ── Click / zone detection ────────────────────────────────────────────────

    handleClick(e) {
        if (!this.isReady) return;

        const rect   = this.canvas.getBoundingClientRect();
        const scaleX = this.CANVAS_W / rect.width;
        const scaleY = this.CANVAS_H / rect.height;
        const x = Math.floor((e.clientX - rect.left) * scaleX);
        const y = Math.floor((e.clientY - rect.top)  * scaleY);

        const px  = this.mapCtx.getImageData(x, y, 1, 1).data;
        const hex = [px[0], px[1], px[2]]
            .map(c => c.toString(16).padStart(2, '0').toUpperCase())
            .join('');

        console.log(`Клик: X:${x} Y:${y}  Цвет: #${hex}`);

        const zone = this.zones[hex];
        if (zone) {
            console.log(`Зона: ${zone}`);
            if (typeof window.handleZoneClick === 'function') window.handleZoneClick(zone);
        }
    }
}

// ── Instantiate & expose global API ──────────────────────────────────────────

const stInteractive = new InteractiveMapManager();
window.stInteractive = stInteractive;

/**
 * Global wardrobe API — call from the chat model or any script:
 *
 *   window.wearClothing('bra')      — надеть
 *   window.removeClothing('shirt')  — снять
 *   window.toggleClothing('short')  — переключить
 *   window.dressAll()               — одеть всё
 *   window.undressAll()             — снять всё
 */
window.wearClothing   = name => stInteractive.wear(name);
window.removeClothing = name => stInteractive.remove(name);
window.toggleClothing = name => stInteractive.toggle(name);
window.dressAll       = ()   => stInteractive.dressAll();
window.undressAll     = ()   => stInteractive.undressAll();

// ── Динамические модули (необязательные) ─────────────────────────────────────
// Используем динамический import() чтобы отсутствие файлов не ломало основной скрипт.
// extDir берётся из import.meta.url который доступен на уровне модуля.
{
    const _extDir = import.meta.url.substring(0, import.meta.url.lastIndexOf('/'));
    import('./asset-scanner.js')
        .then(({ AssetScanner }) => {
            window.assetScanner = new AssetScanner(stInteractive, _extDir);
            window.assetScanner.scan();
        })
        .catch(e => console.warn('[ST Interactive] asset-scanner.js не подключён:', e.message));

    import('./highlight.js')
        .then(({ ZoneHighlighter }) => {
            window._zoneHighlighter = new ZoneHighlighter(stInteractive);
        })
        .catch(e => console.warn('[ST Interactive] highlight.js не подключён:', e.message));
}

// ── Settings panel: sliders, file pickers, wardrobe sections, debug ──────────

(function setupSettingsPanel() {
    const poll = setInterval(() => {
        // Ждём появления любого элемента настроек
        if (!document.getElementById('st-interact-pick-base') &&
            !document.getElementById('st-interact-scale')) return;
        clearInterval(poll);

        // ── Позиционирование манекена ─────────────────────────────────────────
        const applyPosition = () => {
            const puppet = document.getElementById('st-interactive-puppet');
            const wrap   = document.getElementById('st-puppet-wrap');
            if (!puppet || !wrap) return;
            const topBar   = document.getElementById('top-bar') || document.getElementById('top-settings-holder');
            const sendForm = document.getElementById('send_form');
            const topH     = topBar   ? topBar.offsetHeight  : 50;
            const bottomH  = sendForm ? sendForm.offsetHeight : 80;
            const availH   = window.innerHeight - topH - bottomH;
            const leftPx   = Math.round((window.innerWidth  - wrap.offsetWidth)  * (stInteractive.posX / 100));
            const bottomPx = bottomH + Math.round((availH - wrap.offsetHeight) * (stInteractive.posY / 100));
            puppet.style.left   = `${leftPx}px`;
            puppet.style.bottom = `${bottomPx}px`;
        };

        const persist = (key, val) => {
            const ctx = window.SillyTavern.getContext();
            const s   = ctx.extensionSettings['st-interact-chat'] || {};
            s[key]    = val;
            ctx.extensionSettings['st-interact-chat'] = s;
            if (typeof ctx.saveSettingsDebounced === 'function') ctx.saveSettingsDebounced();
        };

        // ── Слайдеры X / Y ───────────────────────────────────────────────────
        const wireSlider = (sliderId, axis, labelId) => {
            const slider = document.getElementById(sliderId);
            const label  = document.getElementById(labelId);
            if (!slider) return;
            const ctx     = window.SillyTavern.getContext();
            const saved   = Number(ctx.extensionSettings['st-interact-chat']?.[axis] ?? 0);
            slider.value  = saved;
            stInteractive[axis] = saved;
            if (label) label.textContent = `${Math.round(saved)}%`;
            slider.addEventListener('input', e => {
                const val = Number(e.target.value);
                stInteractive[axis] = val;
                if (label) label.textContent = `${Math.round(val)}%`;
                applyPosition();
                persist(axis, val);
            });
        };
        wireSlider('st-interact-pos-x', 'posX', 'st-interact-pos-x-val');
        wireSlider('st-interact-pos-y', 'posY', 'st-interact-pos-y-val');

        // ── Слайдер масштаба ─────────────────────────────────────────────────
        const scaleSlider = document.getElementById('st-interact-scale');
        const scaleLabel  = document.getElementById('st-interact-scale-val');
        if (scaleSlider) {
            const ctx        = window.SillyTavern.getContext();
            const savedScale = Math.round((Number(ctx.extensionSettings['st-interact-chat']?.scale) || 0.45) * 100);
            scaleSlider.value = savedScale;
            if (scaleLabel) scaleLabel.textContent = `${savedScale}%`;
            scaleSlider.addEventListener('input', e => {
                const pct  = Number(e.target.value);
                const frac = pct / 100;
                if (scaleLabel) scaleLabel.textContent = `${pct}%`;
                const wrap     = document.getElementById('st-puppet-wrap');
                const topBar   = document.getElementById('top-bar') || document.getElementById('top-settings-holder');
                const sendForm = document.getElementById('send_form');
                const availH   = window.innerHeight
                    - (topBar   ? topBar.offsetHeight   : 50)
                    - (sendForm ? sendForm.offsetHeight  : 80);
                if (wrap) {
                    const newH = Math.round(availH * frac);
                    wrap.style.height = `${newH}px`;
                    wrap.style.width  = `${Math.round(newH * (stInteractive.CANVAS_W / stInteractive.CANVAS_H))}px`;
                    stInteractive.scale = frac;
                    applyPosition();
                }
                persist('scale', frac);
            });
        }

        // ── Выбор файла базы и карты зон ─────────────────────────────────────
        const linkSingle = (btnId, fileId, inputId) => {
            const b = document.getElementById(btnId);
            const f = document.getElementById(fileId);
            const i = document.getElementById(inputId);
            if (!b || !f || !i) return;
            b.addEventListener('click', () => f.click());
            f.addEventListener('change', ev => {
                const file = ev.target.files[0];
                if (file) {
                    i.value = file.name;
                    i.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
        };
        linkSingle('st-interact-pick-base', 'st-interact-file-base', 'st-interact-base-path');
        linkSingle('st-interact-pick-map',  'st-interact-file-map',  'st-interact-map-path');

        // ── Выбор файлов для секций гардероба (мульти) ───────────────────────
        const linkMulti = (btnId, fileId, textareaId, settingsKey) => {
            const b  = document.getElementById(btnId);
            const f  = document.getElementById(fileId);
            const ta = document.getElementById(textareaId);
            if (!b || !f || !ta) return;
            b.addEventListener('click', () => f.click());
            f.addEventListener('change', ev => {
                const newItems = Array.from(ev.target.files)
                    .map(file => `${file.name.replace(/\.[^.]+$/, '')}:${file.name}`)
                    .join(', ');
                ta.value = ta.value ? `${ta.value}, ${newItems}` : newItems;
                ta.dispatchEvent(new Event('input', { bubbles: true }));
                persist(settingsKey, ta.value);
            });
            // Сохранение при ручном вводе
            ta.addEventListener('input', () => persist(settingsKey, ta.value));
        };
        linkMulti('st-interact-pick-underwear', 'st-interact-file-underwear', 'st-interact-wardrobe-underwear', 'wardrobeUnderwear');
        linkMulti('st-interact-pick-outerwear', 'st-interact-file-outerwear', 'st-interact-wardrobe-outerwear', 'wardrobeOuterwear');
        linkMulti('st-interact-pick-costumes',  'st-interact-file-costumes',  'st-interact-wardrobe-costumes',  'wardrobeCostumes');

        // Восстанавливаем сохранённые значения textarea
        const ctx = window.SillyTavern.getContext();
        const s   = ctx.extensionSettings['st-interact-chat'] || {};
        ['wardrobeUnderwear', 'wardrobeOuterwear', 'wardrobeCostumes'].forEach((key, i) => {
            const ids = ['st-interact-wardrobe-underwear', 'st-interact-wardrobe-outerwear', 'st-interact-wardrobe-costumes'];
            const ta  = document.getElementById(ids[i]);
            if (ta && s[key]) ta.value = s[key];
        });

        // ── Кнопки "?" — подсказки по именованию ─────────────────────────────
        const HELP_TEXTS = {
            'st-help-underwear': 'Файлы для категории «Бельё» (underwear):\n\n✅ bra.png\n✅ panties.png\n✅ thong.png\n✅ stockings.png\n✅ socks.png\n✅ lingerie.png\n\nАвтоопределение: имя файла содержит bra / panties / thong / stockings / socks / lingerie.\n\nБельё никогда не снимается автоматически при смене одежды.',
            'st-help-outerwear': 'Файлы для категории «Верхняя одежда» (outerwear):\n\n✅ shirt.png\n✅ shorts.png\n✅ pants.png\n✅ skirt.png\n✅ jacket.png\n✅ blouse.png\n\nВсё что не бельё и не костюм — попадает сюда.\n\nПри надевании верхней одежды активный костюм снимается автоматически.',
            'st-help-costumes':  'Файлы для категории «Костюмы» (costumes):\n\n✅ maid_costume.png\n✅ nurse_costume.png\n✅ school_uniform.png\n✅ bunny_suit.png\n✅ swimsuit_outfit.png\n\nАвтоопределение суффиксов: _costume, _outfit, _uniform, _suit\n\nПри надевании костюма ВСЯ верхняя одежда скрывается автоматически.\nАИ получает команду [wear:maid_costume].',
        };
        Object.entries(HELP_TEXTS).forEach(([id, text]) => {
            document.getElementById(id)?.addEventListener('click', () => alert(text));
        });

        // ── Кнопка автосканирования ───────────────────────────────────────────
        document.getElementById('st-interact-scan-assets')?.addEventListener('click', async () => {
            const status = document.getElementById('st-wardrobe-scan-status');
            if (status) status.textContent = '⏳ Сканирование...';
            if (!window.assetScanner) {
                alert('AssetScanner не загружен. Проверьте asset-scanner.js.');
                if (status) status.textContent = '❌ Ошибка';
                return;
            }
            try {
                const catalog = await window.assetScanner.scan();
                const total   = catalog.underwear.length + catalog.outerwear.length + catalog.costume.length;
                if (status) status.textContent = `✅ Найдено: ${total}`;
                const fill = (taId, items) => {
                    const ta = document.getElementById(taId);
                    if (!ta || !items.length) return;
                    const existing = new Set(ta.value.split(',').map(s => s.trim().split(':')[0].trim()).filter(Boolean));
                    const newEntries = items.filter(i => !existing.has(i.name)).map(i => `${i.name}:${i.file}`);
                    if (newEntries.length) {
                        ta.value = ta.value ? `${ta.value}, ${newEntries.join(', ')}` : newEntries.join(', ');
                        ta.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                };
                fill('st-interact-wardrobe-underwear', catalog.underwear);
                fill('st-interact-wardrobe-outerwear', catalog.outerwear);
                fill('st-interact-wardrobe-costumes',  catalog.costume);
            } catch (e) {
                console.error('[Settings] Ошибка сканирования:', e);
                if (status) status.textContent = '❌ Ошибка';
            }
        });

        // ── Стиль подсветки ───────────────────────────────────────────────────
        const hlSelect = document.getElementById('st-interact-highlight-style');
        if (hlSelect) {
            hlSelect.addEventListener('change', e => {
                const val = e.target.value;
                if (val === 'none') {
                    window._zoneHighlighter?.destroy?.();
                    window._zoneHighlighter = null;
                } else if (window._zoneHighlighter) {
                    window._zoneHighlighter.setStyle(val);
                } else {
                    // Подсветка была выключена — создаём заново
                    import('./highlight.js')
                        .then(({ ZoneHighlighter }) => {
                            window._zoneHighlighter = new ZoneHighlighter(stInteractive, { style: val });
                        })
                        .catch(() => {});
                }
                persist('highlightStyle', val);
            });
            // Восстановить сохранённый стиль
            const savedStyle = s['highlightStyle'];
            if (savedStyle) hlSelect.value = savedStyle;
        }

    }, 500);
})();
