import type { ButtonHTMLAttributes, ComponentChildren } from 'preact';

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'danger' | 'ghost' | 'default';
  small?: boolean;
  disabled?: boolean;
};

export function Button({ variant = 'default', small, class: cls, ...rest }: BtnProps) {
  const v = variant === 'default' ? '' : ` btn-${variant}`;
  return <button type="button" class={`btn${v}${small ? ' btn-sm' : ''}${cls ? ` ${cls}` : ''}`} {...rest} />;
}

export function IconButton({ label, class: cls, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" class={`icon-btn${cls ? ` ${cls}` : ''}`} aria-label={label} title={label} {...rest} />;
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      class={`toggle${on ? ' on' : ''}`}
      onClick={() => onChange(!on)}
    />
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div class="seg" role="tablist">
      {options.map((o) => (
        <button
          type="button"
          role="tab"
          aria-selected={o.value === value}
          class={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div class="field">
      <span class="field-label">{label}</span>
      {children}
    </div>
  );
}

/** A labelled settings row with a control on the right. */
export function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ComponentChildren }) {
  return (
    <div class="setting-row">
      <div class="label">
        {label}
        {hint && <small>{hint}</small>}
      </div>
      {children}
    </div>
  );
}

export function Chips<T extends string | number>({
  value,
  options,
  onChange,
  multi,
}: {
  value: T[];
  options: { value: T; label: string }[];
  onChange: (v: T[]) => void;
  multi?: boolean;
}) {
  return (
    <div class="chips">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            type="button"
            class={`chip${on ? ' on' : ''}`}
            aria-pressed={on}
            onClick={() => onChange(multi ? (on ? value.filter((v) => v !== o.value) : [...value, o.value]) : [o.value])}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A number stepper for small integer settings. */
export function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div class="row">
      <button type="button" class="ctl ctl-round" aria-label="Decrease" onClick={() => onChange(Math.max(min, value - 1))}>
        −
      </button>
      <span style={{ minWidth: '3.6rem', textAlign: 'center', fontWeight: 600 }}>{value}</span>
      <button type="button" class="ctl ctl-round" aria-label="Increase" onClick={() => onChange(Math.min(max, value + 1))}>
        +
      </button>
    </div>
  );
}

export function Empty({ emoji, children }: { emoji: string; children: ComponentChildren }) {
  return (
    <div class="empty">
      <span class="big">{emoji}</span>
      <span>{children}</span>
    </div>
  );
}
