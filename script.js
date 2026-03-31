class InteractiveMapManager {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.layers = { base: new Image(), map: new Image(), clothing: {} };
        this.isReady = false;
        
        // Зоны кликов остаются прежними
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

        this.setupEventListeners();
        this.init();
    }

    // Слушаем события Таверны, как это делает Character Expressions
    setupEventListeners() {
        const { eventSource, event_types } = window.SillyTavern;
        
        // Когда персонаж выбран или изменен
        eventSource.on(event_types.CHARACTER_SELECTED, () => {
            console.log("👤 [ST Interactive] Персонаж изменен, обновляем оверлей...");
            this.tryInject(true); // Принудительное обновление
        });

        // Когда чат загружен
        eventSource.on(event_types.CHAT_CHANGED, () => {
            this.tryInject(true);
        });
    }

    async init() {
        const context = window.SillyTavern.getContext();
        const settings = context.extensionSettings['st-interact-chat'] || {};
        const extDir = import.meta.url.substring(0, import.meta.url.lastIndexOf('/'));

        const fixPath = (p) => {
            if (!p) return '';
            let clean = p.trim().replace(/^\/+|\/+$/g, '');
            return clean.startsWith('assets/') ? clean : `assets/${clean}`;
        };

        try {
            const baseSrc = `${extDir}/${fixPath(settings.basePath || 'girl.png')}`;
            const mapSrc = `${extDir}/${fixPath(settings.mapPath || 'map.png')}`;

            await Promise.all([
                this.loadImage(this.layers.base, baseSrc),
                this.loadImage(this.layers.map, mapSrc)
            ]);

            this.canvas.width = 832;
            this.canvas.height = 1216;
            this.render();
            this.isReady = true;
            console.log("✅ [ST Interactive] Assets Loaded");
        } catch (e) {
            console.error("❌ [ST Interactive] Ошибка загрузки:", e);
        }

        // Запускаем проверку наличия контейнера
        setInterval(() => this.tryInject(), 2000);
    }

    loadImage(img, src) {
        return new Promise((res, rej) => {
            img.onload = res;
            img.onerror = () => rej(src);
            img.src = src;
        });
    }

    render() {
        this.ctx.clearRect(0, 0, 832, 1216);
        if (this.layers.base.complete) this.ctx.drawImage(this.layers.base, 0, 0);
        Object.values(this.layers.clothing).forEach(img => {
            if (img.complete) this.ctx.drawImage(img, 0, 0);
        });
    }

    tryInject(force = false) {
        if (force) {
            const oldOvl = document.getElementById('st-interactive-overlay');
            if (oldOvl) oldOvl.remove();
        }

        const host = document.querySelector('.expression_holder, #expression_holder, .canvas_container');
        if (!host || document.getElementById('st-interactive-overlay')) return;

        console.log("💉 [ST Interactive] Внедрение в:", host.className);

        const overlay = document.createElement('div');
        overlay.id = 'st-interactive-overlay';
        // z-index выше, чем у Character Expressions (у них обычно до 100)
        overlay.style = "position:absolute; top:0; left:0; width:100%; height:100%; z-index:500; cursor:crosshair;";

        overlay.onclick = (e) => {
            if (!this.isReady) return;
            const r = overlay.getBoundingClientRect();
            const x = Math.floor((e.clientX - r.left) * (832 / r.width));
            const y = Math.floor((e.clientY - r.top) * (1216 / r.height));
            
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = 832; tempCanvas.height = 1216;
            const tCtx = tempCanvas.getContext('2d');
            tCtx.drawImage(this.layers.map, 0, 0);
            
            const p = tCtx.getImageData(x, y, 1, 1).data;
            const hex = [p[0], p[1], p[2]].map(c => c.toString(16).padStart(2, '0').toUpperCase()).join('');
            
            console.log(`🖱️ Клик: X:${x} Y:${y}, Цвет: #${hex}`);
            const zone = this.zones[hex];
            if (zone && window.handleZoneClick) window.handleZoneClick(zone);
        };

        host.appendChild(overlay);
    }
}

new InteractiveMapManager();

// UI логика (📂 кнопки) остается без изменений
(function setupUI() {
    const poll = setInterval(() => {
        const btn = document.getElementById('st-interact-pick-base');
        if (!btn) return; clearInterval(poll);
        const link = (bI, fI, iI) => {
            const b = document.getElementById(bI), f = document.getElementById(fI), inp = document.getElementById(iI);
            b.onclick = () => f.click();
            f.onchange = (e) => { if(e.target.files[0]) { inp.value = e.target.files[0].name; inp.dispatchEvent(new Event('input', {bubbles:true})); }};
        };
        link('st-interact-pick-base', 'st-interact-file-base', 'st-interact-base-path');
        link('st-interact-pick-map', 'st-interact-file-map', 'st-interact-map-path');
    }, 1000);
})();
