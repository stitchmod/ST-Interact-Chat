class InteractiveMapManager {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

        // Отдельный offscreen-канвас для карты зон (создаём один раз, не на каждый клик)
        this.mapCanvas = document.createElement('canvas');
        this.mapCtx = this.mapCanvas.getContext('2d', { willReadFrequently: true });

        this.layers = {
            base: new Image(),
            map: new Image(),
            clothing: {}
        };

        this.isReady = false;

        this.zones = {
            'DEFF90': 'Волосы', '9AAAEF': 'Лицо', '7F3300': 'Нос',
            'CCFFFA': 'Глаза', '61A7AA': 'Глаза', 'F49788': 'Губы',
            'FFC9CD': 'Ухо', '522D00': 'Шея', '00FFFA': 'Плечи',
            'FFAF99': 'Плечи', '57007F': 'Руки', 'F026FF': 'Руки',
            'E3A3FF': 'Руки', '7F6A00': 'Руки', '7F0000': 'Руки',
            '404040': 'Руки', '5B7F00': 'Торс', '07FF5E': 'Торс',
            '61FF00': 'Пупок', '808080': 'Пах', 'FF004C': 'Вагина',
            '0A88FF': 'Грудь', 'E1FF00': 'Грудь', '6A00FF': 'Ареола',
            'FF6D05': 'Ареола', 'FF00FF': 'Сосок', 'FF0037': 'Сосок',
            'A387FF': 'Бёдра', '000000': 'Бёдра', 'B1FF2B': 'Ступня'
        };

        this.init();
    }

    async init() {
        const context = window.SillyTavern.getContext();
        const settings = context.extensionSettings['st-interact-chat'] || {};

        const scriptPath = import.meta.url;
        const extDir = scriptPath.substring(0, scriptPath.lastIndexOf('/'));

        const fixPath = (p) => {
            if (!p) return '';
            let clean = p.trim().replace(/^\/+|\/+$/g, '');
            return clean.startsWith('assets/') ? clean : `assets/${clean}`;
        };

        const baseSrc = `${extDir}/${fixPath(settings.basePath || 'girl.png')}`;
        const mapSrc  = `${extDir}/${fixPath(settings.mapPath  || 'map.png')}`;

        try {
            // Загружаем base и map параллельно
            await Promise.all([
                this.loadImage(this.layers.base, baseSrc),
                this.loadImage(this.layers.map,  mapSrc),
            ]);

            // Загружаем гардероб параллельно вместо последовательного await в цикле
            if (settings.wardrobeString) {
                const items = settings.wardrobeString
                    .split(',')
                    .map(i => i.trim())
                    .filter(Boolean);

                const wardrobePromises = items.map(item => {
                    const parts = item.split(':');
                    if (parts.length !== 2) return Promise.resolve(); // пропускаем кривые записи

                    const name = parts[0].trim();
                    const path = fixPath(parts[1].trim());
                    const img  = new Image();
                    this.layers.clothing[name] = img;
                    return this.loadImage(img, `${extDir}/${path}`).catch(err => {
                        // Один сломанный элемент гардероба не роняет всё остальное
                        console.warn(`⚠️ [ST Interactive] Не удалось загрузить одежду "${name}":`, err);
                    });
                });

                await Promise.allSettled(wardrobePromises);
            }

            this.canvas.width    = 832;
            this.canvas.height   = 1216;
            this.mapCanvas.width  = 832;
            this.mapCanvas.height = 1216;

            // Рисуем карту зон в offscreen-канвас один раз
            this.mapCtx.drawImage(this.layers.map, 0, 0);

            this.renderVisibleLayers();
            this.isReady = true;
            console.log('✅ [ST Interactive] Assets Loaded & Canvas Ready');
        } catch (e) {
            console.error('❌ [ST Interactive] Load Error:', e);
            return;
        }

        // Пробуем инжектить сразу, затем повторяем по таймеру
        this.tryInject();
        this._injectInterval = setInterval(() => {
            if (this.tryInject()) clearInterval(this._injectInterval);
        }, 1000);
    }

    loadImage(img, src) {
        return new Promise((resolve, reject) => {
            img.onload  = () => resolve(img);
            img.onerror = () => reject(new Error(`Не удалось загрузить: ${src}`));
            img.src = src;
        });
    }

    renderVisibleLayers() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (this.layers.base.complete && this.layers.base.naturalWidth > 0) {
            this.ctx.drawImage(this.layers.base, 0, 0);
        }
        for (const key in this.layers.clothing) {
            const clothImg = this.layers.clothing[key];
            if (clothImg.complete && clothImg.naturalWidth > 0) {
                this.ctx.drawImage(clothImg, 0, 0);
            }
        }
    }

    /**
     * Ищет контейнер по правильным селекторам SillyTavern:
     *   - VN-режим (групповой чат + waifuMode): #visual-novel-wrapper
     *   - Обычный режим (одиночный персонаж):  #expression-wrapper
     * Возвращает true, если инжект прошёл успешно.
     */
    tryInject() {
        // Уже внедрили — ничего делать не нужно
        if (document.getElementById('st-interactive-overlay')) return true;

        // Приоритет: VN-wrapper (видим) → expression-wrapper (видим)
        // Селекторы взяты из index.js расширения Character Expression
        const vnWrapper   = document.getElementById('visual-novel-wrapper');
        const exprWrapper = document.getElementById('expression-wrapper');

        // Выбираем первый видимый контейнер
        const vnContainer =
            (vnWrapper   && vnWrapper.offsetParent   !== null ? vnWrapper   : null) ||
            (exprWrapper && exprWrapper.offsetParent !== null ? exprWrapper : null);

        if (!vnContainer) return false;

        console.log('💉 [ST Interactive] Внедряем куклу в контейнер:', vnContainer.id);

        // Обёртка с канвасом персонажа
        const puppetContainer = document.createElement('div');
        puppetContainer.id = 'st-interactive-puppet';
        puppetContainer.style.cssText = [
            'position:absolute', 'top:0', 'left:0',
            'width:100%', 'height:100%',
            'pointer-events:none',
            'display:flex', 'justify-content:center', 'align-items:center',
            'z-index:999',
        ].join(';');

        this.canvas.style.cssText = [
            'max-width:100%', 'max-height:100%',
            'object-fit:contain',
            'image-rendering:pixelated',
        ].join(';');

        puppetContainer.appendChild(this.canvas);

        // Прозрачный оверлей для обработки кликов
        const overlay = document.createElement('div');
        overlay.id = 'st-interactive-overlay';
        overlay.style.cssText = [
            'position:absolute', 'top:0', 'left:0',
            'width:100%', 'height:100%',
            'z-index:1000', 'cursor:pointer',
        ].join(';');

        overlay.addEventListener('click', (e) => this.handleClick(e));

        vnContainer.style.position = 'relative'; // нужно для absolute-позиционирования детей
        vnContainer.appendChild(puppetContainer);
        vnContainer.appendChild(overlay);

        return true;
    }

    handleClick(e) {
        if (!this.isReady) return;

        const rect   = e.currentTarget.getBoundingClientRect();
        const scaleX = 832 / rect.width;
        const scaleY = 1216 / rect.height;
        const x = Math.floor((e.clientX - rect.left)  * scaleX);
        const y = Math.floor((e.clientY - rect.top)   * scaleY);

        // Читаем пиксель из заранее подготовленного offscreen-канваса карты зон
        const p   = this.mapCtx.getImageData(x, y, 1, 1).data;
        const hex = [p[0], p[1], p[2]]
            .map(c => c.toString(16).padStart(2, '0').toUpperCase())
            .join('');

        console.log(`🖱️ Клик: X:${x} Y:${y}, Цвет: #${hex}`);

        const zone = this.zones[hex];
        if (zone) {
            console.log(`🎯 Попадание: ${zone}`);
            if (typeof window.handleZoneClick === 'function') {
                window.handleZoneClick(zone);
            }
        }
    }
}

