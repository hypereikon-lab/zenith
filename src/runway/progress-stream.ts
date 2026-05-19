type ProgressOptions = {
  errorPrefix?: string;
  emptyMessage?: string;
  defaultStage?: string;
  onProgress?: (stage: string, progress: number) => void;
};
type ProgressEvent = {
  type?: string;
  error?: string;
  result?: unknown;
  stage?: string;
  progress?: number;
};

export async function readProgressStream(response: Response, options: ProgressOptions = {}): Promise<unknown> {
  const {
    errorPrefix = "Request failed",
    emptyMessage = "Progress stream closed before returning a result.",
    defaultStage = "Running",
    onProgress = () => {},
  } = options;

  if (!response.ok) {
    const result = (await response.json().catch((): null => null)) as { error?: string } | null;
    throw new Error(result?.error || `${errorPrefix} (${response.status})`);
  }
  if (!response.body) {
    return response.json();
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const result = handleProgressLine(line, { errorPrefix, defaultStage, onProgress });
        if (result) return result;
      }
    }
    if (done) break;
  }

  if (buffer.trim()) {
    const result = handleProgressLine(buffer, { errorPrefix, defaultStage, onProgress });
    if (result) return result;
  }
  throw new Error(emptyMessage);
}

function handleProgressLine(
  line: string,
  { errorPrefix, defaultStage, onProgress }: Required<Pick<ProgressOptions, "errorPrefix" | "defaultStage" | "onProgress">>,
): unknown | null {
  if (!line.trim()) return null;
  const event = JSON.parse(line) as ProgressEvent;
  if (event.type === "error") {
    throw new Error(event.error || `${errorPrefix}.`);
  }
  if (event.type === "complete") {
    onProgress("Complete", 1);
    return event.result;
  }
  onProgress(event.stage || defaultStage, Number(event.progress) || 0);
  return null;
}
