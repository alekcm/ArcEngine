using System;
using System.IO;
using UnityEngine;

namespace MapEditorPrototype
{
    public enum MapGenerationTemplateExportMode
    {
        PersistentExports,
        PersistentUserTemplates,
        StreamingAssetsTemplates
    }

    /// <summary>
    /// Small MVP utility that exports the current built-in mansion template to JSON.
    ///
    /// This is the first bridge from hardcoded test content to editable template data:
    /// export a JSON file, inspect/edit it, then let MapGenerationTemplateLibraryService
    /// load user templates from persistentDataPath/MapGen/Templates.
    /// </summary>
    public class MapGenerationTemplateExporter : MonoBehaviour
    {
        [SerializeField] private MapGenerationTemplateLibraryService templateLibrary;
        [SerializeField] private MapGenerationTemplateExportMode exportMode = MapGenerationTemplateExportMode.PersistentExports;
        [SerializeField] private bool includeCourtroom = true;
        [SerializeField] private bool includeOutdoorYard = true;
        [SerializeField] private bool prettyPrint = true;

        [Header("User clone settings")]
        [SerializeField] private bool cloneAsUserTemplate = true;
        [SerializeField] private string userTemplateId = "user.template.mvp2_mansion_clustered_copy";
        [SerializeField] private string userTemplateName = "MVP-2 Mansion User Copy";

        public string LastExportPath { get; private set; }

        [ContextMenu("Export Built-In Mansion Template JSON")]
        public void ExportBuiltInMansionTemplateJson()
        {
            MapGenerationTemplateData template = DefaultMansionTemplateFactory.Create(includeCourtroom, includeOutdoorYard);

            if (cloneAsUserTemplate || exportMode == MapGenerationTemplateExportMode.PersistentUserTemplates)
            {
                ApplyUserCloneMetadata(template);
            }

            ExportTemplate(template);
        }

        public bool ExportTemplate(MapGenerationTemplateData template)
        {
            if (template == null)
            {
                Debug.LogError("MapGenerationTemplateExporter: template is null.", this);
                return false;
            }

            if (exportMode == MapGenerationTemplateExportMode.PersistentUserTemplates)
            {
                return ExportToUserTemplateLibrary(template);
            }

            string directory = ResolveExportDirectory();
            Directory.CreateDirectory(directory);

            string fileName = MakeSafeFileName(template.id) + ".template.json";
            string path = Path.Combine(directory, fileName);
            string json = MapGenerationTemplateJsonUtility.ToJson(template, prettyPrint);
            File.WriteAllText(path, json);
            LastExportPath = path;

            Debug.Log($"Map generation template exported: {path}", this);
            return true;
        }

        private bool ExportToUserTemplateLibrary(MapGenerationTemplateData template)
        {
            if (templateLibrary == null)
            {
                templateLibrary = FindObjectOfType<MapGenerationTemplateLibraryService>();
            }

            if (templateLibrary == null)
            {
                GameObject go = new GameObject("MapGenerationTemplateLibraryService");
                templateLibrary = go.AddComponent<MapGenerationTemplateLibraryService>();
            }

            string path;
            string error;
            if (!templateLibrary.SaveUserTemplate(template, out path, out error))
            {
                Debug.LogError("MapGenerationTemplateExporter: " + error, this);
                return false;
            }

            LastExportPath = path;
            Debug.Log($"User map generation template saved: {path}", this);
            return true;
        }

        private void ApplyUserCloneMetadata(MapGenerationTemplateData template)
        {
            if (template == null)
            {
                return;
            }

            template.id = string.IsNullOrWhiteSpace(userTemplateId) ? "user.template.mvp2_mansion_clustered_copy" : userTemplateId;
            if (!template.id.StartsWith("user.", StringComparison.OrdinalIgnoreCase))
            {
                template.id = "user." + template.id;
            }

            if (!string.IsNullOrWhiteSpace(userTemplateName))
            {
                template.name = userTemplateName;
            }

            template.description = (template.description ?? string.Empty) + "\nExported as editable user template clone.";
        }

        private string ResolveExportDirectory()
        {
            switch (exportMode)
            {
                case MapGenerationTemplateExportMode.StreamingAssetsTemplates:
                    return Path.Combine(Application.streamingAssetsPath, "MapGen", "Templates");
                case MapGenerationTemplateExportMode.PersistentExports:
                default:
                    return Path.Combine(Application.persistentDataPath, "MapGen", "Exports");
            }
        }

        private static string MakeSafeFileName(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return "template";
            }

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