new InteractiveMapManager();

// Привязка кнопок выбора файлов в панели настроек
(function setupFilePickers() {
    const poll = setInterval(() => {
        const btn = document.getElementById('st-interact-pick-base');
        if (!btn) return;
        clearInterval(poll);

        const link = (bId, fId, iId) => {
            const b = document.getElementById(bId);
            const f = document.getElementById(fId);
            const i = document.getElementById(iId);
            if (!b || !f || !i) return;
            b.addEventListener('click', () => f.click());
            f.addEventListener('change', (e) => {
                if (e.target.files[0]) {
                    i.value = e.target.files[0].name;
                    i.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
        };

        link('st-interact-pick-base', 'st-interact-file-base', 'st-interact-base-path');
        link('st-interact-pick-map',  'st-interact-file-map',  'st-interact-map-path');

        const bW = document.getElementById('st-interact-pick-wardrobe');
        const fW = document.getElementById('st-interact-file-wardrobe');
        const aW = document.getElementById('st-interact-wardrobe-cfg');
        if (!bW || !fW || !aW) return;

        bW.addEventListener('click', () => fW.click());
        fW.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            const items = files
                .map(f => `${f.name.replace(/\.[^.]+$/, '')}:${f.name}`)
                .join(', ');
            aW.value = aW.value ? `${aW.value}, ${items}` : items;
            aW.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }, 500);
})();
