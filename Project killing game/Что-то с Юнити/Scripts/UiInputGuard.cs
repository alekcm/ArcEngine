using UnityEngine;

namespace MapEditorPrototype
{
    /// <summary>
    /// Простой «страж ввода»: UI-панели (включая OnGUI, про которые
    /// EventSystem не знает) помечают кадр, когда курсор находится над ними,
    /// а потребители ввода (камера и т.п.) проверяют флаг перед обработкой
    /// колеса мыши.
    ///
    /// Окно в 1 кадр нужно потому, что OnGUI выполняется ПОСЛЕ Update:
    /// флаг, выставленный в OnGUI кадра N, должен блокировать Update кадра N+1.
    /// </summary>
    public static class UiInputGuard
    {
        private static int scrollBlockedFrame = -10;

        /// <summary>Вызывается UI каждый кадр, пока курсор над панелью.</summary>
        public static void BlockScrollThisFrame()
        {
            scrollBlockedFrame = Time.frameCount;
        }

        /// <summary>Камеры и прочие потребители колеса проверяют это перед зумом.</summary>
        public static bool IsScrollBlocked => Time.frameCount - scrollBlockedFrame <= 1;
    }
}
