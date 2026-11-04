using System;
using UnityEngine;

namespace MapEditorPrototype
{
    [Serializable]
    public class DetailPaintLayerSettings
    {
        public string displayName;
        public Texture2D texture;
        public Color tint = Color.white;
        public Vector2 tiling = Vector2.one;
    }

    public class DetailPaintableSurface : MonoBehaviour
    {
        [SerializeField] private string localSurfaceKey = "Main";
        [SerializeField] private Renderer targetRenderer;
        [SerializeField] private MeshFilter targetMeshFilter;
        [SerializeField] private Collider paintCollider;
        [SerializeField] private Texture2D baseTextureOverride;
        [SerializeField] private int textureResolution = 512;
        [SerializeField] private DetailPaintLayerSettings[] detailLayers = new DetailPaintLayerSettings[4]
        {
            new DetailPaintLayerSettings { displayName = "Cracks" },
            new DetailPaintLayerSettings { displayName = "Grass" },
            new DetailPaintLayerSettings { displayName = "Dirt" },
            new DetailPaintLayerSettings { displayName = "Wear" }
        };

        private Texture2D baseTexture;
        private Texture2D runtimeMaskTexture;
        private Texture2D runtimeCompositeTexture;
        private Material runtimeMaterial;
        private bool initialized;
        private bool hasAnyMaskContent;
        private string cachedSurfaceId;

        public string SurfaceId => string.IsNullOrWhiteSpace(cachedSurfaceId) ? BuildSurfaceId() : cachedSurfaceId;
        public bool HasSavedMask => initialized && runtimeMaskTexture != null && hasAnyMaskContent;

        private void Awake()
        {
            InitializeSurface();
        }

        public void InitializeSurface()
        {
            if (initialized)
            {
                return;
            }

            if (targetRenderer == null)
            {
                targetRenderer = GetComponent<Renderer>();
                if (targetRenderer == null)
                {
                    targetRenderer = GetComponentInChildren<Renderer>(true);
                }
            }

            if (targetMeshFilter == null)
            {
                targetMeshFilter = GetComponent<MeshFilter>();
                if (targetMeshFilter == null)
                {
                    targetMeshFilter = GetComponentInChildren<MeshFilter>(true);
                }
            }

            if (paintCollider == null)
            {
                paintCollider = GetComponent<Collider>();
                if (paintCollider == null)
                {
                    paintCollider = GetComponentInChildren<Collider>(true);
                }
            }

            if (paintCollider == null && targetMeshFilter != null)
            {
                MeshCollider meshCollider = targetMeshFilter.gameObject.GetComponent<MeshCollider>();
                if (meshCollider == null)
                {
                    meshCollider = targetMeshFilter.gameObject.AddComponent<MeshCollider>();
                }

                meshCollider.sharedMesh = targetMeshFilter.sharedMesh;
                paintCollider = meshCollider;
            }

            if (targetRenderer == null)
            {
                return;
            }

            runtimeMaterial = targetRenderer.material;
            baseTexture = baseTextureOverride != null ? baseTextureOverride : GetMaterialTexture(runtimeMaterial);
            if (baseTexture == null)
            {
                baseTexture = CreateSolidTexture(textureResolution, textureResolution, Color.white);
            }

            textureResolution = Mathf.Max(64, textureResolution);
            
            // Если мы просто инициализируем поверхность, не нужно сразу создавать тяжелые текстуры, 
            // если только мы не загружаем старую маску.
            // Но для простоты оставим создание, но УБЕРЕМ RebuildCompositeTexture из инициализации.

            runtimeMaskTexture = new Texture2D(textureResolution, textureResolution, TextureFormat.RGBA32, false, false)
            {
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear,
                name = name + "_DetailMask"
            };

            runtimeCompositeTexture = new Texture2D(textureResolution, textureResolution, TextureFormat.RGBA32, false, false)
            {
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear,
                name = name + "_Composite"
            };

            ClearMaskTexture();
            
            // Вместо RebuildCompositeTexture мы просто копируем базовую текстуру или устанавливаем её
            ApplyBaseToComposite();
            
            cachedSurfaceId = BuildSurfaceId();
            initialized = true;
        }

