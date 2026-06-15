<script lang="ts">
  import {
    getArtifact,
    getSelectedArtifact,
    getSelectedStage,
    selectSurfaceMode,
    selectStage,
    setDropActive,
    workbench,
    WORKFLOW_STAGES,
  } from "../artifacts/artifact-store.svelte.js";
  import {
    changeProjectionProfile,
    executeOperator,
    importPreviewMediaFile,
    importProjectSnapshotFile,
  } from "../app/workbench-commands.js";
  import {
    SOURCE_PROJECTION_MODES,
    sourceProjectionLabel,
    sourceProjectionSummary,
  } from "../geometry/source-projection.js";
  import ArtifactInspector from "./ArtifactInspector.svelte";
  import ArtifactLineage from "./ArtifactLineage.svelte";
  import OperatorPanel from "./OperatorPanel.svelte";
  import PaidActionConfirm from "./PaidActionConfirm.svelte";
  import MediaPreviewPanel from "./MediaPreviewPanel.svelte";
  import PlateSketchEditor from "./PlateSketchEditor.svelte";
  import QcChecklist from "./QcChecklist.svelte";
  import ResultGallery from "./ResultGallery.svelte";
  import RgbdExpansionLab from "./RgbdExpansionLab.svelte";
  import SourceMapMediaViewer from "./SourceMapMediaViewer.svelte";
  import DeliverablesStage from "../stages/DeliverablesStage.svelte";
  import EndStateStage from "../stages/EndStateStage.svelte";
  import MotionDraftStage from "../stages/MotionDraftStage.svelte";
  import StartStateStage from "../stages/StartStateStage.svelte";
  import VideoTakeStage from "../stages/VideoTakeStage.svelte";
  import type { ArtifactSlotId } from "../artifacts/artifact-types.js";

  let stage = $derived(getSelectedStage());
  let artifact = $derived(getSelectedArtifact());
  let projection = $derived(sourceProjectionSummary(workbench.projectionProfile, workbench.domeGuideSemanticSplit));

  function handleDragEnter(event: DragEvent) {
    event.preventDefault();
    setDropActive(true, workbench.drop.depth + 1);
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
  }

  function handleDragLeave() {
    setDropActive(workbench.drop.depth > 1, Math.max(0, workbench.drop.depth - 1));
  }

  async function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDropActive(false, 0);
    const file = event.dataTransfer?.files?.[0];
    if (file) await importPreviewMediaFile(file);
  }

  async function handleProjectImport(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) await importProjectSnapshotFile(file);
    input.value = "";
  }

  function roleLabel(id: ArtifactSlotId): string {
    if (id === "plate-sketch") return "Plate Sketch / Inpaint Handoff";
    if (id === "start-state") return "Image 1 / Start State";
    if (id === "end-state") return "Image 2 / Reconstructed End State";
    if (id === "motion-draft") return "Video 1 / Motion Draft";
    if (id === "displaced-endpoint") return "Displaced Endpoint";
    return getArtifact(id).label;
  }

  function handleProjectionChange() {
    changeProjectionProfile(workbench.projectionProfile);
  }
</script>

<svelte:window
  ondragenter={handleDragEnter}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
/>

