using System;
using System.Collections.Generic;
using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// Применяет оверрайды точки вызова (TemplateLocationOverrideData) к КОПИИ
    /// LocationDefData. Исходные данные библиотеки локаций не меняются.
    ///
    /// Семантика полей:
    ///   targetSlotId "" | "*" — addFilterTags/countScale/probabilityScale/anchorOverride
    ///       применяются ко ВСЕМ слотам; replaceFilterTags и forceStampId в
    ///       этом режиме игнорируются (с записью в report), иначе все слоты
    ///       стали бы одинаковыми.
    ///   targetSlotId "bed"  — всё применяется только к слоту "bed"; слот не
    ///       найден → запись в report, остальные оверрайды обрабатываются.
    ///
    /// Несколько оверрайдов применяются ПО ПОРЯДКУ списка: поздние выигрывают.
    /// (Внешние оверрайды clusterRef добавляются после внутренних —
    /// см. TemplateRefExpander.)
    ///
    /// Чистый статический класс без доступа к сцене/библиотекам — удобно
    /// покрывать EditMode-тестами.
    /// </summary>
    public static class LocationOverrideApplier
    {
        /// <summary>Пустой/неэффективный ли список оверрайдов (быстрый выход без копирования).</summary>
        public static bool IsEmpty(IReadOnlyList<TemplateLocationOverrideData> overrides)
        {
            if (overrides == null)
            {
                return true;
            }

            for (int i = 0; i < overrides.Count; i++)
            {
                TemplateLocationOverrideData o = overrides[i];
                if (o == null)
                {
                    continue;
                }
                bool hasTags = (o.replaceFilterTags != null && o.replaceFilterTags.Count > 0) ||
                               (o.addFilterTags != null && o.addFilterTags.Count > 0);
                bool hasScalars = Mathf.Abs(o.countScale - 1f) > 0.0001f ||
                                  Mathf.Abs(o.probabilityScale - 1f) > 0.0001f;
                bool hasStrings = !string.IsNullOrWhiteSpace(o.forceStampId) ||
                                  !string.IsNullOrWhiteSpace(o.anchorOverride);
                if (hasTags || hasScalars || hasStrings)
                {
                    return false;
                }
            }

            return true;
        }

        /// <summary>
        /// Применить оверрайды; вернуть копию def (или исходник, если оверрайдов нет).
        /// report (необязателен) — человекочитаемые предупреждения.
        /// </summary>
        public static LocationDefData Apply(
            LocationDefData source,
            IReadOnlyList<TemplateLocationOverrideData> overrides,
            List<string> report = null)
        {
            if (source == null)
            {
                return null;
            }

            if (IsEmpty(overrides))
            {
                return source;
            }

            LocationDefData result = JsonUtility.FromJson<LocationDefData>(JsonUtility.ToJson(source));

            for (int i = 0; i < overrides.Count; i++)
            {
                ApplyOne(result, overrides[i], report);
            }

            return result;
        }

        // ------------------------------------------------------------------

        private static void ApplyOne(LocationDefData def, TemplateLocationOverrideData o, List<string> report)
        {
            if (def?.slots == null || o == null)
            {
                return;
            }

            bool global = string.IsNullOrWhiteSpace(o.targetSlotId) || o.targetSlotId == "*";

            if (global)
            {
                if (o.replaceFilterTags != null && o.replaceFilterTags.Count > 0)
                {
                    report?.Add("replaceFilterTags игнорируется при targetSlotId '*' (сделал бы все слоты одинаковыми).");
                }
                if (!string.IsNullOrWhiteSpace(o.forceStampId))
                {
                    report?.Add("forceStampId игнорируется при targetSlotId '*' (поставил бы один штамп во все слоты).");
                }

                foreach (LocationSlotData slot in def.slots)
                {
                    if (slot == null)
                    {
                        continue;
                    }
                    AddTags(slot, o.addFilterTags);
                    ScaleCounts(slot, o.countScale);
                    ScaleProbability(slot, o.probabilityScale);
                    if (!string.IsNullOrWhiteSpace(o.anchorOverride))
                    {
                        slot.anchor = o.anchorOverride;
                    }
                }
                return;
            }

            LocationSlotData target = FindSlot(def, o.targetSlotId);
            if (target == null)
            {
                report?.Add($"слот '{o.targetSlotId}' не найден в локации '{def.id}' — оверрайд пропущен.");
                return;
            }

            if (o.replaceFilterTags != null && o.replaceFilterTags.Count > 0)
            {
                target.filterTags = new List<string>(o.replaceFilterTags);
            }
            AddTags(target, o.addFilterTags);
            ScaleCounts(target, o.countScale);
            ScaleProbability(target, o.probabilityScale);
            if (!string.IsNullOrWhiteSpace(o.forceStampId))
            {
                target.forceStampId = o.forceStampId;
            }
            if (!string.IsNullOrWhiteSpace(o.anchorOverride))
            {
                target.anchor = o.anchorOverride;
            }
        }

        private static LocationSlotData FindSlot(LocationDefData def, string slotId)
        {
            for (int i = 0; i < def.slots.Count; i++)
            {
                LocationSlotData slot = def.slots[i];
                if (slot != null && string.Equals(slot.id, slotId, StringComparison.OrdinalIgnoreCase))
                {
                    return slot;
                }
            }
            return null;
        }

        private static void AddTags(LocationSlotData slot, List<string> tags)
        {
            if (tags == null)
            {
                return;
            }

            foreach (string tag in tags)
            {
                if (string.IsNullOrWhiteSpace(tag) || ContainsTag(slot.filterTags, tag))
                {
                    continue;
                }
                slot.filterTags = slot.filterTags ?? new List<string>();
                slot.filterTags.Add(tag);
            }
        }

        private static bool ContainsTag(List<string> list, string tag)
        {
            if (list == null)
            {
                return false;
            }
            foreach (string item in list)
            {
                if (string.Equals(item, tag, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
            return false;
        }

        /// <summary>2.0 → countMin 1→2, countMax 2→4 (пакетов крови вдвое больше).</summary>
        private static void ScaleCounts(LocationSlotData slot, float scale)
        {
            if (Mathf.Abs(scale - 1f) <= 0.0001f)
            {
                return;
            }

            int newMin = Mathf.Max(0, Mathf.RoundToInt(slot.countMin * scale));
            int newMax = Mathf.Max(newMin, Mathf.RoundToInt(slot.countMax * scale));
            slot.countMin = newMin;
            slot.countMax = newMax;
        }

        private static void ScaleProbability(LocationSlotData slot, float scale)
        {
            if (Mathf.Abs(scale - 1f) <= 0.0001f)
            {
                return;
            }

            slot.probability = Mathf.Clamp01(slot.probability * scale);
        }
    }
}
