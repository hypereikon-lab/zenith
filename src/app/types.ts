import type {
  NormalizedPlatePlacement,
  PlateCorner,
  PlateCornerOffsets,
} from "../plates/plate-placement.js";
import type { SourceProjectionMode } from "../geometry/source-projection.js";

export type ViewMode = "inside" | "theater" | "orbit" | "flat" | "split" | "cave" | "cutaway";
export type WorkspaceId = "source" | "sketch" | "repair" | "depth" | "motion" | "bridge" | "video" | "deliver" | string;
export type MediaKind = "image" | "video";
export type { SourceProjectionMode };
export type ActiveDomeCamera = "inside" | "theater" | "orbit";
export type PointerMode = "view" | "plate" | null;

export type CameraState = {
  insideYaw: number;
  insidePitch: number;
  theaterYaw: number;
  orbitYaw: number;
  orbitPitch: number;
  orbitDistance: number;
};

export type Point2D = { x: number; y: number };

export type PlateSource = {
  name: string;
  width: number;
  height: number;
  aspect: number;
  canvas: HTMLCanvasElement;
};

export type RunwayOutput = {
  url?: string;
  dataUri?: string;
  contentType?: string;
  name?: string;
  model?: string;
  ratio?: string;
  quality?: string;
  prompt?: string;
  createdAt?: string;
  sourceProjectionMode?: string;
};

export type SeedanceOutput = RunwayOutput & {
  name?: string;
  model?: string;
  duration?: number;
  workflow?: string;
  prompt?: string;
};

export type PlacementDrag =
  | {
      action: "move";
      startClient: Point2D;
      startCenter: Point2D;
      started?: boolean;
    }
  | {
      action: "scale";
      handle: PlateHandleHit;
      startScale: number;
      startLocal: Point2D | null;
    }
  | {
      action: "warp";
      corner: PlateCorner;
      startLocal: Point2D | null;
      startCornerLocal: Point2D;
      startCornerOffsets: PlateCornerOffsets;
    }
  | {
      action: "rotate";
      startSpin: number;
      startAngle: number;
      center: Point2D;
      started?: boolean;
    };

export type PlateHandleHit = {
  action: "move" | "scale" | "rotate";
  corner?: PlateCorner;
};

export type ZenithPointerState = {
  active: boolean;
  mode: PointerMode;
  x: number;
  y: number;
  placementDrag?: PlacementDrag | null;
};

export type ZenithState = {
  viewMode: ViewMode;
  activeWorkspace: WorkspaceId;
  mediaKind: MediaKind;
  sourceUrl: string | null;
  sourceName: string;
  sourceWidth: number;
  sourceHeight: number;
  sourceCanvas: HTMLCanvasElement | null;
  mediaDuration: number;
  mediaFps: number;
  lastFrameMediaTime: number | null;
  pointer: ZenithPointerState;
  camera: CameraState;
  timelineSeeking: boolean;
  pendingVideoUpload: boolean;
  videoFrameCallbackId: number | null;
  panelHidden: boolean;
  fps: number;
  fpsSampleTime: number;
  fpsFrameCount: number;
  plates: PlateSource[];
  platePlacements: NormalizedPlatePlacement[];
  activePlateIndex: number;
  plateCompositeCanvas: HTMLCanvasElement | null;
  plateCompositeDirty: boolean;
  plateCompositeTexture: GPUTexture | null;
  inpaintWhiteCanvas: HTMLCanvasElement | null;
  inpaintMaskCanvas: HTMLCanvasElement | null;
  runwayOutputs: RunwayOutput[];
  activeRunwayOutputIndex: number;
  seedanceOutputs: SeedanceOutput[];
  activeSeedanceOutputIndex: number;
  runwayConfigured: boolean | null;
  depthMapCanvas: HTMLCanvasElement | null;
  depthMapName: string;
  depthMapModel: string;
  depthMapPrompt: string;
  depthMotionPreviewCanvas: HTMLCanvasElement | null;
  depthFinalStateCanvas: HTMLCanvasElement | null;
  depthFinalStateName: string;
  depthFinalStateFingerprint: string;
  depthFinalReconstructedCanvas: HTMLCanvasElement | null;
  depthFinalReconstructedName: string;
  depthFinalReconstructedFingerprint: string;
  depthPreviewActive: boolean;
  depthPreviewWidth: number;
  depthPreviewHeight: number;
  depthPreviewName: string;
  depthPreviewSourceKind: "" | "texture" | "canvas";
};

export type SetGpuState = (message: string, isError?: boolean) => void;
export type ScheduleWorkspaceAutosave = (reason?: string, delay?: number) => void;