        private void ApplyBaseToComposite()
        {
            if (runtimeCompositeTexture == null || baseTexture == null) return;
            Graphics.CopyTexture(baseTexture, runtimeCompositeTexture);
            ApplyCompositeToMaterial();
        }

        public bool TryPaint(RaycastHit hit, DetailPaintBrushDefinition brush, bool erase)
        {
            if (brush == null)
            {
                return false;
            }

            InitializeSurface();
            ApplyBrushDefaults(brush);
            if (!initialized || runtimeMaskTexture == null)
            {
                return false;
            }

            Vector2 uv = hit.textureCoord;
            Bounds bounds = targetRenderer != null ? targetRenderer.bounds : new Bounds(transform.position, Vector3.one);
            float maxDimension = Mathf.Max(bounds.size.x, bounds.size.y, bounds.size.z);
            float uvRadius = Mathf.Clamp01(brush.brushSize / Mathf.Max(0.001f, maxDimension));
            int radiusPixels = Mathf.Max(1, Mathf.CeilToInt(uvRadius * textureResolution));
            int centerX = Mathf.RoundToInt(uv.x * (textureResolution - 1));
            int centerY = Mathf.RoundToInt(uv.y * (textureResolution - 1));
            int channelIndex = Mathf.Clamp((int)brush.channel, 0, 3);

            bool changed = false;

            for (int y = centerY - radiusPixels; y <= centerY + radiusPixels; y++)
            {
                if (y < 0 || y >= textureResolution)
                {
                    continue;
                }

                for (int x = centerX - radiusPixels; x <= centerX + radiusPixels; x++)
                {
                    if (x < 0 || x >= textureResolution)
                    {
                        continue;
                    }

                    float dx = (x - centerX) / (float)radiusPixels;
                    float dy = (y - centerY) / (float)radiusPixels;
                    float distance = Mathf.Sqrt(dx * dx + dy * dy);
                    if (distance > 1f)
                    {
                        continue;
                    }

                    float falloff = Mathf.Pow(1f - distance, Mathf.Lerp(0.25f, 4f, 1f - brush.hardness));
                    float strength = brush.opacity * falloff;

                    Color pixel = runtimeMaskTexture.GetPixel(x, y);
                    float current = GetChannelValue(pixel, channelIndex);
                    float next = erase ? Mathf.Max(0f, current - strength) : Mathf.Min(1f, current + strength);
                    if (Mathf.Abs(next - current) > 0.0001f)
                    {
                        pixel = SetChannelValue(pixel, channelIndex, next);
                        runtimeMaskTexture.SetPixel(x, y, pixel);
                        changed = true;
                    }
                }
            }

            if (!changed)
            {
                return false;
            }

            runtimeMaskTexture.Apply(false, false);
            hasAnyMaskContent = RecalculateHasMaskContent();
            RebuildCompositeTexture();
            return true;
        }

        public string ExportMaskToBase64()
        {
            // Если маска пустая (ничего не нарисовано), возвращаем null. 
            // Это сэкономит мегабайты памяти и секунды времени.
            if (!hasAnyMaskContent) return null;

            InitializeSurface();
            if (!initialized || runtimeMaskTexture == null)
            {
                return null;
            }

            byte[] pngBytes = runtimeMaskTexture.EncodeToPNG();
            return pngBytes != null && pngBytes.Length > 0 ? Convert.ToBase64String(pngBytes) : null;
        }

