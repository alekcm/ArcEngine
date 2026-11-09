// ============================================================================
//  fs-engine.mjs — load the rules engine the way the browser loads it
// ----------------------------------------------------------------------------
//  The server (fs-server.mjs) and the checks (fs-audit.mjs, fs-card-check.mjs,
//  fs-coverage.mjs) all run the classic scripts of the game inside node:vm.
//  Every tool used to keep its own hand-written list of files, and the lists
//  had already drifted from index.html: the server never loaded FSCards.js and
//  FSWarpStorms.js, so buying an upgrade or moving a storm failed there, while
//  the same command worked in the browser.
//
//  The list now comes from index.html — the one place where the load order is
//  written. A new core file is added there once and every tool sees it.
//
//  The engine files are the game scripts of js/fs (not the view: the server and
//  the rules checks need no Babylon and no DOM).
// ============================================================================
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import url from 'node:url';

export const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');

/** All local script/link paths of index.html, in document order. */
export function htmlFiles() {
    const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const out = [];
    for (const m of src.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)=["']([^"']+)["']/g)) {
        const ref = m[1];
        if (!ref || /^https?:|^data:|^#/.test(ref)) continue;
        if (out.includes(ref)) continue;
        out.push(ref);
    }
    return out;
}

/** The classic scripts of the rules engine, in the order index.html loads them. */
export function engineFiles() {
    return htmlFiles().filter(f => f.startsWith('js/fs/') && f.endsWith('.js')
        && !/FSNet|FSView|FSUI|FSGame|FSIcons/.test(f));
}

/** The names a tool may need after loading: every global the scripts define. */
const ENGINE_GLOBALS = ['FS_DATA', 'FS_CATALOG', 'FS_RULES_CONFIG', 'FS_WARP_STORMS',
    'FS_CARDS', 'FS_EFFECTS', 'FS_RULES', 'Board', 'PlayerEntity', 'TrimQueue', 'StrikePlan',
    'TileGeometry', 'CombatSides', 'StepContext', 'STEP_EXECUTORS', 'ASK_EXECUTORS'];

/**
 * One context with the engine in it.
 * @param {object} [extra] additional globals for the context (console is there by default)
 * @returns {any} the node:vm context
 */
export function createEngineContext(extra) {
    const ctx = vm.createContext(Object.assign({
        console, Math, JSON, Date, Set, Map, Array, Object, Number, String, Boolean, Error,
        parseInt, parseFloat, isNaN, RegExp, Promise, Symbol, TypeError, RangeError,
        WeakMap, WeakSet, Reflect, Proxy,
    }, extra || {}));
    for (const file of engineFiles()) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
    }
    // The classic scripts declare `const`/`class` at the top level of the
    // context; a vm context does not expose those as properties, so hand the
    // tools the names they ask for.
    for (const name of ENGINE_GLOBALS) {
        try {
            const value = vm.runInContext(name, ctx);
            ctx[name] = value;
        } catch (e) {
            // The script is not loaded (a tool that needs a smaller engine).
        }
    }
    return ctx;
}
