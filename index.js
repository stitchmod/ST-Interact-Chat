// =============================================
// ST-Interact-Chat — index.js
// Простая версия без импортов и await на старте
// =============================================

console.log("[ST Interactive] Инициализация расширения...");

let actionlibrary = null;

// Загружаем библиотеку действий
fetch('./actionlibrary.js')
    .then(response => response.text())
    .then(text => {
        // Простой способ выполнить модуль и взять default
        const moduleScript = document.createElement('script');
        moduleScript.type = 'module';
        moduleScript.textContent = `
            import lib from './actionlibrary.js';
            window.__ST_ACTION_LIBRARY = lib;
        `;
        document.head.appendChild(moduleScript);
        
        // Даём время выполниться
        setTimeout(() => {
            if (window.__ST_ACTION_LIBRARY) {
                actionlibrary = window.__ST_ACTION_LIBRARY;
                console.log("[ST Interactive] actionlibrary загружена успешно");
                initExtension();
            }
        }, 100);
    })
    .catch(err => {
        console.error("[ST Interactive] Ошибка загрузки actionlibrary.js", err);
    });

// Загружаем script.js (карта касаний)
const scriptTag = document.createElement('script');
scriptTag.src = './script.js';
scriptTag.onload = () => console.log("[ST Interactive] script.js загружен");
scriptTag.onerror = () => console.warn("[ST Interactive] script.js не найден");
document.head.appendChild(scriptTag);

function initExtension() {
    window.handleZoneClick = function(zoneName) {
        if (!actionlibrary || !actionlibrary[zoneName]) {
            console.warn(`[ST Interactive] Нет фраз для зоны: ${zoneName}`);
            return;
        }

        const phrases = actionlibrary[zoneName];
        const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];

        // Замена [левое/правое]
        const finalAction = randomPhrase.replace(/\[([^\]]+)\/([^\]]+)\]/g, (_, p1, p2) => {
            return Math.random() > 0.5 ? p1 : p2;
        });

        const textarea = document.getElementById('send_textarea');
        if (textarea) {
            textarea.value = finalAction;
            textarea.focus();
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            console.log(`[ST Interactive] Клик по ${zoneName} →`, finalAction);
        }
    };

    console.log("[ST Interactive] ✅ Расширение полностью готово!");
}

// Это нужно, чтобы SillyTavern понимал, что расширение загрузилось
window.ST_Interact_Chat_Initialized = true;
