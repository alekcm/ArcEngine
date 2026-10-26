// main.js — bootstrap: one 3D world, a campaign selector, and two independent game controllers.
// window.app = { location, camera, game }: choose Heroes V or the Warcraft III RTS at launch.

function updateLoadingProgress(percent) {
    const bar = /** @type {HTMLElement | null} */ (document.querySelector('.loading-progress'));
    if (bar) bar.style.width = percent + '%';
}

function hideLoader() {
    updateLoadingProgress(100);
    setTimeout(() => {
        const screen = document.getElementById('loading-screen');
        if (screen) screen.style.display = 'none';
    }, 300);
}

function showBootError(text) {
    console.error(text);
    const el = document.querySelector('.loading-text');
    if (el) el.textContent = text;
}

function applyUILayoutMode(mode) {
    if (!UI.root) return;
    // Clear runtime visibility overrides first; each campaign starts from the saved layout.
    for (const rec of UI.layout) {
        const el = UI.get(rec.id);
        if (!el) continue;
        el._shown = null;
        el.apply();
    }
    const wc3Roots = new Set([
        'wc3ResourcePanel', 'wc3ObjectivePanel', 'wc3UtilityPanel', 'wc3ToastPanel',
        'wc3SelectedPanel', 'wc3MinimapPanel', 'wc3CommandPanel', 'wc3HoverPanel',
        'wc3PauseDim', 'wc3ResultDim',
    ]);
    for (const rec of UI.layout) {
        if (rec.parent) continue;
        const el = UI.get(rec.id);
        if (!el) continue;
        let visible = false;
        if (mode === 'menu') visible = rec.id === 'modeDim';
        else if (mode === 'warcraft') visible = wc3Roots.has(rec.id) &&
            !['wc3ToastPanel', 'wc3PauseDim', 'wc3ResultDim'].includes(rec.id);
        else visible = rec.visible !== 0 && rec.id !== 'modeDim' && !rec.id.startsWith('wc3');
        el.show(visible);
    }
    // The campaign selector is the only overlay shown before a game starts.
    if (mode !== 'menu') {
        const panel = UI.get('modeDim');
        if (panel) panel.show(false);
    }
}

function startGame() {
    if (window.app) return;
    if (typeof SimplexNoise === 'undefined') { showBootError('Нет libs/simplex-noise.js'); return; }
    const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('world3d'));
    updateLoadingProgress(40);
    if (!World3D.init(canvas)) { showBootError('3D недоступен: нет libs/babylon.js или WebGL'); return; }

    // Start with an empty shared location. HoMM V attaches its own authored map objects
    // only after the player chooses that campaign; the RTS creates a separate live battlefield.
    const location = new Location3D({ objects: [] });
    const camera = new CameraController(location.view, {
        terrain: location.terrain,
        bounds: { w: location.width, h: location.height },
    });
    camera.attach(canvas);
    UI.init(canvas);
    /** @type {{ location: Location3D, camera: CameraController, game: Game | Warcraft3RTS | null, showModeMenu?: () => void }} */
    const app = window.app = { location, camera, game: null };

    let campaignStarting = false;
    const beginHeroes = async () => {
        if (app.game || campaignStarting) return;
        campaignStarting = true;
        applyUILayoutMode('heroes');
        try {
            const records = typeof LOCATION_OBJECTS !== 'undefined' ? LOCATION_OBJECTS : [];
            await Promise.all(records.map(def => location.addObject(def).loaded));
            if (app.game) return;
            app.game = new Game(app);
            console.log('ArcEngine: кампания «Герои V» запущена.');
        } catch (e) {
            console.error(e);
            showBootError('Не удалось запустить кампанию «Герои V». Подробности — в консоли.');
        } finally {
            campaignStarting = false;
        }
    };

    const beginWarcraft = () => {
        if (app.game || campaignStarting) return;
        campaignStarting = true;
        applyUILayoutMode('warcraft');
        try {
            app.game = new Warcraft3RTS(app);
            console.log('ArcEngine: RTS-кампания Warcraft III запущена.');
        } catch (e) {
            console.error(e);
            applyUILayoutMode('menu');
            showBootError('Не удалось запустить RTS-кампанию. Подробности — в консоли.');
        } finally {
            campaignStarting = false;
        }
    };

    app.showModeMenu = () => {
        const current = /** @type {any} */ (app.game);
        if (current && typeof current.dispose === 'function') current.dispose();
        app.game = null;
        applyUILayoutMode('menu');
        camera.setStrategyMode(true);
        camera.setCustomBounds(null);
        camera.lookAt(location.width / 2, location.height / 2);
    };

    const heroesBtn = UI.get('modeHeroesBtn');
    const warcraftBtn = UI.get('modeWarcraftBtn');
    if (heroesBtn) heroesBtn.onClick(() => { void beginHeroes(); });
    if (warcraftBtn) warcraftBtn.onClick(beginWarcraft);
    applyUILayoutMode('menu');

    updateLoadingProgress(70);
    let last = performance.now();
    World3D.engine.runRenderLoop(() => {
        const now = performance.now(), dt = (now - last) / 1000;
        last = now;
        const game = app.game;
        if (game) game.update(Math.min(0.1, dt));
        location.update(dt);
        camera.update(dt);
        Sound3D.update(camera);
        World3D.renderFrame();
    });
    window.addEventListener('resize', () => World3D.resize());
    location.ready.then(() => {
        hideLoader();
        console.log('ArcEngine: выберите кампанию — Герои V или Warcraft III.');
    });
}

window.onload = () => startGame();
