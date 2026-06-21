<script lang="ts">
  import {
    buildRgbdSceneFromWorkbench,
    downloadRgbdSceneManifest,
    fuseCurrentRgbdView,
  } from "../scene/rgbd-scene-commands.js";
  import {
    cancelRgbdPaidAction,
    confirmRgbdPaidAction,
    requestRgbdPaidAction,
  } from "../app/rgbd-lab-commands.js";
  import { artifactIsReady } from "../artifacts/artifact-store.svelte.js";
  import {
    canAlignRgbdDepth,
    canFuseRgbdView,
    canRenderRgbdProxy,
    rgbdLab,
    sceneIsReady,
    setRgbdStep,
  } from "../scene/rgbd-scene-store.svelte.js";
  import CameraPathEditor from "./CameraPathEditor.svelte";
  import ProxyRenderPanel from "./ProxyRenderPanel.svelte";
  import ReconstructionPanel from "./ReconstructionPanel.svelte";
  import DepthAlignmentPanel from "./DepthAlignmentPanel.svelte";
  import FusionInspector from "./FusionInspector.svelte";
  import SceneDiagnostics from "./SceneDiagnostics.svelte";

  const steps = [
    { id: "scene", label: "Scene Map" },
    { id: "path", label: "Camera Path" },
    { id: "proxy", label: "Proxy" },
    { id: "reconstruct", label: "Reconstruct" },
    { id: "depth", label: "Depth" },
    { id: "align", label: "Align" },
    { id: "fuse", label: "Fuse" },
    { id: "render", label: "Render" },
  ] as const;

  let buildDisabledReason = $derived(
    artifactIsReady("start-state") && artifactIsReady("start-depth") ? null : "Needs ready Start State and Start Depth artifacts.",
  );
  let proxyDisabledReason = $derived(canRenderRgbdProxy() ? null : "Needs a seeded RGBD scene and selected camera keyframe.");
  let alignDisabledReason = $derived(canAlignRgbdDepth() ? null : "Needs proxy, reconstruction, and relative depth artifacts.");
  let fuseDisabledReason = $derived(canFuseRgbdView() ? null : "Needs successful depth alignment before fusion.");
</script>

