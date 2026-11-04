using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// Переключатель этажей в режиме Edit: кнопки ▲/▼ и PageUp/PageDown.
    /// Меняет FloorContext.ActiveFloor; срез делает FloorVisibilityController,
    /// высоту построек — инструменты через FloorContext.ActiveFloorY.
    /// </summary>
    public class FloorSwitcherUi : MonoBehaviour
    {
        [SerializeField] private GameModeController gameModeController;
        [SerializeField] private int maxFloors = 6;
        [SerializeField] private KeyCode floorUpKey = KeyCode.PageUp;
        [SerializeField] private KeyCode floorDownKey = KeyCode.PageDown;

        private void Update()
        {
            if (gameModeController == null || gameModeController.CurrentMode != GameMode.Edit) return;
            if (InputHelper.GetKeyDown(floorUpKey)) FloorContext.ActiveFloor = Mathf.Min(maxFloors - 1, FloorContext.ActiveFloor + 1);
            if (InputHelper.GetKeyDown(floorDownKey)) FloorContext.ActiveFloor = Mathf.Max(FloorContext.MinFloor, FloorContext.ActiveFloor - 1);
        }

        private void OnGUI()
        {
            if (gameModeController == null || gameModeController.CurrentMode != GameMode.Edit) return;

            // ASCII вместо ▲/▼: глифы стрелок отсутствуют во встроенном
            // шрифте Unity и кнопки выглядели пустыми.
            Rect rect = new Rect(Screen.width - 70, Screen.height * 0.5f - 70, 60, 140);
            GUI.Box(rect, "Этаж");

            if (GUI.Button(new Rect(rect.x + 8, rect.y + 26, 44, 30), "+"))
                FloorContext.ActiveFloor = Mathf.Min(maxFloors - 1, FloorContext.ActiveFloor + 1);

            GUIStyle centered = new GUIStyle(GUI.skin.label) { alignment = TextAnchor.MiddleCenter, fontStyle = FontStyle.Bold };
            string floorLabel = FloorContext.ActiveFloor < 0 ? "П" : (FloorContext.ActiveFloor + 1).ToString();
            GUI.Label(new Rect(rect.x, rect.y + 60, rect.width, 26), floorLabel, centered);

            if (GUI.Button(new Rect(rect.x + 8, rect.y + 92, 44, 30), "-"))
                FloorContext.ActiveFloor = Mathf.Max(FloorContext.MinFloor, FloorContext.ActiveFloor - 1);

            Vector2 mouse = InputHelper.MousePosition;
            if (rect.Contains(new Vector2(mouse.x, Screen.height - mouse.y)))
            {
                UiInputGuard.BlockScrollThisFrame();
            }
        }
    }
}
