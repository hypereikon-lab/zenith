<script lang="ts">
  import { importDepthFile, importPlateSketchFile, importSourceFile } from "../app/workbench-media-commands.js";

  async function handlePlateSketchFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) await importPlateSketchFile(file);
    input.value = "";
  }

  async function handleStartStateFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) await importSourceFile(file);
    input.value = "";
  }

  async function handleStartDepthFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) await importDepthFile("start-depth", file);
    input.value = "";
  }
</script>

<section class="stage-panel" aria-label="Build Start State">
  <p class="eyebrow">Build Start State</p>
  <h2>Start with the Plate Sketch.</h2>
  <p>
    The Plate Sketch is the square fulldome composition handoff for inpaint. Repair/inpaint turns it into the clean
    Start State. Start Depth comes after the repaired Start State exists.
  </p>
  <label class="file-import" for="plate-sketch-import">
    <span>Import Plate Sketch handoff</span>
    <input id="plate-sketch-import" type="file" accept="image/*" onchange={handlePlateSketchFile} />
  </label>
  <label class="file-import" for="start-state-import">
    <span>Import already-clean Start State</span>
    <input id="start-state-import" type="file" accept="image/*,video/*" onchange={handleStartStateFile} />
  </label>
  <label class="file-import" for="start-depth-import">
    <span>Import Start Depth map</span>
    <input id="start-depth-import" type="file" accept="image/*" onchange={handleStartDepthFile} />
  </label>
</section>
