using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace MapEditorPrototype
{
    public class PathCatalog : MonoBehaviour
    {
        [SerializeField] private List<PathDefinition> paths = new List<PathDefinition>();
        [SerializeField] private int startingIndex;

        public event Action SelectionChanged;

        public IReadOnlyList<PathDefinition> Paths => paths;
        public int SelectedIndex { get; private set; }
        public PathDefinition Current => paths.Count == 0 ? null : paths[Mathf.Clamp(SelectedIndex, 0, paths.Count - 1)];

        private void Awake()
        {
            if (paths.Count > 0)
            {
                SelectedIndex = Mathf.Clamp(startingIndex, 0, paths.Count - 1);
            }
        }

        public void Select(int index)
        {
            if (paths.Count == 0)
            {
                SelectedIndex = 0;
                SelectionChanged?.Invoke();
                return;
            }

            index %= paths.Count;
            if (index < 0)
            {
                index += paths.Count;
            }

            SelectedIndex = index;
            SelectionChanged?.Invoke();
        }

        public void SelectNext() => Select(SelectedIndex + 1);
        public void SelectPrevious() => Select(SelectedIndex - 1);

        public PathDefinition FindById(string id)
        {
            if (string.IsNullOrWhiteSpace(id))
            {
                return null;
            }

            return paths.FirstOrDefault(item => item != null && string.Equals(item.id, id, StringComparison.OrdinalIgnoreCase));
        }
    }
}
