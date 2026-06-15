import { clamp } from "../projection.js";

export type TextContentSink = {
  textContent: string | null;
};

export function setProgressButton(
  button: HTMLButtonElement,
  readout: TextContentSink | null | undefined,
  stage: string,
  progress: number,
): void {
  const percent = clamp(Math.round(progress * 100), 1, 100);
  button.classList.add("progressing");
  button.style.setProperty("--progress", `${percent}%`);
  button.textContent = `${stage} ${percent}%`;
  if (readout) {
    readout.textContent = `${stage} (${percent}%)`;
  }
}

export function clearProgressButton(button: HTMLButtonElement, label: string): void {
  button.classList.remove("progressing");
  button.style.removeProperty("--progress");
  button.textContent = label;
}
