/**
 * MODU-style time picker: clean dropdowns for hours and minutes.
 * Replaces native HTML5 time input for a more polished UX.
 */
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Label } from '@/components/ui/Label';
import { cn } from '@/lib/utils';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];

function parseTime(value: string): { h: string; m: string } {
  if (!value || typeof value !== 'string') return { h: '09', m: '00' };
  const parts = value.trim().split(':');
  const h = (parts[0] ?? '09').padStart(2, '0');
  const m = (parts[1] ?? '00').padStart(2, '0');
  return { h, m: MINUTES.includes(m) ? m : '00' };
}

function formatTime(h: string, m: string): string {
  return `${h}:${m}`;
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
  const { h, m } = parseTime(value);
  const mOption = MINUTES.includes(m) ? m : '00';

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label && (
        <Label htmlFor={id} className="text-foreground">
          {label}
        </Label>
      )}
      <div className="flex gap-2">
        <Select
          value={h}
          onValueChange={(v) => onChange(formatTime(v, mOption))}
          disabled={disabled}
        >
          <SelectTrigger
            id={id}
            className="flex-1 border-primary/30 font-mono text-sm"
          >
            <SelectValue placeholder="שעה" />
          </SelectTrigger>
          <SelectContent>
            {HOURS.map((hr) => (
              <SelectItem key={hr} value={hr}>
                {hr}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="flex items-center text-muted-foreground font-mono">:</span>
        <Select
          value={mOption}
          onValueChange={(v) => onChange(formatTime(h, v))}
          disabled={disabled}
        >
          <SelectTrigger className="flex-1 border-primary/30 font-mono text-sm">
            <SelectValue placeholder="דקות" />
          </SelectTrigger>
          <SelectContent>
            {MINUTES.map((mn) => (
              <SelectItem key={mn} value={mn}>
                {mn}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
