using System.Collections;
using System.Reflection;
using UnityEngine;

namespace MapEditorPrototype
{
    public class RuntimeNavMeshUpdater : MonoBehaviour
    {
        [SerializeField] private GridBuildingSystem gridBuildingSystem;
        [SerializeField] private WallSystem wallSystem;
        [SerializeField] private PathSystem pathSystem;
        [SerializeField] private Component navMeshSurfaceComponent;
        [SerializeField] private bool rebuildOnStart = true;
        [SerializeField] private float rebuildDelay = 0.35f;

        private Coroutine rebuildCoroutine;
        private MethodInfo buildMethod;

        private void Awake()
        {
            CacheBuildMethod();
        }

        private void OnEnable()
        {
            if (gridBuildingSystem != null)
            {
                gridBuildingSystem.Changed += RequestRebuild;
            }

            if (wallSystem != null)
            {
                wallSystem.Changed += RequestRebuild;
            }

            if (pathSystem != null)
            {
                pathSystem.Changed += RequestRebuild;
            }
        }

        private void Start()
        {
            if (rebuildOnStart)
            {
                RequestRebuild();
            }
        }

        private void OnDisable()
        {
            if (gridBuildingSystem != null)
            {
                gridBuildingSystem.Changed -= RequestRebuild;
            }

            if (wallSystem != null)
            {
                wallSystem.Changed -= RequestRebuild;
            }

            if (pathSystem != null)
            {
                pathSystem.Changed -= RequestRebuild;
            }
        }

        public void RequestRebuild()
        {
            if (!isActiveAndEnabled)
            {
                return;
            }

            if (rebuildCoroutine != null)
            {
                StopCoroutine(rebuildCoroutine);
            }

            rebuildCoroutine = StartCoroutine(RebuildDelayed());
        }

        public void BuildNow()
        {
            if (navMeshSurfaceComponent == null)
            {
                return;
            }

            if (buildMethod == null)
            {
                CacheBuildMethod();
            }

            if (buildMethod == null)
            {
                Debug.LogWarning("RuntimeNavMeshUpdater: NavMeshSurface.BuildNavMesh method was not found. Install AI Navigation package and assign NavMeshSurface component.");
                return;
            }

            buildMethod.Invoke(navMeshSurfaceComponent, null);
        }

        private IEnumerator RebuildDelayed()
        {
            yield return new WaitForSeconds(rebuildDelay);
            rebuildCoroutine = null;
            BuildNow();
        }

        private void CacheBuildMethod()
        {
            buildMethod = navMeshSurfaceComponent != null ? navMeshSurfaceComponent.GetType().GetMethod("BuildNavMesh", BindingFlags.Instance | BindingFlags.Public) : null;
        }
    }
}
