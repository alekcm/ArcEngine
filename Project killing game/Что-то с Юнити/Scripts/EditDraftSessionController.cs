using UnityEngine;
using System.Threading.Tasks;

namespace MapEditorPrototype
{
    public class EditDraftSessionController : MonoBehaviour
    {
        [SerializeField] private MapSaveSystem mapSaveSystem;
        private readonly WorldStateDiffBuilder diffBuilder = new WorldStateDiffBuilder();

        public bool HasActiveDraft { get; private set; }
        public WorldState BaseWorldState { get; private set; }
        public WorldState DraftWorldState { get; private set; }

        public bool BeginDraftSession()
        {
            if (mapSaveSystem == null) return false;
            BaseWorldState = mapSaveSystem.CaptureCurrentWorldState();
            HasActiveDraft = BaseWorldState != null;
            return HasActiveDraft;
        }

        public async Task<WorldPatch> ApplyDraftSessionAsync()
        {
            if (!HasActiveDraft || mapSaveSystem == null || BaseWorldState == null) return null;
            DraftWorldState = mapSaveSystem.CaptureCurrentWorldState();
            WorldPatch patch = await Task.Run(() => diffBuilder.BuildPatch(BaseWorldState, DraftWorldState));
            BaseWorldState = DraftWorldState; 
            HasActiveDraft = false;
            return patch;
        }

        public void CancelDraftSession()
        {
            if (!HasActiveDraft || BaseWorldState == null) return;
            mapSaveSystem.ApplyWorldState(BaseWorldState);
            HasActiveDraft = false;
        }

        public void ClearDraftSession()
        {
            BaseWorldState = null;
            DraftWorldState = null;
            HasActiveDraft = false;
        }
    }
}
