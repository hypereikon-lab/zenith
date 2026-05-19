import { useState } from "react";
import { SkipBack, Play, Pause, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface TransportBarProps {
  className?: string;
}

export function TransportBar({ className }: TransportBarProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState("1");
  const isVideoLoaded = duration > 0;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
  };

  return (
    <section
      className={cn(
        "fixed right-4 bottom-4 left-[450px] z-[4]",
        "grid grid-cols-[58px_68px_58px_minmax(180px,1fr)_82px_164px] items-center gap-2",
        "p-2.5 rounded-lg border border-border bg-card shadow-lg backdrop-blur-[22px] saturate-[1.18]",
        "max-md:left-2.5 max-md:right-2.5 max-md:grid-cols-[58px_58px_58px_1fr]",
        className
      )}
      aria-label="Video transport"
    >
      {/* Step back */}
      <Button
        variant="outline"
        size="sm"
        disabled={!isVideoLoaded}
        onClick={() => console.log("[v0] Step back")}
        className="h-9"
      >
        <SkipBack className="size-4" />
        <span className="sr-only">Previous frame</span>
      </Button>

      {/* Play/Pause */}
      <Button
        variant="outline"
        size="sm"
        disabled={!isVideoLoaded}
        onClick={() => setIsPlaying(!isPlaying)}
        className="h-9"
      >
        {isPlaying ? (
          <Pause className="size-4" />
        ) : (
          <Play className="size-4" />
        )}
        <span className="sr-only">{isPlaying ? "Pause" : "Play"}</span>
      </Button>

      {/* Step forward */}
      <Button
        variant="outline"
        size="sm"
        disabled={!isVideoLoaded}
        onClick={() => console.log("[v0] Step forward")}
        className="h-9"
      >
        <SkipForward className="size-4" />
        <span className="sr-only">Next frame</span>
      </Button>

      {/* Timeline slider */}
      <Slider
        value={[currentTime]}
        min={0}
        max={duration || 1}
        step={0.001}
        onValueChange={([v]) => setCurrentTime(v)}
        disabled={!isVideoLoaded}
        className="mx-2"
      />

      {/* Playback rate */}
      <Select
        value={playbackRate}
        onValueChange={setPlaybackRate}
        disabled={!isVideoLoaded}
      >
        <SelectTrigger className="h-9 max-md:col-span-2">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="0.25">0.25x</SelectItem>
          <SelectItem value="0.5">0.5x</SelectItem>
          <SelectItem value="1">1x</SelectItem>
          <SelectItem value="2">2x</SelectItem>
          <SelectItem value="4">4x</SelectItem>
        </SelectContent>
      </Select>

      {/* Time readout */}
      <output className="text-xs text-[#dce2dc] tabular-nums text-right max-md:col-span-2 max-md:overflow-hidden max-md:text-ellipsis max-md:whitespace-nowrap">
        {formatTime(currentTime)} / {formatTime(duration)}
      </output>
    </section>
  );
}
