using System;
using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    public class PathSystem : MonoBehaviour
    {
        [SerializeField] private Transform pathRoot;

        private readonly List<PathStroke> strokes = new List<PathStroke>();

        public event Action Changed;

        public IReadOnlyList<PathStroke> Strokes => strokes;

        public PathStroke CreateStroke(PathDefinition definition, IReadOnlyList<Vector3> points, float width, string strokeId = null)
        {
            if (definition == null || points == null || points.Count < 2)
            {
                return null;
            }

            Transform parent = pathRoot != null ? pathRoot : transform;
            GameObject strokeObject = new GameObject(string.IsNullOrWhiteSpace(definition.SafeDisplayName) ? "PathStroke" : definition.SafeDisplayName + "_Stroke");
            strokeObject.transform.SetParent(parent, false);

            PathStroke stroke = strokeObject.AddComponent<PathStroke>();
            stroke.Initialize(definition, width, points, strokeId);
            strokes.Add(stroke);
            Changed?.Invoke();
            return stroke;
        }

        public void RemoveStroke(PathStroke stroke)
        {
            if (stroke == null)
            {
                return;
            }

            strokes.Remove(stroke);
            Destroy(stroke.gameObject);
            Changed?.Invoke();
        }

        public void NotifyStrokeChanged()
        {
            Changed?.Invoke();
        }

        public PathStroke FindById(string strokeId)
        {
            for (int i = 0; i < strokes.Count; i++)
            {
                if (strokes[i] != null && strokes[i].StrokeId == strokeId)
                {
                    return strokes[i];
                }
            }

            return null;
        }

        public void ClearAll()
        {
            for (int i = strokes.Count - 1; i >= 0; i--)
            {
                if (strokes[i] != null)
                {
                    Destroy(strokes[i].gameObject);
                }
            }

            strokes.Clear();
            Changed?.Invoke();
        }
    }
}
