using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// Автоматический коллайдер-пандус для заглушки лестницы.
    /// Повесь на префаб лестницы (тот, что в BuildingDefinition штампа
    /// sys:stair_shaft) и укажи длину подъёма по локальной Z.
    ///
    /// Создаёт наклонный BoxCollider от пола до FloorContext.FloorHeight —
    /// CharacterController игрока просто заходит и поднимается, без
    /// телепортов. Когда появится настоящая модель лестницы со ступенями,
    /// компонент можно убрать.
    /// </summary>
    public class StairRampCollider : MonoBehaviour
    {
        [SerializeField, Tooltip("Длина подъёма по локальной Z (м). Для footprint 1x3 — 3.")]
        private float runLength = 3f;
        [SerializeField, Tooltip("Ширина пандуса (м).")]
        private float width = 1f;
        [SerializeField, Tooltip("Толщина плиты пандуса (м).")]
        private float thickness = 0.2f;

        private void Awake()
        {
            float rise = FloorContext.FloorHeight;
            float slopeLength = Mathf.Sqrt(rise * rise + runLength * runLength);
            float angle = Mathf.Atan2(rise, runLength) * Mathf.Rad2Deg;

            GameObject ramp = new GameObject("StairRamp");
            ramp.transform.SetParent(transform, false);
            // Центр пандуса: середина подъёма.
            ramp.transform.localPosition = new Vector3(0f, rise * 0.5f - thickness * 0.5f, 0f);
            ramp.transform.localRotation = Quaternion.Euler(-angle, 0f, 0f);

            BoxCollider box = ramp.AddComponent<BoxCollider>();
            box.size = new Vector3(width, thickness, slopeLength);
        }
    }
}
