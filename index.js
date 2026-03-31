// ST-Interact-Chat / index.js
// Интерактивные зоны касания + wardrobe system для Lima

jQuery(async () => {
    console.log("[ST Interactive] Запуск расширения Lima Interactive...");

    // === ДОБАВЛЕНО: Автоматическая загрузка интерфейса в меню расширений ===
    // Важно: имя должно строго совпадать с названием папки расширения!
    const extensionName = "lima-interactive";                    // ← Изменено под твой manifest
    const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $("#extension_settings").append(settingsHtml);
        console.log("[ST Interactive] ✅ Интерфейс настроек успешно загружен в меню расширений");
    } catch (e) {
        console.warn("[ST Interactive] Не удалось загрузить settings.html. Возможно, расширение установлено не через third-party.");
        console.warn("[ST Interactive] Пробуем загрузить из scripts/extensions/...");

        try {
            const altPath = `scripts/extensions/${extensionName}`;
            const settingsHtml = await $.get(`${altPath}/settings.html`);
            $("#extension_settings").append(settingsHtml);
            console.log("[ST Interactive] ✅ Интерфейс загружен (альтернативный путь)");
        } catch (e2) {
            console.error("[ST Interactive] ❌ Не удалось загрузить settings.html ни по одному пути.", e2);
        }
    }
    // ===================================================================

    // Динамически подгружаем библиотеку действий
    let actionlibrary;
    try {
        const module = await import('./actionlibrary.js');
        actionlibrary = module.default || module;
        console.log("[ST Interactive] Библиотека действий загружена");
    } catch (e) {
        console.error("[ST Interactive] Не удалось загрузить actionlibrary.js", e);
        return;
    }

    // Подгружаем скрипт карты (script.js)
    try {
        await import('./script.js');
        console.log("[ST Interactive] script.js успешно загружен");
    } catch (e) {
        console.warn("[ST Interactive] script.js не найден или уже загружен", e);
    }

    // Основная функция обработки клика по зоне
    window.handleZoneClick = async (zoneName) => {
        const library = actionlibrary[zoneName];
        
        if (!library || library.length === 0) {
            console.warn(`[ST Interactive] Нет фраз для зоны: ${zoneName}`);
            return;
        }

        // Выбираем случайную фразу
        const randomPhrase = library[Math.floor(Math.random() * library.length)];

        // Замена конструкций [левое/правое] или [left/right]
        const finalAction = randomPhrase.replace(/\[([^\]]+)\/([^\]]+)\]/g, (match, p1, p2) => {
            return Math.random() > 0.5 ? p1.trim() : p2.trim();
        });

        // Вставляем в поле ввода SillyTavern
        const inputField = document.getElementById('send_textarea');
        if (inputField) {
            inputField.value = finalAction;
            inputField.focus();
            inputField.dispatchEvent(new Event('input', { bubbles: true }));
            
            // Опционально: можно сразу отправить сообщение (раскомментировать при необходимости)
            // inputField.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

            console.log(`[ST Interactive] → ${zoneName}:`, finalAction);
        } else {
            console.error("[ST Interactive] Поле ввода #send_textarea не найдено");
        }
    };

    console.log("[ST Interactive] ✅ Расширение полностью инициализировано. Карта касаний готова.");
});
