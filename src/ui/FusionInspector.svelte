<script lang="ts">
  import { rgbdLab } from "../scene/rgbd-scene-store.svelte.js";
</script>

<section class="fusion-inspector" aria-label="RGBD fusion provenance">
  <h4>Fusion Provenance</h4>
  {#if rgbdLab.fusedView}
    <dl class="rgbd-detail-list">
      <div><dt>Fused view</dt><dd>{rgbdLab.fusedView.id}</dd></div>
      <div><dt>Confidence</dt><dd>{Math.round(rgbdLab.fusedView.confidenceMean * 100)}%</dd></div>
      <div><dt>Inserted samples</dt><dd>{rgbdLab.fusedView.insertedSamples}</dd></div>
      <div><dt>Reinforced samples</dt><dd>{rgbdLab.fusedView.reinforcedSamples}</dd></div>
      <div><dt>Skipped samples</dt><dd>{rgbdLab.fusedView.skippedSamples}</dd></div>
      <div><dt>Alignment</dt><dd>{rgbdLab.fusedView.alignmentId}</dd></div>
    </dl>
    <details>
      <summary>Reconstruction prompt</summary>
      <pre>{rgbdLab.fusedView.provenance.reconstructionPrompt}</pre>
    </details>
    <details>
      <summary>Depth prompt</summary>
      <pre>{rgbdLab.fusedView.provenance.depthPrompt}</pre>
    </details>
  {:else}
    <p class="empty-note">No fused view yet. Align a reconstructed proxy depth map, then fuse it into the scene.</p>
  {/if}
</section>
