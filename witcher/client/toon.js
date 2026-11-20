// Toon look of the miniatures — the Forbidden Stars (waha) rendering, copied from the kit:
// ArcToonPlugin of js/World3D.js (light bands + hard glint + rim light along the silhouette)
// and its ink edges (World3D.inkMesh: EdgesRenderer on edges creased sharper than the ink
// angle). Values are waha's js/Constants.js WORLD3D_TOON_*. As in waha (FSView.addMarker), the
// miniatures get NO silhouette outline — only the ink edges.
//
// The only conversion is the scale: the ink width of EdgesRenderer is in world units, waha's
// miniature is 27 world units tall with WORLD3D_TOON_INK_WIDTH = 20; ours are ~0.95.

export const TOON = { bands: 4, soft: 0.02, low: 0.48, spec: 0.25, specSize: 0.075, rim: 0.28, rimWidth: 0.24 };
const WAHA_MINI = 27, WAHA_INK_WIDTH = 20;
export const INK = { angle: 40, color: 0x171717, widthPerUnit: WAHA_INK_WIDTH / WAHA_MINI };

class ToonPlugin extends BABYLON.MaterialPluginBase {
    constructor(material, cfg) {
        super(material, 'ArcToon', 500, { ARCTOON: true }, true, true);
        this.cfg = cfg || TOON;
    }
    getClassName() { return 'ArcToonPlugin'; }
    prepareDefines(defines) { defines.ARCTOON = true; }
    getUniforms() {
        return {
            ubo: [{ name: 'arcToonA', size: 4, type: 'vec4' }, { name: 'arcToonB', size: 4, type: 'vec4' }],
            fragment: '#ifdef ARCTOON\nuniform vec4 arcToonA;\nuniform vec4 arcToonB;\n#endif',
        };
    }
    bindForSubMesh(ubo) {
        const c = this.cfg;
        ubo.updateFloat4('arcToonA', c.bands, c.soft, c.low, c.spec);
        ubo.updateFloat4('arcToonB', c.specSize, c.rim, c.rimWidth, 0);
    }
    getCustomCode(shaderType) { return shaderType === 'fragment' ? CODE : null; }
}

// Verbatim ArcToonPlugin.CODE (js/World3D.js) without the coloured-shadow part (ARCSHADOW
// needs the kit's lighting; the board keeps its own sun and shadow generator).
const CODE = {
    CUSTOM_FRAGMENT_DEFINITIONS: `
#ifdef ARCTOON
float arcToonLevel(float v) {
    float bands = arcToonA.x;
    float lo = arcToonA.z;
    float t = clamp((v - lo) / max(1e-4, 1.0 - lo), 0.0, 1.0);
    float x = t * (bands - 1.0);
    float k = floor(x + 0.5);
    float d = x - k;
    float s = max(1e-3, arcToonA.y);
    float q = k + smoothstep(0.5 - s, 0.5 + s, d) - smoothstep(0.5 - s, 0.5 + s, -d);
    return lo + clamp(q / (bands - 1.0), 0.0, 1.0) * (1.0 - lo);
}
#endif
`,
    '!!aggShadow=aggShadow/numLights;': `$0
#ifdef ARCTOON
if (arcToonA.x >= 1.5) {
    float arcV = max(diffuseBase.r, max(diffuseBase.g, diffuseBase.b));
    float arcQ = arcToonLevel(arcV);
    diffuseBase = arcV > 1e-4 ? diffuseBase * (arcQ / arcV) : vec3(arcQ);
#ifdef SPECULARTERM
    float arcS = max(specularBase.r, max(specularBase.g, specularBase.b));
    float arcW = max(0.005, arcToonA.y * 0.25);
    float arcH = smoothstep(arcToonB.x - arcW, arcToonB.x + arcW, arcS) * arcToonA.w;
    specularBase = (arcS > 1e-5 ? specularBase / arcS : vec3(0.0)) * arcH;
#endif
}
#endif
`,
    CUSTOM_FRAGMENT_BEFORE_FOG: `
#ifdef ARCTOON
if (arcToonB.y > 0.0) {
    float arcF = 1.0 - max(0.0, dot(normalW, viewDirectionW));
    float arcE = 1.0 - arcToonB.z;
    float arcR = smoothstep(arcE - 0.05, arcE + 0.05, arcF) * arcToonB.y;
    color.rgb += baseColor.rgb * arcR;
}
#endif
`,
};

/** A solid-colour toon material for a miniature. */
export function toonMaterial(scene, name, hex, cfg) {
    const m = new BABYLON.StandardMaterial(name, scene);
    m.diffuseColor = BABYLON.Color3.FromHexString(hex);
    m.specularColor = new BABYLON.Color3(0.34, 0.31, 0.25);
    m.specularPower = 36;
    if (BABYLON.MaterialPluginBase) m.arcToon = new ToonPlugin(m, cfg ? Object.assign({}, TOON, cfg) : TOON);
    return m;
}

/**
 * Ink edges as World3D.inkMesh does them: EdgesRenderer on creases sharper than INK.angle.
 * height — the miniature's height in world units (the width scales from waha's 27).
 */
export function inkMini(mesh, height = 1) {
    mesh.enableEdgesRendering(Math.cos(INK.angle * Math.PI / 180), true);
    mesh.edgesWidth = INK.widthPerUnit * height;
    const c = BABYLON.Color3.FromInts((INK.color >> 16) & 255, (INK.color >> 8) & 255, INK.color & 255);
    mesh.edgesColor = new BABYLON.Color4(c.r, c.g, c.b, 1);
}
