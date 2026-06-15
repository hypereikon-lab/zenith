<script lang="ts">
  import { getReadyQcCount, workbench } from "../artifacts/artifact-store.svelte.js";

  let readyCount = $derived(getReadyQcCount());
</script>

<section class="qc-panel" aria-label="Fulldome quality-control checklist">
  <div class="panel-heading compact">
    <p class="eyebrow">QC</p>
    <h2>{readyCount} / {workbench.qcItems.length} checked</h2>
  </div>
  <div class="qc-list">
    {#each workbench.qcItems as item}
      <label class="qc-item" for={`qc-${item.id}`}>
        <input id={`qc-${item.id}`} type="checkbox" bind:checked={item.checked} />
        <span>
          <strong>{item.label}</strong>
          <small>{item.description}</small>
        </span>
      </label>
    {/each}
  </div>
</section>
