// В script.js добавь логику, которая находит текущий аватар
function getActiveCharacterImage() {
    const charImg = document.querySelector('.character_picture img');
    return charImg ? charImg.src : './assets/fallback.png';
}

// При отрисовке на Canvas используй эту картинку как нижний слой