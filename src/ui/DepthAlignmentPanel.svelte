<script lang="ts">
  import {
    alignCurrentRgbdDepth,
    downloadRgbdCanvas,
    importRgbdDepthFile,
    importRgbdFeatureReportFile,
    markFeatureAnchorsUnavailable,
  } from "../scene/rgbd-scene-commands.js";
  import { rgbdLab } from "../scene/rgbd-scene-store.svelte.js";

  let {
    mode,
    disabledReason = null,
    onPaidDepthRequest = undefined,
  }: {
    mode: "depth" | "align";
    disabledReason?: string | null;
    onPaidDepthRequest?: () => void;
  } = $props();

  async function handleDepthImport(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) await importRgbdDepthFile(file);
    input.value = "";
  }

  async function handleFeatureImport(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) await importRgbdFeatureReportFile(file);
    input.value = "";
  }

  let depthDisabledReason = $derived(rgbdLab.reconstruction ? null : "Import or generate a reconstructed proxy view before depth.");
</script>

{#if mode === "depth"}
  <article class="rgbd-panel">
    <div class="panel-heading">
      <p class="eyebrow">Gemini Depth Prior</p>
      <h3>Generate or import relative depth</h3>
      <p>Gemini depth is treated as a dense relative prior. Alignment turns it into coherent scene geometry.</p>
    </div>

    <label class="prompt-editor" for="rgbd-depth-prompt">
      <span>Depth prompt sent to Gemini</span>
      <textarea id="rgbd-depth-prompt" rows="7" bind:value={rgbdLab.promptDrafts.depth}></textarea>
    </label>

    {#if depthDisabledReason}
      <p class="disabled-reason" id="rgbd-depth-disabled">{depthDisabledReason}</p>
    {/if}

    <div class="inline-actions">
      <button
        type="button"
        class="operator-action"
        disabled={Boolean(depthDisabledReason)}
        aria-describedby={depthDisabledReason ? "rgbd-depth-disabled" : undefined}
        onclick={() => onPaidDepthRequest?.()}
      >
        Review + Run Gemini Depth
      </button>
      <label class="file-import compact" for="rgbd-depth-import">
        <span>Import Manual Depth</span>
        <input
          id="rgbd-depth-import"
          type="file"
          accept="image/*"
          disabled={Boolean(depthDisabledReason)}
          aria-describedby={depthDisabledReason ? "rgbd-depth-disabled" : undefined}
          onchange={handleDepthImport}
        />
      </label>
    </div>

    {#if rgbdLab.depth?.media.url}
      <figure class="rgbd-single-preview">
        <figcaption>{rgbdLab.depth.label}</figcaption>
        <img src={rgbdLab.depth.media.url} alt={rgbdLab.depth.media.alt || "Proxy relative depth"} />
      </figure>
    {/if}
  </article>
{:else}
  <article class="rgbd-panel">
    <div class="panel-heading">
      <p class="eyebrow">Alignment + Drift</p>
      <h3>Normalize depth against overlap</h3>
      <p>Fits generated inverse-depth to existing proxy inverse-depth, rejecting disocclusion, low confidence, and bad reprojection samples.</p>
    </div>

    {#if disabledReason}
      <p class="disabled-reason" id="rgbd-align-disabled">{disabledReason}</p>
    {/if}
    <button
      type="button"
      class="operator-action"
      disabled={Boolean(disabledReason)}
      aria-describedby={disabledReason ? "rgbd-align-disabled" : undefined}
      onclick={alignCurrentRgbdDepth}
    >
      Align Relative Depth
    </button>

    <div class="feature-anchor-box">
      <h4>Feature Anchoring / Drift Detection</h4>
      <p>DINOv3/VGGT/DUSt3R/MASt3R matching is an external adapter path here. Import a report when available; no fake matches are generated.</p>
      <div class="inline-actions">
        <label class="file-import compact" for="rgbd-feature-report-import">
          <span>Import Feature Report JSON</span>
          <input id="rgbd-feature-report-import" type="file" accept="application/json,.json" onchange={handleFeatureImport} />
        </label>
        <button type="button" class="secondary-action compact-action" onclick={markFeatureAnchorsUnavailable}>
          Mark External Runtime Missing
        </button>
      </div>
    </div>

    {#if rgbdLab.alignment}
      <dl class="rgbd-detail-list">
        <div><dt>Status</dt><dd>{rgbdLab.alignment.status}</dd></div>
        <div><dt>Fit</dt><dd>alignedInvDepth = {rgbdLab.alignment.scale.toFixed(4)} x generatedInvDepth + {rgbdLab.alignment.offset.toFixed(4)}</dd></div>
        <div><dt>Samples used</dt><dd>{rgbdLab.alignment.samplesUsed}</dd></div>
        <div><dt>Rejected</dt><dd>{rgbdLab.alignment.rejectedSamples}</dd></div>
        <div><dt>RMSE</dt><dd>{Number.isFinite(rgbdLab.alignment.rmse) ? rgbdLab.alignment.rmse.toFixed(4) : "n/a"}</dd></div>
      </dl>
      {#each rgbdLab.alignment.warnings as warning}
        <p class="disabled-reason">{warning}</p>
      {/each}
      <button
        type="button"
        class="secondary-action compact-action"
        onclick={() => downloadRgbdCanvas("alignedDepthCanvas", `zenith-rgbd-aligned-depth-${Date.now()}.png`)}
      >
        Download Aligned Depth PNG
      </button>
    {/if}

    {#if rgbdLab.featureReport}
      <dl class="rgbd-detail-list">
        <div><dt>Feature status</dt><dd>{rgbdLab.featureReport.status}</dd></div>
        <div><dt>Model</dt><dd>{rgbdLab.featureReport.model}</dd></div>
        <div><dt>Anchors</dt><dd>{rgbdLab.featureReport.anchors.length}</dd></div>
        <div><dt>Coverage</dt><dd>{Math.round(rgbdLab.featureReport.coverage * 100)}%</dd></div>
      </dl>
    {/if}
  </article>
{/if}
