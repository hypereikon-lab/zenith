<script lang="ts">
  import { getSelectedArtifact, workbench } from "../artifacts/artifact-store.svelte.js";
  import { changeProjectionProfile, executeOperator, importDepthFile, importPlateSketchFile, importSourceFile } from "../app/workbench-commands.js";
  import { operatorsForArtifact } from "../app/operator-registry.js";
  import { SOURCE_PROJECTION_MODES, sourceProjectionLabel } from "../geometry/source-projection.js";
  import PromptEditor from "./PromptEditor.svelte";

  let artifact = $derived(getSelectedArtifact());
  let artifactOperators = $derived(operatorsForArtifact(artifact.id));

  function promptValueId(id: string) {
    return id as keyof typeof workbench.promptDrafts;
  }

  async function handleOperatorFile(event: Event, operatorId: string) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (operatorId === "import-plate-sketch") await importPlateSketchFile(file);
    if (operatorId === "import-source") await importSourceFile(file);
    if (operatorId === "import-start-depth") await importDepthFile("start-depth", file);
    if (operatorId === "import-end-depth") await importDepthFile("end-depth", file);
    input.value = "";
  }

  function isImportOperator(operatorId: string) {
    return (
      operatorId === "import-plate-sketch" ||
      operatorId === "import-source" ||
      operatorId === "import-start-depth" ||
      operatorId === "import-end-depth"
    );
  }

  function importAccept(operatorId: string) {
    return operatorId === "import-source" ? "image/*,video/*" : "image/*";
  }
</script>

