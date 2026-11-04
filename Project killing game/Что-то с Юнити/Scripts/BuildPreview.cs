using UnityEngine;
using UnityEngine.Rendering;

namespace MapEditorPrototype
{
    public class BuildPreview : MonoBehaviour
    {
        [SerializeField] private Color validColor = new Color(0.35f, 1f, 0.45f, 0.85f);
        [SerializeField] private Color invalidColor = new Color(1f, 0.35f, 0.35f, 0.85f);

        private GameObject currentPrefab;
        private GameObject previewInstance;
        private Renderer[] cachedRenderers;

        public void SetDefinition(BuildingDefinition definition)
        {
            SetPrefab(definition != null ? definition.prefab : null);
        }

        public void SetPrefab(GameObject prefab)
        {
            if (currentPrefab == prefab)
            {
                return;
            }

            currentPrefab = prefab;
            RebuildPreview();
        }

        public void SetVisible(bool visible)
        {
            if (previewInstance != null)
            {
                previewInstance.SetActive(visible);
            }
        }

        public void UpdatePose(Vector3 worldPosition, Quaternion worldRotation, bool canPlace)
        {
            if (previewInstance == null)
            {
                return;
            }

            previewInstance.transform.SetPositionAndRotation(worldPosition, worldRotation);
            ApplyPreviewColor(canPlace ? validColor : invalidColor);
        }

        private void RebuildPreview()
        {
            if (previewInstance != null)
            {
                Destroy(previewInstance);
            }

            previewInstance = null;
            cachedRenderers = null;

            if (currentPrefab == null)
            {
                return;
            }

            previewInstance = Instantiate(currentPrefab, transform);
            previewInstance.name = currentPrefab.name + "_Preview";

            Collider[] colliders = previewInstance.GetComponentsInChildren<Collider>(true);
            for (int i = 0; i < colliders.Length; i++)
            {
                colliders[i].enabled = false;
            }

            Rigidbody[] rigidbodies = previewInstance.GetComponentsInChildren<Rigidbody>(true);
            for (int i = 0; i < rigidbodies.Length; i++)
            {
                rigidbodies[i].isKinematic = true;
                rigidbodies[i].detectCollisions = false;
            }

            MonoBehaviour[] behaviours = previewInstance.GetComponentsInChildren<MonoBehaviour>(true);
            for (int i = 0; i < behaviours.Length; i++)
            {
                behaviours[i].enabled = false;
            }

            Animator[] animators = previewInstance.GetComponentsInChildren<Animator>(true);
            for (int i = 0; i < animators.Length; i++)
            {
                animators[i].enabled = false;
            }

            cachedRenderers = previewInstance.GetComponentsInChildren<Renderer>(true);
            for (int i = 0; i < cachedRenderers.Length; i++)
            {
                cachedRenderers[i].shadowCastingMode = ShadowCastingMode.Off;
                cachedRenderers[i].receiveShadows = false;
            }

            ApplyPreviewColor(validColor);
        }

        private void ApplyPreviewColor(Color color)
        {
            if (cachedRenderers == null)
            {
                return;
            }

            for (int i = 0; i < cachedRenderers.Length; i++)
            {
                Renderer rendererComponent = cachedRenderers[i];
                if (rendererComponent == null)
                {
                    continue;
                }

                MaterialPropertyBlock block = new MaterialPropertyBlock();
                rendererComponent.GetPropertyBlock(block);
                block.SetColor("_BaseColor", color);
                block.SetColor("_Color", color);
                rendererComponent.SetPropertyBlock(block);
            }
        }
    }
}
