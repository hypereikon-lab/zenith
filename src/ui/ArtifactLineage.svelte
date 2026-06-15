<script lang="ts">
  import { getArtifactList, selectArtifact, workbench, WORKFLOW_STAGES } from "../artifacts/artifact-store.svelte.js";
  import type { ArtifactStatus } from "../artifacts/artifact-types.js";

  let artifacts = $derived(getArtifactList());

  function statusLabel(status: ArtifactStatus, stale: boolean): string {
    if (stale) return "stale";
    return status;
  }
</script>

<nav class="lineage" aria-label="Production artifact lineage">
  {#each WORKFLOW_STAGES as stage}
    <section class="lineage-stage" aria-label={stage.label}>
      <div class="stage-kicker">{stage.number}</div>
      <h2>{stage.label}</h2>
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
  {/each}
</nav>