        public void ImportMaskFromBase64(string base64Png)
        {
            InitializeSurface();
            if (!initialized || runtimeMaskTexture == null)
            {
                return;
            }

            if (string.IsNullOrWhiteSpace(base64Png))
            {
                ClearMaskTexture();
                RebuildCompositeTexture();
                hasAnyMaskContent = false;
                return;
            }

            try
            {
                byte[] bytes = Convert.FromBase64String(base64Png);
                Texture2D temp = new Texture2D(2, 2, TextureFormat.RGBA32, false, false);
                if (temp.LoadImage(bytes, false))
                {
                    Color[] sourcePixels = temp.GetPixels();
                    if (temp.width == textureResolution && temp.height == textureResolution)
                    {
                        runtimeMaskTexture.SetPixels(sourcePixels);
                    }
                    else
                    {
                        for (int y = 0; y < textureResolution; y++)
                        {
                            for (int x = 0; x < textureResolution; x++)
                            {
                                float u = x / (float)(textureResolution - 1);
                                float v = y / (float)(textureResolution - 1);
                                runtimeMaskTexture.SetPixel(x, y, temp.GetPixelBilinear(u, v));
                            }
                        }
                    }

                    runtimeMaskTexture.Apply(false, false);
                    hasAnyMaskContent = RecalculateHasMaskContent();
                    RebuildCompositeTexture();
                }
            }
            catch
            {
                ClearMaskTexture();
                RebuildCompositeTexture();
                hasAnyMaskContent = false;
            }
        }

        public static DetailPaintableSurface EnsureAutoAttached(GameObject root, string localKey = "Main")
        {
            if (root == null)
            {
                return null;
            }

            DetailPaintableSurface existing = root.GetComponentInChildren<DetailPaintableSurface>(true);
            if (existing != null)
            {
                existing.InitializeSurface();
                return existing;
            }

            Renderer renderer = root.GetComponent<Renderer>();
            MeshFilter meshFilter = root.GetComponent<MeshFilter>();
            if (renderer == null || meshFilter == null)
            {
                MeshRenderer childRenderer = root.GetComponentInChildren<MeshRenderer>(true);
                if (childRenderer != null)
                {
                    renderer = childRenderer;
                    meshFilter = childRenderer.GetComponent<MeshFilter>();
                }
            }

            if (renderer == null || meshFilter == null)
            {
                return null;
            }

            DetailPaintableSurface surface = renderer.gameObject.AddComponent<DetailPaintableSurface>();
            surface.localSurfaceKey = localKey;
            surface.targetRenderer = renderer;
            surface.targetMeshFilter = meshFilter;
            surface.InitializeSurface();
            return surface;
        }

        private void ApplyBrushDefaults(DetailPaintBrushDefinition brush)
        {
            if (brush == null || detailLayers == null)
            {
                return;
            }

            int index = Mathf.Clamp((int)brush.channel, 0, detailLayers.Length - 1);
            if (detailLayers[index] == null)
            {
                detailLayers[index] = new DetailPaintLayerSettings();
            }

            if (detailLayers[index].texture == null && brush.overlayTexture != null)
            {
                detailLayers[index].texture = brush.overlayTexture;
                detailLayers[index].tint = brush.overlayTint;
                detailLayers[index].tiling = brush.overlayTiling == Vector2.zero ? Vector2.one : brush.overlayTiling;
            }
        }

        private void ClearMaskTexture()
        {
            Color32 clear = new Color32(0, 0, 0, 0);
            Color32[] pixels = new Color32[textureResolution * textureResolution];
            // В C# массивы Color32 инициализируются нулями по умолчанию, 
            // так что цикл даже не нужен, если мы хотим clear.
            runtimeMaskTexture.SetPixels32(pixels);
            runtimeMaskTexture.Apply(false, false);
            hasAnyMaskContent = false;
        }

