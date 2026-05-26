export function shouldIgnoreTransientLongPressClose({
  nextOpen,
  openedByLongPress,
  reason,
}: {
  nextOpen: boolean
  openedByLongPress: boolean
  reason: string | undefined
}) {
  if (nextOpen || !openedByLongPress) return false
  return reason === 'outside-press' || reason === 'focus-out' || reason === 'cancel-open' || reason == null
}
