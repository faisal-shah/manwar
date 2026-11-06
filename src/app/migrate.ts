import { deleteField, getDoc } from 'firebase/firestore';
import { timezoneAt } from '../core/place';
import { planPlaceMove } from '../data/placeMove';
import { batch, householdId, prayerSettingsRef, settingsRef } from '../data/store';
import type { SettingsPatch } from '../data/types';

const FIRST_RETRY_MS = 30_000;
const MAX_RETRY_MS = 30 * 60_000;

const deletes = (fields: string[]) => Object.fromEntries(fields.map((f) => [f, deleteField()]));

/**
 * Move the household's place into `settings/main.place` (data/placeMove.ts
 * plans it), on the wall once the household is open. Both documents change
 * in one batch, so the old place is never deleted without the new one. A
 * second run finds nothing to move. A failure (the time zone lookup
 * offline) is tried again later, backing off, while the household stays.
 */
export async function movePlace(): Promise<void> {
  const hid = householdId.peek();
  for (let wait = FIRST_RETRY_MS; householdId.peek() === hid; wait = Math.min(wait * 2, MAX_RETRY_MS)) {
    try {
      const [main, prayer] = await Promise.all([getDoc(settingsRef()), getDoc(prayerSettingsRef())]);
      let plan = planPlaceMove(main.data(), prayer.data());
      if (plan?.kind === 'lookup') plan = planPlaceMove(main.data(), prayer.data(), await timezoneAt(plan.lat, plan.lon));
      if (plan?.kind !== 'write' || householdId.peek() !== hid) return;
      const { place, remove } = plan.main;
      await batch()
        .settings({ ...(place ? { place } : {}), ...deletes(remove) } as SettingsPatch)
        .prayerSettings({ ...plan.prayer.set, ...deletes(plan.prayer.remove) })
        .commit();
      return;
    } catch (e) {
      console.warn('moving the household place: trying again later', e);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}
