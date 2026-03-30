// ST-Interact-Chat / index.js
// Правильная регистрация для SillyTavern

const extensionName = "ST Interactive Chat";
const extensionVersion = "1.0.0";

console.log(`[${extensionName}] Инициализация v${extensionVersion}...`);

// Динамически загружаем actionlibrary
let actionlibrary = {};

async function loadActionLibrary() {
    try {
        const module = await import('./actionlibrary.js');
        actionlibrary = module.default || module;
        console.log(`[${extensionName}] actionlibrary загружена (${Object.keys(actionlibrary).length} зон)`);
    } catch (err) {
        console.error(`[${extensionName}] Ошибка загрузки actionlibrary.js`, err);
    }
}

// Загружаем script.js (карта касаний)
function loadScriptJS() {
    const script = document.createElement('script');
    script.src = './script.js';
    script.onload = () => console.log(`[${extensionName}] script.js загружен`);
    script.onerror = () => console.warn(`[${extensionName}] script.js не удалось загрузить`);
    document.head.appendChild(script);
}

// Основная функция клика
window.handleZoneClick = function(zoneName) {
    const phrases = actionlibrary[zoneName];
    if (!phrases || phrases.length === 0) {
        console.warn(`[${extensionName}] Нет фраз для зоны: ${zoneName}`);
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
        console.log(`[${extensionName}] Клик по ${zoneName} →`, finalAction);
    }
};

// Регистрация расширения в SillyTavern
jQuery(async () => {
    await loadActionLibrary();
    loadScriptJS();

    // Это важно — регистрируем расширение
    if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
        console.log(`[${extensionName}] ✅ Успешно зарегистрировано в SillyTavern`);
    } else {
        console.warn(`[${extensionName}] SillyTavern API не найден`);
    }

    console.log(`[${extensionName}] Готово! Кликай по зонам на карте.`);
});

// Дополнительно для настроек (чтобы settings.html работал)
window['${extensionName.replace(/ /g, '_')}'] = {
    version: extensionVersion
};
