using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// Библиотека переиспользуемых кластерных фрагментов (*.cluster.json) —
    /// «медблок», «стандартное крыло из трёх комнат» и т.п., вызываемые из
    /// любых шаблонов карт через TemplateClusterRequirementData.clusterRef.
    /// Зеркалит LocationLibraryService/StampLibraryService по структуре.
    ///
    /// Файл = корневой TemplateClusterRequirementData (ruleId/clusterId/
    /// clusterType/displayName + requiredLocations/requiredClusters/
    /// requiredConnectors). Глобальный адрес фрагмента = его clusterId
    /// (например "core.cluster.med_block").
    ///
    /// Папки:
    ///   StreamingAssets/MapGen/Clusters/*.cluster.json   — контент разработчика
    ///   persistentDataPath/MapGen/Clusters/*.cluster.json — пользовательский
    ///
    /// Пользовательские clusterId обязаны начинаться с "user." и не могут
    /// перекрывать базовые id.
    /// </summary>
    public class ClusterFragmentLibraryService : MonoBehaviour
    {
        public event Action LibraryChanged;

        private readonly List<FragmentEntry> entries = new List<FragmentEntry>();
        private readonly Dictionary<string, FragmentEntry> byId =
            new Dictionary<string, FragmentEntry>(StringComparer.OrdinalIgnoreCase);

        public IReadOnlyList<FragmentEntry> Entries => entries;

        public class FragmentEntry
        {
            public TemplateClusterRequirementData Data;
            public string FilePath;
            public bool IsUserContent;
            public bool IsValid;
            public List<string> Errors = new List<string>();
        }

        public static string UserClustersDirectory =>
            Path.Combine(Application.persistentDataPath, "MapGen", "Clusters");

        public static string CoreClustersDirectory =>
            Path.Combine(Application.streamingAssetsPath, "MapGen", "Clusters");

        private void Awake()
        {
            Reload();
        }

        [ContextMenu("Reload Cluster Fragments")] // удобно при редактировании JSON на лету
        public void Reload()
        {
            entries.Clear();
            byId.Clear();

            LoadDirectory(CoreClustersDirectory, isUser: false);
            LoadDirectory(UserClustersDirectory, isUser: true);

            LibraryChanged?.Invoke();
        }

        private void LoadDirectory(string directory, bool isUser)
        {
            if (!Directory.Exists(directory))
            {
                if (isUser)
                {
                    Directory.CreateDirectory(directory);
                }
                return;
            }

            foreach (string file in Directory
                         .GetFiles(directory, "*.cluster.json", SearchOption.TopDirectoryOnly)
                         .OrderBy(f => f))
            {
                FragmentEntry entry = new FragmentEntry { FilePath = file, IsUserContent = isUser };

                try
                {
                    entry.Data = JsonUtility.FromJson<TemplateClusterRequirementData>(File.ReadAllText(file));
                }
                catch (Exception e)
                {
                    entry.Errors.Add($"Не удалось прочитать JSON: {e.Message}");
                }

                if (entry.Data == null && entry.Errors.Count == 0)
                {
                    entry.Errors.Add("Пустой или нечитаемый файл.");
                }

                if (entry.Data != null)
                {
                    Validate(entry);
                }

                entry.IsValid = entry.Errors.Count == 0;
                entries.Add(entry);

                if (entry.IsValid)
                {
                    byId[entry.Data.clusterId] = entry;
                }
                else
                {
                    Debug.LogWarning($"[ClusterFragmentLibrary] '{Path.GetFileName(file)}' отклонён: " +
                                     string.Join("; ", entry.Errors));
                }
            }
        }

        /// <summary>Найти фрагмент по clusterId (адресу ссылки clusterRef).</summary>
        public TemplateClusterRequirementData FindById(string id)
        {
            return !string.IsNullOrWhiteSpace(id) && byId.TryGetValue(id, out FragmentEntry e) ? e.Data : null;
        }

        // ------------------------------------------------------------------
        // Валидация (уровень 1: схема; содержимое проверит MapGenerationValidator
        // уже после раскрытия ref'ов в шаблоне).
        // ------------------------------------------------------------------

        private void Validate(FragmentEntry entry)
        {
            TemplateClusterRequirementData d = entry.Data;

            if (string.IsNullOrWhiteSpace(d.clusterId))
            {
                entry.Errors.Add("Не задан clusterId (глобальный адрес фрагмента).");
            }
            else
            {
                string id = d.clusterId;
                foreach (char c in id)
                {
                    bool ok = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_' || c == '.';
                    if (!ok)
                    {
                        entry.Errors.Add($"clusterId '{id}': недопустимый символ '{c}' (разрешено a-z 0-9 _ .).");
                        break;
                    }
                }

                if (entry.IsUserContent && !id.StartsWith("user.", StringComparison.Ordinal))
                {
                    entry.Errors.Add($"Пользовательский фрагмент '{id}' должен начинаться с 'user.'.");
                }

                if (!entry.IsUserContent && id.StartsWith("user.", StringComparison.Ordinal))
                {
                    entry.Errors.Add($"Базовый фрагмент '{id}' не должен иметь префикс 'user.'.");
                }

                if (byId.ContainsKey(id))
                {
                    entry.Errors.Add($"Фрагмент с clusterId '{id}' уже загружен (дубликат).");
                }
            }

            bool hasContent =
                (d.requiredLocations != null && d.requiredLocations.Count > 0) ||
                (d.requiredClusters != null && d.requiredClusters.Count > 0);
            if (!hasContent)
            {
                entry.Errors.Add("Фрагмент пуст: нет ни requiredLocations, ни requiredClusters.");
            }

            if (d.minCount < 0)
            {
                entry.Errors.Add("minCount < 0.");
            }
        }
    }
}