        private void RebuildCompositeTexture()
        {
            if (runtimeCompositeTexture == null || baseTexture == null || runtimeMaskTexture == null)
            {
                return;
            }

            // ОПТИМИЗАЦИЯ: используем массивы пикселей вместо GetPixel/SetPixel
            Color[] maskPixels = runtimeMaskTexture.GetPixels();
            Color[] compositePixels = new Color[textureResolution * textureResolution];
            
            for (int y = 0; y < textureResolution; y++)
            {
                for (int x = 0; x < textureResolution; x++)
                {
                    int index = y * textureResolution + x;
                    float u = x / (float)(textureResolution - 1);
                    float v = y / (float)(textureResolution - 1);
                    
                    Color finalColor = baseTexture.GetPixelBilinear(u, v);
                    Color mask = maskPixels[index];

                    if (mask.r > 0.001f || mask.g > 0.001f || mask.b > 0.001f || mask.a > 0.001f)
                    {
                        for (int layerIndex = 0; layerIndex < 4; layerIndex++)
                        {
                            DetailPaintLayerSettings layer = detailLayers != null && layerIndex < detailLayers.Length ? detailLayers[layerIndex] : null;
                            if (layer == null || layer.texture == null) continue;

                            float layerWeight = GetChannelValue(mask, layerIndex);
                            if (layerWeight <= 0.001f) continue;

                            Vector2 tiledUv = new Vector2(u * layer.tiling.x, v * layer.tiling.y);
                            Color layerColor = layer.texture.GetPixelBilinear(tiledUv.x % 1.0f, tiledUv.y % 1.0f);
                            layerColor *= layer.tint;
                            finalColor = Color.Lerp(finalColor, layerColor, layerWeight);
                        }
                    }
                    compositePixels[index] = finalColor;
                }
            }

            runtimeCompositeTexture.SetPixels(compositePixels);
            runtimeCompositeTexture.Apply(false, false);
            ApplyCompositeToMaterial();
        }

        private void ApplyCompositeToMaterial()
        {
            if (runtimeMaterial == null || runtimeCompositeTexture == null)
            {
                return;
            }

            if (runtimeMaterial.HasProperty("_BaseMap"))
            {
                runtimeMaterial.SetTexture("_BaseMap", runtimeCompositeTexture);
            }

            if (runtimeMaterial.HasProperty("_MainTex"))
            {
                runtimeMaterial.SetTexture("_MainTex", runtimeCompositeTexture);
            }
        }

        private Texture2D GetMaterialTexture(Material material)
        {
            if (material == null)
            {
                return null;
            }

            if (material.HasProperty("_BaseMap"))
            {
                return material.GetTexture("_BaseMap") as Texture2D;
            }

            if (material.HasProperty("_MainTex"))
            {
                return material.GetTexture("_MainTex") as Texture2D;
            }

            return null;
        }

        private Texture2D CreateSolidTexture(int width, int height, Color color)
        {
            Texture2D texture = new Texture2D(width, height, TextureFormat.RGBA32, false, false)
            {
                wrapMode = TextureWrapMode.Repeat,
                filterMode = FilterMode.Bilinear
            };

            Color[] pixels = new Color[width * height];
            for (int i = 0; i < pixels.Length; i++)
            {
                pixels[i] = color;
            }

            texture.SetPixels(pixels);
            texture.Apply(false, false);
            return texture;
        }

        private string BuildSurfaceId()
        {
            IPaintSurfaceOwner owner = GetComponentInParent<IPaintSurfaceOwner>();
            string ownerId = owner != null ? owner.SurfaceOwnerId : gameObject.scene.name + "/" + gameObject.name;
            string key = string.IsNullOrWhiteSpace(localSurfaceKey) ? gameObject.name : localSurfaceKey;
            return ownerId + ":" + key;
        }

        private bool RecalculateHasMaskContent()
        {
            if (runtimeMaskTexture == null)
            {
                return false;
            }

            Color[] pixels = runtimeMaskTexture.GetPixels();
            for (int i = 0; i < pixels.Length; i++)
            {
                if (pixels[i].r > 0.001f || pixels[i].g > 0.001f || pixels[i].b > 0.001f || pixels[i].a > 0.001f)
                {
                    return true;
                }
            }

            return false;
        }

        private float GetChannelValue(Color color, int channelIndex)
        {
            switch (channelIndex)
            {
                case 0: return color.r;
                case 1: return color.g;
                case 2: return color.b;
                default: return color.a;
            }
        }

        private Color SetChannelValue(Color color, int channelIndex, float value)
        {
            switch (channelIndex)
            {
                case 0: color.r = value; break;
                case 1: color.g = value; break;
                case 2: color.b = value; break;
                default: color.a = value; break;
            }

            return color;
        }
    }
}
