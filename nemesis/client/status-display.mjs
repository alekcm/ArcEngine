import { KNOWLEDGE_MAX, KNOWLEDGE_THRESHOLDS } from '../shared/knowledge.mjs';
import { DECK_NAMES } from '../shared/data/cards.mjs';

// Only real item-deck identifiers are displayed. Starting equipment is not a coloured search deck.
export function itemDeckBadge(deck) {
    if (deck === 'start') return '<span class="item-deck start">Стартовый предмет</span>';
    if (!Object.hasOwn(DECK_NAMES, deck)) return '';
    return '<span class="item-deck ' + deck + '">Колода: ' + DECK_NAMES[deck] + '</span>';
}

export function knowledgeTrack(p) {
    const value = Math.max(0, Math.min(KNOWLEDGE_MAX, Number(p.knowledge) || 0));
    const active = p.knowledgeActive ? 'Жетон знаний активирован' : 'Жетон знаний не активирован';
    const cells = Array.from({ length: KNOWLEDGE_MAX }, (_, i) => {
        const n = i + 1, reward = KNOWLEDGE_THRESHOLDS.includes(n);
        const title = 'Знания ' + n + (reward ? ' — порог карты полевых данных' : '');
        return '<span class="knowledge-cell' + (n <= value ? ' on' : '') + (n === value ? ' here' : '') +
            (reward ? ' reward' : '') + '" title="' + title + '" aria-label="' + title + '">' + n +
            (reward ? '<span aria-hidden="true"> 🂠</span>' : '') + '</span>';
    }).join('');
    return '<div class="sheet-knowledge"><div class="knowledge-label">Знания: ' + value + ' / ' + KNOWLEDGE_MAX +
        ' <span title="' + active + '">' + (p.knowledgeActive ? '✓ активирован' : 'не активирован') + '</span></div>' +
        '<div class="knowledge-track" role="group" aria-label="Знания: ' + value + ' из ' + KNOWLEDGE_MAX + '. ' + active + '">' + cells + '</div>' +
        '<small>🂠 — порог получения карты полевых данных</small></div>';
}

export function larvaBadge(p) {
    return p.larva ? '<span class="sh-larva" title="У персонажа личинка" aria-label="У персонажа личинка">🪱</span>' : '';
}
