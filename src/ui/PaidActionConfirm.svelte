<script lang="ts">
  import { workbench } from "../artifacts/artifact-store.svelte.js";
  import { cancelPendingPaidAction, confirmPendingPaidAction } from "../app/workbench-operator-commands.js";
</script>

{#if workbench.pendingPaidAction}
  <div class="modal-backdrop" role="presentation">
    <div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="paid-action-title">
      <p class="eyebrow">Paid/API action</p>
      <h2 id="paid-action-title">{workbench.pendingPaidAction.label}</h2>
      <p>{workbench.pendingPaidAction.body}</p>
      <p class="control-help">
        The visible prompt/config and referenced artifacts are the source of truth. Tests and smoke checks do not press
        this confirmation.
      </p>
      <div class="dialog-actions">
        <button type="button" class="secondary-action" onclick={cancelPendingPaidAction}>Cancel</button>
        <button type="button" class="danger-action" onclick={confirmPendingPaidAction}>Confirm and run paid API</button>
      </div>
    </div>
  </div>
{/if}
