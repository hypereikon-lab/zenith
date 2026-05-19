import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface PromptFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  rows?: number;
  placeholder?: string;
}

export function PromptField({
  label,
  value,
  onChange,
  disabled,
  className,
  rows = 6,
  placeholder,
}: PromptFieldProps) {
  return (
    <div className={cn("grid gap-2", className)}>
      <Label className="text-[13px] text-[#cfd6d1]">{label}</Label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={rows}
        placeholder={placeholder}
      />
    </div>
  );
}