<section class="rgbd-lab" aria-label="RGBD Scene Expansion Lab">
  <header class="rgbd-lab-header">
    <div>
      <p class="eyebrow">RGBD Expansion Lab</p>
      <h2>Path-conditioned scene expansion</h2>
      <p>
        Treat the source map as one projection of an evolving RGBD scene. Render proxy views, reconstruct holes,
        align relative depth, then fuse confident views back into the scene.
      </p>
    </div>
    <div class="rgbd-status-grid" aria-label="RGBD scene status">
      <span>Scene: {rgbdLab.scene?.status || "empty"}</span>
      <span>Fused views: {rgbdLab.scene?.fusedViews.length || 0}</span>
      <span>Confidence: {Math.round((rgbdLab.scene?.confidenceMean || 0) * 100)}%</span>
      <span>Keyframe: {rgbdLab.selectedKeyframeId}</span>
    </div>
  </header>

  <nav class="rgbd-step-nav" aria-label="RGBD expansion steps">
    {#each steps as step}
      <button
        type="button"
        class:selected={rgbdLab.selectedStep === step.id}
        aria-pressed={rgbdLab.selectedStep === step.id ? "true" : "false"}
        onclick={() => setRgbdStep(step.id)}
      >
        {step.label}
      </button>
    {/each}
  </nav>

  <div class="rgbd-lab-grid">
    <section class="rgbd-main-panel" aria-label="RGBD expansion working panel">
      {#if rgbdLab.selectedStep === "scene"}
        <article class="rgbd-panel">
          <h3>Canonical Scene Map</h3>
          <p>Seed the RGBD scene from the current artifact workbench Start State and Start Depth.</p>
          {#if buildDisabledReason}
            <p class="disabled-reason" id="rgbd-build-disabled">{buildDisabledReason}</p>
          {/if}
          <button
            type="button"
            class="operator-action"
            disabled={Boolean(buildDisabledReason)}
            aria-describedby={buildDisabledReason ? "rgbd-build-disabled" : undefined}
            onclick={buildRgbdSceneFromWorkbench}
          >
            Build From Start State + Start Depth
          </button>
          {#if rgbdLab.scene}
            <dl class="rgbd-detail-list">
              <div><dt>Projection</dt><dd>{rgbdLab.scene.projectionProfile}</dd></div>
              <div><dt>Source map</dt><dd>{rgbdLab.scene.sourceMapGeometry.width} x {rgbdLab.scene.sourceMapGeometry.height}</dd></div>
              <div><dt>Inner split</dt><dd>{Math.round(rgbdLab.scene.sourceMapGeometry.innerGuideSplit * 100)}%</dd></div>
              <div><dt>Depth convention</dt><dd>{rgbdLab.scene.depthConvention.polarity}, {rgbdLab.scene.depthConvention.nearMeters}m - {rgbdLab.scene.depthConvention.farMeters}m</dd></div>
            </dl>
          {/if}
        </article>
      {:else if rgbdLab.selectedStep === "path"}
        <CameraPathEditor />
      {:else if rgbdLab.selectedStep === "proxy"}
        <ProxyRenderPanel disabledReason={proxyDisabledReason} />
      {:else if rgbdLab.selectedStep === "reconstruct"}
        <ReconstructionPanel onPaidRequest={() => requestRgbdPaidAction("reconstruct-proxy-view")} />
      {:else if rgbdLab.selectedStep === "depth"}
        <DepthAlignmentPanel mode="depth" onPaidDepthRequest={() => requestRgbdPaidAction("generate-proxy-depth")} />
      {:else if rgbdLab.selectedStep === "align"}
        <DepthAlignmentPanel mode="align" disabledReason={alignDisabledReason} />
      {:else if rgbdLab.selectedStep === "fuse"}
        <article class="rgbd-panel">
          <h3>Confidence-Weighted Fusion</h3>
          <p>Fuse the aligned reconstructed view into the canonical scene. Existing high-confidence geometry wins.</p>
          {#if fuseDisabledReason}
            <p class="disabled-reason" id="rgbd-fuse-disabled">{fuseDisabledReason}</p>
          {/if}
          <button
            type="button"
            class="operator-action"
            disabled={Boolean(fuseDisabledReason)}
            aria-describedby={fuseDisabledReason ? "rgbd-fuse-disabled" : undefined}
            onclick={fuseCurrentRgbdView}
          >
            Fuse View Into Scene
          </button>
          <FusionInspector />
        </article>
      {:else}
        <article class="rgbd-panel">
          <h3>Render Anywhere / Splat Candidate</h3>
          <p>Export the expanded scene manifest for domemaster, CAVE 270, rectangular camera previews, video handoffs, and future splat reconstruction.</p>
          <label class="field-row" for="rgbd-render-target">
            <span>Render target</span>
            <select id="rgbd-render-target" bind:value={rgbdLab.renderTarget}>
              <option value="rectangular">Rectangular camera preview</option>
              <option value="domemaster">Zenith domemaster handoff</option>
              <option value="cave-270">CAVE 270 handoff</option>
              <option value="video-handoff">Video/motion handoff material</option>
            </select>
          </label>
          <button type="button" class="operator-action" onclick={downloadRgbdSceneManifest}>Export Scene Manifest</button>
          <FusionInspector />
        </article>
      {/if}
    </section>

    <aside class="rgbd-side-panel" aria-label="RGBD diagnostics and provenance">
      <SceneDiagnostics />
    </aside>
  </div>

  {#if rgbdLab.jobs.length > 0}
    <section class="job-strip compact-rgbd-jobs" aria-label="RGBD job progress">
      {#each rgbdLab.jobs.slice(0, 3) as job}
        <article>
          <strong>{job.label}</strong>
          <span>{job.stage}</span>
          {#if job.progress !== null}
            <progress max="1" value={job.progress} aria-label={`${job.label} progress`}></progress>
          {/if}
        </article>
      {/each}
    </section>
  {/if}

  {#if rgbdLab.pendingPaidAction}
    <div class="paid-confirm-backdrop" role="presentation">
      <dialog class="paid-confirm" open aria-modal="true" aria-labelledby="rgbd-paid-title">
        <h2 id="rgbd-paid-title">{rgbdLab.pendingPaidAction.label}</h2>
        <p>{rgbdLab.pendingPaidAction.body}</p>
        <p class="disabled-reason">Review the visible prompt in this lab before confirming. Browser smoke tests do not click this.</p>
        <div class="confirm-actions">
          <button type="button" class="secondary-action" onclick={cancelRgbdPaidAction}>Cancel</button>
          <button type="button" class="operator-action" onclick={confirmRgbdPaidAction}>Confirm Paid/API Run</button>
        </div>
      </dialog>
    </div>
  {/if}
</section>
