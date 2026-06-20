<script lang="ts">
  import { getArtifactList, selectArtifact, selectStage, workbench, WORKFLOW_STAGES } from "../artifacts/artifact-store.svelte.js";
  import type { ArtifactStatus } from "../artifacts/artifact-types.js";

  let artifacts = $derived(getArtifactList());
  let showAll = $state(false);

  function statusLabel(status: ArtifactStatus, stale: boolean): string {
    if (stale) return "stale";
    return status;
  }

  function getStageSummary(stageId: string) {
    const stageArtifacts = artifacts.filter(a => a.stage === stageId);
    const ready = stageArtifacts.filter(a => a.status === 'ready' || a.status === 'done' || a.status === 'warning').length;
    return `${ready}/${stageArtifacts.length} done`;
  }
</script>

<div class="lineage-header">
  <h3>Pipeline</h3>
  <label class="lineage-toggle">
    <input type="checkbox" bind:checked={showAll} />
    <span>Show all</span>
  </label>
</div>

<nav class="lineage" aria-label="Production artifact lineage">
  {#each WORKFLOW_STAGES as stage}
    {@const isActive = workbench.selectedStageId === stage.id}
    {@const shouldExpand = showAll || isActive}
    {#if shouldExpand}
      <section class="lineage-stage" class:active={isActive} aria-label={stage.label}>
        <div class="lineage-stage-header">
          <div class="lineage-stage-dot">{stage.number}</div>
          <h2>{stage.label}</h2>
        </div>

        <p>{stage.summary}</p>
        <div class="artifact-stack">
          {#each artifacts.filter((artifact) => artifact.stage === stage.id) as artifact}
            <button
              type="button"
              class="artifact-token"
              class:selected={workbench.selectedArtifactId === artifact.id}
              data-status={artifact.status}
              aria-pressed={workbench.selectedArtifactId === artifact.id ? "true" : "false"}
              aria-label={`Select ${artifact.label}. Status ${statusLabel(artifact.status, artifact.stale)}.`}
              onclick={() => selectArtifact(artifact.id)}
            >
              <span>{artifact.label}</span>
              <strong>{statusLabel(artifact.status, artifact.stale)}</strong>
            </button>
          {/each}
        </div>
      </section>
    {:else}
      <button
        type="button"
        class="lineage-stage collapsed"
        aria-label={`Open ${stage.label}`}
        onclick={() => selectStage(stage.id)}
      >
        <div class="lineage-stage-header">
          <div class="lineage-stage-dot">{stage.number}</div>
          <h2>{stage.label}</h2>
          <strong class="stage-badge">{getStageSummary(stage.id)}</strong>
        </div>
      </button>
    {/if}
  {/each}
</nav>