<main class="workbench-shell">
  <header class="workbench-header">
    <div class="workbench-title">
      <p class="eyebrow">Zenith</p>
      <h1>Artifact workbench</h1>
      <p>{artifact.label} · {artifact.stale ? "stale" : artifact.status} · {projection.label}</p>
    </div>
    <div class="workbench-actions" aria-label="Workbench view and persistence controls">
      <label class="header-field" for="workbench-projection-profile">
        <span>Projection profile</span>
        <select id="workbench-projection-profile" bind:value={workbench.projectionProfile} onchange={handleProjectionChange}>
          {#each SOURCE_PROJECTION_MODES as mode}
            <option value={mode}>{sourceProjectionLabel(mode)}</option>
          {/each}
        </select>
      </label>
      <div class="viewer-mode-group" aria-label="Fulldome viewer mode">
        <button
          type="button"
          class:selected={workbench.viewerMode === "domemaster"}
          aria-pressed={workbench.viewerMode === "domemaster" ? "true" : "false"}
          onclick={() => (workbench.viewerMode = "domemaster")}
        >
          Domemaster
        </button>
        <button
          type="button"
          class:selected={workbench.viewerMode === "dome-check"}
          aria-pressed={workbench.viewerMode === "dome-check" ? "true" : "false"}
          onclick={() => (workbench.viewerMode = "dome-check")}
        >
          Dome Check
        </button>
        <button
          type="button"
          class:selected={workbench.viewerMode === "rim-check"}
          aria-pressed={workbench.viewerMode === "rim-check" ? "true" : "false"}
          onclick={() => (workbench.viewerMode = "rim-check")}
        >
          Rim Check
        </button>
      </div>
      <div class="surface-mode-group" aria-label="Workbench surface mode">
        <button
          type="button"
          class:selected={workbench.surfaceMode === "artifact"}
          aria-pressed={workbench.surfaceMode === "artifact" ? "true" : "false"}
          onclick={() => selectSurfaceMode("artifact")}
        >
          Artifact Workbench
        </button>
        <button
          type="button"
          class:selected={workbench.surfaceMode === "media-preview"}
          aria-pressed={workbench.surfaceMode === "media-preview" ? "true" : "false"}
          onclick={() => selectSurfaceMode("media-preview")}
        >
          Media Preview
        </button>
        <button
          type="button"
          class:selected={workbench.surfaceMode === "rgbd-lab"}
          aria-pressed={workbench.surfaceMode === "rgbd-lab" ? "true" : "false"}
          onclick={() => selectSurfaceMode("rgbd-lab")}
        >
          RGBD Expansion Lab
        </button>
      </div>
      <button type="button" class="secondary-action compact-action" onclick={() => executeOperator("save-project")}>
        Save Project
      </button>
      <label class="project-import" for="project-import-file">
        <span>Load Project</span>
        <input id="project-import-file" type="file" accept="application/json,.json" onchange={handleProjectImport} />
      </label>
    </div>
  </header>

  <nav class="stage-nav" aria-label="Workflow stages">
    {#each WORKFLOW_STAGES as workflowStage}
      <button
        type="button"
        class:selected={stage.id === workflowStage.id}
        aria-pressed={stage.id === workflowStage.id ? "true" : "false"}
        aria-label={`Open ${workflowStage.label}`}
        onclick={() => selectStage(workflowStage.id)}
      >
        <span>{workflowStage.number}</span>
        <strong>{workflowStage.label}</strong>
      </button>
    {/each}
  </nav>

  <div class="workbench-grid" class:rgbd-lab-active={workbench.surfaceMode === "rgbd-lab"}>
    {#if workbench.surfaceMode !== "rgbd-lab"}
      <aside class="left-rail" aria-label="Artifact lineage and stage context">
        <ArtifactLineage />
      </aside>
    {/if}

    <section class="viewer-zone" class:rgbd-wide-zone={workbench.surfaceMode === "rgbd-lab"} aria-label="Central fulldome artifact viewer">
      {#if workbench.surfaceMode === "rgbd-lab"}
        <RgbdExpansionLab />
      {:else if workbench.surfaceMode === "media-preview"}
        <MediaPreviewPanel />
      {:else if artifact.id === "plate-sketch"}
        <PlateSketchEditor />
      {:else if stage.id === "end"}
        <div class="triptych" aria-label="Start State, Displaced Endpoint, Reconstructed End State comparison">
          {#each ["start-state", "displaced-endpoint", "end-state"] as id}
            {@const triptychArtifact = getArtifact(id as ArtifactSlotId)}
            <figure>
              <figcaption>{roleLabel(id as ArtifactSlotId)}</figcaption>
              {#if triptychArtifact.media.kind === "video" && triptychArtifact.media.url}
                <video
                  class="dome-media"
                  class:dome-check={workbench.viewerMode === "dome-check"}
                  class:rim-check={workbench.viewerMode === "rim-check"}
                  src={triptychArtifact.media.url}
                  controls
                  muted
                  loop
                  playsinline
                  aria-label={triptychArtifact.media.alt || triptychArtifact.label}
                ></video>
              {:else if triptychArtifact.media.url}
                <img
                  class="dome-media"
                  class:dome-check={workbench.viewerMode === "dome-check"}
                  class:rim-check={workbench.viewerMode === "rim-check"}
                  src={triptychArtifact.media.url}
                  alt={triptychArtifact.media.alt || triptychArtifact.label}
                />
              {:else}
                <div class="empty-specimen" role="img" aria-label={`No preview available for ${triptychArtifact.label}`}>
                  No preview available
                </div>
              {/if}
            </figure>
          {/each}
        </div>
      {:else}
        <figure class="specimen">
          <figcaption>
            <span>{roleLabel(artifact.id)}</span>
            <strong>{artifact.media.name || artifact.label}</strong>
          </figcaption>
          {#if (artifact.media.kind === "image" || artifact.media.kind === "video") && artifact.media.url}
            <SourceMapMediaViewer media={artifact.media} label={artifact.label} />
          {:else}
            <div class="empty-specimen" role="img" aria-label="No preview available for selected artifact">
              No preview available
            </div>
          {/if}
        </figure>
      {/if}

      <div class="stage-context">
        {#if stage.id === "start"}
          <StartStateStage />
        {:else if stage.id === "motion"}
          <MotionDraftStage />
        {:else if stage.id === "end"}
          <EndStateStage />
        {:else if stage.id === "video"}
          <VideoTakeStage />
        {:else}
          <DeliverablesStage />
        {/if}
      </div>
    </section>

    {#if workbench.surfaceMode !== "rgbd-lab"}
      <aside class="right-rail" aria-label="Operators, provenance, and QC">
        <OperatorPanel />
        <ArtifactInspector />
        <ResultGallery />
        {#if stage.id === "deliver"}
          <QcChecklist />
        {/if}
      </aside>
    {/if}
  </div>

  {#if workbench.jobs.length > 0}
    <section class="job-strip" aria-label="Job progress">
      {#each workbench.jobs.slice(0, 3) as job}
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

  {#if workbench.errors.length > 0}
    <section class="error-strip" aria-label="Recent errors">
      {#each workbench.errors as error}
        <p>{error.message}</p>
      {/each}
    </section>
  {/if}

  {#if workbench.drop.active}
    <div class="drop-overlay">
      <span>Drop media to open Media Preview</span>
      <small>Promote it into Plate Sketch, Start State, End State, or video only when it works.</small>
    </div>
  {/if}

  <PaidActionConfirm />
</main>
