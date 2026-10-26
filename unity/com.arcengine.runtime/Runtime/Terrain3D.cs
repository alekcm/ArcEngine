// Terrain3D.cs — the location's ground: the kit's height grid (exported by tools/export-unity.mjs
// from Terrain3D.js, not recomputed — the noise is not ported) and the coarse ring beyond the edge.
// HeightAt reads THE SAME triangles the mesh draws: the cell is split by the diagonal
// (i,j)-(i+1,j+1), as in the kit, so objects stand exactly on the surface. Beyond the location —
// the ring grid (it lies 1 px under the noise, the +1 is put back); beyond the ring — its edge.
// The meshes are built on enable (edit mode too) and never saved: terrain.bytes is the source.
// THE TERRAIN IS A PICTURE (invariant 4): game decisions that must match on every device keep
// their own state; HeightAt is for placing things on the ground.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace ArcEngine
{
    [ExecuteAlways]
    public class Terrain3D : MonoBehaviour
    {
        [Serializable]
        public class Grid
        {
            public float x0, y0, cell = 8;
            public int nx, ny;
            public float holeX1, holeY1;   // the ring: the location grid's far corner — cells inside it are not drawn
        }

        public TextAsset data;             // terrain.bytes: float32 LE, the location grid, then the ring
        public float worldW = 2048, worldH = 2048;
        public float tileSize = 512;       // GROUND_TILE_SIZE: world px per repeat of the ground texture
        public Grid grid = new Grid();
        public Grid ring = new Grid();
        public Material material, outerMaterial;

        float[] _g, _r;
        readonly List<GameObject> _meshes = new List<GameObject>();

        public float HMin { get; private set; }
        public float HMax { get; private set; }
        public float Cell => grid.cell;
        public float OuterRing => -ring.x0;   // Terrain3D.OUTER_RING: the camera pitch limit reads it

        bool Load()
        {
            if (_g != null) return true;
            if (data == null) return false;
            var bytes = data.bytes;
            int n1 = grid.nx * grid.ny, n2 = ring.nx * ring.ny;
            if (n1 <= 0 || bytes.Length < (n1 + n2) * 4)
            {
                Debug.LogWarning("Terrain3D: terrain.bytes не совпадает с размерами сетки — земля ровная");
                return false;
            }
            _g = new float[n1];
            _r = new float[n2];
            Buffer.BlockCopy(bytes, 0, _g, 0, n1 * 4);
            Buffer.BlockCopy(bytes, n1 * 4, _r, 0, n2 * 4);
            float lo = float.PositiveInfinity, hi = float.NegativeInfinity;
            foreach (var h in _g) { if (h < lo) lo = h; if (h > hi) hi = h; }
            HMin = lo;
            HMax = hi;
            return true;
        }

        // Surface height under a map point, px.
        public float HeightAt(float x, float y)
        {
            if (!Load()) return Arc.Const("TERRAIN_BASE", 0f);
            if (Sample(_g, grid, x, y, out var h)) return h;
            if (Sample(_r, ring, x, y, out h)) return h + 1f;
            float cx = Mathf.Clamp(x, ring.x0, ring.x0 + (ring.nx - 1) * ring.cell);
            float cy = Mathf.Clamp(y, ring.y0, ring.y0 + (ring.ny - 1) * ring.cell);
            return Sample(_r, ring, cx, cy, out h) ? h + 1f : Arc.Const("TERRAIN_BASE", 0f);
        }

        static bool Sample(float[] g, Grid m, float x, float y, out float h)
        {
            double fx = (x - m.x0) / (double)m.cell, fy = (y - m.y0) / (double)m.cell;
            h = 0f;
            if (g == null || fx < 0 || fy < 0 || fx > m.nx - 1 || fy > m.ny - 1) return false;
            int n = m.nx;
            int i = Math.Min(m.nx - 2, (int)Math.Floor(fx)), j = Math.Min(m.ny - 2, (int)Math.Floor(fy));
            double tx = fx - i, ty = fy - j;
            double h00 = g[j * n + i], h10 = g[j * n + i + 1];
            double h01 = g[(j + 1) * n + i], h11 = g[(j + 1) * n + i + 1];
            h = (float)(tx >= ty ? h00 + (h10 - h00) * tx + (h11 - h10) * ty : h00 + (h01 - h00) * ty + (h11 - h01) * tx);
            return true;
        }

        // Surface tilt along the heading (rad): x — pitch (nose higher -> positive), y — roll
        // (left side higher -> positive), from four points of the object's base.
        public Vector2 TiltAt(float x, float y, float headingRad, float halfLen, float halfWid)
        {
            float cx = Mathf.Cos(headingRad), sy = Mathf.Sin(headingRad);
            float hf = HeightAt(x + cx * halfLen, y + sy * halfLen);
            float hb = HeightAt(x - cx * halfLen, y - sy * halfLen);
            float hl = HeightAt(x - sy * halfWid, y + cx * halfWid);
            float hr = HeightAt(x + sy * halfWid, y - cx * halfWid);
            return new Vector2(Mathf.Atan2(hf - hb, halfLen * 2), Mathf.Atan2(hl - hr, halfWid * 2));
        }

        // --- Meshes ------------------------------------------------------------------------------

        void OnEnable() => Build();
        void OnDisable() => Clear();

        public void Build()
        {
            Clear();
            if (!Load()) return;
            _meshes.Add(MakeMesh("Ground", _g, grid, false, material));
            _meshes.Add(MakeMesh("GroundOuter", _r, ring, true, outerMaterial));
        }

        void Clear()
        {
            foreach (var go in _meshes)
            {
                if (go == null) continue;
                var mf = go.GetComponent<MeshFilter>();
                if (mf && mf.sharedMesh) DestroyImmediate(mf.sharedMesh);
                DestroyImmediate(go);
            }
            _meshes.Clear();
        }

        // A grid in the map's px -> a Unity mesh. UV — x / tile, −y / tile: the tile runs down the map
        // like the kit's (a Babylon DynamicTexture with invertY = false has v = 0 at the image top).
        // Triangles (a, b, d), (a, d, c) — the a-d diagonal of the kit; clockwise from above = +Y normals.
        GameObject MakeMesh(string name, float[] g, Grid m, bool hole, Material mat)
        {
            var go = new GameObject(name) { hideFlags = HideFlags.DontSave | HideFlags.NotEditable };
            go.transform.SetParent(transform, false);
            int nx = m.nx, ny = m.ny;
            var verts = new Vector3[nx * ny];
            var uvs = new Vector2[nx * ny];
            float tile = Mathf.Max(16f, tileSize);
            for (int j = 0; j < ny; j++)
            {
                for (int i = 0; i < nx; i++)
                {
                    int k = j * nx + i;
                    float x = m.x0 + i * m.cell, y = m.y0 + j * m.cell;
                    verts[k] = ArcSpace.ToWorld(x, y, g[k]);
                    uvs[k] = new Vector2(x / tile, -y / tile);
                }
            }
            var tris = new List<int>((nx - 1) * (ny - 1) * 6);
            for (int j = 0; j < ny - 1; j++)
            {
                for (int i = 0; i < nx - 1; i++)
                {
                    if (hole)
                    {
                        float cx = m.x0 + (i + 0.5f) * m.cell, cy = m.y0 + (j + 0.5f) * m.cell;
                        if (Inside(m, cx, cy) && Inside(m, cx - m.cell, cy - m.cell) && Inside(m, cx + m.cell, cy + m.cell)) continue;
                    }
                    int a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
                    tris.Add(a); tris.Add(b); tris.Add(d);
                    tris.Add(a); tris.Add(d); tris.Add(c);
                }
            }
            var mesh = new Mesh { name = name, hideFlags = HideFlags.DontSave };
            mesh.indexFormat = verts.Length > 65535 ? IndexFormat.UInt32 : IndexFormat.UInt16;
            mesh.vertices = verts;
            mesh.uv = uvs;
            mesh.SetTriangles(tris, 0);
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = mat;
            mr.shadowCastingMode = ShadowCastingMode.Off;
            mr.receiveShadows = true;
            return go;
        }

        static bool Inside(Grid m, float x, float y) => x > 0 && x < m.holeX1 && y > 0 && y < m.holeY1;
    }
}
