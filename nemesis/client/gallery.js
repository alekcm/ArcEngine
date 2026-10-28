// gallery.js — the demo pieces the room gallery shows: every room is known and explored, and the
// cargo that makes the board read as a ship rather than an empty set of decks. Both the in-game
// gallery (app.js, key F) and the board editor's Nemesis tab (editor-panel.js) build from this, so a
// designer sees the same board the table sees.
//
// Escape pods are not room props: scene3d.js draws them from the view (`syncPods`) in the two
// evacuation bays, at the same ±2.5 / 1.05 spots their cradles stand on. A view without pods leaves
// both cradles bare, which is exactly what the editor showed before this file existed.
/** Four demo pods — two per bay — open, locked and occupied, as they look in a game. */
export function galleryPods() {
    return [
        { num: 1, section: 'A', locked: false, occupants: [], launched: false, removed: false },
        { num: 2, section: 'A', locked: true, occupants: [], launched: false, removed: false },
        { num: 3, section: 'B', locked: false, occupants: [1], launched: false, removed: false },
        { num: 4, section: 'B', locked: false, occupants: [], launched: false, removed: false },
    ];
}
