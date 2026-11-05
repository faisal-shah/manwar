import type { ComponentChildren } from 'preact';
import { UserPlus } from 'lucide-preact';
import { openSettings } from '../app/nav';
import { Button } from './controls';

/** First run: nobody in the household yet. Explains what people are for and opens Settings > Profiles. */
export function NoProfiles({ children }: { children: ComponentChildren }) {
  return (
    <div class="empty no-profiles">
      <span class="big" aria-hidden="true">
        👪
      </span>
      <span>{children}</span>
      <Button variant="primary" onClick={() => openSettings('profiles')}>
        <UserPlus size="2rem" />
        Add people
      </Button>
    </div>
  );
}
