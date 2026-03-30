// Используем CDN версию, так как в расширении нет node_modules
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1';

let extractor = null;
let phraseEmbeddings = {}; 

async function initEmbedder() {
    if (!extractor) {
        console.log("⏳ [ST Interactive] Loading AI Model...");
        extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
}

export async function preloadPhrases(library) {
    await initEmbedder();
    phraseEmbeddings = {};

    for (const [zone, phrases] of Object.entries(library)) {
        phraseEmbeddings[zone] = [];
        for (const phrase of phrases) {
            const output = await extractor(phrase, { pooling: 'mean', normalize: true });
            const embedding = Array.from(output.data);
            phraseEmbeddings[zone].push({ phrase, embedding });
        }
    }
}

export async function getBestAction(zoneName, contextText) {
    await initEmbedder();

    if (!phraseEmbeddings[zoneName]) return `*Я коснулся её ${zoneName}*`;

    const queryOutput = await extractor(contextText, { pooling: 'mean', normalize: true });
    const queryEmb = Array.from(queryOutput.data);

    let bestScore = -1;
    let bestPhrase = "";

    for (const item of phraseEmbeddings[zoneName]) {
        const score = cosineSimilarity(queryEmb, item.embedding);
        if (score > bestScore) {
            bestScore = score;
            bestPhrase = item.phrase;
        }
    }
    return bestPhrase || `*Я коснулся её ${zoneName}*`;
}

function cosineSimilarity(a, b) {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1);
}