using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace MapEditorPrototype
{
    public class DetailPaintBrushCatalog : MonoBehaviour
    {
        [SerializeField] private List<DetailPaintBrushDefinition> brushes = new List<DetailPaintBrushDefinition>();
        [SerializeField] private int startingIndex;

        public event Action SelectionChanged;

        public IReadOnlyList<DetailPaintBrushDefinition> Brushes => brushes;
        public int SelectedIndex { get; private set; }
        public DetailPaintBrushDefinition Current => brushes.Count == 0 ? null : brushes[Mathf.Clamp(SelectedIndex, 0, brushes.Count - 1)];

        private void Awake()
        {
            if (brushes.Count > 0)
            {
                SelectedIndex = Mathf.Clamp(startingIndex, 0, brushes.Count - 1);
            }
        }

        public void Select(int index)
        {
            if (brushes.Count == 0)
            {
                SelectedIndex = 0;
                SelectionChanged?.Invoke();
                return;
            }

            index %= brushes.Count;
            if (index < 0)
            {
                index += brushes.Count;
            }

            SelectedIndex = index;
            SelectionChanged?.Invoke();
        }

        public void SelectNext() => Select(SelectedIndex + 1);
        public void SelectPrevious() => Select(SelectedIndex - 1);

        public DetailPaintBrushDefinition FindById(string id)
        {
            if (string.IsNullOrWhiteSpace(id))
            {
                return null;
            }

            return brushes.FirstOrDefault(item => item != null && string.Equals(item.id, id, StringComparison.OrdinalIgnoreCase));
        }
    }
}
