import { type ChangeEvent, type ReactNode } from 'react';
import { classes } from '../classes';

// The StarAdmin check box: a transparent input over the template's drawn .input-helper box.
export default function CheckBox({
  checked,
  label,
  onChange,
  children,
  className,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  children?: ReactNode;
  // A caller's class lands on this root, as Vue does for a single-root component.
  className?: string;
}) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target as HTMLInputElement;
    onChange(input.checked);
    // Stay controlled by the parent state, even when it does not change.
    input.checked = checked;
  }

  return (
    <div className={classes('form-check', className)}>
      <label className="form-check-label">
        <input type="checkbox" className="form-check-input" checked={checked} aria-label={label} onChange={handleChange} /><i aria-hidden="true" className="input-helper" />{children}
      </label>
    </div>
  );
}
