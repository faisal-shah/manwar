/**
 * The phone agenda's person filter (pure; `shownPeople` in state.ts keeps it
 * on this phone, since the wall's filter is the household's). It names the
 * people to show; none named, or none of them still in the household, shows
 * everyone. The events it keeps follow the wall's rule (`passesHidden`): an
 * event shows while any of its people is shown, and always when it is for
 * the whole family or for no one yet.
 */

/** The people of `all` (profile ids, in order) the filter `shown` names; empty means everyone. */
export const shownOf = (shown: readonly string[], all: readonly string[]): string[] => all.filter((id) => shown.includes(id));

/** The profiles to hide for `passesHidden`. */
export function hiddenBy(shown: readonly string[], all: readonly string[]): string[] {
  const on = shownOf(shown, all);
  return on.length ? all.filter((id) => !on.includes(id)) : [];
}

/** The filter after tapping person `id` (null: All). Everyone named comes back to All. */
export function tapPerson(shown: readonly string[], all: readonly string[], id: string | null): string[] {
  if (id === null) return [];
  const on = shownOf(shown, all);
  const next = on.includes(id) ? on.filter((x) => x !== id) : shownOf([...on, id], all);
  return next.length === all.length ? [] : next;
}
