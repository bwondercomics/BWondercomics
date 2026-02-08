import { state } from "./state.js";
import { sortPagesByFilename, getChapterFolder, readFileAsBase64 } from "./utils.js";

function createUploadManager({
  entriesApi,
  getChaptersRoot,
  showError,
  showSuccess,
} = {}) {
  function initUploadHandlers() {
    const uploadArea = document.getElementById("uploadArea");
    const fileInput = /** @type {HTMLInputElement | null} */ (
      document.getElementById("imageUpload")
    );
    const uploadPrompt = document.getElementById("uploadPrompt");
    const uploadPreview = document.getElementById("uploadPreview");
    const btnUploadImages = /** @type {HTMLButtonElement | null} */ (
      document.getElementById("btnUploadImages")
    );
    const uploadProgress = document.getElementById("uploadProgress");

    if (
      !uploadArea ||
      !fileInput ||
      !uploadPrompt ||
      !uploadPreview ||
      !btnUploadImages ||
      !uploadProgress
    ) {
      return;
    }

    const clearDragState = () => uploadArea.classList.remove("drag-over");

    uploadArea.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () =>
      handleFileSelect(fileInput.files),
    );

    uploadArea.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadArea.classList.add("drag-over");
    });

    uploadArea.addEventListener("dragleave", (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearDragState();
    });

    uploadArea.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearDragState();
      handleFileSelect(e.dataTransfer?.files || []);
    });

    btnUploadImages.addEventListener("click", uploadImagesToServer);
  }

  function handleFileSelect(fileList) {
    const uploadPrompt = document.getElementById("uploadPrompt");
    const btnUploadImages = document.getElementById("btnUploadImages");
    const uploadPreview = document.getElementById("uploadPreview");
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;

    const validFiles = incoming.filter((file) => {
      if (!file.type.startsWith("image/")) {
        return false;
      }
      if (file.size > MAX_FILE_SIZE) {
        if (showError) showError(`File ${file.name} is too large (max 10MB)`);
        return false;
      }
      return true;
    });

    if (!validFiles.length) {
      if (showError) showError("Please select valid image files under 10MB.");
      return;
    }

    validFiles.forEach((file) => {
      const exists = state.selectedFiles.find(
        (f) =>
          f.name === file.name &&
          f.size === file.size &&
          f.lastModified === file.lastModified,
      );
      if (!exists) state.selectedFiles.push(file);
    });

    uploadPrompt.style.display = state.selectedFiles.length ? "none" : "block";
    btnUploadImages.style.display = state.selectedFiles.length ? "block" : "none";
    renderFilePreview(uploadPreview);
    maybeAutoUpload();
  }

  function renderFilePreview(uploadPreview) {
    uploadPreview.innerHTML = "";

    state.selectedFiles.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const previewItem = document.createElement("div");
        previewItem.className = "preview-item";
        previewItem.innerHTML = `
          <img src="${e.target.result}" alt="${file.name}">
          <div class="preview-name" title="${file.name}">${file.name}</div>
          <button class="preview-remove" data-index="${index}" title="Remove">Remove</button>
        `;

        previewItem
          .querySelector(".preview-remove")
          ?.addEventListener("click", (evt) => {
            evt.stopPropagation();
            removeSelectedFile(index);
          });

        uploadPreview.appendChild(previewItem);
      };
      reader.readAsDataURL(file);
    });
  }

  function removeSelectedFile(index) {
    const uploadPrompt = document.getElementById("uploadPrompt");
    const btnUploadImages = /** @type {HTMLButtonElement | null} */ (
      document.getElementById("btnUploadImages")
    );
    const uploadPreview = document.getElementById("uploadPreview");

    state.selectedFiles.splice(index, 1);
    uploadPrompt.style.display = state.selectedFiles.length ? "none" : "block";
    btnUploadImages.style.display = state.selectedFiles.length ? "block" : "none";
    renderFilePreview(uploadPreview);
  }

  function clearSelectedFiles() {
    const uploadPrompt = document.getElementById("uploadPrompt");
    const uploadPreview = document.getElementById("uploadPreview");
    const btnUploadImages = /** @type {HTMLButtonElement | null} */ (
      document.getElementById("btnUploadImages")
    );
    const fileInput = /** @type {HTMLInputElement | null} */ (
      document.getElementById("imageUpload")
    );

    state.selectedFiles = [];
    state.isUploading = false;
    if (uploadPrompt) uploadPrompt.style.display = "block";
    if (uploadPreview) uploadPreview.innerHTML = "";
    if (btnUploadImages) {
      btnUploadImages.style.display = "none";
      btnUploadImages.disabled = false;
      btnUploadImages.textContent = "Upload Selected Images";
    }
    if (fileInput) fileInput.value = "";
  }

  function maybeAutoUpload() {
    if (!state.selectedFiles.length || state.isUploading) return;
    const entryName = entriesApi?.getActiveEntryName();
    const uploadProgress = document.getElementById("uploadProgress");
    if (!entryName) {
      if (uploadProgress) uploadProgress.style.display = "none";
      return; // wait until user sets a chapter name
    }
    uploadImagesToServer();
  }

  async function uploadImagesToServer() {
    const btnUploadImages = /** @type {HTMLButtonElement | null} */ (
      document.getElementById("btnUploadImages")
    );
    const uploadProgress = document.getElementById("uploadProgress");

    if (state.isUploading) return;
    const entryName = entriesApi?.getActiveEntryName();
    if (!entryName) {
      if (showError) showError("Enter an entry name first.");
      if (uploadProgress) {
        uploadProgress.style.display = "block";
        uploadProgress.textContent = "Enter an entry name first.";
      }
      return;
    }

    if (!state.selectedFiles.length) {
      if (showError) showError("No files selected for upload.");
      if (uploadProgress) {
        uploadProgress.style.display = "block";
        uploadProgress.textContent = "No files selected.";
      }
      return;
    }

    const chaptersRoot =
      typeof entriesApi?.getActiveEntryRoot === "function"
        ? entriesApi.getActiveEntryRoot()
        : typeof getChaptersRoot === "function"
          ? getChaptersRoot()
          : "chapters";
    const chapterFolder = getChapterFolder(
      entryName,
      state.entryFolders,
      state.entries,
      state.currentPages,
      chaptersRoot,
    );

    state.isUploading = true;
    if (uploadProgress) {
      uploadProgress.style.display = "block";
      uploadProgress.textContent = "Uploading...";
    }
    btnUploadImages.disabled = true;
    btnUploadImages.textContent = "Uploading...";

    try {
      await fetch("/api/create-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryFolder: chapterFolder }),
      });

      const filesPayload = await Promise.all(
        state.selectedFiles.map(async (file) => ({
          name: file.name,
          data: await readFileAsBase64(file),
        })),
      );

      const response = await fetch("/api/upload-entry-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryFolder: chapterFolder, files: filesPayload }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Upload failed");

      const newPaths = result.paths || [];
      state.currentPages = state.currentPages.length
        ? [...state.currentPages, ...newPaths]
        : sortPagesByFilename([...state.currentPages, ...newPaths]);
      entriesApi?.renderPageList(state.currentPages);
      entriesApi?.markUnsaved();
      clearSelectedFiles();

      const errors = result.errors?.length || 0;
      if (errors > 0) {
        if (showError) {
          showError(`Uploaded ${newPaths.length} file(s), ${errors} failed.`);
        }
      } else if (showSuccess) {
        showSuccess(`Successfully uploaded ${newPaths.length} image(s)!`);
      }
    } catch (error) {
      console.error("Upload error:", error);
      if (showError) showError(`Upload failed: ${error.message}`);
      if (uploadProgress) {
        uploadProgress.textContent = `Upload failed: ${error.message}`;
      }
    } finally {
      state.isUploading = false;
      btnUploadImages.disabled = false;
      btnUploadImages.textContent = "Upload Selected Images";
      setTimeout(() => {
        if (uploadProgress) uploadProgress.style.display = "none";
      }, 1200);
    }
  }

  return {
    initUploadHandlers,
  };
}

export { createUploadManager };
