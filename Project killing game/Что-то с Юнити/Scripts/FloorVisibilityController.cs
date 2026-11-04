using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// «Срез» этажей в режиме редактирования (как в Sims): видны активный
    /// этаж и все под ним; всё выше — скрыто. В режиме игры показывается всё.
    /// Работает выключением Renderer'ов по высоте объекта (этаж считается
    /// из мировой Y), поэтому не требует полей в данных.
    /// </summary>
    public class FloorVisibilityController : MonoBehaviour
    {
        [SerializeField] private GameModeController gameModeController;
        [SerializeField] private GridBuildingSystem gridBuildingSystem;
        [SerializeField] private WallSystem wallSystem;

        private GameMode lastMode;
        private int lastFloor = -1;
        private float refreshTimer;

        private void OnEnable()
        {
            FloorContext.Changed += MarkDirty;
            if (gridBuildingSystem != null) gridBuildingSystem.Changed += MarkDirty;
            if (wallSystem != null) wallSystem.Changed += MarkDirty;
        }

        private void OnDisable()
        {
            FloorContext.Changed -= MarkDirty;
            if (gridBuildingSystem != null) gridBuildingSystem.Changed -= MarkDirty;
            if (wallSystem != null) wallSystem.Changed -= MarkDirty;
            SetAllVisible();
        }

        private bool dirty = true;
        private void MarkDirty() => dirty = true;

        private void LateUpdate()
        {
            if (gameModeController == null) return;

            GameMode mode = gameModeController.CurrentMode;
            if (mode != lastMode)
            {
                lastMode = mode;
                dirty = true;
            }

            // Подстраховка: новые объекты (мультиплеер) могли появиться без события.
            refreshTimer += Time.deltaTime;
            if (refreshTimer > 1.5f) { refreshTimer = 0f; dirty = true; }

            if (!dirty && lastFloor == FloorContext.ActiveFloor) return;
            dirty = false;
            lastFloor = FloorContext.ActiveFloor;

            if (mode != GameMode.Edit)
            {
                SetAllVisible();
                return;
            }

            ApplySlice();
        }

        private void ApplySlice()
        {
            float cutY = gridBuildingSystem.GridOrigin.y
                         + FloorContext.FloorY(FloorContext.ActiveFloor)
                         + FloorContext.FloorHeight * 0.5f;

            foreach (PlacedObject obj in gridBuildingSystem.PlacedObjects)
            {
                if (obj == null) continue;
                SetVisible(obj.gameObject, obj.transform.position.y <= cutY + FloorContext.FloorHeight * 0.49f
                                           && obj.BaseY <= cutY);
            }

            foreach (WallSegment seg in wallSystem.Segments)
            {
                if (seg == null) continue;
                SetVisible(seg.gameObject, seg.Edge.level <= FloorContext.ActiveFloor);
            }
        }

        private void SetAllVisible()
        {
            if (gridBuildingSystem != null)
            {
                foreach (PlacedObject obj in gridBuildingSystem.PlacedObjects)
                {
                    if (obj != null) SetVisible(obj.gameObject, true);
                }
            }
            if (wallSystem != null)
            {
                foreach (WallSegment seg in wallSystem.Segments)
                {
                    if (seg != null) SetVisible(seg.gameObject, true);
                }
            }
        }

        private static void SetVisible(GameObject go, bool visible)
        {
            foreach (Renderer r in go.GetComponentsInChildren<Renderer>(true))
            {
                if (r.enabled != visible) r.enabled = visible;
            }
        }
    }
}
