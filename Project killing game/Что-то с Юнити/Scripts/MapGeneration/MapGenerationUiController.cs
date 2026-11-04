using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace MapEditorPrototype
{
    /// <summary>
    /// Minimal MVP UI adapter for map generation.
    ///
    /// Wire optional UI fields in the inspector. The component is deliberately small:
    /// it does not own generation logic, it only copies UI values into
    /// ClusteredMansionMapGenerator, invokes generation, and displays LastValidationReport.
    /// </summary>
    public class MapGenerationUiController : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private ClusteredMansionMapGenerator generator;
        [SerializeField] private MapGenerationTemplateLibraryService templateLibrary;

        [Header("Buttons")]
        [SerializeField] private Button generateButton;
        [SerializeField] private Button reloadTemplatesButton;
        [SerializeField] private Button exportTemplateButton;

        [Header("Inputs")]
        [SerializeField] private TMP_InputField seedInput;
        [SerializeField] private TMP_InputField playerCountInput;
        [SerializeField] private TMP_InputField maxAttemptsInput;
        [SerializeField] private TMP_InputField templateIdInput;

        [Header("Toggles")]
        [SerializeField] private Toggle randomizeSeedToggle;
        [SerializeField] private Toggle randomizeGeometryToggle;
        [SerializeField] private Toggle includeCourtroomToggle;
        [SerializeField] private Toggle includeOutdoorYardToggle;

        [Header("Output")]
        [SerializeField] private TMP_Text statusLabel;
        [SerializeField] private TMP_Text reportText;
        [SerializeField] private ScrollRect reportScrollRect;

        [Header("Optional Tools")]
        [SerializeField] private MapGenerationTemplateExporter templateExporter;

        private void Awake()
        {
            if (generator == null) generator = FindObjectOfType<ClusteredMansionMapGenerator>();
            if (templateLibrary == null) templateLibrary = FindObjectOfType<MapGenerationTemplateLibraryService>();
            if (templateExporter == null) templateExporter = FindObjectOfType<MapGenerationTemplateExporter>();
        }

        private void OnEnable()
        {
            BindButton(generateButton, GenerateFromUi);
            BindButton(reloadTemplatesButton, ReloadTemplates);
            BindButton(exportTemplateButton, ExportTemplate);
        }

        private void Start()
        {
            PullGeneratorValuesToUi();
            RefreshReport();
        }

        public void GenerateFromUi()
        {
            if (generator == null)
            {
                SetStatus("Generator is not assigned.", true);
                return;
            }

            PushUiValuesToGenerator();
            generator.GenerateAndApply();
            PullGeneratorValuesToUi();
            RefreshReport();
        }

        public void ReloadTemplates()
        {
            if (templateLibrary == null)
            {
                templateLibrary = FindObjectOfType<MapGenerationTemplateLibraryService>();
            }

            if (templateLibrary == null)
            {
                SetStatus("Template library is not assigned.", true);
                return;
            }

            templateLibrary.Reload();
            SetStatus($"Templates reloaded: {templateLibrary.Templates.Count}, errors: {templateLibrary.LoadErrors.Count}.", templateLibrary.LoadErrors.Count > 0);
        }

        public void ExportTemplate()
        {
            if (templateExporter == null)
            {
                templateExporter = FindObjectOfType<MapGenerationTemplateExporter>();
            }

            if (templateExporter == null)
            {
                SetStatus("Template exporter is not assigned.", true);
                return;
            }

            templateExporter.ExportBuiltInMansionTemplateJson();
            SetStatus(string.IsNullOrWhiteSpace(templateExporter.LastExportPath) ? "Template export attempted." : "Template exported: " + templateExporter.LastExportPath, false);
        }

        public void PullGeneratorValuesToUi()
        {
            if (generator == null)
            {
                return;
            }

            SetInput(seedInput, generator.Seed.ToString());
            SetInput(playerCountInput, generator.PlayerCount.ToString());
            SetInput(maxAttemptsInput, generator.MaxGenerationAttempts.ToString());
            SetInput(templateIdInput, generator.TemplateId);
            SetToggle(randomizeSeedToggle, generator.RandomizeSeedOnGenerate);
            SetToggle(randomizeGeometryToggle, generator.RandomizeGeometryFromSeed);
            SetToggle(includeCourtroomToggle, generator.IncludeCourtroom);
            SetToggle(includeOutdoorYardToggle, generator.IncludeOutdoorYard);
        }

        public void PushUiValuesToGenerator()
        {
            if (generator == null)
            {
                return;
            }

            generator.Seed = ParseInt(seedInput, generator.Seed, minValue: int.MinValue);
            generator.PlayerCount = ParseInt(playerCountInput, generator.PlayerCount, minValue: 1);
            generator.MaxGenerationAttempts = ParseInt(maxAttemptsInput, generator.MaxGenerationAttempts, minValue: 1);

            if (templateIdInput != null)
            {
                generator.TemplateId = templateIdInput.text;
            }

            if (randomizeSeedToggle != null) generator.RandomizeSeedOnGenerate = randomizeSeedToggle.isOn;
            if (randomizeGeometryToggle != null) generator.RandomizeGeometryFromSeed = randomizeGeometryToggle.isOn;
            if (includeCourtroomToggle != null) generator.IncludeCourtroom = includeCourtroomToggle.isOn;
            if (includeOutdoorYardToggle != null) generator.IncludeOutdoorYard = includeOutdoorYardToggle.isOn;
        }

        public void RefreshReport()
        {
            if (generator == null)
            {
                SetStatus("Generator is not assigned.", true);
                return;
            }

            string report = generator.LastValidationReport;
            if (string.IsNullOrWhiteSpace(report))
            {
                report = "No generation report yet.";
            }

            if (reportText != null)
            {
                reportText.text = report;
            }

            if (generator.LastValidation != null)
            {
                SetStatus(MapGenerationValidationReportFormatter.FormatCompact(generator.LastValidation), !generator.LastValidation.IsValid);
            }
            else
            {
                SetStatus("Ready.", false);
            }

            if (reportScrollRect != null)
            {
                reportScrollRect.verticalNormalizedPosition = 1f;
            }
        }

        private void SetStatus(string message, bool error)
        {
            if (statusLabel == null)
            {
                return;
            }

            statusLabel.text = message;
            statusLabel.color = error ? new Color(1f, 0.35f, 0.25f, 1f) : new Color(0.7f, 1f, 0.7f, 1f);
        }

        private static void SetInput(TMP_InputField input, string value)
        {
            if (input != null) input.text = value ?? string.Empty;
        }

        private static void SetToggle(Toggle toggle, bool value)
        {
            if (toggle != null) toggle.isOn = value;
        }

        private static int ParseInt(TMP_InputField input, int fallback, int minValue)
        {
            if (input == null || string.IsNullOrWhiteSpace(input.text))
            {
                return fallback;
            }

            int value;
            if (!int.TryParse(input.text, out value))
            {
                return fallback;
            }

            return value < minValue ? minValue : value;
        }

        private static void BindButton(Button button, UnityEngine.Events.UnityAction action)
        {
            if (button == null)
            {
                return;
            }

            button.onClick.RemoveListener(action);
            button.onClick.AddListener(action);
        }
    }
}
