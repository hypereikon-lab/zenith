<script lang="ts">
  import { getPipelineContext } from "../app/pipeline-state.svelte.js";

  const pipeline = getPipelineContext();
  let nodes = $derived(pipeline.state.graph.nodes);
</script>

<section class="artifact-board-section" aria-label="Artifact DAG board">
  <div class="section-title">Artifact DAG</div>
  <div class="artifact-board">
    {#each nodes as node}
      <button
        type="button"
        class="artifact-node"
        class:selected={pipeline.state.selectedArtifactId === node.id}
        aria-pressed={pipeline.state.selectedArtifactId === node.id ? "true" : "false"}
        data-state={node.status}
        onclick={() => pipeline.selectArtifact(node.id)}
      >
        <span>{node.label}</span>
        <strong>{node.summary}</strong>
      </button>
    {/each}
  </div>
</section>
