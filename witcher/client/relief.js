// Relief of the board (the nemesis approach: the board is built, not printed). A region of the
// Continent becomes a landscape: the plains swell into hills and the painted rivers are cut into
// them, the painted mountains rise (relief-height.mjs reads all heights from the painting itself),
// low-poly firs grow where the forest is painted, and what the artist drew on the map — castles,
// bridges, huts, a watchtower, ruins — stands there in 3D. The painted originals under them are
// painted over (inpaint) so nothing shows twice.
//
// One look for everything: the terrain, the buildings and the firs share the same toon lighting
// (BOARD_TOON, the flat board too, so the region has no seam) and the buildings are covered with a
// brushed stone texture in the painting's own blue-grey, without the ink edges of the miniatures —
// the board is painted, the miniatures are the plastic on it.
//
// The first region is Kaer Morhen (location 3) with Ban Ard (4) and the valley between them;
// more regions are entries of REGIONS. Pure presentation: no rule reads anything from here.
/* global BABYLON */
import { heightField, sample, isForest, inpaint, rockDetail, classify, markEllipses } from './relief-height.mjs';
import { toonMaterial } from './toon.js';

/** Lighting of everything painted on the board (soft bands, no hard glint, a faint rim). */
export const BOARD_TOON = { bands: 4, soft: 0.07, low: 0.5, spec: 0, specSize: 0.075, rim: 0.1, rimWidth: 0.2 };

/** Regions of continent.jpg (image pixels: 4096 × 3307) that are built in 3D. Angles are image
 *  angles in radians (0 = east, π/2 = south); a bridge's angle is the direction of its road. */
export const REGIONS = [{
    // ---- the north-east: Kaer Morhen (3), Ban Ard (4) and the valley between them -----------
    // Regions tile the board: their x0/y0 are aligned to the mesh step (3) so neighbours share their
    // edge vertices (Relief.stitch), and a side that another region continues has no falloff.
    id: 'kaer-morhen',
    px: [2901, 0, 1195, 901],              // x, y, width, height in image pixels
    step: 3,                               // pixels per grid cell of the terrain mesh
    maxH: 0.3,                             // the highest peak, world units (a miniature is 0.95)
    open: { top: true, right: true },      // sides that are the edge of the board
    noCopy: [{ x: 3762, y: 141, rx: 66, ry: 66 }],   // the Wolf school medallion: not a texture source
    holes: [{ x: 3668, y: 616, rx: 28, ry: 11, angle: -0.5 }],   // Ban Ard's painted causeway (built in 3D)
    buildings: [
        // foot — the radius of the building's plinth in its own units: the terrace is levelled under
        // all of it (r = foot · scale in pixels), on a spur falling by `mound` per pixel. Kaer
        // Morhen keeps clear of its name banner (y ≥ 296) and of the school medallion to the east.
        { kind: 'kaerMorhen', x: 3610, y: 215, foot: 0.46, footY: 0.44, h: 0.1, mound: 0.004, scale: 0.72, rot: 0, hole: { x: 3612, y: 207, rx: 94, ry: 88 } },
        { kind: 'banArd', x: 3742, y: 590, foot: 0.24, h: 0.12, scale: 1, rot: 0, hole: { x: 3740, y: 560, rx: 70, ry: 84 } },
    ],
    props: [
        { kind: 'bridge', stone: true, x: 3257, y: 369, angle: 0, len: 52, width: 24 },
        { kind: 'bridge', x: 3320, y: 477, angle: 1.93, len: 30, width: 16 },
        { kind: 'bridge', stone: true, x: 3372, y: 716, angle: -0.46, len: 52, width: 22 },
        { kind: 'bridge', x: 3127, y: 748, angle: 1.04, len: 32, width: 16 },
        { kind: 'bridge', stone: true, x: 3607, y: 567, angle: 0.98, len: 30, width: 14 },
        // the village in the valley
        { kind: 'hut', x: 3122, y: 668, rot: -0.25, size: 1 }, { kind: 'hut', x: 3148, y: 655, rot: -0.3, size: 0.9 },
        { kind: 'hut', x: 3190, y: 649, rot: 0.1, size: 0.9, round: true }, { kind: 'hut', x: 3177, y: 697, rot: -0.2, size: 1.15 },
        { kind: 'hut', x: 3209, y: 694, rot: -0.35, size: 1 }, { kind: 'hut', x: 3257, y: 677, rot: -0.3, size: 1 },
        { kind: 'hut', x: 3239, y: 690, rot: -0.15, size: 0.85 },
        // a farmstead, the huts under Ban Ard, the hut by the ruins
        { kind: 'house', x: 3447, y: 575, rot: 0.05 },
        { kind: 'hut', x: 3665, y: 596, rot: 0.2, size: 0.9 }, { kind: 'hut', x: 3708, y: 641, rot: -0.2, size: 1 },
        // the farms round Ban Ard: fields with farmhouses
        { kind: 'field', x: 3645, y: 545, w: 34, d: 20, angle: -0.3 }, { kind: 'field', x: 3606, y: 556, w: 26, d: 18, angle: 0.25, crop: 'fieldGreen' },
        { kind: 'field', x: 3586, y: 616, w: 30, d: 18, angle: 0.2 }, { kind: 'field', x: 3556, y: 536, w: 28, d: 18, angle: 0.45, crop: 'fieldGreen' },
        { kind: 'field', x: 3762, y: 655, w: 28, d: 12, angle: 0, crop: 'fieldGreen' }, { kind: 'field', x: 3672, y: 655, w: 22, d: 12, angle: -0.1 },
        { kind: 'hut', x: 3626, y: 566, rot: -0.3, size: 0.85, roof: 'roofBrown' }, { kind: 'hut', x: 3604, y: 600, rot: 0.2, size: 0.8, roof: 'roofBrown' },
        { kind: 'hut', x: 3738, y: 650, rot: 0.1, size: 0.85, roof: 'roofBrown' }, { kind: 'hut', x: 3690, y: 648, rot: -0.3, size: 0.75, roof: 'roofBrown' },
        { kind: 'hut', x: 3099, y: 392, rot: 0.3, size: 0.8 },
        { kind: 'ruin', x: 3121, y: 370 },
        { kind: 'watchtower', x: 3281, y: 872, hole: { x: 3281, y: 852, rx: 17, ry: 38 } },
    ],
}, {
    // ---- the north: Hengfors (2), Vizima (7), Haern Caduch (10) ----------------------------
    id: 'north',
    px: [1950, 0, 952, 2200],
    step: 3, maxH: 0.3,
    open: { top: true },
    noCopy: [{ x: 2533, y: 1747, rx: 64, ry: 64 }],   // the Bear school medallion
    holes: [{ x: 1966, y: 868, rx: 24, ry: 72 }],      // the east edge of Novigrad (built with the west)
    buildings: [
        // the painted road from the south stays visible: it runs under the bridge between the two holes
        { kind: 'hengfors', x: 2490, y: 375, foot: 0.5, footY: 0.44, h: 0.065, scale: 0.75, rot: 0,
            hole: [{ x: 2442, y: 365, rx: 58, ry: 86 }, { x: 2566, y: 375, rx: 46, ry: 62 }, { x: 2512, y: 334, rx: 30, ry: 26 }] },
        // Vizima spreads along its river: an elliptical terrace barely above the plain
        { kind: 'vizima', x: 2338, y: 906, foot: 0.64, footY: 0.39, h: 0.05, scale: 0.8, rot: 0, hole: { x: 2338, y: 904, rx: 136, ry: 78 } },
        { kind: 'haernCaduch', x: 2395, y: 1798, foot: 0.43, footY: 0.4, h: 0.07, mound: 0.003, scale: 0.78, rot: 0, hole: { x: 2397, y: 1793, rx: 85, ry: 101 } },
    ],
    props: [
        { kind: 'bridge', x: 2075, y: 680, angle: 1.04, len: 24, width: 14 },
        { kind: 'bridge', x: 2400, y: 760, angle: -0.86, len: 26, width: 14 },
        { kind: 'bridge', stone: true, x: 2480, y: 810, angle: -0.37, len: 40, width: 14 },
        { kind: 'bridge', x: 2227, y: 1230, angle: 1.35, len: 22, width: 14 },
        { kind: 'bridge', stone: true, x: 2305, y: 1285, angle: 0.62, len: 36, width: 16 },
        { kind: 'bridge', stone: true, x: 2571, y: 1177, angle: 0.36, len: 50, width: 14 },
        { kind: 'rocks', x: 2185, y: 674, size: 1.3 }, { kind: 'rocks', x: 2560, y: 733, size: 1.3 }, { kind: 'rocks', x: 2085, y: 895, size: 1 },
        // the village under the mountains of Haern Caduch, lone huts
        { kind: 'hut', x: 2298, y: 1437, rot: -0.3, size: 1.1, roof: 'roofRed' }, { kind: 'hut', x: 2278, y: 1452, rot: -0.2, size: 1, roof: 'roofRed' },
        { kind: 'hut', x: 2258, y: 1474, rot: -0.35, size: 1.05, roof: 'roofRed' }, { kind: 'hut', x: 2347, y: 1449, rot: 0.1, size: 1.15, roof: 'roofRed' },
        { kind: 'hut', x: 2357, y: 1497, rot: -0.15, size: 1.25, roof: 'roofRed' }, { kind: 'hut', x: 2322, y: 1486, rot: -0.4, size: 1, roof: 'roofRed' },
        { kind: 'hut', x: 2750, y: 1890, rot: 0.1, size: 1 }, { kind: 'hut', x: 2730, y: 1380, rot: -0.1, size: 1.25 },
    ],
}, {
    // ---- the east: Vengerberg (8), Bechelt Nar (0), Beauclair (11) -------------------------
    id: 'east',
    px: [2901, 900, 1195, 1300],
    step: 3, maxH: 0.3,
    open: { right: true },
    noCopy: [{ x: 3716, y: 1576, rx: 64, ry: 64 }],   // the medallion by Bechelt Nar
    buildings: [
        { kind: 'vengerberg', x: 3497, y: 1022, foot: 0.44, h: 0.07, scale: 0.75, rot: 0, hole: { x: 3503, y: 1022, rx: 102, ry: 98 } },
        { kind: 'becheltNar', x: 3890, y: 1548, foot: 0.4, h: 0.09, scale: 0.8, rot: 0, hole: { x: 3888, y: 1548, rx: 95, ry: 100 } },
        { kind: 'beauclair', x: 3378, y: 1820, foot: 0.48, footY: 0.5, h: 0.12, scale: 0.8, rot: 0, hole: { x: 3385, y: 1815, rx: 100, ry: 118 } },
    ],
    props: [
        { kind: 'bridge', x: 3399, y: 1502, angle: 0.56, len: 30, width: 14 },
        { kind: 'hut', x: 3410, y: 1330, rot: -0.1, size: 1 }, { kind: 'hut', x: 3378, y: 1312, rot: 0.15, size: 0.9 },
        { kind: 'house', x: 3862, y: 1304, rot: 0.2 },
        { kind: 'hut', x: 3462, y: 1468, rot: 0, size: 1.1 },
        { kind: 'hall', x: 3789, y: 1649, rot: 0.1 }, { kind: 'hall', x: 3925, y: 1668, rot: -0.15, size: 0.85 },
        { kind: 'watchtower', x: 3000, y: 1592, roof: 'lilac', hole: { x: 3000, y: 1560, rx: 16, ry: 46 } },
    ],
}, {
    // ---- the west: Kaer Seren (1), Novigrad (6), Cidaris (5), Cintra (9) ---------------------
    id: 'west',
    px: [1251, 0, 700, 2200],
    step: 3, maxH: 0.3,
    open: { top: true },
    noCopy: [{ x: 1447, y: 345, rx: 62, ry: 62 }],   // the Griffin school medallion
    // the sea west of the coast (Kaer Seren's bay, Novigrad's and Cidaris's harbours, Cintra's bay)
    sea: [[[1251, 480], [1330, 505], [1400, 515], [1480, 520], [1560, 530], [1650, 545], [1700, 560], [1760, 600], [1760, 690], [1732, 720], [1728, 800], [1730, 880],
        [1740, 960], [1720, 1020], [1640, 1040], [1560, 1042], [1480, 1045], [1400, 1050], [1330, 1075], [1300, 1110], [1290, 1160], [1300, 1180], [1310, 1290],
        [1400, 1345], [1440, 1420], [1440, 1480], [1436, 1560], [1426, 1640], [1405, 1720], [1430, 1800], [1465, 1900], [1500, 2000], [1560, 2080], [1590, 2150], [1596, 2205], [1251, 2205]]],
    buildings: [
        { kind: 'kaerSeren', x: 1580, y: 442, foot: 0.4, footY: 0.3, h: 0.07, scale: 0.8, rot: 0, hole: [{ x: 1592, y: 432, rx: 96, ry: 76 }, { x: 1512, y: 470, rx: 34, ry: 38 }] },
        { kind: 'novigrad', x: 1838, y: 820, foot: 0.58, footY: 0.5, h: 0.055, scale: 0.8, rot: 0, hole: [{ x: 1846, y: 800, rx: 118, ry: 116 }, { x: 1872, y: 914, rx: 92, ry: 24 }] },
        { kind: 'cidaris', x: 1430, y: 1095, foot: 0.52, footY: 0.32, h: 0.05, scale: 0.8, rot: 0, hole: [{ x: 1442, y: 1092, rx: 128, ry: 70 }, { x: 1316, y: 1056, rx: 32, ry: 28 }] },
        { kind: 'glenmore', x: 1755, y: 2170, foot: 0.45, footY: 0.3, h: 0.05, scale: 0.8, rot: 0, hole: { x: 1756, y: 2160, rx: 124, ry: 84 } },
        { kind: 'cintra', x: 1555, y: 1585, foot: 0.62, footY: 0.34, h: 0.05, scale: 0.8, rot: 0, hole: [{ x: 1556, y: 1588, rx: 134, ry: 74 }, { x: 1612, y: 1666, rx: 56, ry: 18 }] },
    ],
    props: [],
}, {
    // ---- the south-west: Doldet (13), Lok Ihor (14), Duvod (16) --------------------------------
    id: 'south-west',
    px: [1251, 2199, 1651, 1108],
    step: 3, maxH: 0.3,
    open: { bottom: true },
    holes: [{ x: 1756, y: 2216, rx: 110, ry: 30 }],   // the foot of Glenmore (built with the west)
    sea: [[[1251, 2195], [1596, 2195], [1586, 2260], [1590, 2380], [1610, 2480], [1600, 2560], [1590, 2640], [1615, 2720], [1630, 2800], [1640, 2880],
        [1660, 2960], [1700, 3040], [1760, 3120], [1830, 3200], [1880, 3307], [1251, 3307]]],
    buildings: [
        { kind: 'doldet', x: 1810, y: 2705, foot: 0.48, footY: 0.3, h: 0.07, mound: 0.003, scale: 0.8, rot: 0, hole: { x: 1810, y: 2690, rx: 110, ry: 90 } },
        { kind: 'lokIhor', x: 2665, y: 2545, foot: 0.5, footY: 0.28, h: 0.05, scale: 0.8, rot: 0, hole: { x: 2662, y: 2535, rx: 118, ry: 82 } },
        { kind: 'duvod', x: 2080, y: 3046, foot: 0.45, footY: 0.32, h: 0.05, scale: 0.8, rot: 0, hole: { x: 2078, y: 3040, rx: 112, ry: 88 } },
    ],
    props: [
        { kind: 'bridge', stone: true, x: 2600, y: 2460, angle: 0.8, len: 34, width: 16 },
        { kind: 'bridge', stone: true, x: 2155, y: 2530, angle: 0, len: 30, width: 16 },
        { kind: 'hut', x: 2190, y: 2350, rot: -0.2, size: 1 }, { kind: 'hut', x: 2216, y: 2340, rot: 0.1, size: 0.9 }, { kind: 'hut', x: 2242, y: 2356, rot: -0.3, size: 1 },
        { kind: 'hut', x: 2206, y: 2376, rot: 0.2, size: 0.9 },
        { kind: 'hut', x: 2160, y: 2770, rot: 0.1, size: 1 }, { kind: 'hut', x: 2186, y: 2760, rot: -0.2, size: 0.9 }, { kind: 'hut', x: 2212, y: 2776, rot: 0.2, size: 1 },
        { kind: 'hut', x: 2236, y: 2764, rot: -0.1, size: 0.85 },
        { kind: 'ruin', x: 2352, y: 2948 },
        { kind: 'house', x: 2466, y: 2892, rot: 0.1 }, { kind: 'house', x: 2740, y: 2372, rot: -0.1 },
    ],
}, {
    // ---- the south-east: Gorthur Gvaed (15), Stygga (17), Ard Modron (18) -----------------------
    id: 'south-east',
    px: [2901, 2199, 1195, 1108],
    step: 3, maxH: 0.3,
    open: { right: true, bottom: true },
    noCopy: [{ x: 3944, y: 2312, rx: 44, ry: 44 }, { x: 3162, y: 2930, rx: 50, ry: 50 }],   // the Viper and Cat school medallions
    sea: [[[3688, 2384], [3736, 2362], [3790, 2368], [3802, 2420], [3792, 2470], [3730, 2476], [3690, 2444]]],   // Gorthur Gvaed's lake
    buildings: [
        { kind: 'gorthurGvaed', x: 3850, y: 2440, foot: 0.5, footY: 0.24, h: 0.05, scale: 0.8, rot: 0, hole: { x: 3852, y: 2430, rx: 108, ry: 72 } },
        { kind: 'stygga', x: 3030, y: 3008, foot: 0.48, footY: 0.26, h: 0.06, scale: 0.8, rot: 0, hole: { x: 3026, y: 2992, rx: 100, ry: 70 } },
        { kind: 'ardModron', x: 3752, y: 3060, foot: 0.5, footY: 0.3, h: 0.07, mound: 0.003, scale: 0.8, rot: 0, hole: { x: 3752, y: 3060, rx: 116, ry: 76 } },
    ],
    props: [
        { kind: 'bridge', x: 3642, y: 2972, angle: -1.0, len: 30, width: 14 },
        { kind: 'bridge', x: 3444, y: 2320, angle: 0.8, len: 28, width: 14 },
        { kind: 'hut', x: 3085, y: 2235, rot: -0.2, size: 1 }, { kind: 'hut', x: 3115, y: 2255, rot: 0.1, size: 0.9 }, { kind: 'hut', x: 3150, y: 2240, rot: -0.3, size: 1 },
        { kind: 'hut', x: 3100, y: 2285, rot: 0.2, size: 0.9 }, { kind: 'hut', x: 3135, y: 2280, rot: -0.1, size: 0.85 },
        { kind: 'hut', x: 3442, y: 2912, rot: 0.1, size: 1 }, { kind: 'hut', x: 3480, y: 2940, rot: -0.2, size: 0.9 }, { kind: 'hut', x: 3512, y: 2930, rot: 0.2, size: 1 },
        { kind: 'hut', x: 3462, y: 2952, rot: -0.1, size: 0.85 },
        { kind: 'watchtower', x: 3008, y: 2405, hole: { x: 3008, y: 2390, rx: 16, ry: 34 } },
    ],
}, {
    // ---- Skellige: Ard Skellig (19), the Isle of Mists (20), Eyna (21) — islands in the sea ----
    id: 'skellige',
    px: [150, 1520, 720, 1460],
    step: 3, maxH: 0.3,
    sea: [[[140, 1510], [880, 1510], [880, 2990], [140, 2990]]],
    land: [
        [[360, 1660], [400, 1615], [440, 1580], [480, 1564], [540, 1570], [600, 1576], [660, 1600], [700, 1640], [725, 1700], [730, 1770], [715, 1840], [680, 1880], [600, 1895], [520, 1895], [450, 1880], [400, 1850], [370, 1800], [355, 1730]],
        [[245, 1580], [280, 1555], [330, 1555], [360, 1580], [340, 1612], [280, 1617], [250, 1605]],
        [[228, 1800], [260, 1772], [310, 1775], [338, 1810], [335, 1860], [300, 1884], [255, 1875], [230, 1840]],
        [[790, 1700], [830, 1690], [865, 1710], [868, 1760], [830, 1780], [795, 1765]],
        [[290, 2120], [320, 2085], [345, 2075], [365, 2100], [370, 2140], [365, 2180], [352, 2210], [372, 2230], [400, 2245], [400, 2262], [370, 2264], [330, 2256], [290, 2240], [275, 2210], [270, 2170], [280, 2140]],
        [[630, 2725], [660, 2710], [700, 2715], [730, 2730], [760, 2770], [775, 2810], [760, 2860], [740, 2900], [700, 2930], [650, 2945], [600, 2950], [560, 2945], [540, 2920], [535, 2870], [545, 2830], [570, 2805], [600, 2790], [620, 2760]],
    ],
    buildings: [],
    props: [
        // Ard Skellig: long houses where the painting has them, in the green valleys between the snowy peaks
        { kind: 'longhouse', x: 525, y: 1631, rot: 0.2, size: 0.8 }, { kind: 'longhouse', x: 531, y: 1649, rot: -0.1, size: 0.75 },
        { kind: 'longhouse', x: 560, y: 1714, rot: 0.4, size: 0.85 }, { kind: 'longhouse', x: 562, y: 1733, rot: -0.2, size: 0.8 },
        { kind: 'longhouse', x: 532, y: 1743, rot: 0.3, size: 0.85 }, { kind: 'longhouse', x: 503, y: 1757, rot: -0.3, size: 0.8 },
        { kind: 'longhouse', x: 422, y: 1763, rot: 0.1, size: 0.8 }, { kind: 'longhouse', x: 672, y: 1752, rot: -0.4, size: 0.75 },
        { kind: 'longhouse', x: 572, y: 1847, rot: 0.3, size: 0.75 }, { kind: 'longhouse', x: 554, y: 1861, rot: -0.2, size: 0.7 },
        { kind: 'ruin', x: 486, y: 1584 },
        // the Isle of Mists: a few huts and pale ruins in the valley
        { kind: 'longhouse', x: 345, y: 2150, rot: 0.2, size: 0.8 }, { kind: 'longhouse', x: 352, y: 2176, rot: -0.3, size: 0.8 }, { kind: 'longhouse', x: 320, y: 2196, rot: 0.5, size: 0.75 },
        { kind: 'ruin', x: 336, y: 2210 },
        // Eyna: the village of pale long houses, the standing stones
        { kind: 'longhouse', x: 690, y: 2790, rot: 0.1, stone: true }, { kind: 'longhouse', x: 718, y: 2804, rot: -0.2, stone: true }, { kind: 'longhouse', x: 650, y: 2816, rot: 0.3, stone: true },
        { kind: 'longhouse', x: 662, y: 2842, rot: -0.1, stone: true }, { kind: 'longhouse', x: 692, y: 2850, rot: 0.2, stone: true }, { kind: 'longhouse', x: 722, y: 2842, rot: -0.3, stone: true },
        { kind: 'longhouse', x: 680, y: 2866, rot: 0.4, stone: true, size: 0.85 },
        { kind: 'menhirs', x: 612, y: 2910, n: 6 },
    ],
}];

