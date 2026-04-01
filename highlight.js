/**
 * highlight.js — Подсветка зон при наведении для ST Interactive
 *
 * Подключение в script.js — добавить одну строку после создания экземпляра:
 *   import { ZoneHighlighter } from './highlight.js';
 *   // ... после строки window.stInteractive = stInteractive; ...
 *   const _highlighter = new ZoneHighlighter(stInteractive);
 *
 * Как работает:
 *   - НЕ рисует карту зон. Использует уже загруженный mapCtx из InteractiveMapManager.
 *   - Читает пиксель под курсором из offscreen mapCanvas (невидимого).
 *   - По цвету пикселя находит все пиксели той же зоны и рисует подсветку
 *     поверх основного canvas с персонажем через отдельный overlay-canvas.
 *   - Чёрный цвет (000000) обрабатывается корректно — не поглощает всё.
 */

export class ZoneHighlighter {
    /**
     * @param {InteractiveMapManager} manager — экземпляр stInteractive
     * @param {object} [options]
     * @param {string} [options.style]     — 'neon' | 'ghost' | 'ants' (default: 'neon')
     * @param {number} [options.tolerance] — допуск совпадения цвета пикселей (default: 4)
     */
    constructor(manager, options = {}) {
        this.mgr   = manager;
        this.style = options.style     ?? 'neon';
        this.tol   = options.tolerance ?? 4;

        // Overlay canvas — рисуется поверх основного, pointer-events:none
        this.overlay    = document.createElement('canvas');
        this.overlayCtx = this.overlay.getContext('2d');

        // Текущий цвет зоны под курсором {r,g,b} | null
        this.hoverColor  = null;
        this.dashOffset  = 0;
        this._rafId      = null;
        this._mapPixels  = null; // кэш пикселей карты зон

        // Ждём пока puppet появится в DOM
        this._waitForPuppet();
    }

    // ── Инициализация ─────────────────────────────────────────────────────────

    _waitForPuppet() {
        const wrap = document.getElementById('st-puppet-wrap');
        if (!wrap) {
            setTimeout(() => this._waitForPuppet(), 300);
            return;
        }
        this._setup(wrap);
    }

    _setup(wrap) {
        const mgr = this.mgr;

        // Размер overlay = размер основного canvas (логические пиксели)
        this.overlay.width  = mgr.CANVAS_W;
        this.overlay.height = mgr.CANVAS_H;
        this.overlay.style.cssText = [
            'position:absolute',
            'inset:0',
            'width:100%',
            'height:100%',
            'pointer-events:none',  // клики проходят сквозь
            'z-index:0',            // под overlay кликов (#st-interactive-overlay z-index:1)
        ].join(';');

        // Вставляем сразу после canvas персонажа, но под overlay кликов
        const clickOverlay = document.getElementById('st-interactive-overlay');
        wrap.insertBefore(this.overlay, clickOverlay ?? null);

        // Кэшируем пиксели карты зон — они не меняются
        this._cacheMapPixels();

        // Вешаем mousemove / mouseleave на overlay кликов (он покрывает весь wrap)
        const eventTarget = clickOverlay ?? wrap;
        eventTarget.addEventListener('mousemove',  e => this._onMove(e));
        eventTarget.addEventListener('mouseleave', () => this._onLeave());

        // Touch — берём первое касание
        eventTarget.addEventListener('touchmove', e => {
            const t = e.touches[0];
            this._onMove({ clientX: t.clientX, clientY: t.clientY,
                           currentTarget: e.currentTarget });
        }, { passive: true });
        eventTarget.addEventListener('touchend', () => this._onLeave());

        // Запускаем цикл анимации
        this._animate();
        console.log('✅ [ZoneHighlighter] Инициализирован, стиль:', this.style);
    }

    _cacheMapPixels() {
        // mapCtx уже содержит нарисованную карту зон (drawImage в init())
        this._mapPixels = this.mgr.mapCtx.getImageData(
            0, 0, this.mgr.CANVAS_W, this.mgr.CANVAS_H
        ).data;
    }

    // ── События мыши ─────────────────────────────────────────────────────────

    _onMove(e) {
        if (!this.mgr.isReady || !this._mapPixels) return;

        // Переводим экранные координаты в логические пиксели canvas
        const target = e.currentTarget ?? e.target;
        const rect   = target.getBoundingClientRect();
        const sx = this.mgr.CANVAS_W / rect.width;
        const sy = this.mgr.CANVAS_H / rect.height;
        const x  = Math.floor((e.clientX - rect.left) * sx);
        const y  = Math.floor((e.clientY - rect.top)  * sy);

        const i = (y * this.mgr.CANVAS_W + x) * 4;
        const d = this._mapPixels;

        // Прозрачный пиксель — вне персонажа
        if (d[i + 3] < 50) {
            this.hoverColor = null;
            return;
        }

        const r = d[i], g = d[i + 1], b = d[i + 2];

        // Обновляем только если зона изменилась (избегаем лишнего rebuild маски)
        if (!this.hoverColor ||
            this.hoverColor.r !== r ||
            this.hoverColor.g !== g ||
            this.hoverColor.b !== b) {
            this.hoverColor = { r, g, b };
            this._rebuildMask();
        }
    }

