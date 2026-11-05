import { Empty } from '../ui/controls';

/** A tab whose screens are still to come. */
export function Placeholder({ what }: { what: string }) {
  return <Empty emoji="🚧">{what} arrives here soon.</Empty>;
}
