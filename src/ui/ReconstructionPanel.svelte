<script lang="ts">
  import { importRgbdReconstructionFile } from "../scene/rgbd-scene-commands.js";
  import { rgbdLab } from "../scene/rgbd-scene-store.svelte.js";

  let { onPaidRequest }: { onPaidRequest: () => void } = $props();

  async function handleReconstructionImport(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) await importRgbdReconstructionFile(file);
    input.value = "";
  }

  let disabledReason = $derived(rgbdLab.proxy ? null : "Render an RGBD proxy before reconstruction.");
</script>

<article class="rgbd-panel">
  <div class="panel-heading">
    <p class="eyebrow">GPT-image-2 Reconstruction</p>
    <h3>Fill only newly revealed regions</h3>
    <p>The proxy view and masks define structure. The model should preserve known pixels and reconstruct holes/new content.</p>
  </div>

  <label class="prompt-editor" for="rgbd-reconstruction-prompt">
    <span>Reconstruction prompt sent to GPT-image-2</span>
    <textarea id="rgbd-reconstruction-prompt" rows="9" bind:value={rgbdLab.promptDrafts.reconstruct}></textarea>
  </label>

  {#if disabledReason}
    <p class="disabled-reason" id="rgbd-reconstruct-disabled">{disabledReason}</p>
  {/if}

  <div class="inline-actions">
    <button
      type="button"
      class="operator-action"
      disabled={Boolean(disabledReason)}
      aria-describedby={disabledReason ? "rgbd-reconstruct-disabled" : undefined}
      onclick={onPaidRequest}
    >
      Review + Run GPT-image-2 Reconstruction
    </button>
    <label class="file-import compact" for="rgbd-reconstruction-import">
      <span>Import Manual Reconstruction</span>
      <input
        id="rgbd-reconstruction-import"
        type="file"
        accept="image/*"
        disabled={Boolean(disabledReason)}
        aria-describedby={disabledReason ? "rgbd-reconstruct-disabled" : undefined}
        onchange={handleReconstructionImport}
      />
    </label>
  </div>

  {#if rgbdLab.reconstruction?.media.url}
    <figure class="rgbd-single-preview">
      <figcaption>{rgbdLab.reconstruction.label} ({rgbdLab.reconstruction.model})</figcaption>
      <img src={rgbdLab.reconstruction.media.url} alt={rgbdLab.reconstruction.media.alt || "Reconstructed RGBD proxy view"} />
    </figure>
  {/if}
</article>
