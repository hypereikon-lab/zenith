import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
  formatValue?: (value: number) => string;
}

export function SliderField({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  disabled,
  className,
  formatValue,
}: SliderFieldProps) {
  const displayValue = formatValue ? formatValue(value) : value.toFixed(2);

  return (
    <div className={cn("grid grid-cols-[92px_1fr] items-center gap-2.5", className)}>
      <Label className="text-[13px] text-[#cfd6d1]">{label}</Label>
      <div className="flex items-center gap-2">
        <Slider
          value={[value]}
          min={min}
          max={max}
          step={step}
          onValueChange={([v]) => onChange(v)}
          disabled={disabled}
          className="flex-1"
        />
        <span className="min-w-12 text-right text-xs text-muted-foreground tabular-nums">
          {displayValue}
        </span>
      </div>
    </div>
  );
}
