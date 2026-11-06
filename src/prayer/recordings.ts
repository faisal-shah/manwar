import type { BundledAudio } from './core/media';

/**
 * The recordings an athan can play, for the wall's settings and the
 * phone's: the bundled athans and the ones a tablet uploaded. An upload's
 * file stays on that tablet; its name is listed in the household's prayer
 * settings document (`recordings`, kept by the tablet: prayer/store.ts), so
 * a phone can choose it too.
 */
export interface UploadedRecording {
  /** The upload's id (its audio id is `upload:<id>`). */
  id: string;
  name: string;
  durationSec: number;
}

/** "Fajr athan — Mishary Rashid Alafasy (maqam Hijaz)" -> "Fajr · Mishary Rashid Alafasy" */
export function shortLabel(label: string): string {
  const [kind, who = ''] = label.split(' — ');
  return `${kind.startsWith('Fajr') ? 'Fajr · ' : ''}${who.replace(/\s*\(.*\)$/, '')}`;
}

/** The choices for one athan as [audio id, label]: the bundled athans (Fajr's first for Fajr), then the uploads. */
export function soundOptions(
  bundled: readonly BundledAudio[],
  uploaded: readonly UploadedRecording[],
  kind: 'athan' | 'fajr',
  uploadedLabel: (name: string) => string,
): [string, string][] {
  const opts: [string, string][] = [
    ...bundled.filter((a) => a.kind === 'athan' || a.kind === 'fajr').map((a) => [a.id, shortLabel(a.label)] as [string, string]),
    ...uploaded.map((u) => [`upload:${u.id}`, uploadedLabel(u.name)] as [string, string]),
  ];
  if (kind === 'fajr') opts.sort((a, b) => Number(b[0].startsWith('fajr')) - Number(a[0].startsWith('fajr')));
  return opts;
}

/** The uploads the tablets listed in the prayer settings document (outside input: anything malformed is left out). */
export function listedRecordings(doc: Record<string, unknown>): UploadedRecording[] {
  const raw = doc.recordings;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  return Object.entries(raw as Record<string, unknown>).flatMap(([id, r]) => {
    if (!r || typeof r !== 'object') return [];
    const { name, durationSec } = r as Record<string, unknown>;
    return typeof name === 'string' && name && typeof durationSec === 'number' && Number.isFinite(durationSec)
      ? [{ id, name, durationSec }]
      : [];
  });
}
