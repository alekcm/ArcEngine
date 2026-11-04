using System.Collections.Generic;
using System.Text;

namespace MapEditorPrototype
{
    public static class MapGenerationValidationReportFormatter
    {
        public static string Format(
            MapGenerationValidationResult validation,
            GeneratedMapLayout layout = null,
            string title = "Map generation validation report")
        {
            StringBuilder sb = new StringBuilder(1024);
            sb.AppendLine(title);

            if (layout != null)
            {
                sb.AppendLine($"Template: {layout.TemplateId}");
                sb.AppendLine($"World: {layout.WorldId}");
                sb.AppendLine($"Seed: {layout.Seed}");
                sb.AppendLine($"Players: {layout.PlayerCount}");
                sb.AppendLine($"Floors: {layout.Floors.Count}, Clusters: {layout.Clusters.Count}, Outdoor zones: {layout.OutdoorZones.Count}, Connectors: {layout.Connectors.Count}");
            }

            if (validation == null)
            {
                sb.AppendLine("Validation result is null.");
                return sb.ToString();
            }

            int errors = 0;
            int warnings = 0;
            int info = 0;
            CountIssues(validation, out errors, out warnings, out info);

            sb.AppendLine($"Status: {(validation.IsValid ? "VALID" : "INVALID")}");
            sb.AppendLine($"Issues: {validation.Issues.Count} total, {errors} errors, {warnings} warnings, {info} info");

            if (validation.Issues.Count == 0)
            {
                return sb.ToString();
            }

            sb.AppendLine();
            AppendIssueGroup(sb, validation, MapGenerationIssueSeverity.Error, "Errors");
            AppendIssueGroup(sb, validation, MapGenerationIssueSeverity.Warning, "Warnings");
            AppendIssueGroup(sb, validation, MapGenerationIssueSeverity.Info, "Info");

            return sb.ToString();
        }

        public static string FormatGenerationFailure(int attempts, GeneratedMapLayout layout, MapGenerationValidationResult validation)
        {
            string title = $"Map generation failed after {attempts} attempt(s)";
            return Format(validation, layout, title);
        }

        public static string FormatGenerationSuccess(int attempt, GeneratedMapLayout layout, MapGenerationValidationResult validation)
        {
            string title = $"Map generation succeeded on attempt {attempt}";
            return Format(validation, layout, title);
        }

        public static string FormatCompact(MapGenerationValidationResult validation)
        {
            if (validation == null)
            {
                return "Validation result is null.";
            }

            int errors;
            int warnings;
            int info;
            CountIssues(validation, out errors, out warnings, out info);
            return $"{(validation.IsValid ? "VALID" : "INVALID")}: {errors} errors, {warnings} warnings, {info} info";
        }

        private static void CountIssues(MapGenerationValidationResult validation, out int errors, out int warnings, out int info)
        {
            errors = 0;
            warnings = 0;
            info = 0;

            if (validation == null || validation.Issues == null)
            {
                return;
            }

            for (int i = 0; i < validation.Issues.Count; i++)
            {
                MapGenerationIssue issue = validation.Issues[i];
                if (issue == null)
                {
                    continue;
                }

                switch (issue.Severity)
                {
                    case MapGenerationIssueSeverity.Error:
                        errors++;
                        break;
                    case MapGenerationIssueSeverity.Warning:
                        warnings++;
                        break;
                    case MapGenerationIssueSeverity.Info:
                        info++;
                        break;
                }
            }
        }

        private static void AppendIssueGroup(StringBuilder sb, MapGenerationValidationResult validation, MapGenerationIssueSeverity severity, string header)
        {
            List<MapGenerationIssue> issues = new List<MapGenerationIssue>();
            for (int i = 0; i < validation.Issues.Count; i++)
            {
                MapGenerationIssue issue = validation.Issues[i];
                if (issue != null && issue.Severity == severity)
                {
                    issues.Add(issue);
                }
            }

            if (issues.Count == 0)
            {
                return;
            }

            sb.AppendLine(header + ":");
            for (int i = 0; i < issues.Count; i++)
            {
                MapGenerationIssue issue = issues[i];
                sb.Append("- ");
                sb.Append(issue.Code);
                if (!string.IsNullOrWhiteSpace(issue.ContextId))
                {
                    sb.Append(" [");
                    sb.Append(issue.ContextId);
                    sb.Append(']');
                }

                sb.Append(": ");
                sb.AppendLine(issue.Message);
            }

            sb.AppendLine();
        }
    }
}
