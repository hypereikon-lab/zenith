import { DEFAULT_CONTROL_VALUES } from "../app/default-profile.js";
import { downloadBlob, makeCanvasThumbnail } from "../media/canvas-utils.js";
import { cloneJson, createVersionId, formatVersionDate } from "./version-utils.js";

const INPAINT_MODEL = "gpt_image_2";
const INPAINT_RATIO = "1920:1920";

export function createVersionController({ storageKey, defaultInpaintPrompt, state, controls, elements, actions }) {
  const {
    versionSelect,
    versionGallery,
    versionReadout,
    saveVersion,
    applyVersion,
    deleteVersion,
    exportVersion,
    importVersion,
  } = elements;

  function loadSavedVersions() {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
      state.versions = Array.isArray(parsed) ? parsed.filter((version) => version?.id) : [];
    } catch {
      state.versions = [];
    }
  }

  function saveVersionsToStorage() {
    localStorage.setItem(storageKey, JSON.stringify(state.versions));
  }

  async function saveCurrentVersion() {
    if ((!state.plateCompositeCanvas || state.plateCompositeDirty) && state.plates.length >= 1) {
      await actions.commitPlateSketchSafely();
    }
    if (!state.plateCompositeCanvas || state.plateCompositeDirty) return;

    try {
      const version = await createVersionSnapshot();
      state.versions.unshift(version);
      state.versions = state.versions.slice(0, 40);
      saveVersionsToStorage();
      versionSelect.value = version.id;
      updateVersionUi();
      versionReadout.textContent = `Saved ${version.name}`;
      actions.scheduleWorkspaceAutosave("version", 250);
    } catch (error) {
      console.error(error);
      versionReadout.textContent = error.message;
    }
  }

  async function createVersionSnapshot() {
    actions.ensurePlatePlacements();
    const plateCount = actions.resolvedPlateCount();
    const createdAt = new Date().toISOString();
    return {
      version: 1,
      id: createVersionId(),
      name: `v${state.versions.length + 1} ${formatVersionDate(createdAt)}`,
      createdAt,
      sourceNames: state.plates.slice(0, plateCount).map((plate) => plate.name),
      plate: {
        count: plateCount,
        fit: controls.plateFit.value,
        feather: Number(controls.plateFeather.value),
        activePlateIndex: state.activePlateIndex,
        patchPlacements: cloneJson(state.platePlacements.slice(0, plateCount)),
      },
      generation: {
        model: INPAINT_MODEL,
        ratio: INPAINT_RATIO,
        quality: controls.runwayQuality.value,
        outputCount: Number(controls.runwayOutputCount.value),
        prompt: controls.runwayPrompt.value,
        lastOutputCount: state.runwayOutputs.length,
        lastOutputUrls: state.runwayOutputs.map((output) => output.url).filter(Boolean),
      },
      thumbnails: {
        plate: state.plateCompositeCanvas ? makeCanvasThumbnail(state.plateCompositeCanvas, 192) : null,
      },
    };
  }

  async function applySelectedVersion() {
    const version = selectedVersion();
    if (!version) return;
    applyVersionSnapshot(version);
    if (state.plates.length >= (version.plate?.count || 1)) {
      await actions.commitPlateSketchSafely();
      versionReadout.textContent = `Applied ${version.name}`;
    } else {
      versionReadout.textContent = `Load ${version.plate?.count || 1} matching images to commit`;
    }
  }

  function applyVersionSnapshot(version) {
    const plate = version.plate || {};
    controls.plateCount.value = String(plate.count || "auto");
    controls.plateFit.value = plate.fit || "contain";
    controls.plateFeather.value = String(plate.feather ?? DEFAULT_CONTROL_VALUES.plateFeather);
    state.platePlacements = cloneJson(plate.patchPlacements || []);
    state.activePlateIndex = plate.activePlateIndex || 0;

    const generation = version.generation || {};
    controls.runwayQuality.value = generation.quality || DEFAULT_CONTROL_VALUES.runwayQuality;
    controls.runwayOutputCount.value = String(generation.outputCount || 1);
    controls.runwayPrompt.value = generation.prompt || defaultInpaintPrompt;

    actions.ensurePlatePlacements();
    actions.updatePlateSelect();
    actions.updatePatchControlsFromActive();
    actions.updatePlateLayoutUi();
    actions.scheduleWorkspaceAutosave("version-apply", 250);
  }

  function deleteSelectedVersion() {
    const version = selectedVersion();
    if (!version) return;
    state.versions = state.versions.filter((item) => item.id !== version.id);
    saveVersionsToStorage();
    updateVersionUi();
    actions.scheduleWorkspaceAutosave("version", 250);
  }

  function exportSelectedVersion() {
    const version = selectedVersion();
    if (!version) return;
    const blob = new Blob([JSON.stringify(version, null, 2)], { type: "application/json" });
    downloadBlob(blob, `fulldome-version-${version.name.replace(/[^\w.-]+/g, "-")}.json`);
  }

  async function importVersionFile() {
    const file = importVersion.files?.[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      const versions = Array.isArray(imported) ? imported : [imported];
      for (const version of versions) {
        if (!version?.plate || !version?.generation) {
          throw new Error("Version JSON is missing plate or generation settings.");
        }
        version.id = createVersionId();
        version.name = version.name || `Imported ${formatVersionDate(new Date().toISOString())}`;
        version.createdAt = version.createdAt || new Date().toISOString();
        state.versions.unshift(version);
      }
      saveVersionsToStorage();
      updateVersionUi();
      versionReadout.textContent = `Imported ${versions.length} version${versions.length === 1 ? "" : "s"}`;
      actions.scheduleWorkspaceAutosave("version", 250);
    } catch (error) {
      console.error(error);
      versionReadout.textContent = error.message;
    } finally {
      importVersion.value = "";
    }
  }

  function updateVersionUi() {
    const selectedId = versionSelect.value || state.versions[0]?.id || "";
    versionSelect.replaceChildren();
    if (state.versions.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No saved versions";
      versionSelect.append(option);
    } else {
      state.versions.forEach((version) => {
        const option = document.createElement("option");
        option.value = version.id;
        option.textContent = version.name;
        versionSelect.append(option);
      });
    }
    versionSelect.value = state.versions.some((version) => version.id === selectedId)
      ? selectedId
      : state.versions[0]?.id || "";

    const hasVersions = state.versions.length > 0;
    const hasPlateMap = Boolean(state.plateCompositeCanvas && !state.plateCompositeDirty);
    saveVersion.disabled = !hasPlateMap;
    applyVersion.disabled = !hasVersions;
    deleteVersion.disabled = !hasVersions;
    exportVersion.disabled = !hasVersions;
    renderVersionGallery();

    const selected = selectedVersion();
    if (!selected) {
      versionReadout.textContent = "No saved versions";
    } else {
      const sourceMatch = versionSourceMatch(selected);
      versionReadout.textContent = `${state.versions.length} saved; selected ${selected.name}${
        sourceMatch ? "" : "; plate names differ"
      }`;
    }
  }

  function renderVersionGallery() {
    versionGallery.replaceChildren();
    const selectedId = versionSelect.value;
    state.versions.forEach((version) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "version-card";
      button.classList.toggle("active", version.id === selectedId);
      button.addEventListener("click", () => {
        versionSelect.value = version.id;
        updateVersionUi();
      });

      const thumbs = document.createElement("div");
      thumbs.className = "version-thumbs";
      const image = document.createElement("img");
      image.alt = "Plate sketch thumbnail";
      if (version.thumbnails?.plate) image.src = version.thumbnails.plate;
      thumbs.append(image);

      const meta = document.createElement("div");
      meta.className = "version-meta";
      const name = document.createElement("div");
      name.className = "version-name";
      name.textContent = version.name;
      const detail = document.createElement("div");
      detail.className = "version-detail";
      detail.textContent = `${version.plate?.count || 0} plates, ${
        version.generation?.model || "model"
      }, ${formatVersionDate(version.createdAt)}`;
      meta.append(name, detail);
      button.append(thumbs, meta);
      versionGallery.append(button);
    });
  }

  function selectedVersion() {
    return state.versions.find((version) => version.id === versionSelect.value) || null;
  }

  function versionSourceMatch(version) {
    const names = version.sourceNames || [];
    if (names.length === 0 || state.plates.length < names.length) return true;
    return names.every((name, index) => state.plates[index]?.name === name);
  }

  return {
    loadSavedVersions,
    saveVersionsToStorage,
    saveCurrentVersion,
    applySelectedVersion,
    deleteSelectedVersion,
    exportSelectedVersion,
    importVersionFile,
    updateVersionUi,
    selectedVersion,
  };
}
