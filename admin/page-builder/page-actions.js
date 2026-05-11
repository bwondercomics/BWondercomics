export function createPageActions({ el, getState, actions, deps }) {
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

  async function updatePublishState(isPublished) {
    const { currentPage } = getState();
    if (!currentPage) return;
    if (
      !actions.ensureCleanWorkspace(
        'Save or discard your current changes before updating publish state.'
      )
    ) {
      return;
    }

    const activeButton = isPublished ? el.pbPublish : el.pbSaveDraft;
    if (!activeButton) return;

    const releaseButtons = setPageActionState(
      activeButton,
      isPublished ? 'Publishing...' : 'Saving...'
    );

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
        throw new Error('Failed to update page status');
      }

      actions.syncPageSummary(updated);
      actions.setActiveThemeDraft(actions.normalizeThemeDraft(getState().currentPage));
      actions.setActiveHeaderDraft(actions.normalizeHeaderDraft(updated));
      actions.renderPageList();
      actions.renderCanvas();
      actions.renderEditorPanel();
      actions.setEditorStatus(
        isPublished
          ? 'Page published. Open Reader now matches the public page.'
          : 'Draft saved. Open Reader now uses the draft preview until you publish.',
        isPublished ? 'success' : 'warning'
      );
      releaseButtons(activeButton, isPublished ? 'Published' : 'Draft Saved');
    } catch (err) {
      console.error('Page status update error:', err);
      releaseButtons();
      actions.setEditorStatus(
        isPublished ? 'Failed to publish changes.' : 'Failed to save draft.',
        'danger'
      );
      actions.renderEditorPanel();
    }
  }

  async function loadPages() {
    const pages = await deps.fetchPages(actions.getSeriesId());
    actions.setPages(pages);
    return pages;
  }

  async function createPageForSeries(slug, title) {
    return deps.createPage(actions.getSeriesId(), slug, title);
  }

  async function uploadAssetFile(file) {
    return deps.uploadAsset(file, deps.readFileAsBase64);
  }

  async function reorderSidebarPages(pageIdArray) {
    const { pages } = getState();
    const originalPages = [...pages];
    actions.setPages(
      pages.slice().sort((a, b) => pageIdArray.indexOf(a.id) - pageIdArray.indexOf(b.id))
    );
    actions.renderPageList();

    const success = await deps.reorderPages(actions.getSeriesId(), pageIdArray);
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
    createPageForSeries,
    deletePageFromSidebar,
    loadPages,
    reorderSidebarPages,
    selectPage,
    updatePublishState,
    uploadAssetFile,
  };
}
