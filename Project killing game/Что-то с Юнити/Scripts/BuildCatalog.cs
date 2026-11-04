using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace MapEditorPrototype
{
    public class BuildCatalog : MonoBehaviour
    {
        [SerializeField] private List<BuildingDefinition> items = new List<BuildingDefinition>();
        [SerializeField] private BuildLayer startingLayer = BuildLayer.Furniture;
        [SerializeField] private int startingIndex;

        private readonly List<BuildingDefinition> filteredItems = new List<BuildingDefinition>();

        public event Action CatalogChanged;
        public event Action SelectionChanged;

        public IReadOnlyList<BuildingDefinition> AllItems => items;
        public IReadOnlyList<BuildingDefinition> FilteredItems => filteredItems;
        public BuildLayer CurrentLayer { get; private set; }
        public int SelectedIndex { get; private set; }
        public BuildingDefinition Current => filteredItems.Count == 0 ? null : filteredItems[Mathf.Clamp(SelectedIndex, 0, filteredItems.Count - 1)];

        private void Awake()
        {
            CurrentLayer = startingLayer;
            RebuildFilteredItems(selectStartingIndex: true);
        }

        public void SetLayer(BuildLayer layer)
        {
            if (CurrentLayer == layer && filteredItems.Count > 0)
            {
                return;
            }

            CurrentLayer = layer;
            RebuildFilteredItems(selectStartingIndex: false);
        }

        public void Select(int index)
        {
            if (filteredItems.Count == 0)
            {
                SelectedIndex = 0;
                SelectionChanged?.Invoke();
                return;
            }

            int wrappedIndex = WrapIndex(index, filteredItems.Count);
            if (SelectedIndex == wrappedIndex)
            {
                return;
            }

            SelectedIndex = wrappedIndex;
            SelectionChanged?.Invoke();
        }

        public void Select(BuildingDefinition definition)
        {
            if (definition == null)
            {
                return;
            }

            if (CurrentLayer != definition.layer)
            {
                CurrentLayer = definition.layer;
                RebuildFilteredItems(selectStartingIndex: false, preferredDefinitionId: definition.id);
                return;
            }

            int index = filteredItems.IndexOf(definition);
            if (index >= 0)
            {
                Select(index);
            }
        }

        public void SelectById(string definitionId)
        {
            BuildingDefinition definition = FindById(definitionId);
            if (definition != null)
            {
                Select(definition);
            }
        }

        public void SelectNext()
        {
            Select(SelectedIndex + 1);
        }

        public void SelectPrevious()
        {
            Select(SelectedIndex - 1);
        }

        public BuildingDefinition FindById(string definitionId)
        {
            if (string.IsNullOrWhiteSpace(definitionId))
            {
                return null;
            }

            return items.FirstOrDefault(item => item != null && string.Equals(item.id, definitionId, StringComparison.OrdinalIgnoreCase));
        }

        private void RebuildFilteredItems(bool selectStartingIndex, string preferredDefinitionId = null)
        {
            filteredItems.Clear();

            foreach (BuildingDefinition item in items)
            {
                if (item != null && item.layer == CurrentLayer)
                {
                    filteredItems.Add(item);
                }
            }

            if (filteredItems.Count == 0)
            {
                SelectedIndex = 0;
                CatalogChanged?.Invoke();
                SelectionChanged?.Invoke();
                return;
            }

            if (!string.IsNullOrWhiteSpace(preferredDefinitionId))
            {
                int preferredIndex = filteredItems.FindIndex(item => string.Equals(item.id, preferredDefinitionId, StringComparison.OrdinalIgnoreCase));
                SelectedIndex = preferredIndex >= 0 ? preferredIndex : 0;
            }
            else if (selectStartingIndex)
            {
                SelectedIndex = Mathf.Clamp(startingIndex, 0, filteredItems.Count - 1);
            }
            else
            {
                SelectedIndex = Mathf.Clamp(SelectedIndex, 0, filteredItems.Count - 1);
            }

            CatalogChanged?.Invoke();
            SelectionChanged?.Invoke();
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
