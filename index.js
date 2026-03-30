import { preloadPhrases, getBestAction } from './actionsSelector.js';
import actionlibrary from './actionlibrary.js';

// Импортируем модули ST (доступны глобально в контексте расширений)
import { 
    getChat, 
    sendMessage, 
    registerSlashCommand,
    onEvent,
    eventSource
} from '../../../../script.js';

jQuery(async () => {
    // 1. Инициализируем эмбеддинги при старте
    await preloadPhrases(actionlibrary);

    // 2. Функция обработки клика по зоне (будет вызываться из script.js)
    window.handleZoneClick = async (zoneName) => {
        const chat = getChat();
        // Берем последние 2 сообщения для контекста
        const context = chat.slice(-2).map(m => m.mes).join(" ");
        
        // Получаем лучшую фразу
        const actionText = await getBestAction(zoneName, context);
        
        // Форматируем [левого/правого] если есть
        const finalAction = actionText.replace(/\[([^\]]+)\/([^\]]+)\]/g, () => 
            Math.random() > 0.5 ? arguments[1] : arguments[2]
        );

        // Отправляем в чат SillyTavern
        const inputField = document.getElementById('send_textarea');
        inputField.value = finalAction;
        // Эмулируем нажатие Enter или вызываем sendMessage
        // sendMessage(); 
    };

    console.log("🚀 ST Interactive Chat Extension Loaded");
});