import { clamp } from "../projection.js";

export function setProgressButton(button, readout, stage, progress) {
  const percent = clamp(Math.round(progress * 100), 1, 100);
  button.classList.add("progressing");
  button.style.setProperty("--progress", `${percent}%`);
  button.textContent = `${stage} ${percent}%`;
  if (readout) {
    readout.textContent = `${stage} (${percent}%)`;
  }
}

export function clearProgressButton(button, label) {
  button.classList.remove("progressing");
  button.style.removeProperty("--progress");
  button.textContent = label;
}
