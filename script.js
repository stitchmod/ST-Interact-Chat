class InteractiveMapManager {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        
        // Объект для хранения всех загруженных слоев
        this.layers = {
            base: new Image(),
            map: new Image(),
            clothing: {} 
        };

        this.isReady = false;

        // Полная библиотека цветов (соответствует твоей карте)
        this.zones = {
            'DEFF90': 'Волосы', 
            '9AAAEF': 'Лицо', 
            '7F3300': 'Нос',
            'CCFFFA': 'Глаза', 
            '61A7AA': 'Глаза', 
            'F49788': 'Губы', 
            'FFC9CD': 'Ухо', 
            '522D00': 'Шея', 
            '00FFFA': 'Плечи', 
            'FFAF99': 'Плечи', 
            '57007F': 'Руки', 
            'F026FF': 'Руки',
            'E3A3FF': 'Руки', 
            '7F6A00': 'Руки', 
            '7F0000': 'Руки', 
            '404040': 'Руки', 
            '5B7F00': 'Торс', 
            '07FF5E': 'Торс',
            '61FF00': 'Пупок', 
            '808080': 'Пах', 
            'FF004C': 'Вагина',
            '0A88FF': 'Грудь', 
            'E1FF00': 'Грудь', 
            '6A00FF': 'Ареола', 
            'FF6D05': 'Ареола', 
            'FF00FF': 'Сосок', 
            'FF0037': 'Сосок',
            'A387FF': 'Бёдра', 
            '000000': 'Бёдра', 
            'B1FF2B': 'Ступня'
        };

        this.init();
    }

    async init() {
        // Получаем доступ к настройкам SillyTavern
        const context = window.SillyTavern.getContext();
        const settings = context.extensionSettings['st-interact-chat'] || {};
        
        // Определяем путь к папке расширения
        const scriptPath = import.meta.url;
        const extDir = scriptPath.substring(0, scriptPath.lastIndexOf('/'));

        console.log("⏳ [ST Interactive] Loading asset layers...");

        // Формируем пути к базовым файлам
        const baseSrc = `${extDir}/${settings.basePath || 'assets/girl.png'}`;
        const mapSrc = `${extDir}/${settings.mapPath || 'assets/map.png'}`;

        try {
            // Загружаем основные слои
            await Promise.all([
                this.loadImage(this.layers.base, baseSrc),
                this.loadImage(this.layers.map, mapSrc)
            ]);

            // Загружаем одежду из wardrobeString (формат "bra:assets/bra.png, shirt:assets/shirt.png")
            if (settings.wardrobeString) {
                const items = settings.wardrobeString.split(',').map(i => i.trim());
                for (const item of items) {
                    const parts = item.split(':');
                    if (parts.length === 2) {
                        const name = parts[0].trim();
                        const path = parts[1].trim();
                        this.layers.clothing[name] = new Image();
                        await this.loadImage(this.layers.clothing[name], `${extDir}/${path}`);
                        console.log(`👗 [ST Interactive] Layer loaded: ${name}`);
                    }
                }
            }

            // Настройка размеров (твое разрешение 832x1216)
            this.canvas.width = 832;
            this.canvas.height = 1216;
            
            // Первичная отрисовка
            this.renderVisibleLayers();
            
            this.isReady = true;
            console.log("✅ [ST Interactive] All assets ready. Waiting for VN Mode...");
        } catch (e) {
            console.error("❌ [ST Interactive] Critical loading error:", e);
        }

        // Запускаем мониторинг появления VN контейнера
        setInterval(() => this.tryInject(), 1000);
    }

    loadImage(img, src) {
        return new Promise((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(`Could not load image at ${src}`);
            img.src = src;
        });
    }

    renderVisibleLayers() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 1. Рисуем тело (girl.png)
        if (this.layers.base.complete) {
            this.ctx.drawImage(this.layers.base, 0, 0);
        }

        // 2. Рисуем все слои одежды поверх тела
        for (const key in this.layers.clothing) {
            const clothImg = this.layers.clothing[key];
            if (clothImg.complete) {
                this.ctx.drawImage(clothImg, 0, 0);
            }
        }
    }

    tryInject() {
        const vnContainer = document.querySelector('.expression_holder');
        if (!vnContainer || document.getElementById('st-interactive-overlay')) return;

        // Создаем контейнер для нашей "куклы"
        const puppetContainer = document.createElement('div');
        puppetContainer.id = 'st-interactive-puppet';
        puppetContainer.style = "position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; display:flex; justify-content:center; align-items:center;";
        
        // Стилизуем Canvas, чтобы он вписывался в размер VN окна
        this.canvas.style = "max-width:100%; max-height:100%; object-fit: contain;";
        puppetContainer.appendChild(this.canvas);

        // Создаем невидимый интерактивный слой
        const overlay = document.createElement('div');
        overlay.id = 'st-interactive-overlay';
        overlay.style = "position:absolute; top:0; left:0; width:100%; height:100%; z-index:1000; cursor:crosshair;";

        overlay.addEventListener('click', (e) => {
            if (!this.isReady) return;
            
            const rect = overlay.getBoundingClientRect();
            
            // Рассчитываем коэффициенты масштабирования
            const scaleX = 832 / rect.width;
            const scaleY = 1216 / rect.height;
            
            const x = Math.floor((e.clientX - rect.left) * scaleX);
            const y = Math.floor((e.clientY - rect.top) * scaleY);
            
            // Проверка попадания в координаты
            if (x < 0 || x >= 832 || y < 0 || y >= 1216) return;

            // Считываем цвет с карты (она в памяти)
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
                console.log(`🎯 [ST Interactive] Hit: ${zoneName} (#${hex}) at X:${x} Y:${y}`);
                window.handleZoneClick(zoneName);
            } else {
                console.log(`💨 [ST Interactive] Miss at X:${x} Y:${y} (Color: #${hex})`);
            }
        });

        vnContainer.appendChild(puppetContainer);
        vnContainer.appendChild(overlay);
        console.log("✅ [ST Interactive] Overlay and Puppet injected into VN Mode");
    }
}

// Запуск
new InteractiveMapManager();