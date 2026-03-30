import { preloadPhrases, getBestAction } from './actionsSelector.js';
import actionlibrary from './actionlibrary.js';

// Глобальные переменные SillyTavern доступны через импорты из ядра
import { 
    getChat, 
    sendMessage,
    eventSource,
    event_types
} from '../../../../script.js';

// Ждем загрузки jQuery (стандарт для расширений ST)
jQuery(async () => {
    console.log("⏳ [ST Interactive] Initializing...");

    // 1. Предзагружаем эмбеддинги для фраз
    try {
        await preloadPhrases(actionlibrary);
        console.log("✅ [ST Interactive] Library loaded");
    } catch (e) {
        console.error("❌ [ST Interactive] Library failed:", e);
    }

    // 2. Функция, которую вызовет script.js при клике по зоне
    window.handleZoneClick = async (zoneName) => {
        const chat = getChat();
        
        // Берем последние 2 сообщения для контекста (из массива чата ST)
        const context = chat.slice(-2).map(m => m.mes).join(" ");
        
        // Получаем лучшую фразу через transformers.js
        const actionText = await getBestAction(zoneName, context);
        
        // Обрабатываем случайный выбор [левого/правого]
        const finalAction = actionText.replace(/\[([^\]]+)\/([^\]]+)\]/g, (match, p1, p2) => {
            return Math.random() > 0.5 ? p1 : p2;
        });

        // Вставляем в поле ввода и фокусим его
        const inputField = document.getElementById('send_textarea');
        if (inputField) {
            inputField.value = finalAction;
            inputField.focus();
            // Вызываем событие изменения, чтобы ST "увидел" текст
            inputField.dispatchEvent(new Event('input', { bubbles: true }));
        }
    };

    console.log("🚀 [ST Interactive] Extension Ready");
});