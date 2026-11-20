// Toon look for the miniatures, ported from the kit's ArcToonPlugin (js/World3D.js, used by the
// Forbidden Stars port): the summed light is quantised into bands, the specular highlight is a
// hard glint, a light rim runs along the silhouette. On top of that inkMini() adds the dark
// "ink" lines on creased edges (EdgesRenderer) and a thin outer outline — together they give the
// painted-miniature feel without any material maps (the OBJ files carry no MTL).

// Tuned side by side with the Forbidden Stars miniatures: three flat bands, almost no glint,
// ink contours along every fold that turns away from the eye, a solid silhouette line.
export const TOON = { bands: 3, soft: 0.02, low: 0.45, spec: 0.1, specSize: 0.12, rim: 0, rimWidth: 0.24, contour: 0.32, contourSoft: 0.035 };
// outlinePx — silhouette thickness in screen pixels (kept constant while zooming, see keepOutline).
export const INK = { angle: 35, width: 5, color: [0.07, 0.07, 0.07], outline: 0.012, outlinePx: 2.2 };

class ToonPlugin extends BABYLON.MaterialPluginBase {
    constructor(material, cfg) {
        super(material, 'WitcherToon', 500, { WTOON: true }, true, true);
        this.cfg = cfg || TOON;
    }
    getClassName() { return 'WitcherToonPlugin'; }
    prepareDefines(defines) { defines.WTOON = true; }
    getUniforms() {
        return {
            ubo: [{ name: 'wToonA', size: 4, type: 'vec4' }, { name: 'wToonB', size: 4, type: 'vec4' }, { name: 'wToonC', size: 4, type: 'vec4' }],
            fragment: '#ifdef WTOON\nuniform vec4 wToonA;\nuniform vec4 wToonB;\nuniform vec4 wToonC;\n#endif',
        };
    }
    bindForSubMesh(ubo) {
        const c = this.cfg;
        ubo.updateFloat4('wToonA', c.bands, c.soft, c.low, c.spec);
        ubo.updateFloat4('wToonB', c.specSize, c.rim, c.rimWidth, 0);
        ubo.updateFloat4('wToonC', c.contour, c.contourSoft, 0, 0);
    }
    getCustomCode(shaderType) {
        if (shaderType !== 'fragment') return null;
        return {
            CUSTOM_FRAGMENT_DEFINITIONS: `
#ifdef WTOON
float wToonLevel(float v) {
    float bands = wToonA.x, lo = wToonA.z;
    float t = clamp((v - lo) / max(1e-4, 1.0 - lo), 0.0, 1.0);
    float x = t * (bands - 1.0);
    float k = floor(x + 0.5);
    float d = x - k;
    float s = max(1e-3, wToonA.y);
    float q = k + smoothstep(0.5 - s, 0.5 + s, d) - smoothstep(0.5 - s, 0.5 + s, -d);
    return lo + clamp(q / (bands - 1.0), 0.0, 1.0) * (1.0 - lo);
}
#endif
`,
            // Right after the light of all sources is summed (default.fragment).
            '!!aggShadow=aggShadow/numLights;': `$0
#ifdef WTOON
{
    float wV = max(diffuseBase.r, max(diffuseBase.g, diffuseBase.b));
    float wQ = wToonLevel(wV);
    diffuseBase = wV > 1e-4 ? diffuseBase * (wQ / wV) : vec3(wQ);
#ifdef SPECULARTERM
    float wS = max(specularBase.r, max(specularBase.g, specularBase.b));
    float wW = max(0.005, wToonA.y * 0.25);
    float wH = smoothstep(wToonB.x - wW, wToonB.x + wW, wS) * wToonA.w;
    specularBase = (wS > 1e-5 ? specularBase / wS : vec3(0.0)) * wH;
#endif
}
#endif
`,
            CUSTOM_FRAGMENT_BEFORE_FOG: `
#ifdef WTOON
if (wToonB.y > 0.0) {
    float wF = 1.0 - max(0.0, dot(normalW, viewDirectionW));
    float wE = 1.0 - wToonB.z;
    color.rgb += baseColor.rgb * smoothstep(wE - 0.05, wE + 0.05, wF) * wToonB.y;
}
// Ink contours: where the surface turns away from the eye (silhouettes and the inner
// occluding folds of arms, cloaks, muzzles) the colour goes to ink — the hand-drawn line
// of the Forbidden Stars miniatures, without needing hard creases in a smooth sculpt.
if (wToonC.x > 0.0) {
    float wN = abs(dot(normalW, viewDirectionW));
    color.rgb = mix(vec3(0.07), color.rgb, smoothstep(wToonC.x - wToonC.y, wToonC.x + wToonC.y, wN));
}
#endif
`,
        };
    }
}

/** A solid-colour toon material for a miniature. */
export function toonMaterial(scene, name, hex, cfg) {
    const m = new BABYLON.StandardMaterial(name, scene);
    m.diffuseColor = BABYLON.Color3.FromHexString(hex);
    m.specularColor = new BABYLON.Color3(1, 1, 1);
    m.specularPower = 40;
    if (BABYLON.MaterialPluginBase) m.wToon = new ToonPlugin(m, cfg ? Object.assign({}, TOON, cfg) : TOON);
    return m;
}

/**
 * Keep the silhouette outline at INK.outlinePx screen pixels for every listed mesh: Babylon's
 * outline is offset along the normals in model units, so it would thin out when zooming away.
 */
export function keepOutline(scene, camera, meshes) {
    const eng = scene.getEngine();
    scene.onBeforeRenderObservable.add(() => {
        const h = eng.getRenderHeight() || 1;
        const k = 2 * Math.tan(camera.fov / 2) / h;
        for (const m of meshes()) {
            if (!m || !m.renderOutline) continue;
            const d = BABYLON.Vector3.Distance(camera.globalPosition, m.getAbsolutePosition());
            m.outlineWidth = INK.outlinePx * d * k / Math.max(0.02, m.absoluteScaling ? m.absoluteScaling.y : 1);
        }
    });
}

/** Ink lines on creased edges plus a thin silhouette outline. */
export function inkMini(mesh, scale = 1, o = {}) {
    const ink = Object.assign({}, INK, o);
    mesh.enableEdgesRendering(Math.cos(ink.angle * Math.PI / 180), true);
    mesh.edgesWidth = ink.width;
    mesh.edgesColor = new BABYLON.Color4(INK.color[0], INK.color[1], INK.color[2], 1);
    mesh.renderOutline = true;
    mesh.outlineColor = new BABYLON.Color3(INK.color[0], INK.color[1], INK.color[2]);
    // outlineWidth is in mesh units: keep the on-screen thickness similar for any model scale.
    mesh.outlineWidth = ink.outline / Math.max(0.05, scale);
}
