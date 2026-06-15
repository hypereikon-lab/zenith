<script lang="ts">
  import { downloadRgbdCanvas, renderSelectedRgbdProxy } from "../scene/rgbd-scene-commands.js";
  import { rgbdLab } from "../scene/rgbd-scene-store.svelte.js";

  let { disabledReason = null }: { disabledReason?: string | null } = $props();

  function exportCanvas(name: Parameters<typeof downloadRgbdCanvas>[0], suffix: string) {
    return downloadRgbdCanvas(name, `zenith-rgbd-${suffix}-${Date.now()}.png`);
  }
</script>

<article class="rgbd-panel">
  <div class="panel-heading">
    <p class="eyebrow">WebGPU Proxy</p>
    <h3>Render camera-conditioned RGBD handoff</h3>
    <p>Outputs RGB proxy, depth preview, known-pixel mask, disocclusion mask, and confidence preview.</p>
  </div>

  <div class="motion-controls two-column-controls" aria-label="RGBD proxy render settings">
    <label for="rgbd-proxy-width">
      <span>Proxy width {rgbdLab.proxySize.width}px</span>
      <input id="rgbd-proxy-width" type="number" min="512" max="4096" step="64" bind:value={rgbdLab.proxySize.width} />
    </label>
    <label for="rgbd-proxy-height">
      <span>Proxy height {rgbdLab.proxySize.height}px</span>
      <input id="rgbd-proxy-height" type="number" min="512" max="4096" step="64" bind:value={rgbdLab.proxySize.height} />
    </label>
  </div>

  {#if disabledReason}
    <p class="disabled-reason" id="rgbd-proxy-disabled">{disabledReason}</p>
  {/if}
  <button
    type="button"
    class="operator-action"
    disabled={Boolean(disabledReason)}
    aria-describedby={disabledReason ? "rgbd-proxy-disabled" : undefined}
    onclick={renderSelectedRgbdProxy}
  >
    Render RGBD Proxy Views
  </button>

  {#if rgbdLab.proxy}
    <div class="rgbd-preview-grid" aria-label="RGBD proxy render outputs">
      <figure>
        <figcaption>RGB proxy</figcaption>
        <img src={rgbdLab.proxy.rgb.url} alt={rgbdLab.proxy.rgb.alt || "RGB proxy"} />
        <button type="button" class="secondary-action compact-action" onclick={() => exportCanvas("proxyRgbCanvas", "proxy-rgb")}>Download RGB</button>
      </figure>
      <figure>
        <figcaption>Depth preview</figcaption>
        <img src={rgbdLab.proxy.depthPreview.url} alt={rgbdLab.proxy.depthPreview.alt || "Depth preview"} />
        <button type="button" class="secondary-action compact-action" onclick={() => exportCanvas("proxyDepthCanvas", "proxy-depth-preview")}>Download Depth</button>
      </figure>
      <figure>
        <figcaption>Known mask</figcaption>
        <img src={rgbdLab.proxy.knownMask.url} alt={rgbdLab.proxy.knownMask.alt || "Known-pixel mask"} />
        <button type="button" class="secondary-action compact-action" onclick={() => exportCanvas("knownMaskCanvas", "known-mask")}>Download Known</button>
      </figure>
      <figure>
        <figcaption>Disocclusion mask</figcaption>
        <img src={rgbdLab.proxy.disocclusionMask.url} alt={rgbdLab.proxy.disocclusionMask.alt || "Disocclusion mask"} />
        <button type="button" class="secondary-action compact-action" onclick={() => exportCanvas("disocclusionMaskCanvas", "hole-mask")}>Download Holes</button>
      </figure>
      <figure>
        <figcaption>Confidence preview</figcaption>
        <img src={rgbdLab.proxy.confidencePreview.url} alt={rgbdLab.proxy.confidencePreview.alt || "Confidence preview"} />
        <button type="button" class="secondary-action compact-action" onclick={() => exportCanvas("confidenceCanvas", "confidence")}>Download Confidence</button>
      </figure>
    </div>
  {/if}
</article>