/**
 * Sharp rock on the terrain's faces. The painting is laid on the terrain from above, so on a steep
 * face a pixel of it covers a long strip and blurs into streaks. Over those faces (and, fainter,
 * over all high ground) this plugin multiplies the painting by painted rock — rockDetail sampled in
 * world space on the three axis planes (triplanar: it is never stretched), in two scales. The
 * painting still gives the colour and the big shapes; the rock gives the surface something sharp.
 * A: (tile scale per world unit, strength, steepness from, steepness to); B: (high ground from,
 * high ground to, strength there, —).
 */
export const ROCK = { scale: 2.6, strength: 0.85, steepFrom: 0.22, steepTo: 0.55, highFrom: 0.1, highTo: 0.22, high: 0.45 };
class RockPlugin extends BABYLON.MaterialPluginBase {
    constructor(material, tex, cfg = ROCK) {
        super(material, 'ReliefRock', 210, { RELIEFROCK: false }, true, true);
        this.tex = tex; this.cfg = cfg;
    }
    getClassName() { return 'ReliefRockPlugin'; }
    prepareDefines(defines) { defines.RELIEFROCK = true; }
    isReadyForSubMesh() { return this.tex.isReady(); }
    getSamplers(samplers) { samplers.push('reliefRockSampler'); }
    getUniforms() {
        return {
            ubo: [{ name: 'reliefRockA', size: 4, type: 'vec4' }, { name: 'reliefRockB', size: 4, type: 'vec4' }],
            fragment: '#ifdef RELIEFROCK\nuniform vec4 reliefRockA;\nuniform vec4 reliefRockB;\n#endif',
        };
    }
    bindForSubMesh(ubo) {
        const c = this.cfg;
        ubo.updateFloat4('reliefRockA', c.scale, c.strength, c.steepFrom, c.steepTo);
        ubo.updateFloat4('reliefRockB', c.highFrom, c.highTo, c.high, 0);
        ubo.setTexture('reliefRockSampler', this.tex);
    }
    getCustomCode(shaderType) {
        if (shaderType !== 'fragment') return null;
        return {
            CUSTOM_FRAGMENT_DEFINITIONS: `
#ifdef RELIEFROCK
uniform sampler2D reliefRockSampler;
float reliefRockAt(vec3 p, vec3 bw) {
    return texture2D(reliefRockSampler, p.zy).r * bw.x + texture2D(reliefRockSampler, p.xz).r * bw.y + texture2D(reliefRockSampler, p.xy).r * bw.z;
}
#endif
`,
            CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
#ifdef RELIEFROCK
{
    vec3 rn = normalize(vNormalW);
    float steep = 1.0 - abs(rn.y);
    float rk = max(smoothstep(reliefRockA.z, reliefRockA.w, steep) * reliefRockA.y,
                   smoothstep(reliefRockB.x, reliefRockB.y, vPositionW.y) * reliefRockB.z);
    if (rk > 0.002) {
        vec3 bw = pow(abs(rn), vec3(4.0));
        bw /= (bw.x + bw.y + bw.z);
        vec3 p = vPositionW * reliefRockA.x;
        float d = reliefRockAt(p, bw) * 0.6 + reliefRockAt(p * 2.7 + 0.37, bw) * 0.4;
        baseColor.rgb *= mix(1.0, 0.45 + d * 1.1, rk);
    }
}
#endif
`,
        };
    }
}

/** Is (x, y) inside the polygon [[x, y]…] (any units)? */
function inPoly(pts, x, y) {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
}

/** Image-pixel size → world size (the map plane is 16 wide over 4096 pixels). */
const PX = 16 / 4096;
/** The terrace radius of a building, image pixels. */
export const footPx = (b) => b.foot * b.scale / PX;

export class Relief {
    /**
     * @param {BABYLON.Scene} scene
     * @param {BABYLON.ShadowGenerator} shadows
     * @param {{ mapW: number, mapH: number, url: string, pins: number[][] }} o  pins — image pixels
     *   of every location badge (their plates and miniature spots are kept level)
     */
    constructor(scene, shadows, o) {
        this.scene = scene; this.shadows = shadows; this.o = o;
        this.parts = [];   // { reg, field, w, h }
        this.meshes = []; this.buildings = {};
        this.ready = this.load().catch((e) => { console.error('relief', e); this.error = String(e && e.stack || e); });
    }

    async load() {
        const img = new Image();
        img.src = this.o.url;
        await img.decode();
        this.imgW = img.naturalWidth; this.imgH = img.naturalHeight;
        this.mats = this.makeMaterials();
        // courtyard floors lie just over the levelled terrace: drawn in front of it at any depth precision
        for (const f of ['yard', 'vengGrass', 'hengGrass']) this.mats[f].zOffset = -2;
        // heights and painting-over of all regions in parallel; then built one by one, each
        // stitched to the ones before it
        const lanes = Math.max(1, Math.min(REGIONS.length, (navigator.hardwareConcurrency || 2) - 1));
        const preps = REGIONS.map((reg, i) => this.prepareRegion(img, reg, i % lanes));
        for (const p of preps) this.buildRegion(await p);
        for (const wk of this.workers || []) if (wk) wk.terminate();
        this.workers = null;
    }

    /** Image pixel -> world (the map plane spans the whole image). */
    world(ix, iy, y = 0) {
        return new BABYLON.Vector3((ix / this.imgW - 0.5) * this.o.mapW, y, (0.5 - iy / this.imgH) * this.o.mapH);
    }
    /** World -> image pixel. */
    pixel(x, z) {
        return [(x / this.o.mapW + 0.5) * this.imgW, (0.5 - z / this.o.mapH) * this.imgH];
    }
    /** Terrain height at a world point (0 on the flat board). */
    heightAt(x, z) {
        const [ix, iy] = this.pixel(x, z);
        return this.heightPx(ix, iy);
    }
    /** Terrain height at an image pixel. */
    heightPx(ix, iy) {
        for (const p of this.parts) {
            const lx = ix - p.reg.px[0], ly = iy - p.reg.px[1];
            if (lx >= 0 && ly >= 0 && lx <= p.w - 1 && ly <= p.h - 1) return sample(p.field, p.w, p.h, lx, ly);
        }
        return 0;
    }

    // ---------------------------------------------------------------------------------------
    // Materials: one toon lighting, a brushed texture in the painting's colours
    // ---------------------------------------------------------------------------------------
    makeMaterials() {
        const S = this.scene;
        // Brushed stone: short strokes of lighter and darker grey over a light base, faint courses
        // of masonry — the way the board painter draws a castle wall. Multiplied by each colour.
        const tex = new BABYLON.DynamicTexture('reliefStone', { width: 256, height: 256 }, S, true);
        const g = tex.getContext();
        g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, 256, 256);
        let seed = 3;
        const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
        for (let i = 0; i < 900; i++) {
            const v = 175 + Math.floor(rnd() * 80);
            g.strokeStyle = `rgba(${v},${v},${v + 6},0.55)`; g.lineWidth = 2 + rnd() * 5; g.lineCap = 'round';
            const x = rnd() * 256, y = rnd() * 256, l = 6 + rnd() * 18, a = (rnd() - 0.5) * 0.6;
            g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
        }
        g.strokeStyle = 'rgba(90,90,100,0.28)'; g.lineWidth = 2;
        for (let y = 16; y < 256; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
        tex.update();
        tex.wrapU = tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
        this.stoneTex = tex;
        // Painted rock (rockDetail: facets, cracks, grain) — the terrain's steep faces and the plinths
        const R = 256, rock = rockDetail(R), rt = new BABYLON.DynamicTexture('reliefRock', { width: R, height: R }, S, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
        const rg = rt.getContext(), rid = rg.createImageData(R, R);
        for (let i = 0; i < R * R; i++) { rid.data[i * 4] = rid.data[i * 4 + 1] = rid.data[i * 4 + 2] = rock[i]; rid.data[i * 4 + 3] = 255; }
        rg.putImageData(rid, 0, 0);
        rt.update();
        rt.wrapU = rt.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
        rt.anisotropicFilteringLevel = 8;
        this.rockTex = rt;
        // furrows: light and dark stripes along a field
        const fieldTex = new BABYLON.DynamicTexture('reliefField', { width: 64, height: 64 }, S, true);
        const fg = fieldTex.getContext();
        fg.fillStyle = '#e8e8e8'; fg.fillRect(0, 0, 64, 64);
        for (let i = 0; i < 8; i++) { fg.fillStyle = 'rgba(70,60,40,0.35)'; fg.fillRect(i * 8, 0, 3, 64); }
        fg.strokeStyle = 'rgba(60,50,30,0.6)'; fg.lineWidth = 2; fg.strokeRect(1, 1, 62, 62);
        fieldTex.update();
        const mk = (name, hex, textured = true) => {
            const m = toonMaterial(S, 'rl_' + name, hex, BOARD_TOON);
            m.specularColor = new BABYLON.Color3(0, 0, 0);
            if (textured) m.diffuseTexture = tex;
            return m;
        };
        // colours sampled from the painting: the light blue-grey of the painted castles, the dark
        // slate of Ban Ard's roofs, the straw and timber of the huts
        return {
            wall: mk('wall', '#b9bccb'), tower: mk('tower', '#a9adbd'), keep: mk('keep', '#c3c3c8'),
            slate: mk('slate', '#565b6b'), dark: mk('dark', '#24252d', false), wood: mk('wood', '#6b4a30'),
            cloth: mk('cloth', '#8f2a22', false), road: mk('road', '#a39274'),
            white: mk('white', '#d6d3cb'), ruin: mk('ruin', '#9a988f'), roofBrown: mk('roofBrown', '#5a4136'),
            plaster: mk('plaster', '#cdbb94'), timber: mk('timber', '#7a5a3c'), thatch: mk('thatch', '#9a7442'),
            plank: mk('plank', '#8a6644'), yard: mk('yard', '#b3a68c'),
            // the other cities: Vengerberg's blue roofs, Beauclair's terracotta, Bechelt Nar's brown
            // stone, the red shingles of the villages, the mage's lilac, a grassy bastion
            roofBlue: mk('roofBlue', '#2b7aa3'), terracotta: mk('terracotta', '#d27e66'), roofRed: mk('roofRed', '#8c5246'),
            brownStone: mk('brownStone', '#80604c'), darkRoof: mk('darkRoof', '#56433b'), lilac: mk('lilac', '#8b6bb0'),
            grass: mk('grass', '#6f8a4a'), pale: mk('pale', '#d9d6cc'), leaf: mk('leaf', '#2f4f2c', false),
            // each city in its own colours, sampled from its painting (lit side, brightened the way
            // the approved Kaer Morhen stone is: painted #8e8fa1 -> #b9bccb)
            hengStone: mk('hengStone', '#b4c4cb'), hengWall: mk('hengWall', '#9eadb6'), hengGrass: mk('hengGrass', '#94a265'),
            vizTower: mk('vizTower', '#b3a9b2'), vizKeep: mk('vizKeep', '#d2cac8'), vizRoof: mk('vizRoof', '#4d6a7e'), vizPlaster: mk('vizPlaster', '#d8d0c8'),
            hcStone: mk('hcStone', '#dcdeee'),
            vengWall: mk('vengWall', '#d2cfcc'), vengGrass: mk('vengGrass', '#4f6e3c'),
            bnStone: mk('bnStone', '#ad866b'), bnDark: mk('bnDark', '#7a5641'),
            beauWhite: mk('beauWhite', '#e6e6e3'),
            // the west: Kaer Seren's grim grey, Novigrad's and Cidaris's red roofs, Cintra's white wall and dark spires
            ksStone: mk('ksStone', '#a2a5b0'), novWall: mk('novWall', '#ddd0c2'), novRoof: mk('novRoof', '#9c4a52'),
            cidWall: mk('cidWall', '#e3d9c6'), cidRoof: mk('cidRoof', '#94433d'), cinWall: mk('cinWall', '#dad6cc'), cinRoof: mk('cinRoof', '#a64e56'),
            spire: mk('spire', '#4e4352'), sail: mk('sail', '#ece6d4', false),
            // the south: Glenmore's white gables, Doldet's light stone, Lok Ihor's pink-white manor and grey straw,
            // Duvod's pale straw, Gorthur Gvaed's grey, Stygga's warm pink and burgundy, Ard Modron's dark wood
            glWall: mk('glWall', '#e4ddd0'), glRoof: mk('glRoof', '#8e5544'), glStone: mk('glStone', '#a3a3a6'), doStone: mk('doStone', '#cfcfd2'),
            liWhite: mk('liWhite', '#ecdedb'), liRoof: mk('liRoof', '#b0513f'), liThatch: mk('liThatch', '#a59c88'), duStone: mk('duStone', '#a19c95'),
            duThatch: mk('duThatch', '#d2c398'), ggStone: mk('ggStone', '#aaa9a5'), stStone: mk('stStone', '#e4d0c9'), stRoof: mk('stRoof', '#8e3f4b'),
            amWood: mk('amWood', '#5d4838'), amRoof: mk('amRoof', '#4b403a'),
            smoke: (() => { const m = mk('smoke', '#d9d9d6', false); m.alpha = 0.6; return m; })(),
            // fields round the farms: ripe and green, furrowed (fieldTex)
            fieldWheat: (() => { const m = mk('fieldWheat', '#c2b062', false); m.diffuseTexture = fieldTex; return m; })(),
            fieldGreen: (() => { const m = mk('fieldGreen', '#8fa452', false); m.diffuseTexture = fieldTex; return m; })(),
            rock: (() => { const m = mk('rock', '#a4adbf'); m.diffuseTexture = rt; rt.uScale = 3; rt.level = 1.65; return m; })(),
        };
    }

    // ---------------------------------------------------------------------------------------
    // A region: terrain, firs, buildings, props
    // ---------------------------------------------------------------------------------------
    /** Runs a pure relief job (relief-worker.mjs) off the main thread — on worker `lane` (one per
     *  region, so the regions are computed in parallel); inline if workers are unavailable. */
    job(op, a, transfer, lane = 0) {
        const inline = () => {
            if (op === 'field') return heightField(a.rgba, a.w, a.h, a.opt);
            inpaint(a.px, a.w, a.h, a.mask, a.iters, { avoid: a.avoid });
            return a.px;
        };
        this.workers = this.workers || [];
        if (this.workers[lane] === undefined) {
            try {
                const wk = new Worker(new URL('./relief-worker.mjs', import.meta.url), { type: 'module' });
                wk.jobs = new Map();
                wk.onmessage = (e) => { const j = wk.jobs.get(e.data.id); wk.jobs.delete(e.data.id); if (e.data.error) j.reject(new Error(e.data.error)); else j.resolve(e.data.out); };
                wk.onerror = (e) => { console.warn('relief worker', e.message); for (const j of wk.jobs.values()) j.retry(); wk.jobs.clear(); this.workers[lane] = null; };
                this.workers[lane] = wk;
            } catch (e) { this.workers[lane] = null; }
        }
        const wk = this.workers[lane];
        if (!wk) return Promise.resolve(inline());
        return new Promise((resolve, reject) => {
            const id = (this.jobId = (this.jobId || 0) + 1);
            wk.jobs.set(id, { resolve, reject, retry: () => { try { resolve(inline()); } catch (e) { reject(e); } } });
            wk.postMessage({ id, op, a }, transfer);
        });
    }

    /** How each side of a region meets the rest: 'board' (the edge of the board), 'shared'
     *  (other regions continue it over its whole length) or 'fall' (it sinks into the flat board). */
    sidesOf(reg) {
        const [x0, y0, w, h] = reg.px, x1 = x0 + w - 1, y1 = y0 + h - 1;
        const others = REGIONS.filter(r => r !== reg).map(r => [r.px[0], r.px[1], r.px[0] + r.px[2] - 1, r.px[1] + r.px[3] - 1]);
        // a side is shared when every point of it lies on (the first row/column of) another region
        const covered = (pts) => pts.every(([x, y]) => others.some(([a0, b0, a1, b1]) => x >= a0 && x <= a1 && y >= b0 && y <= b1));
        const line = (ax, ay, bx, by) => { const out = []; const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay)); for (let i = 0; i <= n; i += 7) out.push([Math.round(ax + (bx - ax) * i / n), Math.round(ay + (by - ay) * i / n)]); out.push([bx, by]); return out; };
        const open = reg.open || {}, side = (name, pts) => (open[name] ? 'board' : covered(pts) ? 'shared' : 'fall');
        return {
            left: side('left', line(x0, y0, x0, y1)), right: side('right', line(x1, y0, x1, y1)),
            top: side('top', line(x0, y0, x1, y0)), bottom: side('bottom', line(x0, y1, x1, y1)),
        };
    }

    /** Level zones of every location: the badge with the miniatures' spot above it and the name
     *  banner (to the left of the badge; to the right where the board has it there). */
    flatZones() {
        const out = [];
        for (const [bx, by, right] of this.o.pins) {
            out.push({ x: bx, y: by - 60, rx: 110, ry: 110 }, { x: right ? bx + 185 : bx - 185, y: by - 52, rx: 140, ry: 40 });
        }
        // and the tokens printed on the map (school medallions): level, like the badges
        for (const reg of REGIONS) out.push(...(reg.flat || []), ...(reg.noCopy || []));
        return out;
    }

    // ---------------------------------------------------------------------------------------
    // A region: terrain, firs, buildings, props
    // ---------------------------------------------------------------------------------------
    async prepareRegion(img, reg, lane) {
        const [x0, y0, w, h] = reg.px;
        const sides = this.sidesOf(reg);
        // Heights are computed over the region plus a margin on its shared sides, so the blurs see
        // the same painting as the neighbour does and both fields agree along the seam.
        const P = 96;
        const px0 = Math.max(0, x0 - (sides.left === 'shared' ? P : 0)), py0 = Math.max(0, y0 - (sides.top === 'shared' ? P : 0));
        const px1 = Math.min(this.imgW, x0 + w + (sides.right === 'shared' ? P : 0)), py1 = Math.min(this.imgH, y0 + h + (sides.bottom === 'shared' ? P : 0));
        const pw = px1 - px0, ph = py1 - py0;
        const cv = document.createElement('canvas');
        cv.width = pw; cv.height = ph;
        const g = cv.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, px0, py0, pw, ph, 0, 0, pw, ph);
        const prgba = g.getImageData(0, 0, pw, ph).data;
        const at = (o) => ({ ...o, x: o.x - px0, y: o.y - py0 });
        const all = REGIONS.flatMap(r => r.buildings), bridges = REGIONS.flatMap(r => r.props.filter(p => p.kind === 'bridge'));
        const flat = this.flatZones();
        const opt = {
            maxH: reg.maxH, flat: flat.map(at),
            open: Object.fromEntries(Object.entries(sides).map(([k, v]) => [k, v === 'board'])),
            none: Object.fromEntries(Object.entries(sides).map(([k, v]) => [k, v === 'shared'])),
            // terraces and bridge beds of every region: a spur or a bed reaching over a seam is the same on both sides
            plateau: all.map(b => at({ x: b.x, y: b.y, r: footPx(b), ry: b.footY ? b.footY * b.scale / PX : undefined, h: b.h, mound: b.mound })),
            sea: REGIONS.flatMap(r => r.sea || []).map(poly => poly.map(([x, y]) => [x - px0, y - py0])),
            land: REGIONS.flatMap(r => r.land || []).map(poly => poly.map(([x, y]) => [x - px0, y - py0])),
            carve: bridges.map(p => at({ x: p.x, y: p.y, len: p.width + 10, width: p.len * 0.62, angle: p.angle + Math.PI / 2 })),
        };
        const fieldJob = this.job('field', { rgba: prgba.slice(), w: pw, h: ph, opt }, [], lane);
        const rgba = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++) {
            const sy = y + y0 - py0;
            for (let x = 0; x < w; x++) { const i = sy * pw + x + x0 - px0; for (let c = 0; c < 4; c++) rgba[(y * w + x) * 4 + c] = prgba[i * 4 + c]; }
        }
        // Paint over what is now built in 3D (texture from the painting around, never from the
        // plates, badges and banners or from tokens painted on the map).
        const loc = (o) => ({ ...o, x: o.x - x0, y: o.y - y0 });
        const holes = [];
        for (const b of reg.buildings) holes.push(...[].concat(b.hole));   // one ellipse or several
        for (const p of reg.props) holes.push(p.hole || this.holeOf(p));
        for (const hz of reg.holes || []) holes.push(hz);   // painted things removed without a 3D twin
        for (let i = holes.length - 1; i >= 0; i--) if (!holes[i]) holes.splice(i, 1);
        const mask = markEllipses(new Uint8Array(w * h), w, h, holes.map(loc));
        const avoid = classify(rgba, w, h).plate;
        markEllipses(avoid, w, h, flat.map(loc));
        markEllipses(avoid, w, h, (reg.noCopy || []).map(loc));
        const paintJob = this.job('inpaint', { px: rgba.slice(), w, h, mask, iters: 120, avoid }, [], lane);
        const pfield = await fieldJob;
        const field = new Float32Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) field[y * w + x] = pfield[(y + y0 - py0) * pw + x + x0 - px0];
        return { reg, field, rgba, px: await paintJob, holes };
    }

    /** Builds a prepared region (on the main thread, in order: the seams follow the ones before). */
    buildRegion({ reg, field, rgba, px, holes }) {
        const S = this.scene;
        const [x0, y0, w, h] = reg.px;
        this.stitch(reg, field, w, h);
        this.parts.push({ reg, field, w, h });
        const tcv = document.createElement('canvas');
        tcv.width = w; tcv.height = h;
        const tg = tcv.getContext('2d');
        tg.putImageData(new ImageData(new Uint8ClampedArray(px.buffer, px.byteOffset, w * h * 4), w, h), 0, 0);
        this.holes = holes;

        // --- the terrain mesh ---------------------------------------------------------------
        const st = reg.step, gw = Math.floor((w - 1) / st) + 1 + ((w - 1) % st ? 1 : 0), gh = Math.floor((h - 1) / st) + 1 + ((h - 1) % st ? 1 : 0);
        const pos = new Float32Array(gw * gh * 3), uv = new Float32Array(gw * gh * 2);
        for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
            const lx = Math.min(w - 1, i * st), ly = Math.min(h - 1, j * st), k = j * gw + i;
            const p = this.world(x0 + lx, y0 + ly, field[ly * w + lx]);
            pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
            uv[k * 2] = lx / (w - 1); uv[k * 2 + 1] = 1 - ly / (h - 1);
        }
        const idx = new Uint32Array((gw - 1) * (gh - 1) * 6);
        let t = 0;
        for (let j = 0; j < gh - 1; j++) for (let i = 0; i < gw - 1; i++) {
            const a = j * gw + i, b = a + 1, d = a + gw, e = d + 1;
            idx[t++] = a; idx[t++] = b; idx[t++] = d;
            idx[t++] = b; idx[t++] = e; idx[t++] = d;
        }
        const nrm = new Float32Array(pos.length);
        BABYLON.VertexData.ComputeNormals(pos, idx, nrm);
        if (nrm[1] < 0) {   // winding check: the normals of a flat corner must look up
            for (let q = 0; q < idx.length; q += 3) { const x = idx[q + 1]; idx[q + 1] = idx[q + 2]; idx[q + 2] = x; }
            BABYLON.VertexData.ComputeNormals(pos, idx, nrm);
        }
        const vd = new BABYLON.VertexData();
        vd.positions = pos; vd.indices = idx; vd.normals = nrm; vd.uvs = uv;
        const mesh = new BABYLON.Mesh('relief_' + reg.id, S);
        vd.applyToMesh(mesh);
        const tex = new BABYLON.DynamicTexture('reliefTex_' + reg.id, tcv, S, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
        tex.update();
        tex.anisotropicFilteringLevel = 8;
        tex.wrapU = tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        const m = toonMaterial(S, 'reliefM_' + reg.id, '#ffffff', BOARD_TOON);
        m.diffuseTexture = tex; m.specularColor = new BABYLON.Color3(0, 0, 0);
        m.zOffset = -2;   // the rim of the patch lies on the flat board: it wins the depth tie
        if (BABYLON.MaterialPluginBase) m.reliefRock = new RockPlugin(m, this.rockTex);
        mesh.material = m; mesh.receiveShadows = true; mesh.isPickable = false;
        this.shadows.addShadowCaster(mesh);
        this.meshes.push(mesh);
        this.mesh = this.meshes[0];

        this.plantFirs(reg, rgba, field, w, h);
        for (const b of reg.buildings) {
            const p = this.world(b.x, b.y, b.h);
            const build = this['build' + b.kind[0].toUpperCase() + b.kind.slice(1)];
            const root = build.call(this, p, b.scale, b.rot, b);
            this.buildings[b.kind] = root;
        }
        for (const p of reg.props) this.buildProp(p);
    }

    /** The seam with regions already built: their border values are taken over exactly (so the
     *  meshes share their edge vertices) and the difference fades out over 32 pixels inside. */
    stitch(reg, field, w, h) {
        const [x0, y0] = reg.px, F = 32;
        const other = (ix, iy) => {
            for (const p of this.parts) {
                const lx = ix - p.reg.px[0], ly = iy - p.reg.px[1];
                if (lx >= 0 && ly >= 0 && lx <= p.w - 1 && ly <= p.h - 1) return p.field[ly * p.w + lx];
            }
            return null;
        };
        // the difference on each border pixel that another region owns, spread inward
        const sides = [
            { n: h, at: (k) => [0, k], dir: [1, 0] }, { n: h, at: (k) => [w - 1, k], dir: [-1, 0] },
            { n: w, at: (k) => [k, 0], dir: [0, 1] }, { n: w, at: (k) => [k, h - 1], dir: [0, -1] },
        ];
        for (const sd of sides) {
            for (let k = 0; k < sd.n; k++) {
                const [bx, by] = sd.at(k), v = other(x0 + bx, y0 + by);
                if (v === null) continue;
                const delta = v - field[by * w + bx];
                for (let d = 0; d < F; d++) {
                    const x = bx + sd.dir[0] * d, y = by + sd.dir[1] * d;
                    if (x < 0 || y < 0 || x >= w || y >= h) break;
                    const f = 1 - d / F;
                    field[y * w + x] += delta * f * f * (3 - 2 * f);
                }
            }
        }
    }

    /** The painted original of a prop: the ellipse painted over under it. */
    holeOf(p) {
        if (p.kind === 'field') return null;   // laid over the painted grass, nothing to paint out
        if (p.kind === 'bridge') return { x: p.x, y: p.y, rx: p.len / 2 + 5, ry: p.width / 2 + 4, angle: p.angle };
        if (p.kind === 'house') return { x: p.x, y: p.y, rx: 29, ry: 27 };
        if (p.kind === 'ruin') return { x: p.x, y: p.y, rx: 23, ry: 27 };
        if (p.kind === 'longhouse') return { x: p.x, y: p.y, rx: 18 * (p.size || 1), ry: 14 * (p.size || 1) };
        if (p.kind === 'menhirs') return { x: p.x, y: p.y, rx: 16, ry: 14 };
        return { x: p.x, y: p.y, rx: 15 * (p.size || 1), ry: 14 * (p.size || 1) };
    }

    /** Low-poly firs where the forest is painted (thin instances: one draw call per colour). */
    plantFirs(reg, rgba, field, w, h) {
        const S = this.scene;
        const [x0, y0] = reg.px;
        let seed = 11;
        const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
        const kinds = ['#1f3b2a', '#2b4a2c', '#36502f'].map((hex, k) => {
            const top = BABYLON.MeshBuilder.CreateCylinder('firT' + k, { diameterTop: 0, diameterBottom: 0.05, height: 0.07, tessellation: 6 }, S);
            top.position.y = 0.085;
            const low = BABYLON.MeshBuilder.CreateCylinder('firL' + k, { diameterTop: 0.015, diameterBottom: 0.075, height: 0.08, tessellation: 6 }, S);
            low.position.y = 0.045;
            const trunk = BABYLON.MeshBuilder.CreateCylinder('firS' + k, { diameter: 0.014, height: 0.03, tessellation: 4 }, S);
            trunk.position.y = 0.012;
            const fir = BABYLON.Mesh.MergeMeshes([top, low, trunk], true);
            fir.convertToFlatShadedMesh();
            fir.material = toonMaterial(S, 'firM' + k, hex, BOARD_TOON);
            fir.material.specularColor = new BABYLON.Color3(0, 0, 0);
            fir.isPickable = false; fir.receiveShadows = true;
            return { fir, mats: [] };
        });
        const busy = [...reg.buildings.map(b => ({ x: b.x, y: b.y, r: footPx(b) + 6 })), ...this.holes.map(o => ({ x: o.x, y: o.y, r: Math.max(o.rx, o.ry) + 4 })),
            ...reg.props.filter(p => p.kind === 'field').map(p => ({ x: p.x, y: p.y, r: Math.max(p.w, p.d) / 2 + 4 }))];
        const seas = REGIONS.flatMap(r => r.sea || []), lands = REGIONS.flatMap(r => r.land || []);
        const STEP = 9;
        for (let y = 4; y < h - 4; y += STEP) for (let x = 4; x < w - 4; x += STEP) {
            const jx = Math.round(x + (rnd() - 0.5) * STEP), jy = Math.round(y + (rnd() - 0.5) * STEP);
            const i = (jy * w + jx) * 4;
            if (!isForest(rgba[i], rgba[i + 1], rgba[i + 2])) continue;
            // a forest pixel alone (a shadow, a dark stroke) is not a forest: most of its neighbours must be
            let n = 0;
            for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [0, 4]]) { const k = ((jy + dy) * w + jx + dx) * 4; if (isForest(rgba[k], rgba[k + 1], rgba[k + 2])) n++; }
            if (n < 3 || rnd() < 0.35) continue;
            if (busy.some(b => Math.hypot(x0 + jx - b.x, y0 + jy - b.y) < b.r)) continue;
            // nothing grows on the sea (dark-green water reads as forest), except where an island is cut out of it
            const gx = x0 + jx, gy = y0 + jy;
            if (seas.some(q => inPoly(q, gx, gy)) && !lands.some(q => inPoly(q, gx, gy))) continue;
            const ht = field[jy * w + jx];
            if (ht > 0.24) continue;   // the tree line
            const p = this.world(x0 + jx, y0 + jy, ht - 0.004);
            const s = 0.45 + rnd() * 0.35;   // a hut is 0.075: a fir a little taller than its roof
            const mat = BABYLON.Matrix.Compose(new BABYLON.Vector3(s, s * (0.9 + rnd() * 0.3), s), BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, rnd() * 6.28), p);
            kinds[Math.floor(rnd() * kinds.length)].mats.push(mat);
        }
        for (const k of kinds) {
            if (!k.mats.length) { k.fir.dispose(); continue; }
            const buf = new Float32Array(k.mats.length * 16);
            k.mats.forEach((mm, q) => mm.copyToArray(buf, q * 16));
            k.fir.thinInstanceSetBuffer('matrix', buf, 16, true);
            k.fir.thinInstanceRefreshBoundingInfo();
            this.shadows.addShadowCaster(k.fir);
        }
        this.firCount = (this.firCount || 0) + kinds.reduce((s, k) => s + k.mats.length, 0);
    }

    // ---------------------------------------------------------------------------------------
    // Building kit (nemesis buildProps/mergeStatic): parts in local coordinates, merged per material
    // ---------------------------------------------------------------------------------------
    kit(name, at, rot = 0, scale = 1) {
        const S = this.scene;
        const root = new BABYLON.TransformNode(name, S);
        root.position = at; root.rotation.y = rot; root.scaling.setAll(scale);
        const parts = {};
        // parts are built unparented in the building's own coordinates: MergeMeshes bakes world
        // matrices, and only the merged mesh is hung on the root
        const add = (mesh, mat) => { (parts[mat] = parts[mat] || []).push(mesh); return mesh; };
        const k = {
            root,
            box: (w, hh, d, x, y, z, mat, ry = 0) => { const b = BABYLON.MeshBuilder.CreateBox('p', { width: w, height: hh, depth: d }, S); b.position.set(x, y, z); b.rotation.y = ry; return add(b, mat); },
            cyl: (dt, db, hh, x, y, z, mat, tess = 10) => { const c = BABYLON.MeshBuilder.CreateCylinder('p', { diameterTop: dt, diameterBottom: db, height: hh, tessellation: tess }, S); c.position.set(x, y, z); return add(c, mat); },
            /** A gabled roof along local x: a triangular prism. */
            roof: (len, span, hh, x, y, z, mat, ry = 0) => {
                const r = BABYLON.MeshBuilder.CreateCylinder('p', { diameter: 1, height: len, tessellation: 3 }, S);
                r.rotation.set(0, ry, Math.PI / 2); r.scaling.set(hh * 1.33, 1, span * 1.16);
                r.position.set(x, y + hh * 0.333, z); return add(r, mat);   // the eaves on y
            },
            /** A flat floor over an outline [[x, z]…] star-shaped around its centroid (a courtyard). */
            floor: (pts, y, mat) => {
                const cx = pts.reduce((q, p) => q + p[0], 0) / pts.length, cz = pts.reduce((q, p) => q + p[1], 0) / pts.length;
                const pos = [cx, y, cz], uv = [0.5 + cx * 2, 0.5 + cz * 2], ind = [];
                for (const [x, z] of pts) { pos.push(x, y, z); uv.push(0.5 + x * 2, 0.5 + z * 2); }
                // facing up (Babylon: clockwise from the viewer) whichever way the outline runs
                // both faces: seen from above whichever way the outline runs (never culled away)
                for (let i = 0; i < pts.length; i++) { const a = 1 + i, b = 1 + ((i + 1) % pts.length); ind.push(0, a, b, 0, b, a); }
                const nrm = []; for (let i = 0; i <= pts.length; i++) nrm.push(0, 1, 0);
                const m = new BABYLON.Mesh('p', S), vd = new BABYLON.VertexData();
                vd.positions = pos; vd.indices = ind; vd.normals = nrm; vd.uvs = uv;
                vd.applyToMesh(m);
                return add(m, mat);
            },
            poly: (size, x, y, z, mat) => { const p = BABYLON.MeshBuilder.CreatePolyhedron('p', { type: 2, size }, S); p.position.set(x, y, z); p.rotation.set(x * 40, z * 40, 0); return add(p, mat); },
            /** Merlons along a straight wall top. */
            crenels: (ax, az, bx, bz, y, t, mat, sp = 0.045, mw = 0.02, mh = 0.024) => {
                const len = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.floor(len / sp)), ry = Math.atan2(bx - ax, bz - az);
                for (let i = 0; i <= n; i += 2) k.box(t, mh, mw, ax + (bx - ax) * i / n, y + mh / 2, az + (bz - az) * i / n, mat, ry);
            },
            /** A solid block over a convex outline [[x, z]…] from y0 to y1: walls of `side`, a top of
             *  `top` (a terrace of Kaer Morhen, an inner keep block). */
            prism: (pts, y0, y1, side, top = side) => {
                let area = 0;
                for (let i = 0; i < pts.length; i++) { const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length]; area += ax * bz - bx * az; }
                const P = area > 0 ? pts : pts.slice().reverse(), n = P.length;
                const cx = P.reduce((q, p) => q + p[0], 0) / n, cz = P.reduce((q, p) => q + p[1], 0) / n;
                const mesh = (pos, ind, uv, mat) => {
                    const m = new BABYLON.Mesh('p', S), vd = new BABYLON.VertexData(), nrm = [];
                    BABYLON.VertexData.ComputeNormals(pos, ind, nrm);
                    vd.positions = pos; vd.indices = ind; vd.normals = nrm; vd.uvs = uv;
                    vd.applyToMesh(m);
                    return add(m, mat);
                };
                // top: a fan facing up (the winding that floor() showed visible)
                const tp = [cx, y1, cz], tu = [0.5 + cx * 2, 0.5 + cz * 2], ti = [];
                for (const [x, z] of P) { tp.push(x, y1, z); tu.push(0.5 + x * 2, 0.5 + z * 2); }
                for (let i = 0; i < n; i++) ti.push(0, 1 + i, 1 + (i + 1) % n);
                mesh(tp, ti, tu, top);
                // sides: each edge walked opposite to the top's walk (a closed, outward-facing solid)
                const sp = [], si = [], su = [];
                let run = 0;
                for (let i = 0; i < n; i++) {
                    const [ax, az] = P[i], [bx, bz] = P[(i + 1) % n], len = Math.hypot(bx - ax, bz - az), v = sp.length / 3;
                    sp.push(bx, y1, bz, ax, y1, az, ax, y0, az, bx, y0, bz);
                    su.push((run + len) * 3, y1 * 3, run * 3, y1 * 3, run * 3, y0 * 3, (run + len) * 3, y0 * 3);
                    si.push(v, v + 1, v + 2, v, v + 2, v + 3);
                    run += len;
                }
                mesh(sp, si, su, side);
            },
            /** A ring of merlons (the crown of a round tower). */
            crown: (x, z, d, y, mat) => {
                k.cyl(d + 0.024, d + 0.01, 0.03, x, y + 0.015, z, mat, 12);
                const n = Math.max(6, Math.round(d * 70));
                for (let i = 0; i < n; i += 2) { const a = i / n * Math.PI * 2, r = d / 2 + 0.006; k.box(0.022, 0.026, 0.016, x + Math.cos(a) * r, y + 0.043, z + Math.sin(a) * r, mat, -a + Math.PI / 2); }
            },
            done: () => {
                for (const [mk, list] of Object.entries(parts)) {
                    const merged = BABYLON.Mesh.MergeMeshes(list, true, true);
                    merged.parent = root; merged.material = this.mats[mk];
                    merged.convertToFlatShadedMesh();
                    merged.isPickable = false; merged.receiveShadows = true;
                    this.shadows.addShadowCaster(merged);
                }
                return root;
            },
        };
        return k;
    }

    /**
     * Kaer Morhen as painted on the board: a keep climbing the mountainside in terraces. Three
     * crescent tiers, each higher and further back, open toward the valley (front-left): the lowest
     * with the gate, the middle one with a door in its curved wall, the top yard with the keep of
     * tall arched windows. Slender open-topped round towers stand at the horn of every tier and
     * rise highest at the back; all in pale blue-white stone with fine merlons. Laid out from the
     * painting's pixels (see docs/witcher/03-cities.md).
     */
    buildKaerMorhen(at, scale = 1, rot = 0, b) {
        const k = this.kit('kaerMorhen', at, rot, scale), { L, S } = this.mapper(b);
        this.plinth(k, 0.46);
        const tiers = [
            { top: 0.15, px: [[3530, 282], [3552, 290], [3583, 294], [3615, 293], [3642, 286], [3660, 272], [3678, 248], [3693, 212], [3695, 178], [3672, 150], [3622, 140], [3580, 158], [3545, 196], [3527, 240]] },
            { top: 0.29, px: [[3556, 250], [3584, 258], [3615, 262], [3644, 258], [3662, 246], [3684, 214], [3690, 180], [3667, 152], [3621, 143], [3586, 160], [3560, 196], [3552, 228]] },
            { top: 0.42, px: [[3590, 214], [3620, 222], [3650, 220], [3673, 204], [3686, 180], [3667, 154], [3622, 147], [3596, 165], [3586, 192]] },
        ];
        const inside = (pts, x, z) => {   // point in polygon
            let c = false;
            for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
                const [xi, zi] = pts[i], [xj, zj] = pts[j];
                if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
            }
            return c;
        };
        tiers.forEach((t, ti) => {
            const pts = t.px.map(([x, y]) => L(x, y)), next = tiers[ti + 1] && tiers[ti + 1].px.map(([x, y]) => L(x, y));
            k.prism(pts, -0.03, t.top, 'wall', 'yard');
            // a cornice and fine merlons on every edge not buried under the tier above
            for (let i = 0; i < pts.length; i++) {
                const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
                if (next && inside(next, (ax + bx) / 2, (az + bz) / 2)) continue;
                const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
                k.box(0.03, 0.012, len + 0.01, (ax + bx) / 2, t.top, (az + bz) / 2, 'wall', ry);
                k.crenels(ax, az, bx, bz, t.top + 0.006, 0.026, 'wall', 0.026, 0.013, 0.018);
            }
        });
        // the doors: the gate of the lowest tier, the door in the middle wall, the keep's door
        for (const [px, py, y] of [[3597, 294, 0], [3615, 262, 0.15], [3627, 206, 0.42]]) {
            const [x, z] = L(px, py);
            k.box(0.04, 0.07, 0.01, x, y + 0.035, z - 0.004, 'dark');
            k.cyl(0.04, 0.04, 0.01, x, y + 0.07, z - 0.004, 'dark', 10).rotation.x = Math.PI / 2;
        }
        // the keep on the top yard: tall arched windows, merlons
        const [kx, kz] = L(3628, 190), kw = S(34), kd = S(24);
        k.box(kw, 0.22, kd, kx, 0.42 + 0.11, kz, 'keep');
        k.box(kw + 0.014, 0.014, kd + 0.014, kx, 0.64, kz, 'keep');
        for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [-1, 1, 1, 1], [-1, -1, -1, 1], [1, -1, 1, 1]])
            k.crenels(kx + ax * kw / 2, kz + az * kd / 2, kx + bx * kw / 2, kz + bz * kd / 2, 0.646, 0.02, 'keep', 0.026, 0.013, 0.018);
        for (let i = 0; i < 3; i++) {
            const x = kx - kw * 0.3 + i * kw * 0.3;
            k.box(0.018, 0.07, 0.006, x, 0.53, kz - kd / 2 - 0.003, 'dark');
            k.cyl(0.018, 0.018, 0.006, x, 0.565, kz - kd / 2 - 0.003, 'dark', 8).rotation.x = Math.PI / 2;
        }
        // the slender open-topped towers: at the horn of each tier, and the tallest at the back
        const towers = [[3530, 268, 24, 0.38], [3558, 226, 22, 0.54], [3655, 254, 20, 0.42], [3606, 190, 24, 0.7],
            [3612, 160, 22, 0.86], [3657, 205, 22, 0.68], [3668, 164, 18, 0.74], [3691, 178, 16, 0.62]];
        for (const [px, py, d, hh] of towers) {
            const [x, z] = L(px, py), D = S(d);
            k.cyl(D, D * 1.04, hh + 0.03, x, (hh - 0.03) / 2, z, 'tower', 14);
            k.cyl(D + 0.02, D, 0.024, x, hh, z, 'tower', 14);
            const n = Math.max(8, Math.round(D * 110));
            for (let i = 0; i < n; i += 2) { const a = i / n * Math.PI * 2, r = D / 2 + 0.006; k.box(0.013, 0.018, 0.012, x + Math.cos(a) * r, hh + 0.021, z + Math.sin(a) * r, 'tower', -a + Math.PI / 2); }
            k.cyl(D - 0.006, D - 0.006, 0.004, x, hh + 0.013, z, 'dark', 14);   // open top: dark inside
            for (let i = 0; i < Math.floor(hh / 0.1); i++) k.box(0.01, 0.03, 0.006, x, 0.08 + i * 0.09, z - D / 2 - 0.003, 'dark');
        }
        const root = k.done();
        this.castle = root;
        return root;
    }

    /**
     * Ban Ard, the mages' school, as painted: a fat white round tower under a tall brown cone
     * with dormers, ringed by slender towers with brown cones; brown timbered houses packed inside
     * a round white curtain banded with dark buttresses; a long walled causeway runs down to the
     * west; farms with fields lie round it (props).
     */
    buildBanArd(at, scale = 1, rot = 0, b) {
        const k = this.kit('banArd', at, rot, scale), { L, S, G } = this.mapper(b);
        k.cyl(0.46, 0.56, 0.26, 0, -0.135, 0, 'rock', 10);   // the plinth (see Kaer Morhen)
        // the round curtain with dark buttresses
        const [cx, cz] = L(3738, 600), R = S(52), N = 18, ring = [];
        for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2; ring.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R * 0.92]); }
        for (let i = 0; i < N; i++) {
            const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % N], len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
            k.box(0.026, 0.085, len + 0.004, (ax + bx) / 2, 0.0425, (az + bz) / 2, 'white', ry);
            k.box(0.034, 0.01, len + 0.004, (ax + bx) / 2, 0.085, (az + bz) / 2, 'white', ry);
            if (i % 2 === 0) k.box(0.036, 0.09, 0.012, ax, 0.045, az, 'timber', ry);
        }
        k.floor(ring, 0.012, 'yard');
        // brown timbered houses inside the wall
        const houses = [[3712, 604, -0.5], [3730, 612, -0.1], [3752, 612, 0.2], [3770, 600, 0.6], [3708, 584, -1.1], [3772, 580, 1.1], [3742, 622, 0]];
        for (const [px, py, ry] of houses) { const [x, z] = L(px, py); this.townHouse(k, x, z, 0.06, 0.042, 0.05, 'timber', 'roofBrown', ry, null, 0.8); }
        // the ring of slender towers with brown cones
        const spire = (px, py, d, hh, ch) => { const [x, z] = L(px, py); this.roundTower(k, x, z, d, hh, 'white', 'roofBrown', ch); };
        for (const [px, py, hh, ch] of [[3712, 568, 0.2, 0.1], [3702, 590, 0.15, 0.08], [3769, 560, 0.22, 0.1], [3792, 566, 0.17, 0.08], [3760, 590, 0.16, 0.08], [3726, 588, 0.15, 0.08], [3744, 556, 0.14, 0.07]])
            spire(px, py, 0.048, hh, ch);
        // the great tower: fat and white, a gallery, the tall cone with dormers
        const [tx, tz] = L(3745, 582), D = S(42), TH = 0.3;
        k.cyl(D, D * 1.05, TH, tx, TH / 2, tz, 'white', 18);
        k.cyl(D + 0.02, D + 0.02, 0.016, tx, TH * 0.45, tz, 'white', 18);
        k.cyl(D + 0.024, D + 0.024, 0.016, tx, TH, tz, 'white', 18);
        k.cyl(0, D + 0.04, 0.2, tx, TH + 0.108, tz, 'roofBrown', 16);
        for (let i = 0; i < 3; i++) {
            const a = -Math.PI / 2 + (i - 1) * 0.9, r = D * 0.42, x = tx + Math.cos(a) * r, z = tz + Math.sin(a) * r;
            k.box(0.028, 0.026, 0.02, x, TH + 0.05, z, 'white', -a + Math.PI / 2);
            k.roof(0.03, 0.026, 0.016, x, TH + 0.063, z, 'roofBrown', -a);
        }
        for (let r = 0; r < 3; r++) for (const da of [-0.5, 0, 0.5]) {
            const a = -Math.PI / 2 + da, x = tx + Math.cos(a) * (D / 2 + 0.002), z = tz + Math.sin(a) * (D / 2 + 0.002);
            k.box(0.014, 0.022, 0.006, x, 0.06 + r * 0.075, z, 'dark', -a + Math.PI / 2);
        }
        // the causeway down to the west: a gatehouse in the wall, walled spans stepping down
        const [g0x, g0z] = L(3690, 604), [g1x, g1z] = L(3646, 628), ry = Math.atan2(g1x - g0x, g1z - g0z), len = Math.hypot(g1x - g0x, g1z - g0z);
        this.squareTower(k, g0x, g0z, 0.06, 0.12, 'white', ry);
        // each span stands on the ground under it (the hill falls away west of the terrace): its deck
        // steps down from the gate to the ground at the far end, its masonry reaches into the slope
        const NS = 6, gEnd = G(3646, 628);
        for (let i = 0; i < NS; i++) {
            const f = (i + 0.5) / NS, x = g0x + (g1x - g0x) * f, z = g0z + (g1z - g0z) * f;
            const ground = G(3690 + (3646 - 3690) * f, 604 + (628 - 604) * f);
            const top = Math.max(ground + 0.014, 0.06 * (1 - f) + (gEnd + 0.014) * f), bot = Math.min(ground, gEnd) - 0.05;
            k.box(0.044, top - bot, len / NS + 0.004, x, (top + bot) / 2, z, 'white', ry);
            for (const sd of [-1, 1]) k.box(0.008, 0.014, len / NS + 0.004, x + Math.cos(ry) * sd * 0.02, top + 0.007, z - Math.sin(ry) * sd * 0.02, 'white', ry);
        }
        return k.done();
    }

    // ---------------------------------------------------------------------------------------
    // Shared pieces of the cities (local units of a building; its plinth radius is `foot`)
    // ---------------------------------------------------------------------------------------
    /** Painting pixels -> a building's own units (anchor b.x, b.y; for buildings laid out from
     *  the board art with rot 0): L(px, py) -> [x, z], S(pixels) -> length. */
    mapper(b) {
        const s = PX / b.scale;
        // G: the terrain under a painting pixel in the building's units (for parts standing off the terrace)
        return { L: (px, py) => [(px - b.x) * s, -(py - b.y) * s], S: (n) => n * s, G: (px, py) => (this.heightPx(px, py) - b.h) / b.scale };
    }

    /** The plinth of rock under a building (see Kaer Morhen): its top just under the terrace. */
    plinth(k, foot) { k.cyl(foot * 1.9, foot * 2.7, 0.34, 0, -0.175, 0, 'rock', 11); }

    /** A ring of walls through `pts` with merlons, optionally a round tower at every corner. */
    curtain(k, pts, hh, t, mat, towers = null, skip = []) {
        for (let i = 0; i < pts.length; i++) {
            if (skip.includes(i)) continue;
            const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
            const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
            k.box(t, hh, len, (ax + bx) / 2, hh / 2, (az + bz) / 2, mat, ry);
            k.box(t + 0.01, 0.01, len, (ax + bx) / 2, hh, (az + bz) / 2, mat, ry);
            k.crenels(ax, az, bx, bz, hh + 0.006, t, mat);
        }
        if (towers) pts.forEach(([x, z], i) => this.roundTower(k, x, z, towers.d, towers.h + (i % 3) * 0.015, towers.mat || mat, towers.roof, towers.coneH));
    }

    /** A round tower: crenellated, or with a cone roof of material `roof` (`coneH` tall). */
    roundTower(k, x, z, d, hh, mat, roof = null, coneH = null, tess = 12) {
        k.cyl(d, d * 1.08, hh, x, hh / 2, z, mat, tess);
        if (roof) {
            const ch = coneH || d * 1.6;
            k.cyl(d + 0.014, d + 0.014, 0.012, x, hh, z, mat, tess);
            k.cyl(0, d + 0.022, ch, x, hh + ch / 2 + 0.006, z, roof, tess);
        } else k.crown(x, z, d, hh, mat);
        for (let i = 0; i < Math.floor(hh / 0.09); i++) k.box(0.011, 0.024, 0.006, x, 0.05 + i * 0.08, z - d / 2 - 0.002, 'dark');
    }

    /** A round tower ribbed with buttresses (Haern Caduch, Bechelt Nar), crenellated on top. */
    ribbedTower(k, x, z, d, hh, mat, ribs = 8, flare = 1.08) {
        k.cyl(d, d * flare, hh, x, hh / 2, z, mat, 16);
        for (let i = 0; i < ribs; i++) {
            const a = (i + 0.5) / ribs * Math.PI * 2, r = d / 2 * (1 + (flare - 1) / 2);
            k.box(0.014, hh * 0.92, 0.014, x + Math.cos(a) * r, hh * 0.46, z + Math.sin(a) * r, mat, -a);
        }
        // a corbelled parapet over the ribs
        k.cyl(d + 0.03, d, 0.03, x, hh + 0.005, z, mat, 16);
        k.crown(x, z, d + 0.02, hh + 0.02, mat);
        for (let i = 0; i < Math.floor(hh / 0.1); i++) k.box(0.011, 0.03, 0.006, x, 0.06 + i * 0.09, z - d / 2 - 0.004, 'dark');
    }

    /** A square tower with merlons (or a pyramid roof). */
    squareTower(k, x, z, w, hh, mat, ry = 0, roof = null) {
        k.box(w, hh, w, x, hh / 2, z, mat, ry);
        k.box(w + 0.014, 0.016, w + 0.014, x, hh, z, mat, ry);
        if (roof) k.cyl(0, w * 1.45, w * 1.1, x, hh + w * 0.55 + 0.008, z, roof, 4).rotation.y = ry + Math.PI / 4;
        else {
            const c = Math.cos(ry), s = Math.sin(ry), q = (w + 0.01) / 2;
            const corner = (u, v) => [x + u * c + v * s, z - u * s + v * c];
            const cs = [corner(-q, -q), corner(q, -q), corner(q, q), corner(-q, q)];
            for (let i = 0; i < 4; i++) k.crenels(...cs[i], ...cs[(i + 1) % 4], hh + 0.008, 0.018, mat);
        }
        for (let i = 0; i < Math.floor(hh / 0.1); i++) k.box(0.014, 0.026, 0.006, x, 0.06 + i * 0.09, z - w / 2 - 0.003, 'dark', ry);
    }

    /** A house: walls, a gabled roof (`pitch` of the depth), windows; `timber` adds the dark
     *  beams of a half-timbered upper storey (Vizima). */
    townHouse(k, x, z, w, d, hh, wall, roof, ry = 0, timber = null, pitch = 0.62, y0 = 0) {
        if (y0) { k.box(w, hh + 0.04, d, x, y0 + (hh - 0.04) / 2, z, wall, ry); return this.houseTop(k, x, z, w, d, hh, roof, ry, pitch, y0); }
        k.box(w, hh, d, x, hh / 2, z, wall, ry);
        k.roof(w * 1.06, d * 1.12, d * pitch, x, hh, z, roof, ry);
        const c = Math.cos(ry), s = Math.sin(ry);
        const at = (u, v) => [x + u * c + v * s, z - u * s + v * c];
        if (timber) {
            k.box(w + 0.004, 0.006, d + 0.004, x, hh * 0.5, z, timber, ry);
            k.box(w + 0.004, 0.006, d + 0.004, x, hh - 0.003, z, timber, ry);
            for (const u of [-w / 2, 0, w / 2]) { const [px, pz] = at(u, -d / 2 - 0.002); k.box(0.006, hh * 0.5, 0.004, px, hh * 0.75, pz, timber, ry); }
        }
        for (const u of [-w * 0.22, w * 0.22]) { const [px, pz] = at(u, -d / 2 - 0.003); k.box(0.01, 0.016, 0.004, px, hh * (timber ? 0.3 : 0.6), pz, 'dark', ry); }
    }

    /** The roof and windows of a house standing on ground at y0 (off the terrace: on a hill, by the water). */
    houseTop(k, x, z, w, d, hh, roof, ry, pitch, y0) {
        k.roof(w * 1.06, d * 1.12, d * pitch, x, y0 + hh, z, roof, ry);
        const c = Math.cos(ry), s = Math.sin(ry);
        for (const u of [-w * 0.22, w * 0.22]) k.box(0.01, 0.016, 0.004, x + u * c + (-d / 2 - 0.003) * s, y0 + hh * 0.6, z - u * s + (-d / 2 - 0.003) * c, 'dark', ry);
    }

    /** A slender turret from y0: a shaft, a ring, a needle cone (Beauclair, Cintra, Novigrad). */
    turret(k, x, z, y0, d, hh, roof, ch, mat, tess = 10) {
        k.cyl(d, d * 1.06, hh, x, y0 + hh / 2, z, mat, tess);
        k.cyl(d + 0.012, d + 0.012, 0.01, x, y0 + hh, z, mat, tess);
        k.cyl(0, d + 0.02, ch, x, y0 + hh + ch / 2 + 0.005, z, roof, tess);
        if (hh > 0.08) k.box(0.009, 0.02, 0.006, x, y0 + hh * 0.7, z - d / 2 - 0.002, 'dark');
    }

    /** Points of a painted outline (pixels) on a jittered grid, clear of the circles in `avoid`
     *  ([px, py, r]): where the houses of a town stand. */
    scatterPx(poly, step, seed, avoid = []) {
        let sd = seed;
        const rnd = () => { sd = (sd * 9301 + 49297) % 233280; return sd / 233280; };
        const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]), out = [];
        for (let y = Math.min(...ys); y <= Math.max(...ys); y += step) for (let x = Math.min(...xs); x <= Math.max(...xs); x += step) {
            const px = x + (rnd() - 0.5) * step * 0.5, py = y + (rnd() - 0.5) * step * 0.5;
            if (!inPoly(poly, px, py) || avoid.some(([ax, ay, r]) => Math.hypot(px - ax, py - ay) < r)) continue;
            out.push([px, py, rnd(), rnd(), rnd()]);
        }
        return out;
    }

    /** A pennant on a pole. */
    flag(k, x, y, z, mat = 'pale') {
        k.cyl(0.004, 0.004, 0.07, x, y + 0.035, z, 'dark', 4);
        k.box(0.004, 0.018, 0.04, x, y + 0.058, z + 0.02, mat);
    }

    /** A tree of the gardens (a trunk and a round crown). */
    tree(k, x, z, s = 1) {
        k.cyl(0.008 * s, 0.01 * s, 0.026 * s, x, 0.013 * s, z, 'wood', 5);
        k.poly(0.028 * s, x, 0.048 * s, z, 'leaf');
    }

    /** A ring of dark arches round a drum (Beauclair's arcades). */
    arcade(k, x, z, d, y, n, aw = 0.026, ah = 0.045, from = 0, to = Math.PI * 2) {
        for (let i = 0; i < n; i++) {
            const a = from + (i + 0.5) / n * (to - from), r = d / 2 + 0.002;
            k.box(aw, ah, 0.006, x + Math.cos(a) * r, y, z + Math.sin(a) * r, 'dark', -a + Math.PI / 2);
        }
    }

    /**
     * Hengfors, as painted: two castles joined high up by a walled bridge, the road running under
     * its arch. West, on the rock: the tall square keep with a lesser tower, a long flat-roofed hall,
     * and in front a low round bastion whose top is a yellow-green lawn with a square tower standing
     * on it. East: a stepped square gatehouse of three crenellated stages. Cool blue-grey stone.
     */
    buildHengfors(at, scale = 1, rot = 0, b) {
        const k = this.kit('hengfors', at, rot, scale), { L, S } = this.mapper(b), M = 'hengStone', W = 'hengWall';
        this.plinth(k, 0.48);
        const sq = (px, py, w, hh, mat = M, d = w) => { const [x, z] = L(px, py); if (d === w) this.squareTower(k, x, z, S(w), hh, mat); else { k.box(S(w), hh, S(d), x, hh / 2, z, mat); } return [x, z]; };
        // the west castle: the keep, the lesser tower, the block that joins them to the bastion
        sq(2456, 350, 34, 0.5);
        sq(2492, 350, 20, 0.36);
        sq(2470, 372, 44, 0.2, W, 22);
        // the long hall with a flat roof and rows of windows
        const [hx, hz] = L(2422, 372), hw = S(34), hd = S(26);
        k.box(hw, 0.16, hd, hx, 0.08, hz, W);
        k.box(hw + 0.02, 0.016, hd + 0.02, hx, 0.168, hz, M);
        for (let r = 0; r < 2; r++) for (let q = 0; q < 4; q++) k.box(0.014, 0.022, 0.006, hx - hw * 0.36 + q * hw * 0.24, 0.05 + r * 0.06, hz - hd / 2 - 0.003, 'dark');
        // the round bastion: a lawn on top, a square tower standing on the lawn
        const [bx, bz] = L(2455, 410), br = S(48);
        k.cyl(br * 2, br * 2.06, 0.11, bx, 0.055, bz, W, 22);
        k.crown(bx, bz, br * 2, 0.11, W);
        k.cyl(br * 2 - 0.03, br * 2 - 0.03, 0.004, bx, 0.142, bz, 'hengGrass', 22);
        for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.42; k.box(0.012, 0.022, 0.006, bx + Math.cos(a) * (br + 0.003), 0.055, bz + Math.sin(a) * (br + 0.003), 'dark', -a + Math.PI / 2); }
        // the tower on the lawn fills most of it: only a crescent of grass shows in front
        const [ox, oz] = L(2457, 405), ow = S(60), od = S(48);
        k.box(ow, 0.16, od, ox, 0.14 + 0.08, oz, M);
        k.box(ow + 0.014, 0.014, od + 0.014, ox, 0.3, oz, M);
        for (const [ax, az, cx, cz] of [[-1, -1, 1, -1], [-1, 1, 1, 1], [-1, -1, -1, 1], [1, -1, 1, 1]]) k.crenels(ox + ax * ow / 2, oz + az * od / 2, ox + cx * ow / 2, oz + cz * od / 2, 0.307, 0.018, M);
        for (const dx of [-0.3, 0, 0.3]) k.box(0.016, 0.026, 0.006, ox + dx * ow, 0.23, oz - od / 2 - 0.003, 'dark');
        // the bridge on high between the two castles, the road under its arch
        const [b0x, bz0] = L(2500, 354), [b1x] = L(2546, 354), blen = b1x - b0x;
        k.box(blen + 0.04, 0.06, 0.07, (b0x + b1x) / 2, 0.2, bz0, W);
        for (const sd of [-1, 1]) k.crenels(b0x - 0.02, bz0 + sd * 0.032, b1x + 0.02, bz0 + sd * 0.032, 0.23, 0.014, W);
        k.box(blen * 0.55, 0.03, 0.074, (b0x + b1x) / 2, 0.155, bz0, W);   // the arch's crown
        for (const x of [b0x, b1x]) k.box(0.05, 0.2, 0.08, x, 0.1, bz0, W);
        // the east castle: the stepped gatehouse
        const [ex, ez] = L(2556, 402);
        k.box(S(56), 0.13, S(44), ex, 0.065, ez, W);
        for (const [ax, az, cx, cz] of [[-1, -1, 1, -1], [-1, -1, -1, 1], [1, -1, 1, 1]]) k.crenels(ex + ax * S(28), ez + az * S(22), ex + cx * S(28), ez + cz * S(22), 0.13, 0.02, W);
        k.box(0.05, 0.08, 0.006, ex - S(6), 0.04, ez - S(22) - 0.003, 'wood');
        sq(2562, 392, 40, 0.25, M, 32);
        const [e2x, e2z] = L(2562, 392);
        for (const [ax, az, cx, cz] of [[-1, -1, 1, -1], [-1, -1, -1, 1], [1, -1, 1, 1], [-1, 1, 1, 1]]) k.crenels(e2x + ax * S(20), e2z + az * S(16), e2x + cx * S(20), e2z + cz * S(16), 0.25, 0.02, M);
        for (let q = 0; q < 3; q++) k.box(0.014, 0.024, 0.006, e2x - S(12) + q * S(12), 0.19, e2z - S(16) - 0.003, 'dark');
        sq(2570, 380, 22, 0.38);
        return k.done();
    }

    /**
     * Vizima, as painted: a town first — big two- and three-storey houses, half-timbered, under
     * steep slate-teal roofs, packed inside a low wall on its island in the river; in the middle a
     * small castle of fat round towers huddled together, and behind it the tall square donjon. A
     * stone bridge of arches leaves the west gate over the moat.
     */
    buildVizima(at, scale = 1, rot = 0, b) {
        const k = this.kit('vizima', at, rot, scale), { L, S } = this.mapper(b), T = 'vizTower';
        // the island's stone bank (the city stands on the plain by its river, no rock)
        const ek = k.cyl(S(268), S(276), 0.08, 0, -0.035, 0, T, 28); ek.scaling.z = 84 / 134;
        // the low wall round the island
        const wall = [[2214, 884], [2224, 910], [2242, 935], [2266, 954], [2318, 967], [2368, 974], [2420, 967], [2452, 945], [2462, 908], [2456, 876], [2438, 852], [2400, 842], [2340, 838], [2282, 840], [2238, 852]].map(([x, y]) => L(x, y));
        this.curtain(k, wall, 0.065, 0.022, T);
        k.floor(wall, 0.012, 'yard');
        for (const [px, py, d, hh] of [[2242, 935, 18, 0.1], [2368, 974, 18, 0.1], [2452, 945, 16, 0.09], [2216, 886, 16, 0.09]]) { const [x, z] = L(px, py); this.roundTower(k, x, z, S(d), hh, T); }
        // the castle: fat round towers huddled round a block, the tall donjon behind
        k.prism([[2278, 902], [2310, 880], [2350, 888], [2352, 912], [2332, 934], [2290, 928]].map(([x, y]) => L(x, y)), -0.02, 0.1, T, 'yard');
        for (const [px, py, d, hh] of [[2276, 905, 20, 0.16], [2310, 914, 26, 0.18], [2350, 898, 24, 0.19], [2310, 882, 18, 0.17], [2333, 936, 16, 0.13], [2278, 930, 14, 0.12]]) {
            const [x, z] = L(px, py); this.roundTower(k, x, z, S(d), hh, T, null, null, 16);
        }
        const [kx, kz] = L(2398, 868);
        this.squareTower(k, kx, kz, S(36), 0.44, 'vizKeep');
        // the town: big half-timbered houses under steep teal roofs; [x, y, width, depth px, eaves, ridge angle]
        const houses = [[2262, 858, 30, 22, 0.13, 0.1], [2236, 876, 26, 20, 0.11, 0.3], [2258, 886, 26, 20, 0.12, 0], [2292, 860, 28, 20, 0.14, -0.1],
            [2352, 853, 36, 24, 0.16, 0], [2440, 884, 38, 28, 0.17, 0], [2416, 906, 26, 20, 0.12, 0.1], [2392, 920, 24, 18, 0.11, 0],
            [2376, 940, 24, 18, 0.11, 0.2], [2420, 936, 28, 20, 0.12, -0.1], [2445, 914, 22, 18, 0.11, 0], [2352, 952, 24, 32, 0.14, 0],
            [2300, 954, 24, 18, 0.1, 0.1], [2404, 955, 24, 18, 0.1, 0], [2320, 848, 26, 18, 0.12, 0], [2380, 862, 24, 18, 0.13, 0.15],
            [2250, 914, 22, 18, 0.1, 0.5], [2420, 860, 24, 18, 0.12, -0.1], [2328, 962, 18, 16, 0.09, 0], [2448, 940, 18, 14, 0.09, 0.4]];
        for (const [px, py, w, d, hh, ry] of houses) { const [x, z] = L(px, py); this.townHouse(k, x, z, S(w), S(d), hh, 'vizPlaster', 'vizRoof', ry, 'timber', 1.05); }
        // the tall house with a pyramid roof at the back-left corner
        const [tx, tz] = L(2240, 848);
        k.box(S(18), 0.17, S(18), tx, 0.085, tz, 'vizPlaster');
        k.cyl(0, S(18) * 1.5, 0.1, tx, 0.17 + 0.05, tz, 'vizRoof', 4).rotation.y = Math.PI / 4;
        // the stone bridge of arches from the west gate over the moat
        const [g0x, g0z] = L(2266, 954), [g1x, g1z] = L(2222, 972), ry = Math.atan2(g1x - g0x, g1z - g0z), len = Math.hypot(g1x - g0x, g1z - g0z);
        k.box(0.05, 0.02, len, (g0x + g1x) / 2, 0.045, (g0z + g1z) / 2, T, ry);
        for (let i = 0; i <= 3; i++) { const f = i / 3; k.box(0.05, 0.05, 0.02, g0x + (g1x - g0x) * f, 0.01, g0z + (g1z - g0z) * f, T, ry); }
        for (const sd of [-1, 1]) k.box(0.008, 0.016, len, (g0x + g1x) / 2 + Math.cos(ry) * sd * 0.022, 0.063, (g0z + g1z) / 2 - Math.sin(ry) * sd * 0.022, T, ry);
        return k.done();
    }

    /**
     * Haern Caduch, the School of the Bear, as painted: a fortress of very pale lilac-white stone
     * on a rock ledge, all verticals. In front two massive round towers flaring at the foot and
     * fluted with heavy ribs, tall narrow arched windows between the ribs, a corbelled crown;
     * between them the gate wall with its tall arch and a gatehouse behind. At the back two tall
     * octagonal towers with flat crenellated tops (the right one the tallest) joined by a gallery;
     * a buttressed wall down the left side, a lower one to the right. No roofs, no ring wall.
     */
    buildHaernCaduch(at, scale = 1, rot = 0, b) {
        const k = this.kit('haernCaduch', at, rot, scale), { L, S } = this.mapper(b), M = 'hcStone';
        this.plinth(k, 0.42);
        const fluted = (px, py, d, hh, ribs) => {
            const [x, z] = L(px, py), D = S(d);
            k.cyl(D, D * 1.04, hh + 0.05, x, (hh - 0.05) / 2, z, M, 18);
            k.cyl(D * 1.04, D * 1.22, 0.12, x, 0.01, z, M, 18);   // the flared foot
            for (let i = 0; i < ribs; i++) {
                const a = (i + 0.5) / ribs * Math.PI * 2, r = D / 2 + 0.008;
                k.box(0.026, hh * 0.84, 0.022, x + Math.cos(a) * r, hh * 0.42, z + Math.sin(a) * r, M, -a + Math.PI / 2);
                // tall arched windows between the ribs on the side seen from the valley
                const w = a + Math.PI / ribs;
                if (Math.sin(w) < -0.3) for (const y of [hh * 0.42, hh * 0.68]) {
                    k.box(0.016, 0.07, 0.006, x + Math.cos(w) * (D / 2 + 0.002), y, z + Math.sin(w) * (D / 2 + 0.002), 'dark', -w + Math.PI / 2);
                    k.cyl(0.016, 0.016, 0.006, x + Math.cos(w) * (D / 2 + 0.002), y + 0.035, z + Math.sin(w) * (D / 2 + 0.002), 'dark', 6).rotation.set(Math.PI / 2, 0, -w + Math.PI / 2);
                }
            }
            k.cyl(D + 0.06, D + 0.01, 0.05, x, hh + 0.01, z, M, 18);   // the corbelled crown
            k.crown(x, z, D + 0.05, hh + 0.03, M);
        };
        const octagon = (px, py, d, hh) => {
            const [x, z] = L(px, py), D = S(d);
            k.cyl(D, D, hh + 0.05, x, (hh - 0.05) / 2, z, M, 8).rotation.y = Math.PI / 8;
            k.cyl(D + 0.03, D + 0.005, 0.035, x, hh + 0.005, z, M, 8).rotation.y = Math.PI / 8;
            for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * Math.PI * 2, r = D / 2 + 0.01; k.box(0.03, 0.03, 0.014, x + Math.cos(a) * r, hh + 0.038, z + Math.sin(a) * r, M, -a + Math.PI / 2); }
            for (let i = 0; i < Math.floor(hh / 0.12); i++) k.box(0.014, 0.04, 0.006, x, 0.1 + i * 0.11, z - D / 2 - 0.004, 'dark');
        };
        const wall = (ax, ay, bx, by, hh, t, buttress = false) => {
            const [x0, z0] = L(ax, ay), [x1, z1] = L(bx, by), len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0);
            k.box(S(t), hh + 0.04, len, (x0 + x1) / 2, (hh - 0.04) / 2, (z0 + z1) / 2, M, ry);
            k.crenels(x0, z0, x1, z1, hh + 0.004, S(t) + 0.006, M, 0.04, 0.022, 0.026);
            if (buttress) for (let f = 0.1; f < 1; f += 0.2) k.box(S(t) + 0.03, hh * 0.9, 0.024, x0 + (x1 - x0) * f, hh * 0.45, z0 + (z1 - z0) * f, M, ry);
        };
        // the solid mass of the ward on its ledge
        k.prism([[2330, 1790], [2445, 1795], [2478, 1842], [2440, 1852], [2380, 1848], [2340, 1840]].map(([x, y]) => L(x, y)), -0.03, 0.2, M, 'yard');
        // the back: two octagons and the gallery between them, a wall to the right
        octagon(2342, 1772, 40, 0.6);
        octagon(2410, 1774, 44, 0.8);
        const [gx, gz] = L(2377, 1778);
        k.box(S(36), 0.44, S(22), gx, 0.2, gz, M);
        k.crenels(gx - S(18), gz - S(11), gx + S(18), gz - S(11), 0.424, 0.02, M, 0.04, 0.022, 0.026);
        for (let i = 0; i < 4; i++) k.box(0.014, 0.04, 0.006, gx - S(13) + i * S(8.6), 0.33, gz - S(11) - 0.003, 'dark');
        wall(2428, 1782, 2470, 1802, 0.24, 14);
        // the sides: a tall buttressed wall down the left, a lower one to the right of the gate
        wall(2324, 1786, 2350, 1848, 0.32, 16, true);
        wall(2470, 1858, 2500, 1838, 0.17, 12);
        // the gatehouse behind the gate wall
        const [hx, hz] = L(2410, 1842), hw = S(56), hd = S(30);
        k.box(hw, 0.38, hd, hx, 0.17, hz, M);
        k.crenels(hx - hw / 2, hz - hd / 2, hx + hw / 2, hz - hd / 2, 0.364, 0.02, M, 0.04, 0.022, 0.026);
        for (let i = 0; i < 4; i++) { const x = hx - hw * 0.33 + i * hw * 0.22; k.box(0.016, 0.05, 0.006, x, 0.27, hz - hd / 2 - 0.003, 'dark'); k.cyl(0.016, 0.016, 0.006, x, 0.295, hz - hd / 2 - 0.003, 'dark', 6).rotation.x = Math.PI / 2; }
        // the gate wall between the front towers: the tall arch
        const [fx, fz] = L(2410, 1866), fw = S(56), fd = S(18);
        k.box(fw, 0.31, fd, fx, 0.135, fz, M);
        k.crenels(fx - fw / 2, fz - fd / 2, fx + fw / 2, fz - fd / 2, 0.294, 0.02, M, 0.04, 0.022, 0.026);
        k.box(0.07, 0.13, 0.006, fx, 0.065, fz - fd / 2 - 0.003, 'dark');
        k.cyl(0.07, 0.07, 0.006, fx, 0.13, fz - fd / 2 - 0.003, 'dark', 10).rotation.x = Math.PI / 2;
        for (const dx of [-0.07, 0.07]) k.box(0.014, 0.04, 0.006, fx + dx, 0.22, fz - fd / 2 - 0.003, 'dark');
        // the two fluted towers, the left one the bigger
        fluted(2368, 1856, 46, 0.5, 11);
        fluted(2452, 1864, 40, 0.37, 10);
        return k.done();
    }

    /** Vengerberg: the white castle under teal-blue roofs — a wide round donjon, slender towers
     *  with tall cones and pennants, blue-roofed halls, a low crenellated wall round a green
     *  bailey with trees. */
    buildVengerberg(at, scale = 1, rot = 0) {
        const k = this.kit('vengerberg', at, rot, scale), M = 'vengWall', R = 'roofBlue';
        this.plinth(k, 0.44);
        const ring = [[-0.36, -0.22], [0.06, -0.34], [0.36, -0.16], [0.32, 0.22], [-0.04, 0.34], [-0.38, 0.12]];
        this.curtain(k, ring, 0.07, 0.026, M);
        ring.forEach(([x, z], i) => { if (i % 2 === 0) this.roundTower(k, x, z, 0.055, 0.1, M, R, 0.12); else this.roundTower(k, x, z, 0.05, 0.09, M); });
        k.floor(ring, 0.012, 'vengGrass');
        // the round donjon
        k.cyl(0.2, 0.21, 0.2, 0.06, 0.1, 0.06, M, 18);
        k.crown(0.06, 0.06, 0.2, 0.2, M);
        k.cyl(0.18, 0.18, 0.004, 0.06, 0.205, 0.06, 'dark', 18);
        // slender towers with tall cones and the halls
        const tw = [[-0.16, 0.14, 0.07, 0.36, 0.2], [0.22, 0.16, 0.07, 0.3, 0.17], [-0.25, -0.06, 0.06, 0.25, 0.15], [0.18, -0.06, 0.055, 0.22, 0.14]];
        for (const [x, z, d, hh, ch] of tw) { this.roundTower(k, x, z, d, hh, M, R, ch); this.flag(k, x, hh + ch, z); }
        this.townHouse(k, -0.1, -0.12, 0.17, 0.09, 0.09, M, R, 0.25, null, 0.75);
        this.townHouse(k, -0.24, -0.2, 0.12, 0.08, 0.07, M, R, 0.45, null, 0.75);
        this.townHouse(k, -0.04, 0.24, 0.14, 0.08, 0.08, M, R, 0.1, null, 0.75);
        for (const [x, z] of [[0.26, 0.02], [-0.3, 0.04], [0.1, -0.24], [0.04, -0.18], [-0.18, 0.02]]) this.tree(k, x, z);
        return k.done();
    }

    /** Bechelt Nar: a copper-brown gothic keep — a tall ribbed round tower flaring at its foot,
     *  a gallery and a crown of spires on top, beside it a hall under a steep dark roof with a
     *  round apse and a spire. No outer wall (as painted). */
    buildBecheltNar(at, scale = 1, rot = 0) {
        const k = this.kit('becheltNar', at, rot, scale), M = 'bnStone', R = 'darkRoof';
        this.plinth(k, 0.4);
        // the tower: a flared ribbed skirt, the shaft, a gallery, the crown of spires
        const tx = -0.12, tz = -0.02;
        this.ribbedTower(k, tx, tz, 0.2, 0.14, M, 12, 1.5);
        k.cyl(0.15, 0.17, 0.42, tx, 0.14 + 0.21, tz, M, 16);
        for (let i = 0; i < 10; i++) { const a = (i + 0.5) / 10 * Math.PI * 2; k.box(0.01, 0.4, 0.01, tx + Math.cos(a) * 0.08, 0.35, tz + Math.sin(a) * 0.08, 'bnDark', -a); }
        k.cyl(0.21, 0.15, 0.05, tx, 0.585, tz, M, 16);
        k.cyl(0.13, 0.13, 0.06, tx, 0.64, tz, M, 16);
        k.cyl(0, 0.12, 0.2, tx, 0.77, tz, R, 12);
        for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; k.cyl(0, 0.022, 0.1, tx + Math.cos(a) * 0.09, 0.66, tz + Math.sin(a) * 0.09, R, 6); }
        for (let i = 0; i < 4; i++) k.box(0.012, 0.035, 0.006, tx, 0.2 + i * 0.09, tz - 0.083, 'dark');
        // the hall with its steep roof, the round apse in front, the spire
        k.box(0.22, 0.17, 0.14, 0.13, 0.085, 0.04, M, -0.1);
        k.roof(0.23, 0.16, 0.17, 0.13, 0.17, 0.04, R, -0.1);
        this.ribbedTower(k, 0.06, -0.05, 0.12, 0.12, M, 7, 1.05);
        k.cyl(0, 0.13, 0.09, 0.06, 0.18, -0.05, R, 12);
        k.box(0.03, 0.06, 0.03, 0.22, 0.31, 0.04, M);
        k.cyl(0, 0.045, 0.2, 0.22, 0.44, 0.04, R, 8);
        for (const sx of [0.1, 0.15, 0.2]) k.box(0.012, 0.04, 0.006, sx, 0.09, -0.03 - (sx - 0.13) * 0.1, 'dark', -0.1);
        return k.done();
    }

    /**
     * Beauclair, as painted: a fairy-tale white palace on the mountainside, asymmetric. Round
     * tiers ringed with dark arcades carry it; on them the hall with a great arched window under a
     * salmon roof, the slender tall tower at the left with a balcony, an arcaded lantern and a
     * needle spire, a round arcaded drum-tower at the far left; needle turrets everywhere. Below
     * in front the little town: white houses under salmon roofs, the gate with its turrets, trees.
     * No ring wall round it.
     */
    buildBeauclair(at, scale = 1, rot = 0, b) {
        const k = this.kit('beauclair', at, rot, scale), { L, S, G } = this.mapper(b), M = 'beauWhite', R = 'terracotta';
        this.plinth(k, 0.48);
        // the two round arcaded tiers
        const [ax, az] = L(3365, 1848), A = S(124);
        k.cyl(A, A * 1.02, 0.17, ax, 0.045, az, M, 30);
        k.cyl(A + 0.016, A + 0.016, 0.014, ax, 0.13, az, M, 30);
        this.arcade(k, ax, az, A, 0.07, 16, 0.026, 0.06, Math.PI * 1.04, Math.PI * 1.96);
        const [bx, bz] = L(3360, 1828), B = S(88);
        k.cyl(B, B, 0.1, bx, 0.18, bz, M, 26);
        k.cyl(B + 0.014, B + 0.014, 0.012, bx, 0.232, bz, M, 26);
        this.arcade(k, bx, bz, B, 0.18, 12, 0.022, 0.05, Math.PI * 1.06, Math.PI * 1.94);
        // the drum-tower at the far left: two rings of arches, a turret on top
        const [dx, dz] = L(3303, 1815), D = S(40);
        k.cyl(D, D * 1.03, 0.36, dx, 0.16, dz, M, 18);
        k.cyl(D + 0.016, D + 0.016, 0.014, dx, 0.34, dz, M, 18);
        this.arcade(k, dx, dz, D, 0.22, 7, 0.02, 0.05, Math.PI, Math.PI * 2);
        this.arcade(k, dx, dz, D, 0.29, 7, 0.018, 0.035, Math.PI, Math.PI * 2);
        this.turret(k, dx + 0.02, dz + 0.02, 0.34, 0.06, 0.09, R, 0.13, M);
        // the hall: a great arched window, a salmon roof; its annex to the right
        const [hx, hz] = L(3372, 1786), hw = S(58), hd = S(34);
        k.box(hw, 0.44, hd, hx, 0.22, hz, M);
        k.roof(hw * 1.04, hd * 1.14, 0.11, hx, 0.44, hz, R);
        k.box(0.075, 0.13, 0.006, hx + hw * 0.08, 0.31, hz - hd / 2 - 0.003, 'dark');
        k.cyl(0.075, 0.075, 0.006, hx + hw * 0.08, 0.375, hz - hd / 2 - 0.003, 'dark', 12).rotation.x = Math.PI / 2;
        for (const u of [-0.32, 0.4]) k.box(0.018, 0.05, 0.006, hx + u * hw, 0.33, hz - hd / 2 - 0.003, 'dark');
        const [nx, nz] = L(3406, 1774), nw = S(30);
        k.box(nw, 0.37, nw, nx, 0.185, nz, M);
        k.roof(nw * 1.06, nw * 1.12, 0.1, nx, 0.37, nz, R, Math.PI / 2);
        k.box(0.02, 0.05, 0.006, nx, 0.29, nz - nw / 2 - 0.003, 'dark');
        // the tall tower: a balcony, windows, the arcaded lantern, the needle spire
        const [tx, tz] = L(3333, 1782), T = S(30);
        k.cyl(T, T * 1.05, 0.64, tx, 0.3, tz, M, 14);
        k.cyl(T + 0.04, T + 0.02, 0.018, tx, 0.47, tz, M, 14);
        k.cyl(T + 0.02, T + 0.02, 0.016, tx, 0.62, tz, M, 14);
        k.cyl(T * 0.78, T * 0.78, 0.08, tx, 0.66, tz, M, 10);
        this.arcade(k, tx, tz, T * 0.78, 0.66, 6, 0.016, 0.04);
        k.cyl(T * 0.8 + 0.012, T * 0.8 + 0.012, 0.01, tx, 0.705, tz, M, 10);
        k.cyl(0, T * 0.84, 0.24, tx, 0.83, tz, R, 12);
        for (let i = 0; i < 3; i++) k.box(0.014, 0.04, 0.006, tx, 0.3 + i * 0.07, tz - T / 2 - 0.003, 'dark');
        // needle turrets on the tiers and the hall
        for (const [px, py, d, hh, ch] of [[3404, 1756, 0.05, 0.47, 0.14], [3368, 1810, 0.05, 0.33, 0.12], [3428, 1812, 0.05, 0.3, 0.12],
            [3398, 1800, 0.044, 0.29, 0.11], [3344, 1810, 0.044, 0.28, 0.1], [3286, 1850, 0.04, 0.19, 0.09]]) {
            const [x, z] = L(px, py); this.turret(k, x, z, 0, d, hh, R, ch, M);
        }
        // the town below: white houses under salmon roofs, the gate and its turrets, trees
        for (const [px, py, w, d, hh, ry] of [[3352, 1905, 40, 22, 0.08, 0.1], [3402, 1894, 36, 22, 0.08, -0.05], [3448, 1866, 26, 20, 0.07, 0.5],
            [3458, 1894, 24, 18, 0.07, 0.3], [3312, 1898, 24, 18, 0.08, 0], [3430, 1846, 20, 16, 0.06, 0.6]]) {
            const [x, z] = L(px, py); this.townHouse(k, x, z, S(w), S(d), hh, M, R, ry, null, 0.75, Math.min(0, G(px, py)));
        }
        const [gx, gz] = L(3312, 1898);
        k.box(0.04, 0.06, 0.006, gx, Math.min(0, G(3312, 1898)) + 0.03, gz - S(9) - 0.003, 'dark');
        for (const [px, py, hh] of [[3292, 1880, 0.16], [3332, 1884, 0.14], [3402, 1924, 0.12]]) { const [x, z] = L(px, py), g = Math.min(0, G(px, py)); this.turret(k, x, z, g - 0.03, 0.045, hh + 0.03, R, 0.1, M); }
        for (const [px, py] of [[3290, 1838], [3442, 1838], [3326, 1872], [3424, 1878], [3462, 1846], [3378, 1880], [3470, 1872]]) { const [x, z] = L(px, py); this.tree(k, x, z, 1.25); }
        return k.done();
    }

    /**
     * Kaer Seren, the School of the Griffin, as painted: a grim, squat grey fortress on the snowy
     * shore, not one roof. At the back right the huge round drum-tower with a broad machicolated
     * crown, the tallest and fattest of all; against it a square block with rows of windows; in
     * front three smaller round towers with crenellated crowns, crenellated curtains between;
     * an arcaded bridge leaves it to the east.
     */
    buildKaerSeren(at, scale = 1, rot = 0, b) {
        const k = this.kit('kaerSeren', at, rot, scale), { L, S, G } = this.mapper(b), M = 'ksStone';
        this.plinth(k, 0.4);
        // the heavy lower ward: a solid mass, crenellated all round
        const ward = [[1500, 470], [1522, 418], [1560, 400], [1610, 398], [1652, 425], [1650, 478], [1555, 492]].map(([x, y]) => L(x, y));
        k.prism(ward, -0.03, 0.12, M, M);
        for (let i = 0; i < ward.length; i++) { const [ax, az] = ward[i], [bx, bz] = ward[(i + 1) % ward.length]; k.crenels(ax, az, bx, bz, 0.124, 0.026, M, 0.04, 0.022, 0.026); }
        // the square block with its rows of windows
        const [qx, qz] = L(1576, 426), qw = S(54), qd = S(40);
        k.box(qw, 0.36, qd, qx, 0.17, qz, M);
        k.box(qw + 0.014, 0.014, qd + 0.014, qx, 0.35, qz, M);
        for (const [ax, az, cx, cz] of [[-1, -1, 1, -1], [-1, 1, 1, 1], [-1, -1, -1, 1], [1, -1, 1, 1]]) k.crenels(qx + ax * qw / 2, qz + az * qd / 2, qx + cx * qw / 2, qz + cz * qd / 2, 0.358, 0.022, M, 0.04, 0.022, 0.026);
        for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) k.box(0.014, 0.03, 0.006, qx - qw * 0.36 + i * qw * 0.24, 0.2 + r * 0.08, qz - qd / 2 - 0.003, 'dark');
        // the drum: the tallest, a broad machicolated crown, dark inside
        const [dx, dz] = L(1622, 428), D = S(58), H = 0.6;
        k.cyl(D, D * 1.05, H + 0.03, dx, (H - 0.03) / 2, dz, M, 20);
        k.cyl(D + 0.07, D, 0.06, dx, H - 0.01, dz, M, 20);
        for (let i = 0; i < 20; i++) { const a = (i + 0.5) / 20 * Math.PI * 2, r = D / 2 + 0.018; k.box(0.012, 0.03, 0.03, dx + Math.cos(a) * r, H - 0.05, dz + Math.sin(a) * r, M, -a); }
        k.crown(dx, dz, D + 0.05, H + 0.02, M);
        k.cyl(D, D, 0.004, dx, H + 0.035, dz, 'dark', 20);
        for (let i = 0; i < 4; i++) k.box(0.014, 0.034, 0.006, dx, 0.16 + i * 0.1, dz - D / 2 - 0.004, 'dark');
        k.box(0.04, 0.07, 0.006, dx - D * 0.36, 0.155, dz - D * 0.36, 'dark', Math.PI / 4);   // the arched door
        // the three front towers and the one behind them
        for (const [px, py, d, hh] of [[1527, 420, 30, 0.38], [1504, 468, 34, 0.28], [1550, 482, 38, 0.32], [1586, 458, 30, 0.36]]) { const [x, z] = L(px, py); this.roundTower(k, x, z, S(d), hh, M); }
        // the arcaded bridge to the east
        const [e0x, e0z] = L(1652, 414), [e1x, e1z] = L(1702, 404), ry = Math.atan2(e1x - e0x, e1z - e0z), len = Math.hypot(e1x - e0x, e1z - e0z);
        const ge = Math.min(0, G(1702, 404));
        k.box(0.06, 0.03, len, (e0x + e1x) / 2, 0.12, (e0z + e1z) / 2, M, ry);
        for (const sd of [-1, 1]) k.box(0.01, 0.02, len, (e0x + e1x) / 2 + Math.cos(ry) * sd * 0.028, 0.145, (e0z + e1z) / 2 - Math.sin(ry) * sd * 0.028, M, ry);
        for (let i = 1; i <= 3; i++) {
            const f = i / 3, x = e0x + (e1x - e0x) * f, z = e0z + (e1z - e0z) * f, g = ge * f - 0.04;
            k.box(0.06, 0.12 - g, 0.03, x, (0.12 + g) / 2, z, M, ry);
        }
        for (let i = 0; i < 3; i++) { const f = (i + 0.5) / 3; k.box(0.034, 0.05, 0.062, e0x + (e1x - e0x) * f, 0.08, e0z + (e1z - e0z) * f, 'dark', ry + Math.PI / 2); }
        return k.done();
    }

    /**
     * Novigrad, as painted: the biggest, busiest city of the board, all crimson roofs. A rocky hill
     * at the left carries the temple-castle with its tall tower under a red pyramid roof and houses
     * round it; a bridge of arches curves from the hill across the town; the east quarter is a mass
     * of white timbered houses under steep red roofs with a second spire; a low wall with red-coned
     * turrets runs along the water at the front and round the east side.
     */
    buildNovigrad(at, scale = 1, rot = 0, b) {
        const k = this.kit('novigrad', at, rot, scale), { L, S } = this.mapper(b), W = 'novWall', R = 'novRoof';
        // the town stands on the plain by the sea: a low bank, no rock plinth
        const ek = k.cyl(S(236), S(244), 0.06, 0, -0.018, 0, 'yard', 28); ek.scaling.z = 102 / 118;
        // the hill and the temple-castle on it
        const [hx, hz] = L(1788, 764), HT = 0.17;
        const hill = k.cyl(S(66), S(118), HT + 0.04, hx, HT / 2 - 0.02, hz, 'rock', 7); hill.scaling.z = 0.85;
        k.cyl(S(30), S(56), 0.08, hx + S(22), 0.03, hz - S(20), 'rock', 6);
        const [tx, tz] = L(1796, 744), tw = S(20);
        k.box(tw, 0.42, tw, tx, HT + 0.12, tz, W);
        k.box(tw + 0.012, 0.012, tw + 0.012, tx, HT + 0.33, tz, W);
        k.cyl(0, tw * 1.45, tw * 1.6, tx, HT + 0.336 + tw * 0.8, tz, R, 4).rotation.y = Math.PI / 4;
        for (let i = 0; i < 3; i++) k.box(0.012, 0.026, 0.006, tx, HT + 0.08 + i * 0.07, tz - tw / 2 - 0.003, 'dark');
        for (const [px, py, w, d, hh, ry] of [[1768, 750, 22, 16, 0.07, 0.3], [1816, 756, 20, 16, 0.08, -0.2], [1774, 780, 22, 16, 0.06, 0.1], [1806, 782, 18, 14, 0.06, -0.1], [1790, 798, 20, 14, 0.05, 0]]) {
            const [x, z] = L(px, py); this.townHouse(k, x, z, S(w), S(d), hh, W, R, ry, 'timber', 0.9, HT - 0.04);
        }
        // the bridge of arches from the hill across the town
        const span = (ax, ay, bx, by, y, n) => {
            const [x0, z0] = L(ax, ay), [x1, z1] = L(bx, by), ry = Math.atan2(x1 - x0, z1 - z0), len = Math.hypot(x1 - x0, z1 - z0);
            k.box(0.05, 0.022, len, (x0 + x1) / 2, y, (z0 + z1) / 2, 'pale', ry);
            for (const sd of [-1, 1]) k.box(0.008, 0.016, len, (x0 + x1) / 2 + Math.cos(ry) * sd * 0.022, y + 0.018, (z0 + z1) / 2 - Math.sin(ry) * sd * 0.022, 'pale', ry);
            for (let i = 0; i <= n; i++) { const f = i / n; k.box(0.05, y, 0.02, x0 + (x1 - x0) * f, y / 2, z0 + (z1 - z0) * f, 'pale', ry); }
            for (let i = 0; i < n; i++) { const f = (i + 0.5) / n; k.box(0.052, y * 0.55, 0.03, x0 + (x1 - x0) * f, y * 0.3, z0 + (z1 - z0) * f, 'dark', ry + Math.PI / 2); }
        };
        span(1808, 800, 1852, 812, 0.12, 4);
        span(1852, 812, 1858, 856, 0.09, 2);
        // the houses: the east quarter, the quarter under the hill
        const avoid = [[1788, 768, 44], [1830, 806, 12], [1854, 834, 11], [1880, 768, 12], [1910, 886, 12]];
        const quarters = [
            [[1838, 772], [1900, 760], [1944, 786], [1952, 850], [1942, 900], [1880, 906], [1846, 882], [1830, 830]],
            [[1738, 818], [1792, 826], [1830, 842], [1846, 900], [1782, 906], [1736, 882]],
        ];
        quarters.forEach((poly, qi) => {
            for (const [px, py, r1, r2, r3] of this.scatterPx(poly, 16, 41 + qi * 7, avoid)) {
                const [x, z] = L(px, py);
                this.townHouse(k, x, z, S(13 + 8 * r1), S(10 + 5 * r2), 0.055 + 0.05 * r3, W, R, (r1 - 0.5) * 0.5 + (r2 > 0.7 ? Math.PI / 2 : 0), r3 > 0.4 ? 'timber' : null, 0.95);
            }
        });
        // the spires: a white tower with a tall red spire, a lower one with a pyramid roof
        const [sx, sz] = L(1880, 768), sw = S(16);
        k.box(sw, 0.34, sw, sx, 0.17, sz, W);
        k.cyl(0, sw * 1.3, 0.2, sx, 0.34 + 0.1, sz, R, 8);
        for (let i = 0; i < 3; i++) k.box(0.01, 0.022, 0.006, sx, 0.1 + i * 0.07, sz - sw / 2 - 0.003, 'dark');
        const [ux, uz] = L(1910, 886);
        this.squareTower(k, ux, uz, S(18), 0.24, W, 0, R);
        // the wall along the water and round the east side, turrets with red cones
        const wall = [[1762, 904], [1800, 918], [1870, 922], [1950, 914], [1962, 862], [1956, 802], [1936, 772]].map(([x, y]) => L(x, y));
        for (let i = 0; i < wall.length - 1; i++) {
            const [ax, az] = wall[i], [bx, bz] = wall[i + 1], len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
            k.box(0.024, 0.07, len, (ax + bx) / 2, 0.035, (az + bz) / 2, W, ry);
            k.crenels(ax, az, bx, bz, 0.074, 0.024, W);
        }
        for (const [px, py] of [[1800, 918], [1950, 914], [1962, 862], [1762, 904]]) { const [x, z] = L(px, py); this.roundTower(k, x, z, S(14), 0.13, W, R, 0.1); }
        return k.done();
    }

    /**
     * Cidaris, as painted: a small sea port. A two-masted ship lies at the wooden pier; white
     * timbered houses under dark red roofs crowd the water, their ground floors arched warehouses;
     * behind them a white square watchtower; a crenellated yard at the right and a piece of wall
     * at the front right.
     */
    buildCidaris(at, scale = 1, rot = 0, b) {
        const k = this.kit('cidaris', at, rot, scale), { L, S, G } = this.mapper(b), W = 'cidWall', R = 'cidRoof';
        // the long warehouse on the quay: a row of dark arches
        const [qx, qz] = L(1340, 1106), qw = S(80), qd = S(18);
        k.box(qw, 0.07, qd, qx, 0.035, qz, W);
        k.roof(qw * 1.03, qd * 1.12, 0.035, qx, 0.07, qz, R);
        for (let i = 0; i < 7; i++) k.box(0.022, 0.04, 0.006, qx - qw * 0.42 + i * qw * 0.14, 0.022, qz - qd / 2 - 0.003, 'dark');
        // the houses on the water
        for (let [px, py, w, d, hh, ry] of [[1388, 1075, 36, 26, 0.13, 0.05], [1430, 1068, 28, 22, 0.12, -0.1], [1478, 1078, 30, 22, 0.12, 0.1], [1512, 1088, 26, 20, 0.1, 0.4],
            [1414, 1104, 30, 22, 0.11, 0], [1452, 1110, 26, 20, 0.1, 0.2], [1492, 1112, 28, 22, 0.1, -0.1], [1530, 1116, 30, 22, 0.11, 0.1], [1556, 1098, 22, 18, 0.09, 0.3],
            [1450, 1088, 20, 16, 0.13, 0], [1372, 1098, 22, 18, 0.08, 0], [1546, 1132, 26, 18, 0.08, 0], [1404, 1128, 22, 16, 0.07, 0.1], [1470, 1134, 22, 16, 0.07, -0.1],
            [1408, 1086, 18, 14, 0.09, 0.2], [1496, 1094, 18, 14, 0.1, -0.2], [1520, 1136, 18, 14, 0.07, 0.3], [1434, 1124, 18, 14, 0.08, -0.3]]) {
            const [x, z] = L(px, py);
            w *= 0.8; d *= 0.8; hh *= 0.8;
            this.townHouse(k, x, z, S(w), S(d), hh, W, R, ry, 'timber', 0.85, Math.min(0, G(px, py)));
            const c = Math.cos(ry), s = Math.sin(ry);   // arched ground floor
            for (const u of [-0.25, 0.25]) k.box(0.02, 0.032, 0.005, x + u * S(w) * c + (-S(d) / 2 - 0.003) * s, Math.min(0, G(px, py)) + 0.016, z - u * S(w) * s + (-S(d) / 2 - 0.003) * c, 'dark', ry);
        }
        // the white watchtower
        const [tx, tz] = L(1462, 1052);
        this.squareTower(k, tx, tz, S(22), 0.34, W);
        // the crenellated yard at the right, the wall at the front right
        const yard = [[1502, 1046], [1544, 1046], [1544, 1068], [1502, 1068]].map(([x, y]) => L(x, y));
        this.curtain(k, yard, 0.06, 0.02, W);
        const fw = [[1478, 1152], [1522, 1148], [1566, 1140]].map(([x, y]) => L(x, y));
        for (let i = 0; i < 2; i++) {
            const [ax, az] = fw[i], [bx, bz] = fw[i + 1], len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az), g = Math.min(0, G(1500 + i * 44, 1150));
            k.box(0.022, 0.07 - g, len, (ax + bx) / 2, (0.07 + g) / 2, (az + bz) / 2, W, ry);
            k.crenels(ax, az, bx, bz, 0.074, 0.022, W);
        }
        for (const [px, py] of [[1478, 1152], [1566, 1140]]) { const [x, z] = L(px, py); this.roundTower(k, x, z, S(14), 0.1, W); }
        // the wooden pier into the harbour
        const [p0x, p0z] = L(1336, 1082), [p1x, p1z] = L(1372, 1062), pr = Math.atan2(p1x - p0x, p1z - p0z), pl = Math.hypot(p1x - p0x, p1z - p0z), pg = G(1350, 1072) + 0.016;
        k.box(0.04, 0.008, pl, (p0x + p1x) / 2, pg, (p0z + p1z) / 2, 'plank', pr);
        for (let i = 0; i <= 3; i++) { const f = i / 3; for (const sd of [-1, 1]) k.box(0.008, 0.05, 0.008, p0x + (p1x - p0x) * f + Math.cos(pr) * sd * 0.02, pg - 0.02, p0z + (p1z - p0z) * f - Math.sin(pr) * sd * 0.02, 'wood'); }
        // the ship: a hull with a raised stern, two masts, sails
        const [sx, sz] = L(1312, 1064), sg = G(1312, 1064) + 0.004, sr = -0.35, c = Math.cos(sr), s = Math.sin(sr);
        const P = (u, v) => [sx + u * c + v * s, sz - u * s + v * c];
        k.box(S(46), 0.034, S(11), sx, sg + 0.012, sz, 'wood', sr);
        { const [x, z] = P(-S(25), 0); k.box(S(10), 0.026, S(7), x, sg + 0.016, z, 'wood', sr); }
        { const [x, z] = P(S(20), 0); k.box(S(12), 0.03, S(10), x, sg + 0.042, z, 'wood', sr); }
        for (const [u, hh] of [[-S(8), 0.19], [S(8), 0.16]]) {
            const [x, z] = P(u, 0);
            k.cyl(0.006, 0.008, hh, x, sg + 0.03 + hh / 2, z, 'wood', 5);
            k.box(0.004, hh * 0.38, S(15), x, sg + 0.03 + hh * 0.42, z, 'sail', sr + Math.PI / 2);
            k.box(0.004, hh * 0.3, S(12), x, sg + 0.03 + hh * 0.8, z, 'sail', sr + Math.PI / 2);
        }
        return k.done();
    }

    /**
     * Cintra, as painted: a perfectly round high wall, white with dark buttresses, and the town
     * packed inside it — crimson roofs, white walls, dark slender spires of the temples, a big
     * gabled hall; at the front left grey rock breaks through the wall; gate towers at the east;
     * a few houses outside the wall.
     */
    buildCintra(at, scale = 1, rot = 0, b) {
        const k = this.kit('cintra', at, rot, scale), { L, S, G } = this.mapper(b), W = 'cinWall', R = 'cinRoof';
        const CX = 1555, CY = 1584, RX = 122, RY = 64, N = 32, ring = [];
        for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2; ring.push([CX + Math.cos(a) * RX, CY + Math.sin(a) * RY]); }
        const rockAt = (px, py) => px < 1505 && py > 1598;
        const pts = ring.map(([x, y]) => L(x, y));
        for (let i = 0; i < N; i++) {
            const [a0, a1] = [ring[i], ring[(i + 1) % N]];
            if (rockAt((a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2)) continue;
            const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % N], len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
            k.box(0.03, 0.15, len + 0.004, (ax + bx) / 2, 0.055, (az + bz) / 2, W, ry);
            k.box(0.042, 0.012, len + 0.004, (ax + bx) / 2, 0.13, (az + bz) / 2, W, ry);
            if (i % 2 === 0) k.box(0.044, 0.12, 0.016, ax, 0.04, az, 'ruin', ry);
        }
        k.floor(pts, 0.012, 'yard');
        // the rock breaking through the wall
        for (const [px, py, d, hh] of [[1470, 1612, 30, 0.14], [1490, 1632, 26, 0.17], [1454, 1630, 22, 0.1], [1506, 1648, 20, 0.08], [1482, 1600, 18, 0.11]]) {
            const [x, z] = L(px, py); k.cyl(S(d) * 0.55, S(d) * 1.1, hh + 0.04, x, hh / 2 - 0.02, z, 'rock', 6).rotation.y = px;
        }
        // the gate towers at the east
        for (const [px, py] of [[1676, 1572], [1672, 1600]]) { const [x, z] = L(px, py); this.roundTower(k, x, z, S(20), 0.17, W); }
        // the temples: dark slender spires, the big gabled hall
        const spires = [[1505, 1540, 0.2, 0.15], [1580, 1527, 0.27, 0.18], [1622, 1537, 0.2, 0.14], [1545, 1562, 0.16, 0.12], [1640, 1560, 0.14, 0.1]];
        for (const [px, py, hh, ch] of spires) { const [x, z] = L(px, py); this.turret(k, x, z, 0, S(10), hh, 'spire', ch, 'spire', 8); }
        const [hx, hz] = L(1578, 1556);
        this.townHouse(k, hx, hz, S(34), S(20), 0.13, W, R, 0.1, null, 1.1);
        // the houses packed inside the wall
        const inner = []; for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; inner.push([CX + Math.cos(a) * (RX - 12), CY + Math.sin(a) * (RY - 9)]); }
        const avoid = [[1478, 1622, 34], [1578, 1556, 22], ...spires.map(([x, y]) => [x, y, 8])];
        for (const [px, py, r1, r2, r3] of this.scatterPx(inner, 15, 77, avoid)) {
            const [x, z] = L(px, py);
            this.townHouse(k, x, z, S(12 + 7 * r1), S(10 + 4 * r2), 0.05 + 0.05 * r3, 'pale', R, (r1 - 0.5) * 0.7 + (r2 > 0.6 ? Math.PI / 2 : 0), null, 0.95);
        }
        // and a few outside it
        for (const [px, py, ry] of [[1572, 1664, 0.1], [1602, 1670, -0.2], [1632, 1662, 0.3], [1656, 1670, 0], [1466, 1554, 0.4], [1450, 1570, -0.2]]) {
            const [x, z] = L(px, py); this.townHouse(k, x, z, S(16), S(12), 0.06, 'pale', R, ry, null, 0.95, Math.min(0, G(px, py)));
        }
        return k.done();
    }

    /** A house with a stepped gable to the front (-z of its own turn `ry`): Glenmore's houses
     *  and hall. The ridge runs front to back, so the gable faces the valley. */
    gableHouse(k, x, z, w, d, hh, wall, roof, ry = 0, steps = 3, y0 = 0) {
        const c = Math.cos(ry), s = Math.sin(ry), at = (u, v) => [x + u * c + v * s, z - u * s + v * c];
        k.box(w, hh + 0.04 - y0 * 0, d, x, y0 + (hh - 0.04) / 2, z, wall, ry);
        k.roof(d * 1.04, w * 1.1, w * 0.75, x, y0 + hh, z, roof, ry + Math.PI / 2);
        // the stepped gable: blocks narrowing upward on the front face
        const rise = w * 0.75;
        for (let i = 0; i < steps; i++) {
            const f = (i + 0.5) / steps, sw = w * (1 - f) + 0.01, [gx, gz] = at(0, -d / 2 + 0.006);
            k.box(sw, rise / steps + 0.004, 0.014, gx, y0 + hh + rise * i / steps + rise / steps / 2, gz, wall, ry);
        }
        const [dx, dz] = at(0, -d / 2 - 0.003);
        k.box(Math.min(0.022, w * 0.3), 0.034, 0.005, dx, y0 + hh * 0.45, dz, 'dark', ry);
    }

    /** Glenmore, as painted: an open little town on the meadow by the sea, no walls. A tall thin
     *  round tower of grey stone, its top broken; a big hall with stepped gables and a tall arched
     *  window; white houses with stepped gables under brown-red roofs; a plank landing at the water. */
    buildGlenmore(at, scale = 1, rot = 0, b) {
        const k = this.kit('glenmore', at, rot, scale), { L, S, G } = this.mapper(b), W = 'glWall', R = 'glRoof';
        // the tower: slender, arched openings at the top, the crown broken unevenly
        const [tx, tz] = L(1760, 2152), T = S(24), TH = 0.5;
        k.cyl(T, T * 1.08, TH + 0.04, tx, (TH - 0.04) / 2, tz, 'glStone', 12);
        for (let i = 0; i < 6; i++) {
            const a = i / 6 * Math.PI * 2, hgt = [0.05, 0.02, 0.07, 0.03, 0.06, 0.01][i];
            k.box(0.03, hgt, 0.02, tx + Math.cos(a) * T * 0.45, TH + hgt / 2, tz + Math.sin(a) * T * 0.45, 'glStone', -a + Math.PI / 2);
        }
        for (const y of [0.15, 0.27, 0.42]) k.box(0.016, y > 0.4 ? 0.06 : 0.03, 0.006, tx, y, tz - T / 2 - 0.004, 'dark');
        // the hall: stepped gables, the tall arched window in the front gable
        const [hx, hz] = L(1830, 2168);
        this.gableHouse(k, hx, hz, S(40), S(52), 0.17, W, R, -0.15, 4);
        const c = Math.cos(-0.15), s2 = Math.sin(-0.15), fz = -S(26) - 0.004;
        k.box(0.04, 0.12, 0.006, hx + fz * s2, 0.14, hz + fz * c, 'dark', -0.15);
        k.cyl(0.04, 0.04, 0.006, hx + fz * s2, 0.2, hz + fz * c, 'dark', 10).rotation.set(Math.PI / 2, 0, 0.15);
        // the houses round the paths
        for (const [px, py, w, d, hh, ry, st] of [[1682, 2182, 22, 26, 0.08, 0.3, 3], [1712, 2150, 20, 24, 0.08, 0.1, 3], [1746, 2160, 18, 20, 0.07, -0.2, 0],
            [1664, 2214, 20, 24, 0.07, 0.2, 3], [1694, 2226, 22, 26, 0.08, -0.1, 0], [1728, 2222, 20, 24, 0.08, 0.15, 3], [1786, 2166, 20, 22, 0.07, -0.3, 0],
            [1780, 2214, 22, 24, 0.08, 0.1, 3], [1814, 2212, 20, 22, 0.07, -0.2, 0], [1850, 2205, 18, 20, 0.06, 0.3, 3], [1700, 2196, 16, 18, 0.06, 0, 0]]) {
            const [x, z] = L(px, py), g = Math.min(0, G(px, py));
            if (st) this.gableHouse(k, x, z, S(w), S(d), hh, W, R, ry, st, g);
            else this.townHouse(k, x, z, S(d), S(w), hh, W, R, ry, null, 0.8, g);
        }
        // the plank landing down to the water
        const [p0x, p0z] = L(1626, 2222), [p1x, p1z] = L(1660, 2218), pg = G(1640, 2220) + 0.014, pr = Math.atan2(p1x - p0x, p1z - p0z);
        k.box(0.03, 0.008, Math.hypot(p1x - p0x, p1z - p0z), (p0x + p1x) / 2, pg, (p0z + p1z) / 2, 'plank', pr);
        return k.done();
    }

    /** Doldet, as painted: a town in a bowl of snowy mountains. A low crenellated wall curves
     *  round it; in the middle the big round white tower; at the right the gate with its arch and
     *  a second round tower; red-roofed houses on the slope inside. */
    buildDoldet(at, scale = 1, rot = 0, b) {
        const k = this.kit('doldet', at, rot, scale), { L, S, G } = this.mapper(b), M = 'doStone';
        this.plinth(k, 0.46);
        const wall = [[1745, 2662], [1724, 2690], [1722, 2725], [1745, 2752], [1790, 2762], [1850, 2762], [1896, 2750]].map(([x, y]) => L(x, y));
        for (let i = 0; i < wall.length - 1; i++) {
            const [ax, az] = wall[i], [bx, bz] = wall[i + 1], len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
            k.box(0.026, 0.11, len + 0.004, (ax + bx) / 2, 0.035, (az + bz) / 2, M, ry);
            k.crenels(ax, az, bx, bz, 0.094, 0.026, M);
        }
        k.floor([...wall, L(1900, 2700), L(1860, 2650), L(1790, 2640)], 0.012, 'yard');
        // the big round tower
        const [tx, tz] = L(1805, 2682), T = S(40);
        k.cyl(T, T * 1.05, 0.4, tx, 0.18, tz, M, 18);
        k.crown(tx, tz, T, 0.38, M);
        for (let i = 0; i < 3; i++) for (const da of [-0.5, 0.5]) { const a = -Math.PI / 2 + da; k.box(0.014, 0.03, 0.006, tx + Math.cos(a) * (T / 2 + 0.002), 0.12 + i * 0.09, tz + Math.sin(a) * (T / 2 + 0.002), 'dark', -a + Math.PI / 2); }
        // the gate: an arched block, the second round tower, a wall to the big tower
        const [gx, gz] = L(1856, 2714), gw = S(36), gd = S(16);
        k.box(gw, 0.18, gd, gx, 0.07, gz, M);
        k.crenels(gx - gw / 2, gz - gd / 2, gx + gw / 2, gz - gd / 2, 0.164, 0.02, M);
        k.box(0.05, 0.08, 0.006, gx, 0.04, gz - gd / 2 - 0.003, 'dark');
        k.cyl(0.05, 0.05, 0.006, gx, 0.08, gz - gd / 2 - 0.003, 'dark', 10).rotation.x = Math.PI / 2;
        const [rx, rz] = L(1888, 2716); this.roundTower(k, rx, rz, S(22), 0.24, M);
        const [ix0, iz0] = L(1838, 2712), [ix1, iz1] = L(1818, 2696);
        k.box(0.02, 0.09, Math.hypot(ix1 - ix0, iz1 - iz0), (ix0 + ix1) / 2, 0.045, (iz0 + iz1) / 2, M, Math.atan2(ix1 - ix0, iz1 - iz0));
        // the houses
        for (const [px, py, w, d, hh, ry] of [[1758, 2690, 24, 18, 0.08, 0.3], [1748, 2722, 22, 16, 0.07, -0.2], [1774, 2738, 20, 16, 0.06, 0], [1842, 2652, 26, 18, 0.08, 0.2],
            [1872, 2632, 22, 16, 0.07, -0.1], [1828, 2740, 24, 16, 0.07, 0], [1860, 2744, 20, 16, 0.06, 0.2], [1838, 2674, 18, 14, 0.07, 0], [1896, 2690, 20, 16, 0.07, 0.4], [1776, 2710, 16, 14, 0.06, -0.3]]) {
            const [x, z] = L(px, py); this.townHouse(k, x, z, S(w), S(d), hh, 'pale', 'roofRed', ry, 'timber', 0.8, Math.min(0, G(px, py)));
        }
        return k.done();
    }

    /** Lok Ihor, as painted: an elven manor among a village. In the middle the white-pink manor
     *  with a carved facade, red gables and slender turrets under red cones; round it wooden
     *  cottages under grey straw, some only rafters (half built or half fallen); a well. */
    buildLokIhor(at, scale = 1, rot = 0, b) {
        const k = this.kit('lokIhor', at, rot, scale), { L, S, G } = this.mapper(b), M = 'liWhite', R = 'liRoof';
        // the manor: the main block, a front gable, arched windows, the turrets
        const [mx, mz] = L(2696, 2528), mw = S(56), md = S(30);
        k.box(mw, 0.22, md, mx, 0.11, mz, M);
        k.roof(mw * 1.04, md * 1.14, 0.1, mx, 0.22, mz, R);
        k.box(S(20), 0.28, 0.03, mx + S(4), 0.14, mz - md / 2 - 0.012, M);
        k.roof(0.03, S(22), 0.08, mx + S(4), 0.28, mz - md / 2 - 0.012, R, Math.PI / 2);
        for (let r = 0; r < 2; r++) for (let i = 0; i < 5; i++) {
            const x = mx - mw * 0.4 + i * mw * 0.2;
            k.box(0.014, 0.04, 0.006, x, 0.07 + r * 0.08, mz - md / 2 - (Math.abs(x - mx - S(4)) < S(10) ? 0.03 : 0.003), 'dark');
        }
        for (const [px, py, d, hh, ch] of [[2664, 2526, 16, 0.32, 0.12], [2690, 2508, 12, 0.32, 0.11], [2726, 2512, 12, 0.28, 0.1], [2668, 2546, 10, 0.2, 0.08]]) {
            const [x, z] = L(px, py); this.turret(k, x, z, 0, S(d), hh, R, ch, M);
        }
        // the cottages: wood under grey straw; some only rafters
        for (const [px, py, w, d, hh, ry, bare] of [[2580, 2522, 30, 22, 0.07, 0.2, 0], [2606, 2510, 26, 20, 0.07, -0.3, 1], [2570, 2548, 26, 20, 0.06, 0.1, 0],
            [2612, 2546, 24, 18, 0.06, 0.3, 0], [2592, 2582, 30, 22, 0.07, -0.1, 0], [2628, 2588, 24, 18, 0.06, 0.2, 1], [2690, 2588, 30, 22, 0.07, 0, 0],
            [2736, 2574, 26, 20, 0.06, -0.2, 0], [2758, 2554, 24, 18, 0.06, 0.3, 1], [2716, 2596, 20, 16, 0.05, 0.1, 0]]) {
            const [x, z] = L(px, py), g = Math.min(0, G(px, py)), W = S(w), D = S(d);
            if (!bare) { this.townHouse(k, x, z, W, D, hh, 'timber', 'liThatch', ry, null, 0.8, g); continue; }
            k.box(W, hh + 0.04, D, x, g + (hh - 0.04) / 2, z, 'timber', ry);
            const c = Math.cos(ry), sn = Math.sin(ry);
            for (let i = 0; i < 4; i++) {
                const u = -W / 2 + W * (i + 0.5) / 4, cx = x + u * c, cz = z - u * sn;
                for (const sd of [-1, 1]) {
                    const r = k.box(0.006, D * 0.62, 0.006, cx + sd * D * 0.24 * sn, g + hh + D * 0.2, cz + sd * D * 0.24 * c, 'wood', ry);
                    r.rotation.x = sd * 0.85; r.rotation.y = ry;
                }
            }
            k.box(W, 0.006, 0.006, x, g + hh + D * 0.42, z, 'wood', ry);
        }
        // the well
        const [wx, wz] = L(2645, 2552);
        k.cyl(0.03, 0.032, 0.025, wx, 0.012, wz, 'ruin', 8);
        for (const sd of [-1, 1]) k.box(0.004, 0.04, 0.004, wx + sd * 0.012, 0.04, wz, 'wood');
        k.roof(0.04, 0.034, 0.014, wx, 0.058, wz, 'liThatch');
        return k.done();
    }

    /** Duvod, as painted: a village first — a tight cluster of wooden and brick houses under pale
     *  straw; behind it a small manor of grey stone with a tall gable, a curved white wall and a
     *  round tower under a red cone. */
    buildDuvod(at, scale = 1, rot = 0, b) {
        const k = this.kit('duvod', at, rot, scale), { L, S, G } = this.mapper(b), T = 'duThatch';
        // the manor: the tall gabled stone house, the curved wall, the tower
        const [mx, mz] = L(2086, 2998), g0 = Math.min(0, G(2086, 2998));
        this.townHouse(k, mx, mz, S(34), S(30), 0.17, 'duStone', 'roofRed', Math.PI / 2 + 0.1, null, 1.0, g0);
        const arc = [[2098, 2978], [2112, 2970], [2130, 2967], [2148, 2972], [2160, 2984]].map(([x, y]) => [...L(x, y), Math.min(0, G(x, y))]);
        for (let i = 0; i < arc.length - 1; i++) {
            const [ax, az, ga] = arc[i], [bx, bz] = arc[i + 1], len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
            k.box(0.022, 0.07 - ga + 0.03, len + 0.004, (ax + bx) / 2, (0.07 + ga - 0.03) / 2, (az + bz) / 2, 'white', ry);
        }
        const [tx, tz] = L(2165, 3004), gt = Math.min(0, G(2165, 3004));
        this.turret(k, tx, tz, gt - 0.03, S(22), 0.23, 'roofRed', 0.13, 'white', 12);
        // the village
        for (const [px, py, w, d, hh, ry, brick] of [[1996, 3080, 36, 24, 0.09, 0.3, 1], [2036, 3045, 26, 20, 0.07, 0.1, 0], [2082, 3055, 26, 20, 0.07, -0.1, 0],
            [2120, 3046, 22, 18, 0.06, 0.2, 0], [2148, 3072, 26, 18, 0.06, 0.4, 0], [2050, 3104, 26, 20, 0.07, 0, 1], [2090, 3102, 22, 18, 0.06, -0.2, 0],
            [2126, 3095, 22, 18, 0.06, 0.3, 0], [2016, 3110, 20, 16, 0.06, 0, 0], [2060, 3078, 20, 16, 0.06, 0.5, 0], [2106, 3076, 18, 14, 0.05, 0, 0], [2160, 3040, 18, 14, 0.05, -0.3, 0]]) {
            const [x, z] = L(px, py);
            this.townHouse(k, x, z, S(w), S(d), hh, brick ? 'brownStone' : 'timber', brick ? 'roofRed' : T, ry, null, 0.85, Math.min(0, G(px, py)));
        }
        return k.done();
    }

    /** Gorthur Gvaed, as painted: a low grey fort on the lake shore, all horizontal — long walls
     *  pierced with round loopholes, angular bastions, the gate with two arches; inside white
     *  houses under red roofs and a square tower under a tall red pyramid. */
    buildGorthurGvaed(at, scale = 1, rot = 0, b) {
        const k = this.kit('gorthurGvaed', at, rot, scale), { L, S } = this.mapper(b), M = 'ggStone';
        this.plinth(k, 0.44);
        // inside, behind the walls: the houses and the tower
        for (const [px, py, w, d, hh] of [[3800, 2404, 34, 22, 0.12], [3838, 2394, 24, 18, 0.11], [3902, 2396, 22, 16, 0.1], [3778, 2420, 22, 16, 0.1]]) {
            const [x, z] = L(px, py); this.townHouse(k, x, z, S(w), S(d), hh, 'pale', 'roofRed', 0, null, 0.75);
        }
        const [tx, tz] = L(3862, 2402);
        this.squareTower(k, tx, tz, S(26), 0.22, M, 0, 'roofRed');
        // the walls: blocks of different heights, round loopholes, fine merlons, the gate
        const blocks = [[[3752, 2440], [3830, 2436], [3832, 2468], [3760, 2470]], [[3830, 2426], [3872, 2424], [3874, 2464], [3832, 2466]], [[3872, 2420], [3936, 2420], [3940, 2458], [3874, 2462]]];
        const tops = [0.075, 0.095, 0.085];
        blocks.forEach((bl, bi) => {
            const pts = bl.map(([x, y]) => L(x, y)), top = tops[bi];
            k.prism(pts, -0.03, top, M, M);
            for (let i = 0; i < 4; i++) { const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % 4]; k.crenels(ax, az, bx, bz, top + 0.004, 0.02, M, 0.03, 0.014, 0.016); }
            // round loopholes along the front face (pts[2] → pts[3] runs along the front)
            const [fx0, fz0] = pts[3], [fx1, fz1] = pts[2], ry = Math.atan2(fx1 - fx0, fz1 - fz0), n = Math.max(2, Math.round(Math.hypot(fx1 - fx0, fz1 - fz0) / 0.05));
            for (let r = 0; r < 2; r++) for (let i = 0; i < n; i++) {
                const f = (i + 0.5) / n, x = fx0 + (fx1 - fx0) * f, z = fz0 + (fz1 - fz0) * f - 0.003;
                if (bi === 2 && f > 0.45) continue;   // the gate is there
                k.cyl(0.012, 0.012, 0.006, x, top * (0.35 + r * 0.32), z, 'dark', 8).rotation.set(Math.PI / 2, ry - Math.PI / 2, 0);
            }
        });
        for (const px of [3906, 3926]) {
            const [x, z] = L(px, 2460);
            k.box(0.032, 0.04, 0.006, x, 0.02, z - 0.003, 'dark');
            k.cyl(0.032, 0.032, 0.006, x, 0.04, z - 0.003, 'dark', 10).rotation.x = Math.PI / 2;
        }
        return k.done();
    }

    /** Stygga, the School of the Cat, as painted: a round keep stepped like a cake — concentric
     *  crenellated drums, each higher and narrower, a dome on top; warm pinkish stone, burgundy
     *  cones; an outer polygonal wall with turrets under burgundy cones. */
    buildStygga(at, scale = 1, rot = 0, b) {
        const k = this.kit('stygga', at, rot, scale), { L, S } = this.mapper(b), M = 'stStone', R = 'stRoof';
        this.plinth(k, 0.46);
        const ring = [[2945, 2986], [2990, 2975], [3060, 2988], [3110, 3008], [3106, 3040], [3040, 3050], [2960, 3042], [2940, 3016]].map(([x, y]) => L(x, y));
        this.curtain(k, ring, 0.09, 0.026, M);
        k.floor(ring, 0.012, 'yard');
        for (const [px, py, hh] of [[2950, 2986, 0.2], [2990, 2975, 0.23], [2942, 3030, 0.14], [3106, 3040, 0.14], [3110, 3006, 0.16], [3040, 3050, 0.12]]) {
            const [x, z] = L(px, py); this.turret(k, x, z, 0, 0.05, hh, R, 0.1, M);
        }
        // the drums, each with a ring of dark windows and merlons
        const drums = [[3046, 3004, 110, 0.17], [3050, 2992, 74, 0.29], [3058, 2982, 42, 0.4]];
        drums.forEach(([px, py, d, hh], i) => {
            const [x, z] = L(px, py), D = S(d);
            k.cyl(D, D * 1.02, hh + 0.03, x, (hh - 0.03) / 2, z, M, 24);
            k.crown(x, z, D, hh, M);
            this.arcade(k, x, z, D, hh - 0.045, Math.round(d / 7), 0.012, 0.026, Math.PI * 0.9, Math.PI * 2.1);
        });
        const [tx, tz] = L(3058, 2982), T = S(42);
        k.cyl(T * 0.7, T * 0.7, 0.05, tx, 0.43 + 0.025, tz, M, 14);
        k.cyl(0, T * 0.82, 0.08, tx, 0.5 + 0.04, tz, R, 14);
        // burgundy cones on the drums' rims
        for (const [px, py, y0, hh] of [[3074, 3034, 0.17, 0.06], [3098, 3016, 0.17, 0.06], [3028, 2976, 0.29, 0.06], [3086, 2986, 0.29, 0.05], [3014, 3030, 0.17, 0.05]]) {
            const [x, z] = L(px, py); this.turret(k, x, z, y0, 0.044, hh, R, 0.08, M);
        }
        return k.done();
    }

    /** Ard Modron, as painted: a mountain hamlet pressed under dark rock — wooden houses with steep
     *  shingle roofs and crossed gable boards, a long house with smoke from its roof, fenced yards.
     *  No walls, no stone. */
    buildArdModron(at, scale = 1, rot = 0, b) {
        const k = this.kit('ardModron', at, rot, scale), { L, S, G } = this.mapper(b), W = 'amWood';
        for (const [px, py, w, d, hh, ry, roof] of [[3668, 3026, 36, 30, 0.09, 0.3, 'amRoof'], [3692, 3072, 26, 20, 0.07, 0.1, 'amRoof'], [3740, 3058, 40, 22, 0.08, -0.2, 'amRoof'],
            [3800, 3040, 30, 22, 0.08, 0.2, 'slate'], [3830, 3078, 26, 20, 0.07, -0.1, 'amRoof'], [3782, 3092, 28, 20, 0.07, 0.3, 'slate'], [3722, 3108, 26, 20, 0.07, 0, 'amRoof'],
            [3684, 3110, 22, 18, 0.06, 0.2, 'slate'], [3850, 3102, 22, 18, 0.06, -0.3, 'amRoof'], [3760, 3082, 18, 14, 0.05, 0, 'amRoof']]) {
            const [x, z] = L(px, py), g = Math.min(0, G(px, py)), Wd = S(w), D = S(d);
            this.townHouse(k, x, z, Wd, D, hh, W, roof, ry, null, 1.05, g);
            // crossed boards over both gable ends
            const c = Math.cos(ry), sn = Math.sin(ry);
            for (const sd of [-1, 1]) for (const lean of [-0.7, 0.7]) {
                const u = sd * (Wd * 0.53), bx = x + u * c, bz = z - u * sn;
                const bd = k.box(0.006, 0.05, 0.006, bx, g + hh + D * 1.05 * 1.12 * 0.95 + 0.012, bz, 'wood', ry);
                bd.rotation.set(lean, ry, 0);
            }
        }
        // the stone foot of the big house, the smoke of the long house, fences
        const [hx, hz] = L(3668, 3026);
        k.box(S(40), 0.03, S(34), hx, 0.0, hz, 'ruin', 0.3);
        const [sx, sz] = L(3744, 3054);
        for (let i = 0; i < 4; i++) k.poly(0.012 + i * 0.005, sx + i * 0.008, 0.16 + i * 0.035, sz + i * 0.006, 'smoke');
        for (const [ax, ay, bx2, by2] of [[3700, 3092, 3760, 3100], [3800, 3112, 3860, 3118], [3706, 3046, 3712, 3090]]) {
            const [x0, z0] = L(ax, ay), [x1, z1] = L(bx2, by2), g = Math.min(0, G((ax + bx2) / 2, (ay + by2) / 2)), len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0);
            k.box(0.004, 0.016, len, (x0 + x1) / 2, g + 0.01, (z0 + z1) / 2, 'wood', ry);
            for (let i = 0; i <= 4; i++) k.box(0.006, 0.026, 0.006, x0 + (x1 - x0) * i / 4, g + 0.008, z0 + (z1 - z0) * i / 4, 'wood');
        }
        return k.done();
    }

    /** Small things painted on the map: bridges, huts, a farmstead, a watchtower, ruins. */
    buildProp(p) {
        const at = this.world(p.x, p.y, this.heightPx(p.x, p.y));
        if (p.kind === 'field') {
            // a ploughed plot (w × d px) draped over the ground, furrows along its length
            const g = BABYLON.MeshBuilder.CreateGround('field', { width: p.w * PX, height: p.d * PX, subdivisions: 4, updatable: true }, this.scene);
            const pos = g.getVerticesData(BABYLON.VertexBuffer.PositionKind), c = Math.cos(p.angle || 0), sn = Math.sin(p.angle || 0);
            for (let i = 0; i < pos.length; i += 3) {
                const lx = pos[i], lz = pos[i + 2], x = at.x + lx * c + lz * sn, z = at.z - lx * sn + lz * c;
                pos[i] = x; pos[i + 2] = z; pos[i + 1] = this.heightAt(x, z) + 0.004;
            }
            const nrm = [];
            BABYLON.VertexData.ComputeNormals(pos, g.getIndices(), nrm);
            g.updateVerticesData(BABYLON.VertexBuffer.PositionKind, pos);
            g.updateVerticesData(BABYLON.VertexBuffer.NormalKind, nrm);
            g.refreshBoundingInfo();
            g.material = this.mats[p.crop || 'fieldWheat'];
            g.isPickable = false; g.receiveShadows = true;
            return g;
        }
        if (p.kind === 'bridge') {
            // The deck lies at the level of the banks it joins (the river bed is cut between them).
            const dx = Math.cos(p.angle) * p.len / 2, dy = Math.sin(p.angle) * p.len / 2;
            const bank = Math.max(this.heightPx(p.x - dx, p.y - dy), this.heightPx(p.x + dx, p.y + dy));
            at.y = bank + 0.004;
            const L = p.len * PX, W = p.width * PX;
            const k = this.kit('bridge', at, p.angle);
            if (p.stone) {
                // a humped stone bridge: two sloping spans and a level crown, parapets, piers in the bed
                const rise = 0.016, side = L * 0.36, slope = Math.atan2(rise, side);
                for (const s of [-1, 1]) {
                    const b = k.box(side, 0.014, W, s * (L / 2 - side / 2), rise / 2, 0, 'wall');
                    b.rotation.z = -s * slope;
                    const pa = k.box(side, 0.014, 0.008, s * (L / 2 - side / 2), rise / 2 + 0.012, W / 2 - 0.004, 'wall'); pa.rotation.z = -s * slope;
                    const pb = k.box(side, 0.014, 0.008, s * (L / 2 - side / 2), rise / 2 + 0.012, -W / 2 + 0.004, 'wall'); pb.rotation.z = -s * slope;
                    k.box(0.03, 0.06, W * 0.9, s * L * 0.2, -0.025, 0, 'ruin');
                }
                k.box(L - 2 * side + 0.004, 0.014, W, 0, rise, 0, 'wall');
                k.box(L - 2 * side + 0.004, 0.014, 0.008, 0, rise + 0.012, W / 2 - 0.004, 'wall');
                k.box(L - 2 * side + 0.004, 0.014, 0.008, 0, rise + 0.012, -W / 2 + 0.004, 'wall');
            } else {
                // a plank bridge on posts with a rail on each side
                const n = Math.max(4, Math.round(L / 0.014));
                for (let i = 0; i < n; i++) k.box(L / n * 0.82, 0.008, W, -L / 2 + (i + 0.5) * L / n, 0, 0, i % 2 ? 'plank' : 'wood');
                for (const sx of [-0.3, 0.3]) for (const sz of [-1, 1]) k.box(0.008, 0.06, 0.008, sx * L, -0.02, sz * W / 2, 'wood');
                for (const sz of [-1, 1]) k.box(L, 0.006, 0.006, 0, 0.02, sz * W / 2, 'wood');
                for (const sx of [-0.45, 0, 0.45]) for (const sz of [-1, 1]) k.box(0.006, 0.02, 0.006, sx * L, 0.01, sz * W / 2, 'wood');
            }
            return k.done();
        }
        if (p.kind === 'hut') {
            const s = 0.075 * (p.size || 1);
            const k = this.kit('hut', at, p.rot || 0);
            if (p.round) {   // a round granary with a conical thatch
                k.cyl(s * 0.75, s * 0.8, s * 0.5, 0, s * 0.25 - 0.01, 0, 'plaster', 9);
                k.cyl(0, s * 1.0, s * 0.55, 0, s * 0.5 + s * 0.27 - 0.01, 0, 'thatch', 9);
            } else {
                k.box(s, s * 0.5, s * 0.72, 0, s * 0.25 - 0.012, 0, (p.x + p.y) % 2 ? 'plaster' : 'timber');
                k.roof(s * 1.12, s * 0.86, s * 0.42, 0, s * 0.5 - 0.012, 0, p.roof || 'thatch');
                k.box(s * 0.12, s * 0.3, s * 0.12, s * 0.28, s * 0.72, s * 0.12, 'ruin');      // chimney
                k.box(s * 0.16, s * 0.28, 0.004, -s * 0.2, s * 0.13 - 0.012, -s * 0.36 - 0.002, 'dark');   // door
            }
            return k.done();
        }
        if (p.kind === 'house') {
            // a two-storey timbered farmhouse with a barn wing, as painted by the river
            const k = this.kit('house', at, p.rot || 0);
            k.box(0.12, 0.1, 0.09, 0, 0.04, 0, 'plaster');
            for (const sx of [-0.058, -0.02, 0.02, 0.058]) k.box(0.008, 0.1, 0.004, sx, 0.04, -0.046, 'timber');
            k.box(0.12, 0.008, 0.004, 0, 0.05, -0.046, 'timber');
            k.roof(0.13, 0.1, 0.06, 0, 0.09, 0, 'roofBrown');
            k.box(0.08, 0.06, 0.07, -0.085, 0.02, 0.03, 'timber', 0);
            k.roof(0.085, 0.075, 0.04, -0.085, 0.05, 0.03, 'thatch', 0);
            for (const sx of [-0.035, 0.035]) k.box(0.018, 0.024, 0.004, sx, 0.065, -0.047, 'dark');
            k.box(0.022, 0.04, 0.004, 0, 0.0, -0.047, 'dark');
            return k.done();
        }
        if (p.kind === 'watchtower') {
            const k = this.kit('watchtower', at, 0);
            k.cyl(0.06, 0.07, 0.21, 0, 0.095, 0, 'white', 10);
            if (p.roof) { k.cyl(0.075, 0.075, 0.012, 0, 0.205, 0, 'white', 10); k.cyl(0, 0.08, 0.12, 0, 0.27, 0, p.roof, 10); }   // a mage's tower: a pointed roof
            else k.crown(0, 0, 0.06, 0.2, 'white');
            for (let i = 0; i < 3; i++) k.box(0.01, 0.024, 0.006, 0, 0.06 + i * 0.05, -0.032, 'dark');
            return k.done();
        }
        if (p.kind === 'rocks') {
            // boulders lying in the grass: a few rough stones, the biggest in the middle
            const k = this.kit('rocks', at, (p.x * 7 + p.y) % 6.28), z = p.size || 1;
            const st = [[0, 0, 0.034], [0.04, 0.012, 0.022], [-0.038, -0.01, 0.026], [0.012, -0.034, 0.016], [-0.012, 0.032, 0.014]];
            for (const [x, zz, r] of st) { const b = k.poly(r * z, x * z, r * z * 0.25 - 0.008, zz * z, 'rock'); b.scaling.y = 0.6; }
            return k.done();
        }
        if (p.kind === 'hall') {
            // a dark timbered hall of Bechelt Nar's estate: a steep roof, a gable porch
            const k = this.kit('hall', at, p.rot || 0), z = p.size || 1;
            k.box(0.12 * z, 0.07 * z, 0.08 * z, 0, 0.035 * z - 0.01, 0, 'brownStone');
            k.roof(0.13 * z, 0.09 * z, 0.08 * z, 0, 0.07 * z - 0.01, 0, 'darkRoof');
            k.box(0.04 * z, 0.05 * z, 0.04 * z, 0.03 * z, 0.025 * z - 0.01, -0.055 * z, 'timber');
            for (const sx of [-0.04, 0, 0.04]) k.box(0.012 * z, 0.022 * z, 0.004, sx * z, 0.04 * z - 0.01, -0.041 * z, 'dark');
            return k.done();
        }
        if (p.kind === 'longhouse') {
            // a northern long house of Skellige: low walls, a long steep dark roof, crossed boards on the gables
            const z = p.size || 1, k = this.kit('longhouse', at, p.rot || 0);
            k.box(0.13 * z, 0.05 * z, 0.06 * z, 0, 0.025 * z - 0.012, 0, p.stone ? 'ruin' : 'amWood');
            k.roof(0.14 * z, 0.07 * z, 0.06 * z, 0, 0.05 * z - 0.012, 0, p.stone ? 'darkRoof' : 'amRoof');
            for (const sd of [-1, 1]) for (const lean of [-0.7, 0.7]) k.box(0.005, 0.03 * z, 0.005, sd * 0.07 * z, 0.11 * z - 0.006, 0, 'wood').rotation.x = lean;
            k.box(0.016 * z, 0.03 * z, 0.004, 0, 0.012 * z - 0.012, -0.031 * z, 'dark');
            return k.done();
        }
        if (p.kind === 'menhirs') {
            // standing stones in a ring
            const k = this.kit('menhirs', at, p.rot || 0), n = p.n || 5, r = p.r || 0.035;
            for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, hh = 0.045 + (i % 3) * 0.012; k.box(0.012, hh + 0.02, 0.009, Math.cos(a) * r, hh / 2 - 0.01, Math.sin(a) * r, 'ruin', -a); }
            return k.done();
        }
        if (p.kind === 'ruin') {
            // broken walls of a small fort, a stump of its tower, rubble
            const k = this.kit('ruin', at, 0.3);
            k.box(0.1, 0.05, 0.016, 0, 0.015, -0.04, 'ruin'); k.box(0.05, 0.08, 0.016, -0.03, 0.03, -0.04, 'ruin');
            k.box(0.016, 0.04, 0.07, 0.05, 0.01, 0, 'ruin');
            k.cyl(0.045, 0.05, 0.1, -0.045, 0.04, 0.02, 'ruin', 9);
            for (let i = 0; i < 5; i++) k.poly(0.008 + (i % 3) * 0.004, -0.02 + i * 0.018, 0.0, 0.03 - (i % 2) * 0.05, 'ruin');
            return k.done();
        }
        return null;
    }
}
