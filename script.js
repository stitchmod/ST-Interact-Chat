class InteractiveMapManager {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        
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
        const mapSrc = `${extDir}/${fixPath(settings.mapPath || 'map.png')}`;

        try {
            await Promise.all([
                this.loadImage(this.layers.base, baseSrc),
                this.loadImage(this.layers.map, mapSrc)
            ]);

            if (settings.wardrobeString) {
                const items = settings.wardrobeString.split(',').map(i => i.trim());
                for (const item of items) {
                    const parts = item.split(':');
                    if (parts.length === 2) {
                        const name = parts[0].trim();
                        const path = fixPath(parts[1].trim());
                        this.layers.clothing[name] = new Image();
                        await this.loadImage(this.layers.clothing[name], `${extDir}/${path}`);
                    }
                }
            }

            this.canvas.width = 832;
            this.canvas.height = 1216;
            this.renderVisibleLayers();
            this.isReady = true;
            console.log("✅ [ST Interactive] Assets Loaded & Canvas Ready");
        } catch (e) {
            console.error("❌ [ST Interactive] Load Error:", e);
        }

        setInterval(() => this.tryInject(), 1000);
    }

    loadImage(img, src) {
        return new Promise((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(src);
            img.src = src;
        });
    }

    renderVisibleLayers() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (this.layers.base.complete) this.ctx.drawImage(this.layers.base, 0, 0);
        for (const key in this.layers.clothing) {
            const clothImg = this.layers.clothing[key];
            if (clothImg.complete) this.ctx.drawImage(clothImg, 0, 0);
        }
    }

    tryInject() {
        // Пробуем найти стандартный контейнер или контейнер для Live2D/VRM
        const vnContainer = document.querySelector('.expression_holder') || 
                            document.querySelector('#expression_holder') ||
                            document.querySelector('.canvas_container');

        if (!vnContainer || document.getElementById('st-interactive-overlay')) return;

        console.log("💉 [ST Interactive] Внедряем куклу в контейнер:", vnContainer);

        const puppetContainer = document.createElement('div');
        puppetContainer.id = 'st-interactive-puppet';
        puppetContainer.style = "position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; display:flex; justify-content:center; align-items:center; z-index:999;";
        
        this.canvas.style = "max-width:100%; max-height:100%; object-fit: contain; image-rendering: pixelated;";
        puppetContainer.appendChild(this.canvas);

        const overlay = document.createElement('div');
        overlay.id = 'st-interactive-overlay';
        overlay.style = "position:absolute; top:0; left:0; width:100%; height:100%; z-index:1000; cursor:pointer;";

        overlay.onclick = (e) => {
            if (!this.isReady) return;
            const rect = overlay.getBoundingClientRect();
            const scaleX = 832 / rect.width;
            const scaleY = 1216 / rect.height;
            const x = Math.floor((e.clientX - rect.left) * scaleX);
            const y = Math.floor((e.clientY - rect.top) * scaleY);
            
            const offCanvas = document.createElement('canvas');
            offCanvas.width = 832; offCanvas.height = 1216;
            const offCtx = offCanvas.getContext('2d');
            offCtx.drawImage(this.layers.map, 0, 0);
            
            const p = offCtx.getImageData(x, y, 1, 1).data;
            const hex = [p[0], p[1], p[2]].map(c => c.toString(16).padStart(2, '0').toUpperCase()).join('');
            
            console.log(`🖱️ Клик: X:${x} Y:${y}, Цвет: #${hex}`);
            const zone = this.zones[hex];
            if (zone) {
                console.log(`🎯 Попадание: ${zone}`);
                if (window.handleZoneClick) window.handleZoneClick(zone);
            }
        };

        vnContainer.appendChild(puppetContainer);
        vnContainer.appendChild(overlay);
    }
}

new InteractiveMapManager();

// Код для кнопок выбора файлов (без изменений)
(function setupFilePickers() {
    const poll = setInterval(() => {
        const btn = document.getElementById('st-interact-pick-base');
        if (!btn) return; clearInterval(poll);

        const link = (bId, fId, iId) => {
            const b = document.getElementById(bId), f = document.getElementById(fId), i = document.getElementById(iId);
            b.onclick = () => f.click();
            f.onchange = (e) => { if(e.target.files[0]) { i.value = e.target.files[0].name; i.dispatchEvent(new Event('input', {bubbles:true})); } };
        };
        link('st-interact-pick-base', 'st-interact-file-base', 'st-interact-base-path');
        link('st-interact-pick-map', 'st-interact-file-map', 'st-interact-map-path');
        
        const bW = document.getElementById('st-interact-pick-wardrobe'), fW = document.getElementById('st-interact-file-wardrobe'), aW = document.getElementById('st-interact-wardrobe-cfg');
        bW.onclick = () => fW.click();
        fW.onchange = (e) => {
            const files = Array.from(e.target.files);
            const items = files.map(f => `${f.name.replace('.png','')}:${f.name}`).join(', ');
            aW.value = aW.value ? aW.value + ', ' + items : items;
            aW.dispatchEvent(new Event('input', {bubbles:true}));
        };
    }, 500);
})();
