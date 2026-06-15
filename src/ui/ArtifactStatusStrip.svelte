<script lang="ts">
  import type { ArtifactStatusNode } from "./lane-model.js";
  import type { ArtifactNodeId } from "../artifacts/artifact-graph.js";

  type Props = {
    artifacts: ArtifactStatusNode[];
    selectedArtifactId: ArtifactNodeId | null;
    onSelect: (id: ArtifactNodeId) => void;
  };

  let { artifacts, selectedArtifactId, onSelect }: Props = $props();
</script>

<ol class="workflow-status" aria-label="Artifact dependency status">
  {#each artifacts as artifact}
    <li
      data-flow-step={artifact.lane}
      data-state={artifact.status}
      data-selected={selectedArtifactId === artifact.artifactId ? "true" : "false"}
    >
      <button type="button" class="artifact-status-button" onclick={() => onSelect(artifact.artifactId)}>
        <span>{artifact.label}</span>
        <strong id={artifact.readoutId}>{artifact.summary}</strong>
      </button>
    </li>
  {/each}
</ol>
