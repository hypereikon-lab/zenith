<script lang="ts">
  import { clearMediaPreview, workbench } from "../artifacts/artifact-store.svelte.js";
  import { importPreviewMediaFile, promotePreviewMedia } from "../app/workbench-commands.js";
  import SourceMapMediaViewer from "./SourceMapMediaViewer.svelte";
  import type { ArtifactSlotId } from "../artifacts/artifact-types.js";

  const promotionTargets: { id: ArtifactSlotId; label: string; accepts: "image" | "video" | "any" }[] = [
    { id: "plate-sketch", label: "Use as Plate Sketch", accepts: "image" },
    { id: "start-state", label: "Use as Start State", accepts: "any" },
    { id: "displaced-endpoint", label: "Use as Displaced Endpoint", accepts: "image" },
    { id: "end-state", label: "Use as End State", accepts: "image" },
    { id: "start-depth", label: "Use as Start Depth", accepts: "image" },
    { id: "end-depth", label: "Use as End Depth", accepts: "image" },
    { id: "motion-draft", label: "Use as Motion Draft", accepts: "video" },
    { id: "video-take", label: "Use as Video Take", accepts: "video" },
  ];

  let media = $derived(workbench.mediaPreview.media);
  let hasMedia = $derived(media.kind === "image" || media.kind === "video");

  async function handleFileInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) await importPreviewMediaFile(file);
    input.value = "";
  }

  function disabledReason(accepts: "image" | "video" | "any"): string | null {
    if (!hasMedia) return "Import or drop media before promoting.";
    if (accepts !== "any" && media.kind !== accepts) return `This target expects ${accepts} media.`;
    return null;
  }
</script>

<section class="media-preview-panel" aria-label="Media Preview geometry inspector">
  <div class="media-preview-header">
    <div>
      <p class="eyebrow">Media Preview</p>
      <h2>Inspect outside generations before they enter the artifact graph.</h2>
      <p>{workbench.mediaPreview.summary}</p>
    </div>
    <div class="media-preview-actions">
      <label class="file-import compact" for="media-preview-file">
        <span>Import preview media</span>
        <input id="media-preview-file" type="file" accept="image/*,video/*" onchange={handleFileInput} />
      </label>
      <button type="button" class="secondary-action" disabled={!hasMedia} title={!hasMedia ? "No preview media is loaded." : "Clear Media Preview."} onclick={clearMediaPreview}>
        Clear Preview
      </button>
    </div>
  </div>

  {#if hasMedia}
    <SourceMapMediaViewer {media} label="Media Preview" />
  {:else}
    <div class="media-preview-empty" role="img" aria-label="No Media Preview image loaded">
      Drop an image here to map it through Source Map, Dome Orbit, Dome POV, or CAVE Room.
    </div>
  {/if}

  <div class="promotion-panel" aria-label="Promote Media Preview into production artifact slots">
    <strong>Promote when it works</strong>
    <div class="promotion-grid">
      {#each promotionTargets as target}
        {@const reason = disabledReason(target.accepts)}
        <button
          type="button"
          class="secondary-action"
          disabled={Boolean(reason)}
          title={reason || `Promote preview media to ${target.label.replace("Use as ", "")}.`}
          onclick={() => promotePreviewMedia(target.id)}
        >
          {target.label}
        </button>
      {/each}
    </div>
    {#if !hasMedia}
      <p class="control-help">Drop media or use Import preview media before promoting.</p>
    {:else if media.kind === "image"}
      <p class="control-help">Image promotion is local and does not trigger paid APIs.</p>
    {:else}
      <p class="control-help">Video promotion is local. MP4 frames are mapped through the selected projection geometry in WebGPU.</p>
    {/if}
  </div>
</section>
