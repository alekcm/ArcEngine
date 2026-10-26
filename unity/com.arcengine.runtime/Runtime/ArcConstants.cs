// ArcConstants.cs — Constants.js as an asset (Arc.Const reads it).
using System;
using System.Collections.Generic;
using UnityEngine;

namespace ArcEngine
{
    // Constants.js as an asset: numbers and strings by name.
    [CreateAssetMenu(menuName = "ArcEngine/Constants")]
    public class ArcConstants : ScriptableObject
    {
        [Serializable] public class Number { public string name; public float value; }
        [Serializable] public class Text { public string name; public string value; }

        public List<Number> numbers = new List<Number>();
        public List<Text> strings = new List<Text>();

        Dictionary<string, float> _numbers;
        Dictionary<string, string> _strings;

        void OnValidate() { _numbers = null; _strings = null; }

        public bool TryGet(string name, out float value)
        {
            if (_numbers == null || _numbers.Count != numbers.Count)
            {
                _numbers = new Dictionary<string, float>();
                foreach (var n in numbers) _numbers[n.name] = n.value;
            }
            return _numbers.TryGetValue(name, out value);
        }

        public bool TryGetText(string name, out string value)
        {
            if (_strings == null || _strings.Count != strings.Count)
            {
                _strings = new Dictionary<string, string>();
                foreach (var s in strings) _strings[s.name] = s.value;
            }
            return _strings.TryGetValue(name, out value);
        }

        public void Set(string name, float value)
        {
            var n = numbers.Find(e => e.name == name);
            if (n == null) numbers.Add(new Number { name = name, value = value });
            else n.value = value;
            _numbers = null;
        }
    }
}
