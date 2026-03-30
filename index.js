// ST-Interact-Chat / index.js
// Стабильная версия без await на старте

console.log("[ST Interactive] index.js начал выполнение");

let actionlibrary = {};

jQuery(() => {
    console.log("[ST Interactive] jQuery готов — начинаем инициализацию");

    // Загружаем actionlibrary
    import('./actionlibrary.js')
        .then(module => {
            actionlibrary = module.default || module;
            console.log(`[ST Interactive] actionlibrary загружена (${Object.keys(actionlibrary).length} зон)`);
            initClickHandler();
        })
        .catch(err => {
            console.error("[ST Interactive] Не удалось загрузить actionlibrary.js", err);
        });

    // Загружаем script.js (карта касаний)
    import('./script.js')
        .then(() => {
            console.log("[ST Interactive] script.js успешно загружен");
        })
        .catch(err => {
            console.warn("[ST Interactive] script.js не удалось загрузить (возможно уже загружен)", err);
        });
});

function initClickHandler() {
    window.handleZoneClick = function(zoneName) {
        const phrases = actionlibrary[zoneName];
        if (!phrases || phrases.length === 0) {
            console.warn(`[ST Interactive] Нет фраз для зоны: ${zoneName}`);
            return;
        }

        const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];
        const finalAction = randomPhrase.replace(/\[([^\]]+)\/([^\]]+)\]/g, (_, p1, p2) => 
            Math.random() > 0.5 ? p1 : p2
        );

        const textarea = document.getElementById('send_textarea');
        if (textarea) {
            textarea.value = finalAction;
            textarea.focus();
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            console.log(`[ST Interactive] Клик по ${zoneName} →`, finalAction);
        }
    };

    console.log("[ST Interactive] ✅ handleZoneClick зарегистрирован — расширение готово!");
}

// Маркер для Tavern, что расширение загрузилось
window.ST_Interact_Chat_Loaded = true;
