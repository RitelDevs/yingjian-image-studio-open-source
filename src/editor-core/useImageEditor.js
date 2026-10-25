import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createEditorController, EMPTY_EDITOR_SNAPSHOT } from './controller.mjs';

export function useImageEditor({ userId }) {
  const controller = useMemo(() => createEditorController({ userId }), [userId]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, () => EMPTY_EDITOR_SNAPSHOT);
  useEffect(() => controller.acquire(), [controller]);
  return useMemo(() => ({ ...state,
    loadImage: controller.loadImage, previewOperations: controller.previewOperations,
    commitOperations: controller.commitOperations, cancelPreview: controller.cancelPreview,
    undo: controller.undo, redo: controller.redo, exportImage: controller.exportImage,
    getAiSnapshot: controller.getAiSnapshot, clearError: controller.clearError,
    clearNotice: controller.clearNotice, flush: controller.flush
  }), [state, controller]);
}
export default useImageEditor;
