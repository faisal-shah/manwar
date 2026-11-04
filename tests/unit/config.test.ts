import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { googleClientId } from '../../src/config';

/** The web app and the Functions read the OAuth client id from separate files; they must agree. */
describe('config', () => {
  const env = Object.fromEntries(
    readFileSync(new URL('../../functions/.env', import.meta.url), 'utf8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
  it('uses one OAuth client id', () => expect(env.GOOGLE_OAUTH_CLIENT_ID).toBe(googleClientId));
});
