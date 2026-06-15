<script lang="ts">
  import type { LaneDefinition, LaneId } from "./lane-model.js";

  type Props = {
    lanes: LaneDefinition[];
    activeWorkspace: LaneId;
    onSelect: (workspace: LaneId) => void;
  };

  let { lanes, activeWorkspace, onSelect }: Props = $props();
</script>

<nav class="stage-nav" aria-label="Artifact lanes">
  {#each lanes as lane}
    <button
      class="stage-tab"
      class:active={activeWorkspace === lane.id}
      data-workspace-tab={lane.id}
      type="button"
      aria-pressed={activeWorkspace === lane.id ? "true" : "false"}
      onclick={() => onSelect(lane.id)}
    >
      <span>{lane.number}</span>
      {lane.label}
    </button>
  {/each}
</nav>
