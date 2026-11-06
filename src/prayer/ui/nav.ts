import { face } from '../../app/face';
import { openSettings } from '../../app/nav';
import { sleeping, wake } from '../../core/display';

/** Back to the family face (waking the wall, if it slept behind the night clock). */
export function toFamily(): void {
  if (sleeping.peek()) wake();
  face.value = 'family';
}

/** The household's place is chosen in Settings > Location, on the family face (behind the PIN, when one is set). */
export function chooseLocation(): void {
  toFamily();
  openSettings('location');
}
