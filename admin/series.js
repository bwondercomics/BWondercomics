import { STORAGE_KEY } from "./config.js";
import { el } from "./dom.js";
import { DEFAULT_SERIES_ID, ACTIVE_SERIES_KEY, state } from "./state.js";
import { saveToServer } from "./core.js";

function createSeriesManager() {
  let chaptersApi = null;
  let setDesignerFrameSrc = null;
  let showChaptersSection = null;
  let seriesModalMode = "edit";
  let seriesModalBound = false;
  let seriesModalEditingId = "";
  let seriesModalLabelsTouched = false;

  function bindDependencies({
    chaptersApi: nextChaptersApi,
    setDesignerFrameSrc: nextSetDesignerFrameSrc,
    showChaptersSection: nextShowChaptersSection,
  } = {}) {
    if (nextChaptersApi) chaptersApi = nextChaptersApi;
    if (nextSetDesignerFrameSrc) setDesignerFrameSrc = nextSetDesignerFrameSrc;
    if (nextShowChaptersSection) showChaptersSection = nextShowChaptersSection;
  }

  function getSeriesModalElements() {
    return {
      modal: el.seriesModal,
      form: el.seriesForm,
      title: el.seriesModalTitle,
      status: el.seriesModalStatus,
      idInput: el.seriesIdInput,
      titleInput: el.seriesTitleInput,
      descriptionInput: el.seriesDescriptionInput,
      coverInput: el.seriesCoverInput,
      unitSingular: el.seriesUnitSingular,
      unitPlural: el.seriesUnitPlural,
      premiumOnly: el.seriesPremiumOnly,
      closeBtn: el.seriesModalClose,
      cancelBtn: el.seriesModalCancel,
      deleteBtn: el.seriesModalDelete,
      saveBtn: el.seriesModalSave,
    };
  }

  function setSeriesModalStatus(message = "", isError = false) {
    const { status } = getSeriesModalElements();
    if (!status) return;
    if (!message) {
      status.style.display = "none";
      status.textContent = "";
      status.className = "success-message";
      return;
    }
    status.textContent = message;
    status.style.display = "block";
    status.className = isError ? "error-message" : "success-message";
  }

  function closeSeriesModal() {
    const { modal } = getSeriesModalElements();
    if (!modal) return;
    modal.classList.remove("active");
  }

  function bindSeriesModal() {
    if (seriesModalBound) return;
    const {
      modal,
      form,
      closeBtn,
      cancelBtn,
      deleteBtn,
      idInput,
      unitSingular,
      unitPlural,
    } = getSeriesModalElements();
    if (!modal || !form) return;

    if (closeBtn) closeBtn.addEventListener("click", closeSeriesModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeSeriesModal);
    if (deleteBtn) deleteBtn.addEventListener("click", handleSeriesModalDelete);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeSeriesModal();
    });
    form.addEventListener("submit", handleSeriesModalSubmit);

    if (idInput) {
      idInput.addEventListener("blur", () => {
        if (seriesModalMode !== "create") return;
        idInput.value = sanitizeSeriesId(idInput.value);
        if (!seriesModalLabelsTouched) {
          const defaults = defaultUnitLabelsForSeries(
            sanitizeSeriesId(idInput.value) || "new-series",
          );
          if (unitSingular) unitSingular.value = defaults.singular;
          if (unitPlural) unitPlural.value = defaults.plural;
        }
      });
    }
    if (unitSingular) {
      unitSingular.addEventListener("input", () => {
        seriesModalLabelsTouched = true;
      });
    }
    if (unitPlural) {
      unitPlural.addEventListener("input", () => {
        seriesModalLabelsTouched = true;
      });
    }

    seriesModalBound = true;
  }

  function updateSeriesModalDeleteButton() {
    const { deleteBtn } = getSeriesModalElements();
    if (!deleteBtn) return;
    const canDelete =
      seriesModalMode === "edit" &&
      seriesModalEditingId &&
      seriesModalEditingId !== DEFAULT_SERIES_ID;
    deleteBtn.style.display = canDelete ? "inline-flex" : "none";
    deleteBtn.disabled = !canDelete;
  }

  function openSeriesModal(mode, series) {
    bindSeriesModal();
    const {
      modal,
      title,
      idInput,
      titleInput,
      descriptionInput,
      coverInput,
      unitSingular,
      unitPlural,
      premiumOnly,
      saveBtn,
    } = getSeriesModalElements();
    if (!modal) return;

    seriesModalMode = mode;
    seriesModalEditingId = series?.id || "";
    seriesModalLabelsTouched = false;
    setSeriesModalStatus("");

    const defaults = defaultUnitLabelsForSeries(
      seriesModalEditingId || "new-series",
    );
    if (title) {
      title.textContent = mode === "create" ? "New Series" : "Edit Series";
    }
    if (saveBtn) {
      saveBtn.textContent = mode === "create" ? "Create Series" : "Save Series";
      saveBtn.disabled = false;
    }
    if (idInput) {
      idInput.value = series?.id || "";
      idInput.disabled = mode === "edit";
    }
    if (titleInput) {
      titleInput.value = series?.title || series?.id || "";
    }
    if (descriptionInput) {
      descriptionInput.value = series?.description || "";
    }
    if (coverInput) {
      coverInput.value = series?.coverImage || "";
    }
    if (unitSingular) {
      unitSingular.value = String(series?.unitLabelSingular || defaults.singular);
    }
    if (unitPlural) {
      unitPlural.value = String(series?.unitLabelPlural || defaults.plural);
    }
    if (premiumOnly) {
      premiumOnly.checked = !!series?.premiumOnly;
    }

    updateSeriesModalDeleteButton();
    modal.classList.add("active");
    if (idInput && mode === "create") {
      idInput.focus();
    } else if (titleInput) {
      titleInput.focus();
    }
  }

  function sanitizeSeriesId(raw = "") {
    return String(raw)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
  }

  function defaultUnitLabelsForSeries(seriesId) {
    const id = sanitizeSeriesId(seriesId) || DEFAULT_SERIES_ID;
    if (id === DEFAULT_SERIES_ID) return { singular: "Entry", plural: "Entries" };
    return { singular: "Entry", plural: "Entries" };
  }

  function getActiveSeriesId() {
    return sanitizeSeriesId(state.activeSeriesId) || DEFAULT_SERIES_ID;
  }

  function getActiveSeriesMeta() {
    const id = getActiveSeriesId();
    const list = state.seriesIndex?.series || [];
    return list.find((s) => s && s.id === id) || null;
  }

  function getUnitLabels() {
    const current = getActiveSeriesMeta();
    const defaults = defaultUnitLabelsForSeries(getActiveSeriesId());
    const singular =
      String(current?.unitLabelSingular || "").trim() || defaults.singular;
    const plural =
      String(current?.unitLabelPlural || "").trim() || defaults.plural;
    return { singular: singular.slice(0, 30), plural: plural.slice(0, 30) };
  }

  function applyUnitLabels() {
    const { singular, plural } = getUnitLabels();

    if (el.btnChapters) el.btnChapters.textContent = plural;
    const title = document.getElementById("chaptersSectionTitle");
    if (title) title.textContent = `${plural} Management`;
    if (el.btnAddChapter) el.btnAddChapter.textContent = `+ Add New ${singular}`;

    const previewLabel = document.getElementById("previewEntryLabel");
    if (previewLabel) previewLabel.textContent = singular;

    const nameLabel = document.getElementById("entryNameLabel");
    if (nameLabel) nameLabel.textContent = `${singular} Name`;
    if (el.chapterName) el.chapterName.placeholder = `e.g., ${singular} 1`;

    const accessLabel = document.getElementById("entryAccessLabel");
    if (accessLabel) accessLabel.textContent = `${singular} Access`;
  }

  function getChaptersRoot() {
    const id = getActiveSeriesId();
    const preferredRoot = `comics/${id}/entries`;
    const legacyRoots = [`comics/${id}/chapters`, "chapters"];
    const rootsToCheck = [preferredRoot, ...legacyRoots];

    const normalizePath = (value) => String(value || "").trim().replace(/^\/+/, "");
    const hasRootMatch = (path, root) => {
      const normalized = normalizePath(path);
      const normalizedRoot = normalizePath(root).replace(/\/+$/, "");
      return normalized && normalizedRoot && normalized.startsWith(`${normalizedRoot}/`);
    };

    const folderPaths = Object.values(state.chapterFolders || {});
    const chapterPages = Object.values(state.chapters || {})
      .flatMap((pages) => (Array.isArray(pages) ? pages : []));

    for (const root of rootsToCheck) {
      if (folderPaths.some((path) => hasRootMatch(path, root))) return root;
      if (chapterPages.some((path) => hasRootMatch(path, root))) return root;
    }

    return preferredRoot;
  }

  function getChaptersDataFileUrl() {
    const id = getActiveSeriesId();
    // Admin endpoint (includes drafts/scheduled entries).
    return `/api/admin/series/${id}/data`;
  }

  function getChaptersSaveFilename() {
    const id = getActiveSeriesId();
    return id === DEFAULT_SERIES_ID
      ? "admin/data.json"
      : `admin/series/${id}/data.json`;
  }

  function getChaptersStorageKey() {
    return `${STORAGE_KEY}:${getActiveSeriesId()}`;
  }

  async function loadSeriesIndex() {
    // Pull the DB-backed series index for the series picker.
    try {
      const res = await fetch("/series.json", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load series.json");
      const data = await res.json();
      const series = Array.isArray(data.series) ? data.series : [];
      const defaultSeriesId =
        sanitizeSeriesId(data.defaultSeriesId) || DEFAULT_SERIES_ID;
      state.seriesIndex = {
        version: data.version || 1,
        defaultSeriesId,
        series,
      };
    } catch {
      state.seriesIndex = {
        version: 1,
        defaultSeriesId: DEFAULT_SERIES_ID,
        series: [],
      };
    }

    if (!Array.isArray(state.seriesIndex.series)) state.seriesIndex.series = [];
    if (!state.seriesIndex.series.some((s) => s && s.id === DEFAULT_SERIES_ID)) {
      state.seriesIndex.series.unshift({
        id: DEFAULT_SERIES_ID,
        title: "Battle Bros",
        description: "Battle Bros comic reader",
        premiumOnly: false,
      });
    }

    // Restore last active series from localStorage when possible.
    const storedActive = sanitizeSeriesId(
      localStorage.getItem(ACTIVE_SERIES_KEY),
    );
    const canUseStored =
      storedActive &&
      state.seriesIndex.series.some((s) => s.id === storedActive);
    state.activeSeriesId = canUseStored
      ? storedActive
      : state.seriesIndex.defaultSeriesId;
  }

  function renderSeriesSelect() {
    if (!el.seriesSelect) return;
    const current = getActiveSeriesId();
    el.seriesSelect.innerHTML = "";

    const sorted = [...(state.seriesIndex.series || [])].sort((a, b) =>
      (a.title || a.id || "").localeCompare(b.title || b.id || ""),
    );

    sorted.forEach((s) => {
      if (!s || !s.id) return;
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.title ? `${s.title} (${s.id})` : s.id;
      el.seriesSelect.appendChild(opt);
    });

    el.seriesSelect.value = current;
    updateSeriesLinks();
  }

  function updateSeriesLinks() {
    const id = getActiveSeriesId();
    if (el.btnOpenSeries) {
      el.btnOpenSeries.href = `../index.html?series=${encodeURIComponent(id)}`;
    }
  }

  async function switchSeries(nextIdRaw) {
    // Swap active series and reload DB data + UI labels.
    if (!chaptersApi) return;
    const nextId = sanitizeSeriesId(nextIdRaw) || DEFAULT_SERIES_ID;
    if (nextId === getActiveSeriesId()) return;

    if (state.hasUnsavedChanges) {
      const { plural } = getUnitLabels();
      const proceed = window.confirm(
        `You have unsaved changes in ${plural}. Switch series anyway?`,
      );
      if (!proceed) {
        renderSeriesSelect();
        return;
      }
    }

    state.activeSeriesId = nextId;
    localStorage.setItem(ACTIVE_SERIES_KEY, nextId);

    await chaptersApi.loadChapters();
    chaptersApi.renderStatusMessageInput();
    chaptersApi.renderChapterList();
    applyUnitLabels();
    updateSeriesLinks();
    if (
      setDesignerFrameSrc &&
      el.designerSection &&
      el.designerSection.style.display !== "none"
    ) {
      setDesignerFrameSrc(nextId, true);
    }
    if (showChaptersSection) showChaptersSection();
  }

  async function createNewSeriesPrompt() {
    // Create a new series index entry plus empty DB-backed data + page config.
    if (!chaptersApi) return;
    const rawId = prompt("New series ID (letters/numbers/-/_):");
    const id = sanitizeSeriesId(rawId);
    if (!id) return;
    if (state.seriesIndex.series.some((s) => s.id === id)) {
      alert(`Series "${id}" already exists.`);
      return;
    }

    const title = (prompt("Series title:", id) || id).trim();
    const premiumOnly = window.confirm("Should this series be premium-only?");
    const defaults = defaultUnitLabelsForSeries(id);
    const unitLabelSingular =
      (
        prompt("Entry label (singular):", defaults.singular) || defaults.singular
      ).trim();
    const unitLabelPlural =
      (
        prompt("Entry label (plural):", defaults.plural) || defaults.plural
      ).trim();

    const nextIndex = {
      ...state.seriesIndex,
      series: [
        ...(state.seriesIndex.series || []),
        {
          id,
          title,
          description: "",
          premiumOnly,
          unitLabelSingular,
          unitLabelPlural,
        },
      ],
    };

    const now = new Date().toISOString();
    const dataFile = `admin/series/${id}/data.json`;
    const pageConfigFile = `admin/series/${id}/page-config.json`;

    const defaultPageConfig = await (async () => {
      try {
      const res = await fetch("/page-config.json", { cache: "no-store" });
        if (!res.ok) throw new Error("missing");
        const cfg = await res.json();
        return cfg && typeof cfg === "object" ? cfg : {};
      } catch {
        return {};
      }
    })();

    const pageConfig = {
      ...defaultPageConfig,
      content: {
        ...(defaultPageConfig.content || {}),
        header: {
          ...((defaultPageConfig.content || {}).header || {}),
          title,
        },
      },
    };

    await saveToServer("admin/series.json", nextIndex);
    await saveToServer(dataFile, {
      chapters: {},
      chapterFolders: {},
      chapterMeta: {},
      statusMessage: "",
      premiumOnly,
      lastUpdated: now,
      publishedBy: "Admin Panel",
    });
    await saveToServer(pageConfigFile, pageConfig);

    // Create the series chapters root folder so uploads work immediately.
    await fetch("/api/create-chapter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterFolder: `comics/${id}/entries` }),
    }).catch(() => {});

    state.seriesIndex = nextIndex;
    await switchSeries(id);
    renderSeriesSelect();
    applyUnitLabels();
    alert(`Created series "${title}" (${id}).`);
  }

  async function editActiveSeriesPrompt() {
    if (!chaptersApi) return;
    const id = getActiveSeriesId();
    const seriesList = state.seriesIndex.series || [];
    const current = seriesList.find((s) => s && s.id === id);
    if (!current) {
      alert("Series not found.");
      return;
    }

    const title = prompt("Series title:", current.title || id);
    if (title === null) return;
    const description = prompt(
      "Series description:",
      current.description || "",
    );
    if (description === null) return;

    const coverImage = prompt(
      "Series cover image path (optional).\n\nExamples:\n- assets/banner3.png\n- comics/02/cover.png\n\nLeave blank to auto-pick the first accessible page in the library.",
      current.coverImage || "",
    );
    if (coverImage === null) return;

    const premiumOnly = current.premiumOnly
      ? window.confirm(
        "Series is currently PREMIUM-ONLY.\n\nOK = keep premium-only\nCancel = make public",
      )
      : window.confirm(
        "Series is currently PUBLIC.\n\nOK = make premium-only\nCancel = keep public",
      );

    const defaults = defaultUnitLabelsForSeries(id);
    const unitLabelSingular = (
      prompt(
        "Entry label (singular):",
        current.unitLabelSingular || defaults.singular,
      ) || defaults.singular
    ).trim();
    const unitLabelPlural = (
      prompt(
        "Entry label (plural):",
        current.unitLabelPlural || defaults.plural,
      ) || defaults.plural
    ).trim();

    const nextIndex = {
      ...state.seriesIndex,
      series: seriesList.map((s) =>
        s && s.id === id
          ? (() => {
            const next = {
              ...s,
              title: title.trim() || id,
              description: description.trim(),
              premiumOnly,
              unitLabelSingular,
              unitLabelPlural,
            };
            const cover = String(coverImage || "").trim();
            if (cover) next.coverImage = cover;
            else delete next.coverImage;
            return next;
          })()
          : s,
      ),
    };

    state.seriesIndex = nextIndex;
    await saveToServer("admin/series.json", nextIndex);

    // Keep the series' data.json flag in sync so the reader can enforce it.
    state.premiumOnly = premiumOnly;
    try {
      await chaptersApi.saveChapters(false);
    } catch (e) {
      console.warn("Failed to persist premiumOnly to data file:", e);
    }

    renderSeriesSelect();
    updateSeriesLinks();
    applyUnitLabels();
    alert("Series updated.");
  }

  async function handleSeriesModalSubmit(event) {
    event.preventDefault();
    if (!chaptersApi) return;
    const {
      idInput,
      titleInput,
      descriptionInput,
      coverInput,
      unitSingular,
      unitPlural,
      premiumOnly,
      saveBtn,
    } = getSeriesModalElements();
    if (!idInput || !titleInput || !unitSingular || !unitPlural || !premiumOnly) {
      return;
    }

    const rawId = idInput.value.trim();
    const id = sanitizeSeriesId(rawId);
    if (!id) {
      setSeriesModalStatus("Series ID is required.", true);
      return;
    }
    if (rawId !== id) idInput.value = id;

    const seriesList = state.seriesIndex.series || [];
    const isCreate = seriesModalMode === "create";
    const targetId = isCreate ? id : seriesModalEditingId || id;

    if (isCreate && seriesList.some((s) => s && s.id === id)) {
      setSeriesModalStatus(`Series "${id}" already exists.`, true);
      return;
    }
    if (!isCreate && !seriesList.some((s) => s && s.id === targetId)) {
      setSeriesModalStatus("Series not found.", true);
      return;
    }

    const defaults = defaultUnitLabelsForSeries(targetId || id);
    const title = titleInput.value.trim() || targetId;
    const description = descriptionInput
      ? descriptionInput.value.trim()
      : "";
    const coverImage = coverInput ? coverInput.value.trim() : "";
    const unitLabelSingular = (
      unitSingular.value.trim() || defaults.singular
    ).slice(0, 30);
    const unitLabelPlural = (
      unitPlural.value.trim() || defaults.plural
    ).slice(0, 30);
    const premiumOnlyValue = !!premiumOnly.checked;

    if (saveBtn) saveBtn.disabled = true;
    try {
      setSeriesModalStatus("Saving...", false);
      if (isCreate) {
        const nextIndex = {
          ...state.seriesIndex,
          series: [
            ...(state.seriesIndex.series || []),
            {
              id,
              title,
              description,
              premiumOnly: premiumOnlyValue,
              unitLabelSingular,
              unitLabelPlural,
              ...(coverImage ? { coverImage } : {}),
            },
          ],
        };

        const now = new Date().toISOString();
        const dataFile = `admin/series/${id}/data.json`;
        const pageConfigFile = `admin/series/${id}/page-config.json`;

        const defaultPageConfig = await (async () => {
          try {
            const res = await fetch("/page-config.json", { cache: "no-store" });
            if (!res.ok) throw new Error("missing");
            const cfg = await res.json();
            return cfg && typeof cfg === "object" ? cfg : {};
          } catch {
            return {};
          }
        })();

        const pageConfig = {
          ...defaultPageConfig,
          content: {
            ...(defaultPageConfig.content || {}),
            header: {
              ...((defaultPageConfig.content || {}).header || {}),
              title,
            },
          },
        };

        await saveToServer("admin/series.json", nextIndex);
        await saveToServer(dataFile, {
          chapters: {},
          chapterFolders: {},
          chapterMeta: {},
          statusMessage: "",
          premiumOnly: premiumOnlyValue,
          lastUpdated: now,
          publishedBy: "Admin Panel",
        });
        await saveToServer(pageConfigFile, pageConfig);

        await fetch("/api/create-chapter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chapterFolder: `comics/${id}/entries` }),
        }).catch(() => {});

        state.seriesIndex = nextIndex;
        await switchSeries(id);
        renderSeriesSelect();
        applyUnitLabels();
      } else {
        const nextIndex = {
          ...state.seriesIndex,
          series: seriesList.map((s) =>
            s && s.id === targetId
              ? (() => {
                  const next = {
                    ...s,
                    title: title.trim() || targetId,
                    description: description.trim(),
                    premiumOnly: premiumOnlyValue,
                    unitLabelSingular,
                    unitLabelPlural,
                  };
                  const cover = String(coverImage || "").trim();
                  if (cover) next.coverImage = cover;
                  else delete next.coverImage;
                  return next;
                })()
              : s,
          ),
        };

        state.seriesIndex = nextIndex;
        await saveToServer("admin/series.json", nextIndex);

        state.premiumOnly = premiumOnlyValue;
        try {
          await chaptersApi.saveChapters(false);
        } catch (e) {
          console.warn("Failed to persist premiumOnly to data file:", e);
        }

        renderSeriesSelect();
        updateSeriesLinks();
        applyUnitLabels();
      }

      closeSeriesModal();
    } catch (err) {
      const message = err?.message || "Failed to save series.";
      setSeriesModalStatus(message, true);
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  async function handleSeriesModalDelete() {
    if (!chaptersApi) return;
    const { deleteBtn } = getSeriesModalElements();
    const id = sanitizeSeriesId(seriesModalEditingId || "");
    if (!id) {
      setSeriesModalStatus("Series not found.", true);
      return;
    }
    if (id === DEFAULT_SERIES_ID) {
      setSeriesModalStatus("Default series cannot be deleted.", true);
      return;
    }
    if (state.hasUnsavedChanges) {
      const { plural } = getUnitLabels();
      const proceed = window.confirm(
        `You have unsaved changes in ${plural}. Deleting the series will discard them. Continue?`,
      );
      if (!proceed) return;
    }

    const seriesList = state.seriesIndex.series || [];
    const current = seriesList.find((s) => s && s.id === id);
    if (!current) {
      setSeriesModalStatus("Series not found.", true);
      return;
    }

    const seriesTitle = current.title || id;
    const confirmed = window.confirm(
      `Delete series "${seriesTitle}" (${id}) from the series list?\n\nThis hides it from the site but keeps its data in the database.`,
    );
    if (!confirmed) return;

    const confirmedAgain = window.confirm(
      "You can restore it later by creating a series with the same ID.\n\nContinue?",
    );
    if (!confirmedAgain) return;

    if (deleteBtn) deleteBtn.disabled = true;
    try {
      setSeriesModalStatus("Deleting...", false);
      const nextIndex = {
        ...state.seriesIndex,
        series: seriesList.filter((s) => s && s.id !== id),
      };
      await saveToServer("admin/series.json", nextIndex);
      state.seriesIndex = nextIndex;

      if (getActiveSeriesId() === id) {
        await switchSeries(DEFAULT_SERIES_ID);
      } else {
        renderSeriesSelect();
        updateSeriesLinks();
        applyUnitLabels();
      }

      closeSeriesModal();
    } catch (err) {
      const message = err?.message || "Failed to delete series.";
      setSeriesModalStatus(message, true);
    } finally {
      if (deleteBtn) deleteBtn.disabled = false;
    }
  }

  async function createNewSeries() {
    if (!el.seriesModal || !el.seriesForm) {
      await createNewSeriesPrompt();
      return;
    }
    openSeriesModal("create", null);
  }

  async function editActiveSeries() {
    if (!el.seriesModal || !el.seriesForm) {
      await editActiveSeriesPrompt();
      return;
    }
    const id = getActiveSeriesId();
    const seriesList = state.seriesIndex.series || [];
    const current = seriesList.find((s) => s && s.id === id);
    if (!current) {
      setSeriesModalStatus("Series not found.", true);
      return;
    }
    openSeriesModal("edit", current);
  }

  return {
    applyUnitLabels,
    bindDependencies,
    createNewSeries,
    defaultUnitLabelsForSeries,
    editActiveSeries,
    getActiveSeriesId,
    getChaptersDataFileUrl,
    getChaptersRoot,
    getChaptersSaveFilename,
    getChaptersStorageKey,
    getUnitLabels,
    loadSeriesIndex,
    renderSeriesSelect,
    sanitizeSeriesId,
    switchSeries,
    updateSeriesLinks,
  };
}

export { createSeriesManager };
