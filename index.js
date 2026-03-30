import { preloadPhrases, getBestAction } from './actionsSelector.js';
import actionlibrary from './actionlibrary.js';

// Получаем контекст SillyTavern
const { getChat } = SillyTavern.getContext();

jQuery(async () => {
    console.log("⏳ [ST Interactive] Initializing...");

    try {
        await preloadPhrases(actionlibrary);
        console.log("✅ [ST Interactive] Library loaded");
    } catch (e) {
        console.error("❌ [ST Interactive] Initialization failed:", e);
    }

    window.handleZoneClick = async (zoneName) => {
        const chat = getChat();
        const context = chat.slice(-3).map(m => m.mes).join(" ");
        const actionText = await getBestAction(zoneName, context);
        
        const finalAction = actionText.replace(/\[([^\]]+)\/([^\]]+)\]/g, (match, p1, p2) => {
            return Math.random() > 0.5 ? p1 : p2;
        });

        const inputField = document.getElementById('send_textarea');
        if (inputField) {
            inputField.value = finalAction;
            inputField.focus();
            inputField.dispatchEvent(new Event('input', { bubbles: true }));
        }
    };
});