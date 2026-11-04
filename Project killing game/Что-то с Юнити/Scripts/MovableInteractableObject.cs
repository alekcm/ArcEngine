using Unity.Netcode;
using Unity.Netcode.Components;
using UnityEngine;


namespace MapEditorPrototype
{
    [RequireComponent(typeof(NetworkObject))]
    [RequireComponent(typeof(Rigidbody))]
    [RequireComponent(typeof(NetworkTransform))]
    public class MovableInteractableObject : NetworkBehaviour
    {
        [Header("Auto-linked Components")]
        [SerializeField] private NetworkTransform netTransform;
        [SerializeField] private Rigidbody rb;
        
        [Header("Optimization")]
        [SerializeField] private float impactThreshold = 1.0f; 
        
        private NetworkVariable<bool> isSynced = new NetworkVariable<bool>(false, 
            NetworkVariableReadPermission.Everyone, NetworkVariableWritePermission.Server);

        private void OnValidate()
        {
            // Авто-поиск в редакторе, чтобы не делать это в игре
            if (rb == null) rb = GetComponent<Rigidbody>();
            if (netTransform == null) netTransform = GetComponent<NetworkTransform>();
            
            if (rb != null)
            {
                rb.collisionDetectionMode = CollisionDetectionMode.ContinuousSpeculative;
            }
        }

        private void Awake()
        {
            // Запасной поиск, если ссылки пусты
            if (rb == null) rb = GetComponent<Rigidbody>();
            if (netTransform == null) netTransform = GetComponent<NetworkTransform>();
            
            SetLocalState(false);
        }

        public override void OnNetworkSpawn()
        {
            isSynced.OnValueChanged += (oldVal, newVal) => ApplyState(newVal);
            ApplyState(isSynced.Value);
        }

        [ServerRpc(RequireOwnership = false)]
        public void RequestDirectInteractionServerRpc(ulong clientId)
        {
            isSynced.Value = true;
            if (NetworkObject.OwnerClientId != clientId)
                NetworkObject.ChangeOwnership(clientId);
        }

        private void OnCollisionEnter(Collision collision)
        {
            if (!IsServer) return;
            if (!isSynced.Value && collision.relativeVelocity.magnitude > impactThreshold)
            {
                isSynced.Value = true;
            }
        }

        private void Update()
        {
            if (!IsServer || !isSynced.Value) return;

            if (rb.IsSleeping() || (rb.linearVelocity.sqrMagnitude < 0.001f && rb.angularVelocity.sqrMagnitude < 0.001f))
            {
                isSynced.Value = false;
            }
        }

        private void ApplyState(bool active)
        {
            if (rb != null)
            {
                rb.isKinematic = !active;
                if (active) rb.WakeUp();
            }

            if (netTransform != null)
            {
                netTransform.enabled = active;
            }
        }

        private void SetLocalState(bool active)
        {
            if (rb != null) rb.isKinematic = !active;
            if (netTransform != null) netTransform.enabled = active;
        }
    }
}
