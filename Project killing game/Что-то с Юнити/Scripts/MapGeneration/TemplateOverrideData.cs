using System;
using System.Collections.Generic;

namespace MapEditorPrototype
{
    /// <summary>
    /// Переопределение ОДНОГО слота локации в точке вызова — в
    /// TemplateLocationRequirementData.overrides (прямой вызов локации) или в
    /// TemplateClusterLocationOverrideData.slotOverrides (внутри clusterRef-блока).
    ///
    /// Применяется к КОПИИ LocationDefData при генерации — исходный файл
    /// локации в библиотеке не меняется (LocationOverrideApplier).
    ///
    /// Примеры:
    ///   пляж:    { "targetSlotId": "med_bed", "replaceFilterTags": ["cat:beach_lounger"] }
    ///   особняк: { "targetSlotId": "blood_packs", "countScale": 2.0 }
    ///   стиль:   { "targetSlotId": "*", "addFilterTags": ["style:gothic_farmhouse"] }
    ///
    /// Приоритет разрешения предмета слота (RoomFurnisher):
    ///   forceStampId → лодаут владельца → дефолт шаблона → filterTags (после replace/add).
    /// </summary>
    [Serializable]
    public class TemplateLocationOverrideData
    {
        /// <summary>
        /// id слота в LocationDefData. "" или "*" — применить add/scale/anchor
        /// ко ВСЕМ слотам локации (replaceFilterTags и forceStampId в этом
        /// режиме игнорируются с предупреждением).
        /// </summary>
        public string targetSlotId = "";

        /// <summary>Непусто → ПОЛНОСТЬЮ заменить filterTags слота (другая модель койки на пляже).</summary>
        public List<string> replaceFilterTags = new List<string>();

        /// <summary>Добавить теги к filterTags слота (например style:* всему блоку).</summary>
        public List<string> addFilterTags = new List<string>();

        /// <summary>Множитель countMin/countMax (2.0 = пакетов крови вдвое больше). 1 = без изменений.</summary>
        public float countScale = 1f;

        /// <summary>Множитель probability optional-слотов (0 — выключить необязательные вставки).</summary>
        public float probabilityScale = 1f;

        /// <summary>Непусто → всегда ставить конкретный штамп (в обход тегов и лодаута).</summary>
        public string forceStampId = "";

        /// <summary>Непусто → переопределить anchor слота (Wall|Corner|Center|NearDoor|NearWindow|Surface|Free).</summary>
        public string anchorOverride = "";
    }

    /// <summary>
    /// Оверрайд локационных требований внутри поддерева clusterRef (поле
    /// TemplateClusterRequirementData.overrides). Адресация цели — первым
    /// непустым из: targetRuleId ("*" = все требования поддерева), targetTag
    /// (requiredTag), targetLocationId (locationId или один из variantIds).
    /// </summary>
    [Serializable]
    public class TemplateClusterLocationOverrideData
    {
        /// <summary>ruleId локационного требования ВНУТРИ фрагмента (до префиксации). "*" = все.</summary>
        public string targetRuleId = "";

        /// <summary>Альтернативная адресация: по requiredTag требования.</summary>
        public string targetTag = "";

        /// <summary>Альтернативная адресация: по locationId/variantId требования.</summary>
        public string targetLocationId = "";

        /// <summary>Оверрайды слотов; ДОБАВЛЯЮТСЯ к overrides найденных требований.</summary>
        public List<TemplateLocationOverrideData> slotOverrides = new List<TemplateLocationOverrideData>();

        /// <summary>Непусто → заменить список вариантов требования (свой состав для этой карты).</summary>
        public List<string> setVariantIds = new List<string>();

        /// <summary>Добавить варианты к variantIds требования.</summary>
        public List<string> addVariantIds = new List<string>();

        /// <summary>Непусто → переопределить variantPolicy требования ("byId"|"first"|"random"|"weighted").</summary>
        public string variantPolicy = "";
    }
}
