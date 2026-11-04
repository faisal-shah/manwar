import { HistoryHost } from '../rewards/History';
import { ClaimHost, DetailsHost } from './Details';
import { CelebrationHost } from './effects';
import { EditorHost } from './Editor';

/** Popover, claim dialog, editor, star history and celebration for whichever task surface is on screen. */
export function TasksOverlays() {
  return (
    <>
      <DetailsHost />
      <ClaimHost />
      <EditorHost />
      <HistoryHost />
      <CelebrationHost />
    </>
  );
}
