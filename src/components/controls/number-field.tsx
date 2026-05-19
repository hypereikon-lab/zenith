import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface NumberFieldProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
}

export function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled,
  className,
}: NumberFieldProps) {
  return (
    <div className={cn("grid grid-cols-[92px_1fr] items-center gap-2.5", className)}>
      <Label className="text-[13px] text-[#cfd6d1]">{label}</Label>
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
      />
    </div>
  );
}
