import { createContext, useContext, useRef, useEffect, type ReactNode } from "react";

// Types for the renderer and controllers
interface RendererActions {
  initialize: () => Promise<void>;
  resize: () => void;
  startFrameLoop: () => void;
  stopFrameLoop: () => void;
  getDevice: () => GPUDevice | null;
  captureFrame: (downloadFn: (blob: Blob, name: string) => void) => void;
  createDomeGeometry: () => void;
}

interface ZenithContextValue {
  // Canvas refs
  viewerRef: React.RefObject<HTMLCanvasElement | null>;
  hudRef: React.RefObject<HTMLCanvasElement | null>;
  videoRef: React.RefObject<HTMLVideoElement | null>;

  // Imperative references to controllers (set after init)
  rendererRef: React.RefObject<RendererActions | null>;

  // Initialization state
  isInitialized: boolean;
  initError: string | null;
}

const ZenithContext = createContext<ZenithContextValue | null>(null);

export function useZenith() {
  const ctx = useContext(ZenithContext);
  if (!ctx) {
    throw new Error("useZenith must be used within a ZenithProvider");
  }
  return ctx;
}

interface ZenithProviderProps {
  children: ReactNode;
}

export function ZenithProvider({ children }: ZenithProviderProps) {
  const viewerRef = useRef<HTMLCanvasElement | null>(null);
  const hudRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rendererRef = useRef<RendererActions | null>(null);

  const value: ZenithContextValue = {
    viewerRef,
    hudRef,
    videoRef,
    rendererRef,
    isInitialized: false,
    initError: null,
  };

  return (
    <ZenithContext.Provider value={value}>
      {children}
    </ZenithContext.Provider>
  );
}

// Hook to access canvas refs
export function useCanvasRefs() {
  const { viewerRef, hudRef, videoRef } = useZenith();
  return { viewerRef, hudRef, videoRef };
}

// Hook to access renderer
export function useRenderer() {
  const { rendererRef } = useZenith();
  return rendererRef.current;
}