<section class="operator-panel" aria-label="Valid operations for selected artifact">
  <div class="panel-heading">
    <p class="eyebrow">Operators</p>
    <h2>{artifact.label}</h2>
    <p>{artifact.summary}</p>
  </div>

  {#if artifactOperators.length === 0}
    <p class="empty-note">No operators are attached to this artifact yet.</p>
  {:else}
    <div class="operator-list">
      {#each artifactOperators as item}
        <article class="operator-card" data-kind={item.operator.kind}>
          <div class="operator-title">
            <div>
              <h3>{item.operator.label}</h3>
              <p>{item.operator.description}</p>
            </div>
            <span class="operator-kind">{item.operator.kind === "paid-api" ? "Paid/API" : "Local"}</span>
          </div>

          {#if item.operator.id === "choose-projection"}
            <label class="field-row" for="projection-profile">
              <span>Projection profile</span>
              <select
                id="projection-profile"
                bind:value={workbench.projectionProfile}
                aria-describedby="projection-profile-help"
                onchange={() => changeProjectionProfile(workbench.projectionProfile)}
              >
                {#each SOURCE_PROJECTION_MODES as mode}
                  <option value={mode}>{sourceProjectionLabel(mode)}</option>
                {/each}
              </select>
            </label>
            <p id="projection-profile-help" class="control-help">Applies to every artifact in this workbench chain.</p>
          {/if}

          {#if item.operator.configFields?.includes("duration")}
            <div class="motion-controls" aria-label="Motion Draft local settings">
              <label for="motion-duration">
                <span>Duration {workbench.motionConfig.duration}s</span>
                <input id="motion-duration" type="number" min="1" max="15" step="0.5" bind:value={workbench.motionConfig.duration} />
              </label>
              <label for="motion-fps">
                <span>FPS</span>
                <input id="motion-fps" type="number" min="6" max="30" step="1" bind:value={workbench.motionConfig.fps} />
              </label>
              <label for="motion-size">
                <span>Output size</span>
                <select id="motion-size" bind:value={workbench.motionConfig.size}>
                  <option value={512}>512 px</option>
                  <option value={768}>768 px</option>
                  <option value={1024}>1024 px</option>
                  <option value={1536}>1536 px</option>
                </select>
              </label>
              <label for="motion-radius-scale">
                <span>Radius scale {workbench.motionConfig.radiusScale.toFixed(2)}</span>
                <input
                  id="motion-radius-scale"
                  type="range"
                  min="0.75"
                  max="1.25"
                  step="0.001"
                  bind:value={workbench.motionConfig.radiusScale}
                />
              </label>
              <label for="motion-yaw">
                <span>Yaw {workbench.motionConfig.yaw}°</span>
                <input id="motion-yaw" type="range" min="-45" max="45" step="1" bind:value={workbench.motionConfig.yaw} />
              </label>
              <label for="motion-pitch">
                <span>Pitch {workbench.motionConfig.pitch}°</span>
                <input id="motion-pitch" type="range" min="-30" max="30" step="1" bind:value={workbench.motionConfig.pitch} />
              </label>
              <label for="motion-roll">
                <span>Roll {workbench.motionConfig.roll}°</span>
                <input id="motion-roll" type="range" min="-30" max="30" step="1" bind:value={workbench.motionConfig.roll} />
              </label>
              <label for="motion-truck">
                <span>Truck {workbench.motionConfig.truck.toFixed(2)}m</span>
                <input id="motion-truck" type="range" min="-2" max="2" step="0.01" bind:value={workbench.motionConfig.truck} />
              </label>
              <label for="motion-lift">
                <span>Lift {workbench.motionConfig.lift.toFixed(2)}m</span>
                <input id="motion-lift" type="range" min="-2" max="2" step="0.01" bind:value={workbench.motionConfig.lift} />
              </label>
              <label for="motion-push">
                <span>Push {workbench.motionConfig.push.toFixed(2)}m</span>
                <input id="motion-push" type="range" min="-2" max="2" step="0.01" bind:value={workbench.motionConfig.push} />
              </label>
              <label for="motion-depth-gain">
                <span>Motion gain {workbench.motionConfig.depthGain.toFixed(2)}</span>
                <input
                  id="motion-depth-gain"
                  type="range"
                  min="0.05"
                  max="3"
                  step="0.01"
                  bind:value={workbench.motionConfig.depthGain}
                />
              </label>
              <label for="motion-near">
                <span>Near {workbench.motionConfig.nearMeters.toFixed(2)}m</span>
                <input id="motion-near" type="number" min="0.001" max="50" step="0.1" bind:value={workbench.motionConfig.nearMeters} />
              </label>
              <label for="motion-far">
                <span>Far {workbench.motionConfig.farMeters.toFixed(2)}m</span>
                <input id="motion-far" type="number" min="0.01" max="100" step="0.1" bind:value={workbench.motionConfig.farMeters} />
              </label>
              <label for="motion-depth-contrast">
                <span>Depth contrast {workbench.motionConfig.depthContrast.toFixed(2)}</span>
                <input
                  id="motion-depth-contrast"
                  type="range"
                  min="0.25"
                  max="4"
                  step="0.01"
                  bind:value={workbench.motionConfig.depthContrast}
                />
              </label>
              <label for="motion-gap-fill">
                <span>Gap fill {workbench.motionConfig.gapFillPasses}</span>
                <input id="motion-gap-fill" type="range" min="0" max="8" step="1" bind:value={workbench.motionConfig.gapFillPasses} />
              </label>
              <label for="motion-polarity">
                <span>Depth polarity</span>
                <select id="motion-polarity" bind:value={workbench.motionConfig.polarity}>
                  <option value="brightFar">Bright = far</option>
                  <option value="brightNear">Bright = near</option>
                </select>
              </label>
              <label for="motion-guide-mode">
                <span>Preview guide</span>
                <select id="motion-guide-mode" bind:value={workbench.motionConfig.guideMode}>
                  <option value="source">Source color</option>
                  <option value="depthShaded">Depth shaded</option>
                  <option value="depthMap">Depth map</option>
                </select>
              </label>
              <label for="motion-empty-background">
                <span>Empty background</span>
                <select id="motion-empty-background" bind:value={workbench.motionConfig.emptyBackground}>
                  <option value="greenDome">Green inside dome handoff</option>
                  <option value="black">Black</option>
                </select>
              </label>
            </div>
          {/if}

          {#each item.operator.promptFields || [] as field}
            <PromptEditor field={field} bind:value={workbench.promptDrafts[promptValueId(field.id)]} />
          {/each}

          {#if item.disabledReason}
            <p class="disabled-reason" id={`disabled-${item.operator.id}`}>{item.disabledReason}</p>
          {/if}

          {#if isImportOperator(item.operator.id)}
            <label class="file-import compact" for={`operator-file-${item.operator.id}`}>
              <span>{item.operator.label}</span>
              <input
                id={`operator-file-${item.operator.id}`}
                type="file"
                accept={importAccept(item.operator.id)}
                disabled={Boolean(item.disabledReason)}
                aria-describedby={item.disabledReason ? `disabled-${item.operator.id}` : undefined}
                onchange={(event) => handleOperatorFile(event, item.operator.id)}
              />
            </label>
          {:else}
            <button
              type="button"
              class="operator-action"
              disabled={Boolean(item.disabledReason)}
              aria-describedby={item.disabledReason ? `disabled-${item.operator.id}` : undefined}
              onclick={() => executeOperator(item.operator.id)}
            >
              {item.operator.requiresConfirmation ? "Review + Run" : item.operator.label}
            </button>
          {/if}
        </article>
      {/each}
    </div>
  {/if}
</section>
