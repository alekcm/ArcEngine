using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// Конструктор шаблонов генерации — форма (OnGUI, без 3D):
    /// структура (этажи, подвал, коридор) + таблица локаций
    /// (имя, размер, количество, required, этажность, обязательные
    /// предметы тегами). Без скриптинга — только поля и галочки.
    ///
    /// Открывается из панели генератора («Шаблоны...»).
    /// </summary>
    public class TemplateEditorUi : MonoBehaviour
    {
        [SerializeField] private GameModeController gameModeController;
        [SerializeField] private TemplateLibraryService templateLibrary;

        private bool visible;
        private GenTemplate draft;
        private Vector2 scroll;
        private string lastError = "";
        private readonly Dictionary<int, string> tagInputs = new Dictionary<int, string>();

        public bool Visible => visible;

        public void Open(GenTemplate source = null)
        {
            // Редактируем копию (через JSON-раунд), чтобы «Отмена» ничего не портила.
            draft = source != null
                ? JsonUtility.FromJson<GenTemplate>(JsonUtility.ToJson(source))
                : NewTemplate();
            if (source != null && !draft.id.StartsWith("user."))
            {
                // Копия core-шаблона становится пользовательской.
                draft.id = "";
                draft.name += " (копия)";
            }
            tagInputs.Clear();
            lastError = "";
            visible = true;
        }

        public void Close() => visible = false;

        private static GenTemplate NewTemplate()
        {
            GenTemplate t = new GenTemplate { name = "Новый шаблон", author = "user" };
            t.locations.Add(new GenLocationSpec
            {
                id = "personal_room",
                displayName = "Личная комната",
                widthMin = 4, widthMax = 5,
                count = 1, countPerPlayer = true, required = true,
                floorPlacement = "any",
                requiredStampTagSets = new List<TagSet> { new TagSet("bed") },
            });
            return t;
        }

        private void OnGUI()
        {
            if (!visible || gameModeController == null || gameModeController.CurrentMode != GameMode.Edit) return;

            float w = Mathf.Min(640f, Screen.width - 40f);
            float h = Mathf.Min(680f, Screen.height - 40f);
            Rect rect = new Rect((Screen.width - w) * 0.5f, (Screen.height - h) * 0.5f, w, h);
            GUI.Box(rect, "Конструктор шаблонов");
            GUILayout.BeginArea(new Rect(rect.x + 12, rect.y + 26, rect.width - 24, rect.height - 36));

            scroll = GUILayout.BeginScrollView(scroll);

            GUILayout.Label("Название шаблона:");
            draft.name = GUILayout.TextField(draft.name, GUILayout.Height(22));

            GUILayout.Space(6);
            GUILayout.Label("— Структура —", BoldLabel());

            GUILayout.BeginHorizontal();
            GUILayout.Label($"Наземных этажей: {draft.floors}", GUILayout.Width(160));
            draft.floors = Mathf.Clamp((int)GUILayout.HorizontalSlider(draft.floors, 1, 4), 1, 4);
            GUILayout.EndHorizontal();

            draft.basementCourtroom = GUILayout.Toggle(draft.basementCourtroom,
                " Подвал: зал суда + лифт (иначе суд — комната на 1-м этаже)");

            GUILayout.BeginHorizontal();
            GUILayout.Label($"Ширина коридора: {draft.corridorWidth}", GUILayout.Width(160));
            draft.corridorWidth = Mathf.Clamp((int)GUILayout.HorizontalSlider(draft.corridorWidth, 1, 4), 1, 4);
            GUILayout.EndHorizontal();

            GUILayout.BeginHorizontal();
            GUILayout.Label($"Глубина комнат: {draft.roomDepthMin}–{draft.roomDepthMax}", GUILayout.Width(160));
            draft.roomDepthMin = Mathf.Clamp((int)GUILayout.HorizontalSlider(draft.roomDepthMin, 3, 10), 3, 10);
            draft.roomDepthMax = Mathf.Clamp((int)GUILayout.HorizontalSlider(draft.roomDepthMax, draft.roomDepthMin, 12), draft.roomDepthMin, 12);
            GUILayout.EndHorizontal();

            GUILayout.Space(6);
            GUILayout.Label("— Локации —", BoldLabel());
            GUILayout.Label("Зал суда и личные комнаты добавятся сами, если их нет (системный минимум).");

            int removeIndex = -1;
            for (int i = 0; i < draft.locations.Count; i++)
            {
                if (!DrawLocation(draft.locations[i], i)) removeIndex = i;
            }
            if (removeIndex >= 0) draft.locations.RemoveAt(removeIndex);

            if (GUILayout.Button("+ Добавить локацию", GUILayout.Height(24)))
            {
                draft.locations.Add(new GenLocationSpec
                {
                    id = "loc_" + (draft.locations.Count + 1),
                    displayName = "Новая локация",
                    widthMin = 4, widthMax = 6,
                    count = 1, required = false,
                    floorPlacement = "any",
                });
            }

            GUILayout.EndScrollView();

            if (!string.IsNullOrEmpty(lastError))
            {
                GUI.color = Color.red;
                GUILayout.Label(lastError);
                GUI.color = Color.white;
            }

            GUILayout.BeginHorizontal();
            if (GUILayout.Button("Сохранить шаблон", GUILayout.Height(30)))
            {
                if (templateLibrary.TrySaveUserTemplate(draft, out string error)) Close();
                else lastError = error;
            }
            if (GUILayout.Button("Отмена", GUILayout.Height(30))) Close();
            GUILayout.EndHorizontal();

            GUILayout.EndArea();

            Vector2 mouse = InputHelper.MousePosition;
            if (rect.Contains(new Vector2(mouse.x, Screen.height - mouse.y)))
            {
                UiInputGuard.BlockScrollThisFrame();
            }
        }

        /// <summary>false = пользователь нажал «Удалить».</summary>
        private bool DrawLocation(GenLocationSpec spec, int index)
        {
            GUILayout.BeginVertical(GUI.skin.box);

            GUILayout.BeginHorizontal();
            spec.displayName = GUILayout.TextField(spec.displayName, GUILayout.Height(20));
            bool keep = !GUILayout.Button("Удалить", GUILayout.Width(70), GUILayout.Height(20));
            GUILayout.EndHorizontal();

            GUILayout.BeginHorizontal();
            GUILayout.Label($"Ширина {spec.widthMin}–{spec.widthMax}", GUILayout.Width(110));
            spec.widthMin = Mathf.Clamp((int)GUILayout.HorizontalSlider(spec.widthMin, 2, 14, GUILayout.Width(90)), 2, 14);
            spec.widthMax = Mathf.Clamp((int)GUILayout.HorizontalSlider(spec.widthMax, spec.widthMin, 14, GUILayout.Width(90)), spec.widthMin, 14);

            spec.countPerPlayer = GUILayout.Toggle(spec.countPerPlayer, " на игрока", GUILayout.Width(90));
            if (!spec.countPerPlayer)
            {
                GUILayout.Label($"x{spec.count}", GUILayout.Width(32));
                spec.count = Mathf.Clamp((int)GUILayout.HorizontalSlider(spec.count, 0, 16, GUILayout.Width(70)), 0, 16);
            }
            GUILayout.EndHorizontal();

            GUILayout.BeginHorizontal();
            spec.required = GUILayout.Toggle(spec.required, " обязательная", GUILayout.Width(120));
            GUILayout.Label("Этаж:", GUILayout.Width(40));
            string[] placements = { "ground", "upper", "any" };
            string[] placementLabels = { "1-й", "верхние", "любой" };
            int pIndex = System.Array.IndexOf(placements, spec.floorPlacement);
            int pNew = GUILayout.SelectionGrid(Mathf.Max(0, pIndex), placementLabels, 3, GUILayout.Width(220));
            spec.floorPlacement = placements[pNew];
            GUILayout.EndHorizontal();

            // Соседство и крыло.
            GUILayout.BeginHorizontal();
            GUILayout.Label("Рядом с:", GUILayout.Width(60));
            int adjIndex = 0;
            List<string> adjOptions = new List<string> { "(нет)" };
            foreach (GenLocationSpec other in draft.locations)
            {
                if (other == spec || string.IsNullOrEmpty(other.id)) continue;
                if (other.id == spec.adjacentTo) adjIndex = adjOptions.Count;
                adjOptions.Add(string.IsNullOrEmpty(other.displayName) ? other.id : other.displayName);
            }
            if (GUILayout.Button(adjOptions[Mathf.Min(adjIndex, adjOptions.Count - 1)], GUILayout.Width(130)))
            {
                // Цикл по вариантам кликом (простая замена дропдауна в IMGUI).
                int next = (adjIndex + 1) % adjOptions.Count;
                if (next == 0) spec.adjacentTo = "";
                else
                {
                    int k = 0;
                    foreach (GenLocationSpec other in draft.locations)
                    {
                        if (other == spec || string.IsNullOrEmpty(other.id)) continue;
                        k++;
                        if (k == next) { spec.adjacentTo = other.id; break; }
                    }
                }
            }
            GUILayout.Label("Крыло:", GUILayout.Width(50));
            spec.groupKey = GUILayout.TextField(spec.groupKey ?? "", GUILayout.Width(120), GUILayout.Height(20));
            GUILayout.EndHorizontal();
            if (!string.IsNullOrEmpty(spec.groupKey))
                GUILayout.Label("  Локации с одинаковым именем крыла встанут подряд, стена к стене.");

            // Обязательные предметы: список TagSet'ов.
            for (int t = 0; t < spec.requiredStampTagSets.Count; t++)
            {
                GUILayout.BeginHorizontal();
                GUILayout.Label($"  предмет: {spec.requiredStampTagSets[t]}", GUILayout.Width(260));
                if (GUILayout.Button("x", GUILayout.Width(24)))
                {
                    spec.requiredStampTagSets.RemoveAt(t);
                    GUILayout.EndHorizontal();
                    break;
                }
                GUILayout.EndHorizontal();
            }

            GUILayout.BeginHorizontal();
            if (!tagInputs.TryGetValue(index, out string input)) input = "";
            input = GUILayout.TextField(input, GUILayout.Width(200), GUILayout.Height(20));
            tagInputs[index] = input;
            if (GUILayout.Button("+ предмет (теги через +)", GUILayout.Width(170), GUILayout.Height(20)))
            {
                string[] parts = input.Split('+');
                TagSet set = new TagSet();
                foreach (string raw in parts)
                {
                    string tag = raw.Trim().ToLowerInvariant();
                    if (!string.IsNullOrEmpty(tag)) set.tags.Add(tag);
                }
                if (set.tags.Count > 0)
                {
                    spec.requiredStampTagSets.Add(set);
                    tagInputs[index] = "";
                }
            }
            GUILayout.EndHorizontal();

            GUILayout.EndVertical();
            return keep;
        }

        private static GUIStyle BoldLabel()
        {
            return new GUIStyle(GUI.skin.label) { fontStyle = FontStyle.Bold };
        }
    }
}
