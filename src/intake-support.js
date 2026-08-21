export function intakeReplayMode({ canInspectModel, hasAddImages, hasTextarea }) {
  if (!canInspectModel) return 'config-assistant'
  if (hasAddImages) return 'native-add-images'
  if (hasTextarea) return 'paste-fallback'
  return 'config-assistant'
}
