import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
} from "react";
import { Search } from "lucide-react";
type FieldProps = { label: string; error?: string; hint?: string };
function Field({
  id,
  label,
  error,
  hint,
  children,
}: { id: string; children: ReactNode } & FieldProps) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <span id={`${id}-hint`} className="field-error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-hint`} className="muted">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & FieldProps
>(function Input({ label, error, hint, id, ...props }, ref) {
  const generated = useId();
  const key = id || generated;
  return (
    <Field id={key} label={label} error={error} hint={hint}>
      <input
        ref={ref}
        id={key}
        className="control"
        aria-invalid={!!error}
        aria-describedby={error || hint ? `${key}-hint` : undefined}
        {...props}
      />
    </Field>
  );
});
export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & FieldProps
>(function Select({ label, error, id, children, ...props }, ref) {
  const generated = useId();
  const key = id || generated;
  return (
    <Field id={key} label={label} error={error}>
      <select
        ref={ref}
        id={key}
        className="control"
        aria-invalid={!!error}
        aria-describedby={error ? `${key}-hint` : undefined}
        {...props}
      >
        {children}
      </select>
    </Field>
  );
});
export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps
>(function Textarea({ label, error, id, ...props }, ref) {
  const generated = useId();
  const key = id || generated;
  return (
    <Field id={key} label={label} error={error}>
      <textarea
        ref={ref}
        id={key}
        className="control"
        aria-invalid={!!error}
        aria-describedby={error ? `${key}-hint` : undefined}
        {...props}
      />
    </Field>
  );
});
export function Checkbox({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="choice">
      <input type="checkbox" {...props} />
      {label}
    </label>
  );
}
export function Radio({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="choice">
      <input type="radio" {...props} />
      {label}
    </label>
  );
}
export function Toggle({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="choice">
      <input type="checkbox" role="switch" className="toggle" {...props} />
      {label}
    </label>
  );
}
export function SearchInput({
  label = "Search",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className="search-input">
      <Search size={16} aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <input type="search" {...props} />
    </label>
  );
}
export const DatePicker = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & FieldProps
>(function DatePicker(props, ref) {
  return <Input {...props} ref={ref} type="date" />;
});
