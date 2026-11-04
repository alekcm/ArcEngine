using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// MVP template loader/saver for JSON templates.
    ///
    /// Reads developer templates from StreamingAssets/MapGen/Templates and user templates
    /// from persistentDataPath/MapGen/Templates. User templates are not allowed to override
    /// existing core ids.
    /// </summary>
    public class MapGenerationTemplateLibraryService : MonoBehaviour
    {
        [SerializeField] private bool loadOnAwake = true;
        [SerializeField] private bool includeBuiltInMansionTemplate = true;
        [SerializeField] private bool logReloadSummary = true;

        private readonly List<MapGenerationTemplateData> templates = new List<MapGenerationTemplateData>();
        private readonly List<string> loadErrors = new List<string>();
        private readonly Dictionary<string, MapGenerationTemplateData> templatesById = new Dictionary<string, MapGenerationTemplateData>(StringComparer.OrdinalIgnoreCase);

        public IReadOnlyList<MapGenerationTemplateData> Templates => templates;
        public IReadOnlyList<string> LoadErrors => loadErrors;

        public string BuiltInTemplatesDirectory => Path.Combine(Application.streamingAssetsPath, "MapGen", "Templates");
        public string UserTemplatesDirectory => Path.Combine(Application.persistentDataPath, "MapGen", "Templates");

        private void Awake()
        {
            if (loadOnAwake)
            {
                Reload();
            }
        }

        [ContextMenu("Reload Map Generation Templates")]
        public void Reload()
        {
            templates.Clear();
            templatesById.Clear();
            loadErrors.Clear();

            if (includeBuiltInMansionTemplate)
            {
                RegisterTemplate(DefaultMansionTemplateFactory.Create(true, true), "built-in", allowUserPrefix: false);
            }

            LoadDirectory(BuiltInTemplatesDirectory, allowUserPrefix: false);
            LoadDirectory(UserTemplatesDirectory, allowUserPrefix: true);

            if (logReloadSummary)
            {
                Debug.Log($"MapGenerationTemplateLibraryService: reloaded {templates.Count} template(s), {loadErrors.Count} error(s). Built-in dir: {BuiltInTemplatesDirectory}; User dir: {UserTemplatesDirectory}", this);
                for (int i = 0; i < loadErrors.Count; i++)
                {
                    Debug.LogError(loadErrors[i], this);
                }
            }
        }

        public MapGenerationTemplateData FindById(string id)
        {
            if (string.IsNullOrWhiteSpace(id))
            {
                return null;
            }

            MapGenerationTemplateData template;
            templatesById.TryGetValue(id, out template);
            return template;
        }

        public bool SaveUserTemplate(MapGenerationTemplateData template, out string path, out string error)
        {
            path = null;
            error = null;

            if (template == null)
            {
                error = "Template is null.";
                return false;
            }

            if (string.IsNullOrWhiteSpace(template.id))
            {
                error = "Template id is empty.";
                return false;
            }

            if (!template.id.StartsWith("user.", StringComparison.OrdinalIgnoreCase))
            {
                error = "User template id must start with 'user.'.";
                return false;
            }

            MapGenerationValidationResult validation = new MapGenerationTemplateValidator().Validate(template, userTemplate: true);
            if (!validation.IsValid)
            {
                error = validation.Issues.Count > 0 ? validation.Issues[0].ToString() : "Template is invalid.";
                return false;
            }

            Directory.CreateDirectory(UserTemplatesDirectory);
            string safeName = MakeSafeFileName(template.id) + ".template.json";
            path = Path.Combine(UserTemplatesDirectory, safeName);
            string json = MapGenerationTemplateJsonUtility.ToJson(template, true);
            File.WriteAllText(path, json);
            Reload();
            return true;
        }

        private void LoadDirectory(string directory, bool allowUserPrefix)
        {
            if (string.IsNullOrWhiteSpace(directory) || !Directory.Exists(directory))
            {
                return;
            }

            string[] files = Directory.GetFiles(directory, "*.template.json", SearchOption.AllDirectories);
            for (int i = 0; i < files.Length; i++)
            {
                LoadFile(files[i], allowUserPrefix);
            }
        }

        private void LoadFile(string path, bool allowUserPrefix)
        {
            try
            {
                string json = File.ReadAllText(path);
                MapGenerationTemplateData template = MapGenerationTemplateJsonUtility.FromJson(json);
                RegisterTemplate(template, path, allowUserPrefix);
            }
            catch (Exception ex)
            {
                loadErrors.Add($"{path}: {ex.Message}");
            }
        }

        private void RegisterTemplate(MapGenerationTemplateData template, string source, bool allowUserPrefix)
        {
            if (template == null)
            {
                loadErrors.Add($"{source}: template is null.");
                return;
            }

            if (string.IsNullOrWhiteSpace(template.id))
            {
                loadErrors.Add($"{source}: template id is empty.");
                return;
            }

            if (allowUserPrefix && !template.id.StartsWith("user.", StringComparison.OrdinalIgnoreCase))
            {
                loadErrors.Add($"{source}: user template id must start with 'user.'.");
                return;
            }

            MapGenerationValidationResult validation = new MapGenerationTemplateValidator().Validate(template, allowUserPrefix);
            for (int i = 0; i < validation.Issues.Count; i++)
            {
                MapGenerationIssue issue = validation.Issues[i];
                if (issue == null)
                {
                    continue;
                }

                string message = $"{source}: {issue}";
                if (issue.Severity == MapGenerationIssueSeverity.Error)
                {
                    loadErrors.Add(message);
                }
                else
                {
                    Debug.LogWarning(message, this);
                }
            }

            if (!validation.IsValid)
            {
                return;
            }

            if (templatesById.ContainsKey(template.id))
            {
                loadErrors.Add($"{source}: duplicate template id '{template.id}'. Existing templates are not overridden.");
                return;
            }

            templatesById.Add(template.id, template);
            templates.Add(template);
        }

        private static string MakeSafeFileName(string value)
        {
            char[] chars = value.ToCharArray();
            for (int i = 0; i < chars.Length; i++)
            {
                char c = chars[i];
                if (!char.IsLetterOrDigit(c) && c != '_' && c != '-' && c != '.')
                {
                    chars[i] = '_';
                }
            }

            return new string(chars);
        }
    }
}
