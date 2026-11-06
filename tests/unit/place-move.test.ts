import { describe, expect, it } from 'vitest';
import { planPlaceMove } from '../../src/data/placeMove';

/** The one-time move of the household's place into settings/main.place (data/placeMove.ts). */

const HOUSTON_WEATHER = { lat: 29.7604, lon: -95.3698, name: 'Houston, Texas' };
const HOUSTON_PRAYER = {
  name: 'Houston, Texas, United States',
  latitude: 29.7633,
  longitude: -95.3633,
  timezone: 'America/Chicago',
};

describe('moving the household place', () => {
  it("takes the prayer clock's place (it has the time zone) and deletes both old fields", () => {
    expect(
      planPlaceMove({ weather: HOUSTON_WEATHER, restingFace: 'prayer' }, { place: HOUSTON_PRAYER, dayTheme: 'kids' }),
    ).toEqual({
      kind: 'write',
      main: {
        place: { name: 'Houston, Texas, United States', lat: 29.7633, lon: -95.3633, timezone: 'America/Chicago' },
        remove: ['weather'],
      },
      prayer: { set: {}, remove: ['place'] },
    });
  });

  it('asks for the time zone of a weather place, then moves it with the zone found', () => {
    expect(planPlaceMove({ weather: HOUSTON_WEATHER }, {})).toEqual({ kind: 'lookup', lat: 29.7604, lon: -95.3698 });
    expect(planPlaceMove({ weather: HOUSTON_WEATHER }, {}, 'America/Chicago')).toEqual({
      kind: 'write',
      main: { place: { name: 'Houston, Texas', lat: 29.7604, lon: -95.3698, timezone: 'America/Chicago' }, remove: ['weather'] },
      prayer: { set: {}, remove: [] },
    });
    // A prayer place stored without a zone is looked up the same way.
    expect(planPlaceMove({}, { place: { ...HOUSTON_PRAYER, timezone: null } })).toMatchObject({ kind: 'lookup' });
  });

  it("drops the prayer clock's own time format and weather unit, keeping its weather switched off", () => {
    expect(planPlaceMove({}, { clock24h: true, weather: { enabled: false, unit: 'c' } })).toEqual({
      kind: 'write',
      main: { remove: [] },
      prayer: { set: { showWeather: false }, remove: ['clock24h', 'weather'] },
    });
    expect(planPlaceMove({}, { weather: { enabled: true, unit: 'f' } })).toMatchObject({ prayer: { set: {} } });
  });

  it('keeps a household place already moved, and only deletes what is left', () => {
    const place = { name: 'Austin, Texas', lat: 30.27, lon: -97.74, timezone: 'America/Chicago' };
    expect(planPlaceMove({ place, weather: HOUSTON_WEATHER }, { place: HOUSTON_PRAYER })).toEqual({
      kind: 'write',
      main: { remove: ['weather'] },
      prayer: { set: {}, remove: ['place'] },
    });
  });

  it('is idempotent: after the move, or with nothing to move, there is nothing to write', () => {
    const plan = planPlaceMove({ weather: HOUSTON_WEATHER }, { place: HOUSTON_PRAYER });
    if (plan?.kind !== 'write') throw new Error('expected a write');
    expect(planPlaceMove({ place: plan.main.place }, {})).toBeNull();
    expect(planPlaceMove({}, {})).toBeNull();
    expect(planPlaceMove(undefined, undefined)).toBeNull();
  });

  it('reads the stored documents as outside input', () => {
    // A malformed old place moves nothing, but is still deleted.
    expect(planPlaceMove({ weather: { lat: 'x', lon: 1 } }, { place: { latitude: 200, longitude: 0 } })).toEqual({
      kind: 'write',
      main: { remove: ['weather'] },
      prayer: { set: {}, remove: ['place'] },
    });
    // A weather place with no name is named by its coordinates.
    expect(planPlaceMove({ weather: { lat: 29.76, lon: -95.37 } }, {}, 'America/Chicago')).toMatchObject({
      main: { place: { name: '29.760, -95.370' } },
    });
  });
});
