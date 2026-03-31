// ST-Interact-Chat / index.js
// Без тяжёлых моделей, без топ-левел import

jQuery(async () => {
    console.log("[ST Interactive] Запуск...");

    // === ДОБАВЛЕНО: Загрузка интерфейса в меню расширений ===
    // Имя должно строго совпадать с названием папки расширения!
    const extensionName = "ST-Interact-Chat"; 
    const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
    
    try {
        // Скачиваем твой settings.html
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        
        // Встраиваем его во вкладку расширений (иконка пазла)
        $("#extension_settings").append(settingsHtml);
        console.log("[ST Interactive] Интерфейс загружен.");
    } catch (e) {
        console.error("[ST Interactive] Ошибка загрузки settings.html! Проверь имя папки.", e);
    }
    // ========================================================

    // Динамически подгружаем библиотеку действий (чтобы не было ошибки импорта)
    let actionlibrary;
    try {
        const module = await import('./actionlibrary.js');
        actionlibrary = module.default || module;
    } catch (e) {
        console.error("[ST Interactive] Не удалось загрузить actionlibrary.js", e);
        return;
    }

    // Подгружаем скрипт карты (script.js должен выполняться)
    try {
        await import('./script.js');
        console.log("[ST Interactive] script.js загружен");
    } catch (e) {
        console.warn("[ST Interactive] script.js не найден или уже загружен");
    }

    window.handleZoneClick = async (zoneName) => {
        const library = actionlibrary[zoneName];
        
        if (!library || library.length === 0) {
            console.warn(`[ST Interactive] Нет фраз для зоны: ${zoneName}`);
            return;
        }

        const randomPhrase = library[Math.floor(Math.random() * library.length)];

        // Замена [левое/правое]
        const finalAction = randomPhrase.replace(/\[([^\]]+)\/([^\]]+)\]/g, (match, p1, p2) => {
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

    console.log("[ST Interactive] ✅ Готово! Карта касаний работает мгновенно.");
});
