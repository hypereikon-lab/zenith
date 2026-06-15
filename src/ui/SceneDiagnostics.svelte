<script lang="ts">
  import { rgbdLab } from "../scene/rgbd-scene-store.svelte.js";
</script>

<section class="scene-diagnostics" aria-label="RGBD scene diagnostics">
  <div class="panel-heading">
    <p class="eyebrow">Diagnostics</p>
    <h3>Scene state</h3>
  </div>

  <dl class="rgbd-detail-list">
    <div><dt>Scene</dt><dd>{rgbdLab.scene?.status || "empty"}</dd></div>
    <div><dt>Projection</dt><dd>{rgbdLab.scene?.projectionProfile || "not seeded"}</dd></div>
    <div><dt>Proxy</dt><dd>{rgbdLab.proxy?.status || "missing"}</dd></div>
    <div><dt>Reconstruction</dt><dd>{rgbdLab.reconstruction?.status || "missing"}</dd></div>
    <div><dt>Depth</dt><dd>{rgbdLab.depth?.status || "missing"}</dd></div>
    <div><dt>Alignment</dt><dd>{rgbdLab.alignment?.status || "not-run"}</dd></div>
    <div><dt>Feature anchors</dt><dd>{rgbdLab.featureReport?.status || "not-run"}</dd></div>
  </dl>

  {#if rgbdLab.scene?.warnings.length}
    <div class="diagnostic-warnings">
      <h4>Scene warnings</h4>
      {#each rgbdLab.scene.warnings as warning}
        <p>{warning}</p>
      {/each}
    </div>
  {/if}

  <div class="diagnostic-warnings">
    <h4>Lab notes</h4>
    {#each rgbdLab.notes as note}
      <p>{note}</p>
    {/each}
  </div>

  {#if rgbdLab.errors.length}
    <div class="diagnostic-warnings error-notes">
      <h4>Errors</h4>
      {#each rgbdLab.errors as error}
        <p>{error.message}</p>
      {/each}
    </div>
  {/if}
</section>
