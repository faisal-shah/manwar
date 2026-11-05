import type { ComponentChildren } from 'preact';
import { asParent } from '../../core/lock';
import { saveSettings } from '../../data/store';
import type { HHMM, SettingsPatch } from '../../data/types';
import { Segmented } from '../../ui/controls';

/** Every settings write is a parent action. */
export function change(partial: SettingsPatch): Promise<void> {
  return asParent(() => {
    void saveSettings(partial);
  }, 'Enter the PIN to change settings.');
}

export function PageTitle({ children }: { children: ComponentChildren }) {
  return <h2 class="set-title">{children}</h2>;
}

export function Group({ title, hint, children }: { title?: string; hint?: string; children: ComponentChildren }) {
  return (
    <section class="set-group">
      {title && <h3>{title}</h3>}
      <div class="set-rows">{children}</div>
      {hint && <p class="set-hint">{hint}</p>}
    </section>
  );
}

function Label({ label, hint }: { label: ComponentChildren; hint?: ComponentChildren }) {
  return (
    <span class="set-label">
      {label}
      {hint && <small>{hint}</small>}
    </span>
  );
}

/** A row with a label on the left and a control on the right. */
export function Row({
  label,
  hint,
  lead,
  children,
}: {
  label: ComponentChildren;
  hint?: ComponentChildren;
  lead?: ComponentChildren;
  children?: ComponentChildren;
}) {
  return (
    <div class="set-row">
      {lead}
      <Label label={label} hint={hint} />
      {children}
    </div>
  );
}

/** A whole-row switch, so the touch target is the row, not the small toggle. */
export function ToggleRow({
  label,
  hint,
  lead,
  on,
  disabled,
  onChange,
}: {
  label: ComponentChildren;
  hint?: ComponentChildren;
  lead?: ComponentChildren;
  on: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      class="set-row set-switch"
      onClick={() => onChange(!on)}
    >
      {lead}
      <Label label={label} hint={hint} />
      <span class={`toggle${on ? ' on' : ''}`} aria-hidden="true" />
    </button>
  );
}

export function ChoiceRow<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: ComponentChildren;
  hint?: ComponentChildren;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <Row label={label} hint={hint}>
      <Segmented value={value} options={options} onChange={onChange} />
    </Row>
  );
}

/** A tappable row that opens or picks something (chevron or check on the right). */
export function NavRow({
  label,
  hint,
  lead,
  trail,
  onClick,
  selected,
}: {
  label: ComponentChildren;
  hint?: ComponentChildren;
  lead?: ComponentChildren;
  trail?: ComponentChildren;
  onClick: () => void;
  selected?: boolean;
}) {
  return (
    <button type="button" class={`set-row set-nav${selected ? ' on' : ''}`} aria-pressed={selected} onClick={onClick}>
      {lead}
      <Label label={label} hint={hint} />
      {trail}
    </button>
  );
}

export function TimeInput({
  value,
  label,
  disabled,
  onChange,
}: {
  value: HHMM;
  label: string;
  disabled?: boolean;
  onChange: (v: HHMM) => void;
}) {
  return (
    <input
      class="input set-time"
      type="time"
      aria-label={label}
      disabled={disabled}
      value={value}
      onChange={(e) => {
        const v = (e.target as HTMLInputElement).value;
        if (/^\d{2}:\d{2}$/.test(v)) onChange(v);
      }}
    />
  );
}

/** A daily window whose From and To are the same time never turns on (see inWindow). */
export const emptyWindow = (w: { enabled: boolean; from: HHMM; to: HHMM }) => w.enabled && w.from === w.to;

/** From / To pickers for a daily window (night mode, sleep). `onChange` gets the one end that changed. */
export function WindowRow({
  from,
  to,
  disabled,
  onChange,
}: {
  from: HHMM;
  to: HHMM;
  disabled?: boolean;
  onChange: (w: { from: HHMM } | { to: HHMM }) => void;
}) {
  return (
    <>
      <div class={`set-row set-window${disabled ? ' off' : ''}`}>
        <label>
          <span>From</span>
          <TimeInput label="From" value={from} disabled={disabled} onChange={(v) => onChange({ from: v })} />
        </label>
        <label>
          <span>To</span>
          <TimeInput label="To" value={to} disabled={disabled} onChange={(v) => onChange({ to: v })} />
        </label>
      </div>
      {emptyWindow({ enabled: !disabled, from, to }) && (
        <p class="set-error set-note" role="alert">
          From and To are the same time, so this never turns on.
        </p>
      )}
    </>
  );
}
