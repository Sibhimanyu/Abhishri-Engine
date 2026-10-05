// What tapping a status button on the attendance sheet does.

/** Absent and Late need a reason before they are saved. */
export const NEEDS_NOTE = ['absent', 'late'];

export const NOTE_MAX = 300;

/**
 * 'clear' when the tapped status is already set (tap again to undo), 'note' when it
 * needs a reason first, otherwise 'save'.
 */
export function tapAction(currentStatus, tapped) {
  if (currentStatus === tapped) return 'clear';
  if (NEEDS_NOTE.includes(tapped)) return 'note';
  return 'save';
}

/** The note as it will be saved, or '' when there's nothing worth saving. */
export function cleanNote(note) {
  return String(note || '').trim().slice(0, NOTE_MAX);
}
