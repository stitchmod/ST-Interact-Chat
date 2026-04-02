// ST-Interact-Chat / index.js

jQuery(async () => {
    console.log("[ST Interactive] Запуск...");

    const extensionName       = "ST-Interact-Chat";
    const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

    // ── Загрузка settings.html в панель расширений ────────────────────────────
    // #extensions_settings2 — правильный контейнер для третьесторонних расширений
    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $("#extensions_settings2").append(settingsHtml);
        console.log("[ST Interactive] settings.html загружен в #extensions_settings2");
    } catch (e) {
        console.error("[ST Interactive] Ошибка загрузки settings.html:", e);
    }

    // ── Библиотека действий (фразы для зон касания) ───────────────────────────
    let actionlibrary;
    try {
        const module = await import('./actionlibrary.js');
        actionlibrary = module.default || module;
    } catch (e) {
        console.error("[ST Interactive] Не удалось загрузить actionlibrary.js", e);
        return;
    }

    // ── Основной скрипт (манекен, canvas, гардероб) ───────────────────────────
    try {
        await import('./script.js');
        console.log("[ST Interactive] script.js загружен");
    } catch (e) {
        console.warn("[ST Interactive] script.js:", e.message);
    }

    // ── Wardrobe AI (парсинг тегов, кнопки, промпт) ───────────────────────────
    // Загружаем ПОСЛЕ script.js чтобы window.stInteractive уже существовал
    try {
        await import('./wardrobe-ai.js');
        console.log("[ST Interactive] wardrobe-ai.js загружен");
    } catch (e) {
        console.warn("[ST Interactive] wardrobe-ai.js:", e.message);
    }

    // ── Обработчик кликов по зонам манекена ──────────────────────────────────
    window.handleZoneClick = async (zoneName) => {
        const library = actionlibrary[zoneName];

        if (!library || library.length === 0) {
            console.warn(`[ST Interactive] Нет фраз для зоны: ${zoneName}`);
            return;
        }

        const randomPhrase = library[Math.floor(Math.random() * library.length)];

        // Замена [левое/правое] → случайный вариант
        const finalAction = randomPhrase.replace(/\[([^\]]+)\/([^\]]+)\]/g, (_, p1, p2) => {
            return Math.random() > 0.5 ? p1 : p2;
        });

        const inputField = document.getElementById('send_textarea');
        if (inputField) {
            inputField.value = finalAction;
            inputField.focus();
            inputField.dispatchEvent(new Event('input', { bubbles: true }));
            console.log(`[ST Interactive] → ${zoneName}:`, finalAction);
        }
    };

    console.log("[ST Interactive] ✅ Готово!");
});
