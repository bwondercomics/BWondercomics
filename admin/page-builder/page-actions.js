export function createPageActions({ el, getState, actions, deps }) {
  function syncPublicationActions() {
    const { currentPage } = getState();
    if (el.pbSaveDraft) el.pbSaveDraft.textContent = 'Save Page';
    if (!el.pbPublish) return;
    const isPublished = currentPage?.isPublished === true;
    el.pbPublish.textContent = isPublished ? 'Unpublish' : 'Publish';
    el.pbPublish.classList.toggle('btn-danger', isPublished);
    el.pbPublish.classList.toggle('btn-primary', !isPublished);
  }

  function setPageActionState(activeButton, busyText) {
    const buttons = [el.pbSaveDraft, el.pbPublish].filter(Boolean);
    const original = new Map(buttons.map((button) => [button, button.textContent]));
    buttons.forEach((button) => {
      button.disabled = true;
      if (button === activeButton) {
        button.textContent = busyText;
      }
    });

    return (button, nextText = null, delayMs = 0) => {
      const restore = () => {
        buttons.forEach((btn) => {
          btn.disabled = false;
          btn.textContent = original.get(btn);
        });
        if (button && nextText) {
          button.textContent = nextText;
          window.setTimeout(() => {
            button.textContent = original.get(button);
          }, 1200);
        }
      };
      if (delayMs > 0) {
        window.setTimeout(restore, delayMs);
        return;
      }
      restore();
    };
  }

  async function persistPage({ isPublished, activeButton, busyText, successMessage, successType }) {
    const { currentPage } = getState();
    if (!currentPage) return;
    if (
      !actions.ensureCleanWorkspace(
        'Save or discard your current changes before updating publish state.'
      )
    ) {
      return;
    }

    if (!activeButton) return;

    const releaseButtons = setPageActionState(activeButton, busyText);

    try {
      const nextMeta = actions.buildNormalizedPageMeta(currentPage);
      const updated = await deps.updatePage(currentPage.id, {
        title: currentPage.title,
        slug: currentPage.slug,
        pageType: currentPage.pageType,
        meta: nextMeta,
        isPublished,
      });
      if (!updated) {
        const lastError = deps.getLastPageBuilderDataError?.();
        throw new Error(lastError?.message || 'Failed to update page status');
      }

      actions.syncPageSummary(updated);
      actions.setActiveThemeDraft(actions.normalizeThemeDraft(getState().currentPage));
      actions.setActiveHeaderDraft(actions.normalizeHeaderDraft(updated));
      actions.renderPageList();
      actions.renderCanvas();
      actions.renderEditorPanel();
      actions.setEditorStatus(successMessage, successType);
      releaseButtons();
      syncPublicationActions();
    } catch (err) {
      console.error('Page status update error:', err);
      releaseButtons();
      actions.setEditorStatus(err?.message || 'Failed to save page changes.', 'danger');
      actions.renderEditorPanel();
    }
  }

  async function savePage() {
    const { currentPage } = getState();
    return persistPage({
      isPublished: currentPage?.isPublished === true,
      activeButton: el.pbSaveDraft,
      busyText: 'Saving...',
      successMessage: 'Page saved. Its publication state is unchanged.',
      successType: 'success',
    });
  }

  async function updatePublishState(isPublished) {
    const { currentPage } = getState();
    if (!currentPage) return;
    if (
      isPublished === false &&
      !window.confirm('Unpublish this page? It will no longer be public.')
    ) {
      return;
    }
    return persistPage({
      isPublished,
      activeButton: el.pbPublish,
      busyText: isPublished ? 'Publishing...' : 'Unpublishing...',
      successMessage: isPublished
        ? 'Page published. The public page now matches the saved builder page.'
        : 'Page unpublished. Its saved draft remains available in the builder.',
      successType: 'success',
    });
  }

  async function loadPages() {
    const { activePageScope } = getState();
    const pages = await deps.fetchPages(activePageScope, actions.getSeriesId());
    actions.setPages(pages);
    const linkPages = await deps.fetchLinkPages?.(actions.getSeriesId());
    actions.setLinkPages?.(linkPages || pages);
    if (activePageScope === 'series') {
      const bindings = await deps.fetchPageBindings?.(actions.getSeriesId());
      actions.setPageBindings?.(bindings || { bindings: {}, warnings: [] });
    } else {
      actions.setPageBindings?.({ bindings: {}, warnings: [] });
    }
    return pages;
  }

  async function createPageForActiveScope(slug, title) {
    const { activePageScope } = getState();
    return deps.createPage(activePageScope, actions.getSeriesId(), slug, title);
  }

  async function uploadAssetFile(file) {
    return deps.uploadAsset(file, deps.readFileAsBase64);
  }

  async function reorderSidebarPages(pageIdArray) {
    const { activePageScope, pages } = getState();
    const originalPages = [...pages];
    actions.setPages(
      pages.slice().sort((a, b) => pageIdArray.indexOf(a.id) - pageIdArray.indexOf(b.id))
    );
    actions.renderPageList();

    const success = await deps.reorderPages(activePageScope, actions.getSeriesId(), pageIdArray);
    if (!success) {
      actions.setPages(originalPages);
      actions.setEditorStatus('Failed to reorder pages.', 'danger');
      actions.renderPageList();
    }
  }

  async function activatePage(
    pageId,
    { surface = '', historyMode = 'replace', fallbackPage = null } = {}
  ) {
    const { currentPage } = getState();
    const page =
      currentPage?.id === pageId ? currentPage : (await deps.fetchPage(pageId)) || fallbackPage;
    if (!page) return false;

    actions.setCurrentPage(page);
    actions.resetBuilderState();
    actions.setActiveThemeDraft(actions.normalizeThemeDraft(getState().currentPage));
    if (surface === 'header') {
      actions.activateHeaderSurface();
    } else if (surface === 'page-settings') {
      actions.setSelectedCanvasSurface('page-settings');
      actions.setActiveEditorTab('modules');
      actions.initializePageSettingsDraft();
    }
    actions.renderPageList();
    actions.renderCanvas();
    actions.renderEditorPanel();
    if (surface === 'header') {
      actions.syncDesignerRoute(historyMode);
    } else if (actions.isDesignerMode()) {
      actions.syncDesignerRoute(historyMode);
    }
    return true;
  }

  async function selectPage(pageId) {
    const { activeDesignerSurface } = getState();
    if (
      !actions.ensureCleanWorkspace('Save or discard your current changes before switching pages.')
    ) {
      return;
    }
    await activatePage(pageId, {
      surface: actions.isDesignerMode() ? activeDesignerSurface || 'header' : 'page-settings',
      historyMode: 'replace',
    });
  }

  async function deletePageFromSidebar(pageId) {
    const { currentPage, activeDesignerSurface } = getState();
    if (
      !actions.ensureCleanWorkspace('Save or discard your current changes before deleting a page.')
    ) {
      return;
    }
    if (!confirm('Delete this page? This cannot be undone.')) return;

    if (await deps.deletePage(pageId)) {
      await loadPages();
      if (currentPage?.id === pageId) {
        actions.setCurrentPage(null);
        actions.resetBuilderState();
      }
      if (actions.isDesignerMode()) {
        const fallbackPage = actions.getDefaultDesignerPage();
        if (fallbackPage) {
          await activatePage(fallbackPage.id, {
            surface: activeDesignerSurface || 'header',
            historyMode: 'replace',
          });
          return;
        }
        actions.syncDesignerRoute('replace');
      }
      actions.renderPageList();
      actions.renderCanvas();
      actions.renderEditorPanel();
    }
  }

  return {
    activatePage,
    createPageForActiveScope,
    deletePageFromSidebar,
    loadPages,
    reorderSidebarPages,
    selectPage,
    updatePublishState,
    savePage,
    syncPublicationActions,
    uploadAssetFile,
  };
}
