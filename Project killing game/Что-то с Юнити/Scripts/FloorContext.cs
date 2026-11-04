using System;
using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// Единый runtime-контекст выбранного этажа.
    ///
    /// Его уже используют BuildSystem/WallSystem/BuildWorldCommandService:
    /// - ActiveFloorY для высоты плоскости редактирования и пола;
    /// - ActiveFloor для level у WallEdge;
    /// - FloorY(level) для экспорта/импорта многоэтажных карт.
    ///
    /// Генератор тоже должен пользоваться этим классом, чтобы этажи объектов,
    /// стен, путей и ручного редактора совпадали по одной формуле.
    /// </summary>
    public static class FloorContext
    {
        public const int GroundFloor = 0;

        private static int activeFloor;
        private static int minFloor = -1;
        private static int maxFloor = 8;
        private static float floorHeight = 3f;

        /// <summary>
        /// Backward-compatible event for older scripts (FloorVisibilityController etc.).
        /// Fires when active floor or floor height changes.
        /// </summary>
        public static event Action Changed;
        public static event Action ActiveFloorChanged;
        public static event Action FloorHeightChanged;

        /// <summary>
        /// Backward-compatible assignable property for older UI scripts.
        /// Prefer SetActiveFloor/StepFloor in new code.
        /// </summary>
        public static int ActiveFloor
        {
            get => activeFloor;
            set => SetActiveFloor(value);
        }

        public static int MinFloor
        {
            get => minFloor;
            set
            {
                minFloor = value;
                if (maxFloor < minFloor) maxFloor = minFloor;
                SetActiveFloor(activeFloor);
                Changed?.Invoke();
            }
        }

        public static int MaxFloor
        {
            get => maxFloor;
            set
            {
                maxFloor = value;
                if (minFloor > maxFloor) minFloor = maxFloor;
                SetActiveFloor(activeFloor);
                Changed?.Invoke();
            }
        }

        public static float FloorHeight => Mathf.Max(0.01f, floorHeight);
        public static float ActiveFloorY => FloorY(activeFloor);

        public static void SetActiveFloor(int floor)
        {
            int clamped = Mathf.Clamp(floor, minFloor, maxFloor);
            if (activeFloor == clamped)
            {
                return;
            }

            activeFloor = clamped;
            ActiveFloorChanged?.Invoke();
            Changed?.Invoke();
        }

        public static void StepFloor(int delta)
        {
            if (delta == 0)
            {
                return;
            }

            SetActiveFloor(activeFloor + delta);
        }

        public static void SetFloorHeight(float value)
        {
            float clamped = Mathf.Max(0.01f, value);
            if (Mathf.Approximately(floorHeight, clamped))
            {
                return;
            }

            floorHeight = clamped;
            FloorHeightChanged?.Invoke();
            ActiveFloorChanged?.Invoke();
            Changed?.Invoke();
        }

        public static void SetFloorBounds(int min, int max)
        {
            minFloor = min;
            maxFloor = Mathf.Max(min, max);
            SetActiveFloor(activeFloor);
            Changed?.Invoke();
        }

        public static float FloorY(int floor)
        {
            return floor * FloorHeight;
        }

        public static int FloorFromBaseY(float baseY, float gridOriginY = 0f)
        {
            return Mathf.RoundToInt((baseY - gridOriginY) / FloorHeight);
        }
    }
}
