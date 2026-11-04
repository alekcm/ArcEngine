using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEngine;

namespace MapEditorPrototype
{
    public class UndoAction
    {
        public WorldPatch Forward; 
        public WorldPatch Backward;
    }

    public class EditorUndoRedoSystem : MonoBehaviour
    {
        [SerializeField] private MapSaveSystem mapSaveSystem;
        private readonly Stack<UndoAction> undoStack = new Stack<UndoAction>();
        private readonly Stack<UndoAction> redoStack = new Stack<UndoAction>();

        public event Action StateChanged;
        public bool CanUndo => undoStack.Count > 0;
        public bool CanRedo => redoStack.Count > 0;

        // Совместимость со старым кодом
        public void RecordStateBeforeChange() { }
        public async Task RecordStateBeforeChangeAsync() { await Task.Yield(); }

        public void PushAction(WorldPatch forward, WorldPatch backward)
        {
            if (forward == null || backward == null) return;
            undoStack.Push(new UndoAction { Forward = forward, Backward = backward });
            redoStack.Clear();
            NotifyStateChanged();
        }

        public WorldPatch Undo()
        {
            if (!CanUndo) return null;
            UndoAction action = undoStack.Pop();
            redoStack.Push(action);
            NotifyStateChanged();
            return action.Backward;
        }

        public WorldPatch Redo()
        {
            if (!CanRedo) return null;
            UndoAction action = redoStack.Pop();
            undoStack.Push(action);
            NotifyStateChanged();
            return action.Forward;
        }

        public void Clear()
        {
            undoStack.Clear();
            redoStack.Clear();
            NotifyStateChanged();
        }

        private void NotifyStateChanged() => StateChanged?.Invoke();
    }
}
