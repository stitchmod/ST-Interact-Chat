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

        // Функция исправления путей (убирает дубли assets/)
        const fixPath = (p) => {
            if (!p) return '';
            let clean = p.trim().replace(/^\/+|\/+$/g, '');
            return clean.startsWith('assets/') ? clean : `assets/${clean}`;
        };

        const baseSrc = `${extDir}/${fixPath(settings.basePath || 'girl.png')}`;
        const mapSrc = `${extDir}/${fixPath(settings.mapPath || 'map.png')}`;

        console.log("⏳ [ST Interactive] Загрузка слоев:", { base: baseSrc, map: mapSrc });

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
                        console.log(`👗 [ST Interactive] Слой одет: ${name}`);
                    }
                }
            }

            this.canvas.width = 832;
            this.canvas.height = 1216;
            this.renderVisibleLayers();
            this.isReady = true;
            console.log("✅ [ST Interactive] Система готова.");
        } catch (e) {
            console.error("❌ [ST Interactive] Ошибка загрузки (проверь наличие файлов в assets/):", e);
        }

        setInterval(() => this.tryInject(), 1000);
    }

    loadImage(img, src) {
        return new Promise((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(`Не найден файл: ${src}`);
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
        const vnContainer = document.querySelector('.expression_holder');
        if (!vnContainer || document.getElementById('st-interactive-overlay')) return;

        const puppetContainer = document.createElement('div');
        puppetContainer.id = 'st-interactive-puppet';
        puppetContainer.style = "position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; display:flex; justify-content:center; align-items:center;";
        
        this.canvas.style = "max-width:100%; max-height:100%; object-fit: contain;";
        puppetContainer.appendChild(this.canvas);

        const overlay = document.createElement('div');
        overlay.id = 'st-interactive-overlay';
        overlay.style = "position:absolute; top:0; left:0; width:100%; height:100%; z-index:1000; cursor:crosshair;";

        overlay.addEventListener('click', (e) => {
            if (!this.isReady) return;
            const rect = overlay.getBoundingClientRect();
            const scaleX = 832 / rect.width;
            const scaleY = 1216 / rect.height;
            const x = Math.floor((e.clientX - rect.left) * scaleX);
            const y = Math.floor((e.clientY - rect.top) * scaleY);
            
            if (x < 0 || x >= 832 || y < 0 || y >= 1216) return;

            const offscreenCanvas = document.createElement('canvas');
            offscreenCanvas.width = 832;
            offscreenCanvas.height = 1216;
            const offCtx = offscreenCanvas.getContext('2d');
            offCtx.drawImage(this.layers.map, 0, 0);
            
            const pixel = offCtx.getImageData(x, y, 1, 1).data;
            const hex = [pixel[0], pixel[1], pixel[2]]
                .map(c => c.toString(16).padStart(2, '0').toUpperCase())
                .join('');
            
            const zoneName = this.zones[hex];
            if (zoneName && window.handleZoneClick) {
                window.handleZoneClick(zoneName);
            }
        });

        vnContainer.appendChild(puppetContainer);
        vnContainer.appendChild(overlay);
        console.log("✅ [ST Interactive] Оверлей внедрен в чат.");
    }
}

new InteractiveMapManager();

// Логика выбора файлов для UI
(function setupFilePickers() {
    const pollInterval = setInterval(() => {
        const btnBase = document.getElementById('st-interact-pick-base');
        if (!btnBase) return; 
        clearInterval(pollInterval);

        const handleFile = (btnId, fileId, inputId) => {
            const btn = document.getElementById(btnId);
            const file = document.getElementById(fileId);
            const input = document.getElementById(inputId);
            btn.onclick = () => file.click();
            file.onchange = (e) => {
                if (e.target.files[0]) {
                    input.value = e.target.files[0].name;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
            };
        };

        handleFile('st-interact-pick-base', 'st-interact-file-base', 'st-interact-base-path');
        handleFile('st-interact-pick-map', 'st-interact-file-map', 'st-interact-map-path');

        const btnW = document.getElementById('st-interact-pick-wardrobe');
        const fileW = document.getElementById('st-interact-file-wardrobe');
        const areaW = document.getElementById('st-interact-wardrobe-cfg');
        
        btnW.onclick = () => fileW.click();
        fileW.onchange = (e) => {
            const files = Array.from(e.target.files);
            const newItems = files.map(f => `${f.name.replace('.png', '')}:${f.name}`);
            const cur = areaW.value.trim();
            areaW.value = cur ? cur + ', ' + newItems.join(', ') : newItems.join(', ');
            areaW.dispatchEvent(new Event('input', { bubbles: true }));
        };
    }, 500);
})();
