export function intakeReplayMode({ canInspectModel, hasAddImages, hasTextarea, hasContentEditable }) {
  if (!canInspectModel) return 'config-assistant'
  if (hasAddImages) return 'native-add-images'
  if (hasTextarea) return 'paste-fallback'
  // DSH 0.2.1-alpha.2 composer is contentEditable and accepts the paste itself.
  if (hasContentEditable) return 'native-composer'
  return 'config-assistant'
}
