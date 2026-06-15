<script lang="ts">
  import { importDepthFile } from "../app/workbench-commands.js";

  async function handleEndDepthFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) await importDepthFile("end-depth", file);
    input.value = "";
  }
</script>

<section class="stage-panel" aria-label="Build End State">
  <p class="eyebrow">Build End State</p>
  <h2>Reconstruct the endpoint, do not copy the source.</h2>
  <p>
    The displaced endpoint defines structure. The Start State defines style, material, lighting, and identity. The
    reconstructed End State becomes Image 2 for video generation.
  </p>
  <label class="file-import" for="end-depth-import">
    <span>Import End Depth map</span>
    <input id="end-depth-import" type="file" accept="image/*" onchange={handleEndDepthFile} />
  </label>
</section>
