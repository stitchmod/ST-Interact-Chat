import actionlibrary from './actionlibrary.js';
// Добавляем импорт скрипта отрисовки карты (оставляем как было)
import './script.js';

const { getChat } = SillyTavern.getContext();

jQuery(async () => {
    console.log("[ST Interactive] Инициализация... (без тяжёлой модели)");

    // Никакой предзагрузки моделей — всё мгновенно

    window.handleZoneClick = async (zoneName) => {
        const library = actionlibrary[zoneName];
        
        if (!library || library.length === 0) {
            console.warn(`[ST Interactive] Нет фраз для зоны: ${zoneName}`);
            return;
        }

        // Просто выбираем случайную фразу из библиотеки — быстро и надёжно
        const randomPhrase = library[Math.floor(Math.random() * library.length)];

        // Обрабатываем [левое/правое] как было раньше
        const finalAction = randomPhrase.replace(/\[([^\]]+)\/([^\]]+)\]/g, (match, p1, p2) => {
            return Math.random() > 0.5 ? p1 : p2;
        });

        // Вставляем в поле ввода
        const inputField = document.getElementById('send_textarea');
        if (inputField) {
            inputField.value = finalAction;
            inputField.focus();
            inputField.dispatchEvent(new Event('input', { bubbles: true }));
            
            console.log(`[ST Interactive] Выбрана фраза для ${zoneName}:`, finalAction);
        }
    };

    console.log("[ST Interactive] Готово! Карта касаний и выбор фраз работают без тормозов.");
});