using UnityEngine;
using UnityEngine.AI;

namespace MapEditorPrototype
{
    [RequireComponent(typeof(NavMeshAgent))]
    public class NpcWanderAgent : MonoBehaviour
    {
        [SerializeField] private float wanderRadius = 8f;
        [SerializeField] private float sampleDistance = 4f;
        [SerializeField] private float waitBetweenMovesMin = 1.5f;
        [SerializeField] private float waitBetweenMovesMax = 4f;

        private NavMeshAgent agent;
        private Vector3 homePosition;
        private float nextMoveTime;

        private void Awake()
        {
            agent = GetComponent<NavMeshAgent>();
            homePosition = transform.position;
        }

        private void Start()
        {
            ScheduleNextMove(0.1f);
        }

        private void Update()
        {
            if (Time.time < nextMoveTime)
            {
                return;
            }

            if (agent.pathPending)
            {
                return;
            }

            if (agent.remainingDistance > agent.stoppingDistance + 0.1f)
            {
                return;
            }

            TryMoveToRandomPoint();
        }

        public void SetHomePosition(Vector3 newHomePosition)
        {
            homePosition = newHomePosition;
        }

        private void TryMoveToRandomPoint()
        {
            for (int i = 0; i < 8; i++)
            {
                Vector2 circle = Random.insideUnitCircle * wanderRadius;
                Vector3 candidate = homePosition + new Vector3(circle.x, 0f, circle.y);

                if (NavMesh.SamplePosition(candidate, out NavMeshHit hit, sampleDistance, NavMesh.AllAreas))
                {
                    agent.SetDestination(hit.position);
                    ScheduleNextMove(Random.Range(waitBetweenMovesMin, waitBetweenMovesMax));
                    return;
                }
            }

            ScheduleNextMove(1f);
        }

        private void ScheduleNextMove(float delay)
        {
            nextMoveTime = Time.time + delay;
        }
    }
}
