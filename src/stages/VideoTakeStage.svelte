<script lang="ts">
  import { getArtifact } from "../artifacts/artifact-store.svelte.js";
</script>

<section class="stage-panel" aria-label="Generate Video Take">
  <p class="eyebrow">Generate Video Take</p>
  <h2>Generate a state-transition take.</h2>
  <dl class="role-list">
    <div>
      <dt>Image 1</dt>
      <dd>{getArtifact("start-state").label}: source identity, style, material, lighting.</dd>
    </div>
    <div>
      <dt>Image 2</dt>
      <dd>{getArtifact("end-state").label}: final endpoint, pose, composition, arrival state.</dd>
    </div>
    <div>
      <dt>Video 1</dt>
      <dd>{getArtifact("motion-draft").label}: choreography, parallax direction, depth rhythm.</dd>
    </div>
  </dl>
  <p>
    This pass currently sends a two-state transition to the video endpoint. The workbench model treats the take as a
    state sequence, so later expansion to Image N should add more state artifacts instead of old side modes.
  </p>
</section>
