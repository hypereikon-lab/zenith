<script lang="ts">
  import { getArtifact, getSelectedArtifact } from "../artifacts/artifact-store.svelte.js";

  let artifact = $derived(getSelectedArtifact());
  let inputLabels = $derived(
    artifact.inputs.length
      ? artifact.inputs.map((id) => getArtifact(id).label).join(", ")
      : "None",
  );
</script>

<section class="artifact-inspector" aria-label="Selected artifact provenance">
  <div class="panel-heading compact">
    <p class="eyebrow">Inspector</p>
    <h2>{artifact.label}</h2>
  </div>

  <dl class="inspector-grid">
    <div>
      <dt>Status</dt>
      <dd>{artifact.stale ? "stale" : artifact.status}</dd>
    </div>
    <div>
      <dt>Inputs</dt>
      <dd>{inputLabels}</dd>
    </div>
    <div>
      <dt>Operator</dt>
      <dd>{artifact.operatorId || "Initial artifact"}</dd>
    </div>
    <div>
      <dt>Projection</dt>
      <dd>{artifact.projectionProfile}</dd>
    </div>
    <div>
      <dt>Media</dt>
      <dd>{artifact.media.kind === "none" ? "No media" : artifact.media.name || artifact.media.kind}</dd>
    </div>
    <div>
      <dt>Updated</dt>
      <dd>{artifact.updatedAt ? new Date(artifact.updatedAt).toLocaleString() : "Unknown"}</dd>
    </div>
  </dl>

  {#if artifact.warnings.length > 0}
    <div class="warning-list" aria-label="Artifact warnings">
      {#each artifact.warnings as warning}
        <p>{warning}</p>
      {/each}
    </div>
  {/if}
</section>
