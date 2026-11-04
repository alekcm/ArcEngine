using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// Точка лифта. Повесь на ПРЕФАБ лифта (BuildingDefinition штампа
    /// sys:elevator). Генератор ставит лифт на одинаковых клетках на двух
    /// этажах; в режиме игры игрок подходит, жмёт E — телепорт к парной
    /// точке (та же XZ-позиция, другая высота).
    ///
    /// Пара ищется автоматически среди всех ElevatorEndpoint сцены,
    /// никакой ручной привязки не нужно.
    /// </summary>
    public class ElevatorEndpoint : MonoBehaviour
    {
        [SerializeField, Tooltip("Радиус, в котором игрок может вызвать лифт (м).")]
        private float useRadius = 1.6f;
        [SerializeField] private KeyCode useKey = KeyCode.E;

        private static readonly List<ElevatorEndpoint> All = new List<ElevatorEndpoint>();

        private GameModeController gameMode;
        private ExplorerController explorer;
        private bool playerInRange;

        private void OnEnable() { All.Add(this); }
        private void OnDisable() { All.Remove(this); }

        private void Start()
        {
            gameMode = FindObjectOfType<GameModeController>();
            explorer = FindObjectOfType<ExplorerController>();
        }

        private void Update()
        {
            playerInRange = false;
            if (gameMode == null || explorer == null) return;
            if (gameMode.CurrentMode != GameMode.Explore) return;

            Vector3 p = explorer.transform.position;
            Vector2 flatDelta = new Vector2(p.x - transform.position.x, p.z - transform.position.z);
            if (flatDelta.magnitude > useRadius) return;
            if (Mathf.Abs(p.y - transform.position.y) > FloorContext.FloorHeight * 0.6f) return;

            playerInRange = true;

            if (InputHelper.GetKeyDown(useKey))
            {
                ElevatorEndpoint target = FindCounterpart();
                if (target != null) Teleport(target);
            }
        }

        private ElevatorEndpoint FindCounterpart()
        {
            ElevatorEndpoint best = null;
            float bestXz = 1.5f; // максимум расхождения по XZ для «той же шахты»

            foreach (ElevatorEndpoint other in All)
            {
                if (other == this) continue;
                Vector2 d = new Vector2(other.transform.position.x - transform.position.x,
                                        other.transform.position.z - transform.position.z);
                float dy = Mathf.Abs(other.transform.position.y - transform.position.y);
                if (dy < FloorContext.FloorHeight * 0.5f) continue; // тот же этаж
                if (d.magnitude < bestXz)
                {
                    bestXz = d.magnitude;
                    best = other;
                }
            }

            return best;
        }

        private void Teleport(ElevatorEndpoint target)
        {
            CharacterController cc = explorer.GetComponent<CharacterController>();
            Vector3 destination = target.transform.position + Vector3.up * 0.15f;

            if (cc != null) cc.enabled = false;
            explorer.transform.position = destination;
            if (cc != null) cc.enabled = true;
        }

        private void OnGUI()
        {
            if (!playerInRange) return;
            GUIStyle style = new GUIStyle(GUI.skin.box) { alignment = TextAnchor.MiddleCenter, fontSize = 14 };
            GUI.Box(new Rect(Screen.width * 0.5f - 110, Screen.height * 0.72f, 220, 30),
                $"[{useKey}] — лифт", style);
        }
    }
}
