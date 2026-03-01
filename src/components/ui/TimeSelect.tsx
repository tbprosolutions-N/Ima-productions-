/**
 * Time picker with native input type="time" — supports typing and scroll on all devices.
 * Falls back to HH:MM text input for older browsers.
 */
import { Label } from '@/components/ui/Label';
import { cn } from '@/lib/utils';

function toTimeValue(value: string): string {
  if (!value || typeof value !== 'string') return '09:00';
  const parts = value.trim().split(':');
  const h = Math.min(23, Math.max(0, parseInt(parts[0] ?? '9', 10) || 9));
  const m = Math.min(59, Math.max(0, parseInt(parts[1] ?? '0', 10) || 0));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

interface TimeSelectProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}

export function TimeSelect({ id, label, value, onChange, className, disabled }: TimeSelectProps) {
  const timeValue = toTimeValue(value);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label && (
        <Label htmlFor={id} className="text-foreground">
          {label}
        </Label>
      )}
      <input
        id={id}
        type="time"
        value={timeValue}
        onChange={(e) => onChange(e.target.value || '09:00')}
        disabled={disabled}
        className={cn(
          'flex h-[var(--modu-control-height)] w-full rounded-[var(--modu-radius)] border border-input bg-background px-3 py-2 text-sm font-mono text-foreground',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'border-primary/30'
        )}
      />
    </div>
  );
}
