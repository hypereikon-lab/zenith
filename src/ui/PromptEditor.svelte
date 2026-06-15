<script lang="ts">
  import type { PromptField } from "../artifacts/artifact-types.js";

  let {
    field,
    value = $bindable(""),
  }: {
    field: PromptField;
    value: string;
  } = $props();
</script>

<label class="prompt-editor" for={`prompt-${field.id}`}>
  <span>{field.label}</span>
  <textarea id={`prompt-${field.id}`} bind:value rows={field.rows || 6}></textarea>
</label>
