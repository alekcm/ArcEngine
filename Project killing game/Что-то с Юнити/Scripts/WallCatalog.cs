using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace MapEditorPrototype
{
    public class WallCatalog : MonoBehaviour
    {
        [SerializeField] private List<WallDefinition> walls = new List<WallDefinition>();
        [SerializeField] private List<WallOpeningDefinition> doors = new List<WallOpeningDefinition>();
        [SerializeField] private List<WallOpeningDefinition> windows = new List<WallOpeningDefinition>();

        [SerializeField] private int startingWallIndex;
        [SerializeField] private int startingDoorIndex;
        [SerializeField] private int startingWindowIndex;

        public event Action SelectionChanged;

        public IReadOnlyList<WallDefinition> Walls => walls;
        public IReadOnlyList<WallOpeningDefinition> Doors => doors;
        public IReadOnlyList<WallOpeningDefinition> Windows => windows;

        public int SelectedWallIndex { get; private set; }
        public int SelectedDoorIndex { get; private set; }
        public int SelectedWindowIndex { get; private set; }

        public WallDefinition CurrentWall => walls.Count == 0 ? null : walls[Mathf.Clamp(SelectedWallIndex, 0, walls.Count - 1)];
        public WallOpeningDefinition CurrentDoor => doors.Count == 0 ? null : doors[Mathf.Clamp(SelectedDoorIndex, 0, doors.Count - 1)];
        public WallOpeningDefinition CurrentWindow => windows.Count == 0 ? null : windows[Mathf.Clamp(SelectedWindowIndex, 0, windows.Count - 1)];

        private void Awake()
        {
            if (walls.Count > 0) SelectedWallIndex = Mathf.Clamp(startingWallIndex, 0, walls.Count - 1);
            if (doors.Count > 0) SelectedDoorIndex = Mathf.Clamp(startingDoorIndex, 0, doors.Count - 1);
            if (windows.Count > 0) SelectedWindowIndex = Mathf.Clamp(startingWindowIndex, 0, windows.Count - 1);
        }

        public void SelectWall(int index)
        {
            if (walls.Count == 0)
            {
                return;
            }

            SelectedWallIndex = WrapIndex(index, walls.Count);
            SelectionChanged?.Invoke();
        }

        public void SelectDoor(int index)
        {
            if (doors.Count == 0)
            {
                return;
            }

            SelectedDoorIndex = WrapIndex(index, doors.Count);
            SelectionChanged?.Invoke();
        }

        public void SelectWindow(int index)
        {
            if (windows.Count == 0)
            {
                return;
            }

            SelectedWindowIndex = WrapIndex(index, windows.Count);
            SelectionChanged?.Invoke();
        }

        public void SelectNextWall() => SelectWall(SelectedWallIndex + 1);
        public void SelectPreviousWall() => SelectWall(SelectedWallIndex - 1);
        public void SelectNextDoor() => SelectDoor(SelectedDoorIndex + 1);
        public void SelectPreviousDoor() => SelectDoor(SelectedDoorIndex - 1);
        public void SelectNextWindow() => SelectWindow(SelectedWindowIndex + 1);
        public void SelectPreviousWindow() => SelectWindow(SelectedWindowIndex - 1);

        public WallDefinition FindWallById(string id)
        {
            if (string.IsNullOrWhiteSpace(id))
            {
                return null;
            }

            return walls.FirstOrDefault(item => item != null && string.Equals(item.id, id, StringComparison.OrdinalIgnoreCase));
        }

        public WallOpeningDefinition FindOpeningById(string id)
        {
            if (string.IsNullOrWhiteSpace(id))
            {
                return null;
            }

            WallOpeningDefinition result = doors.FirstOrDefault(item => item != null && string.Equals(item.id, id, StringComparison.OrdinalIgnoreCase));
            if (result != null)
            {
                return result;
            }

            return windows.FirstOrDefault(item => item != null && string.Equals(item.id, id, StringComparison.OrdinalIgnoreCase));
        }

        private int WrapIndex(int index, int count)
        {
            if (count <= 0)
            {
                return 0;
            }

            index %= count;
            if (index < 0)
            {
                index += count;
            }

            return index;
        }
    }
}
