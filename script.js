class InteractiveMapManager {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.mapImage = new Image();
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

    init() {
        // Определяем путь к текущему скрипту, чтобы найти assets относительно него
        const scriptPath = import.meta.url;
        const extensionDir = scriptPath.substring(0, scriptPath.lastIndexOf('/'));
        this.mapImage.src = `${extensionDir}/assets/map.png`;
        
        this.mapImage.onload = () => {
            this.canvas.width = this.mapImage.naturalWidth;
            this.canvas.height = this.mapImage.naturalHeight;
            this.ctx.drawImage(this.mapImage, 0, 0);
            this.isReady = true;
            console.log("✅ [ST Interactive] Map image loaded from: " + this.mapImage.src);
        };

        this.mapImage.onerror = () => {
            console.error("❌ [ST Interactive] 404: Map not found at " + this.mapImage.src);
        };

        setInterval(() => this.tryInject(), 1000);
    }

    tryInject() {
        const vnContainer = document.querySelector('.expression_holder');
        if (!vnContainer || document.getElementById('st-interactive-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'st-interactive-overlay';
        overlay.style = "position:absolute;top:0;left:0;width:100%;height:100%;z-index:100;cursor:crosshair;";

        overlay.addEventListener('click', (e) => {
            if (!this.isReady) return;
            const rect = e.target.getBoundingClientRect();
            const x = Math.floor((e.clientX - rect.left) * (this.canvas.width / rect.width));
            const y = Math.floor((e.clientY - rect.top) * (this.canvas.height / rect.height));
            
            const p = this.ctx.getImageData(x, y, 1, 1).data;
            const hex = [p[0], p[1], p[2]].map(c => c.toString(16).padStart(2, '0').toUpperCase()).join('');
            
            const zoneName = this.zones[hex];
            if (zoneName && window.handleZoneClick) {
                window.handleZoneClick(zoneName);
            }
        });

        vnContainer.appendChild(overlay);
        console.log("✅ [ST Interactive] Overlay ready in VN Mode");
    }
}

new InteractiveMapManager();