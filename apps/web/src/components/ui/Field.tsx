import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string) => ReactNode;
}

/**
 * One layout for every form control, so a label always sits in the same place
 * and an error always looks the same. Consistency is what makes a form
 * learnable for someone who is not used to software.
 */
function FieldShell({ label, hint, error, children }: FieldShellProps) {
  const id = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink-700">
        {label}
      </label>
      {children(id)}
      {hint && !error && <p className="text-sm text-ink-500">{hint}</p>}
      {error && (
        <p role="alert" className="text-sm font-medium text-danger-600">
          {error}
        </p>
      )}
    </div>
  );
}

const CONTROL =
  'min-h-12 w-full rounded-xl border bg-surface px-4 text-base text-ink-900 ' +
  'placeholder:text-ink-300 transition-colors';

const controlClass = (error?: string) =>
  `${CONTROL} ${error ? 'border-danger-600' : 'border-line focus:border-brand-500'}`;

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: string;
  error?: string;
}

export function TextField({ label, hint, error, className = '', ...rest }: TextFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {(id) => <input {...rest} id={id} className={`${controlClass(error)} ${className}`} />}
    </FieldShell>
  );
}

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export function SelectField({ label, hint, error, children, className = '', ...rest }: SelectFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {(id) => (
        <select {...rest} id={id} className={`${controlClass(error)} ${className}`}>
          {children}
        </select>
      )}
    </FieldShell>
  );
}

interface TextAreaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string;
  hint?: string;
  error?: string;
}

export function TextAreaField({ label, hint, error, className = '', ...rest }: TextAreaFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {(id) => (
        <textarea
          {...rest}
          id={id}
          className={`${controlClass(error)} min-h-32 resize-y py-3 leading-relaxed ${className}`}
        />
      )}
    </FieldShell>
  );
}

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> {
  label: string;
  hint?: string;
}

export function Checkbox({ label, hint, ...rest }: CheckboxProps) {
  const id = useId();

  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4">
      <input
        {...rest}
        id={id}
        type="checkbox"
        className="mt-0.5 size-5 shrink-0 accent-brand-500"
      />
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="text-base font-medium text-ink-900">
          {label}
        </label>
        {hint && <p className="text-sm text-ink-500">{hint}</p>}
      </div>
    </div>
  );
}
