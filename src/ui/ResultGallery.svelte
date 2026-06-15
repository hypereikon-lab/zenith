<script lang="ts">
  import { getSelectedArtifact, selectArtifactResult } from "../artifacts/artifact-store.svelte.js";

  let artifact = $derived(getSelectedArtifact());
</script>

<section class="result-gallery" aria-label="Result gallery">
  <div class="panel-heading compact">
    <p class="eyebrow">Results</p>
    <h2>{artifact.results.length} saved</h2>
  </div>

  {#if artifact.results.length === 0}
    <p class="empty-note">No generated or promoted results for this artifact yet.</p>
  {:else}
    <div class="result-grid">
      {#each artifact.results as result}
        <button
          type="button"
          class="result-card"
          class:selected={Boolean(result.selected)}
          aria-pressed={result.selected ? "true" : "false"}
          aria-label={`Select result ${result.label}`}
          onclick={() => selectArtifactResult(artifact.id, result.id)}
        >
          {#if result.media.kind === "image" && result.media.url}
            <img src={result.media.url} alt={result.media.alt || result.label} />
          {:else if result.media.kind === "video" && result.media.url}
            <video src={result.media.url} muted playsinline aria-label={result.media.alt || result.label}></video>
          {:else}
            <span class="result-placeholder">No preview</span>
          {/if}
          <span>{result.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</section>