    _onLeave() {
        this.hoverColor = null;
        this._maskCanvas = null;
    }

    // ── Маска зоны ────────────────────────────────────────────────────────────

    /**
     * Строит offscreen-маску: белые пиксели там, где цвет карты совпадает
     * с hoverColor (с допуском). Кэшируется до смены зоны.
     */
    _rebuildMask() {
        if (!this.hoverColor || !this._mapPixels) return;

        const W = this.mgr.CANVAS_W;
        const H = this.mgr.CANVAS_H;
        const d = this._mapPixels;
        const { r: tr, g: tg, b: tb } = this.hoverColor;
        const tol = this.tol;

        const mask   = document.createElement('canvas');
        mask.width   = W;
        mask.height  = H;
        const mCtx   = mask.getContext('2d');
        const imgData = mCtx.createImageData(W, H);
        const md     = imgData.data;

        for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 50) continue; // прозрачно — пропуск
            if (Math.abs(d[i]   - tr) <= tol &&
                Math.abs(d[i+1] - tg) <= tol &&
                Math.abs(d[i+2] - tb) <= tol) {
                md[i] = md[i+1] = md[i+2] = 255;
                md[i+3] = 255;
            }
        }
        mCtx.putImageData(imgData, 0, 0);
        this._maskCanvas = mask;
    }

    // ── Анимация ──────────────────────────────────────────────────────────────

    _animate() {
        this._render();
        this.dashOffset -= 0.5;
        this._rafId = requestAnimationFrame(() => this._animate());
    }

    _render() {
        const ctx = this.overlayCtx;
        ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);

        if (!this.hoverColor || !this._maskCanvas) return;

        ctx.save();

        switch (this.style) {
            case 'neon':
                // Мягкое свечение поверх персонажа
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha  = 0.55;
                ctx.shadowBlur   = 28;
                ctx.shadowColor  = 'rgba(255, 245, 200, 1)';
                // Первый слой — само свечение
                ctx.drawImage(this._maskCanvas, 0, 0);
                // Второй слой — чуть ярче для сердцевины
                ctx.globalAlpha = 0.25;
                ctx.shadowBlur  = 10;
                ctx.drawImage(this._maskCanvas, 0, 0);
                break;

            case 'ghost':
                // Полупрозрачная заливка зоны
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = 0.35;
                // Тонируем маску нужным цветом
                ctx.drawImage(this._maskCanvas, 0, 0);
                ctx.globalCompositeOperation = 'source-in';
                ctx.fillStyle = 'rgba(255, 240, 180, 0.9)';
                ctx.fillRect(0, 0, this.overlay.width, this.overlay.height);
                break;

            case 'ants': {
                // "Марширующие муравьи" — бегущий пунктирный контур
                // Строим контур через stroke маски
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = 0.9;
                ctx.shadowBlur  = 6;
                ctx.shadowColor = '#fff';
                // Рисуем маску с размытием как base
                ctx.filter = 'blur(1px)';
                ctx.drawImage(this._maskCanvas, 0, 0);
                ctx.filter = 'none';
                // Пунктирный контур через dilate→XOR трюк
                ctx.globalCompositeOperation = 'xor';
                ctx.filter = 'blur(2px)';
                ctx.drawImage(this._maskCanvas, 0, 0);
                ctx.filter = 'none';
                ctx.globalCompositeOperation = 'source-over';
                ctx.setLineDash([12, 8]);
                ctx.lineDashOffset = this.dashOffset;
                ctx.strokeStyle    = '#ffffff';
                ctx.lineWidth      = 2;
                ctx.globalAlpha    = 0.8;
                // Обводка по bounding box маски как аппроксимация
                ctx.strokeRect(2, 2, this.overlay.width - 4, this.overlay.height - 4);
                break;
            }

            default:
                ctx.globalAlpha = 0.5;
                ctx.drawImage(this._maskCanvas, 0, 0);
        }

        ctx.restore();
    }

    // ── Публичное API ─────────────────────────────────────────────────────────

    /** Сменить стиль подсветки на лету */
    setStyle(style) {
        this.style = style;
        console.log('[ZoneHighlighter] Стиль:', style);
    }

    /** Остановить анимацию и скрыть подсветку */
    destroy() {
        if (this._rafId) cancelAnimationFrame(this._rafId);
        this.overlay.remove();
    }
}
