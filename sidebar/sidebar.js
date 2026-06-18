const SidebarApp = {
  courses: [],
  currentCourseId: null,
  currentChapterId: null,
  activeTab: 'notes',
  reviewFilter: 'all',
  currentSettings: null,

  shortcutLabels: {
    quickNote: '快速笔记',
    quickBookmark: '添加书签',
    quickScreenshot: '截取画面',
    toggleSidebar: '切换侧边栏'
  },

  shortcutDefaults: {
    quickNote: 'Ctrl+Shift+N',
    quickBookmark: 'Ctrl+Shift+B',
    quickScreenshot: 'Ctrl+Shift+S',
    toggleSidebar: 'Ctrl+Shift+P'
  },

  async init() {
    await this.loadCourses();
    this.setupTabs();
    this.setupEventListeners();
    await this.loadSettings();
    this.updateAllShortcutHints();
    this.populateExportCourseSelect();
    this.renderCurrentTab();
  },

  async loadCourses() {
    const resp = await chrome.runtime.sendMessage({ action: 'getCourses' });
    this.courses = resp?.data || [];
    this.renderCourseSelect();

    if (this.courses.length > 0 && !this.currentCourseId) {
      this.currentCourseId = this.courses[0].id;
      this.currentChapterId = this.courses[0].chapters?.[0]?.id;
      this.renderChapterSelect();
    }
  },

  renderCourseSelect() {
    const select = document.getElementById('courseSelect');
    if (this.courses.length === 0) {
      select.innerHTML = '<option value="">暂无课程</option>';
      return;
    }
    select.innerHTML = this.courses.map(c =>
      `<option value="${c.id}" ${c.id === this.currentCourseId ? 'selected' : ''}>${this.escapeHtml(c.title)}</option>`
    ).join('');
  },

  renderChapterSelect() {
    const select = document.getElementById('chapterSelect');
    const course = this.courses.find(c => c.id === this.currentCourseId);
    if (!course || !course.chapters || course.chapters.length === 0) {
      select.innerHTML = '<option value="">暂无章节</option>';
      return;
    }
    select.innerHTML = course.chapters.map(ch =>
      `<option value="${ch.id}" ${ch.id === this.currentChapterId ? 'selected' : ''}>${this.escapeHtml(ch.title)}</option>`
    ).join('');
  },

  setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
        this.activeTab = btn.dataset.tab;
        this.renderCurrentTab();
      });
    });
  },

  setupEventListeners() {
    document.getElementById('courseSelect').addEventListener('change', (e) => {
      this.currentCourseId = e.target.value;
      const course = this.courses.find(c => c.id === this.currentCourseId);
      this.currentChapterId = course?.chapters?.[0]?.id || null;
      this.renderChapterSelect();
      this.renderCurrentTab();
    });

    document.getElementById('chapterSelect').addEventListener('change', (e) => {
      this.currentChapterId = e.target.value;
      this.renderCurrentTab();
    });

    document.getElementById('btnAddCourse').addEventListener('click', () => this.showCourseModal());
    document.getElementById('btnAddChapter').addEventListener('click', () => this.showChapterModal());

    document.getElementById('searchNotes').addEventListener('input', () => this.renderNotes());
    document.getElementById('searchBookmarks').addEventListener('input', () => this.renderBookmarks());
    document.getElementById('filterBookmarkTag').addEventListener('input', () => this.renderBookmarks());
    document.getElementById('searchScreenshots').addEventListener('input', () => this.renderScreenshots());

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.reviewFilter = btn.dataset.filter;
        this.renderReviews();
      });
    });

    document.getElementById('btnAddReview').addEventListener('click', () => this.showReviewModal());

    document.getElementById('btnSync').addEventListener('click', async () => {
      await this.loadCourses();
      this.populateExportCourseSelect();
      this.renderCurrentTab();
      this.showToast('数据已刷新');
    });

    this.setupSettingsListeners();
    this.setupShortcutListeners();
    this.setupExportListeners();
  },

  setupSettingsListeners() {
    document.getElementById('settingFloatWindow').addEventListener('change', async (e) => {
      await chrome.runtime.sendMessage({
        action: 'saveSettings',
        settings: { floatWindowVisible: e.target.checked }
      });
      this.currentSettings.floatWindowVisible = e.target.checked;
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, { action: 'toggleFloatWindow', visible: e.target.checked }).catch(() => {});
      }
      this.showToast(e.target.checked ? '浮动窗口已显示' : '浮动窗口已隐藏');
    });

    document.getElementById('settingAutoDetect').addEventListener('change', async (e) => {
      await chrome.runtime.sendMessage({
        action: 'saveSettings',
        settings: { autoDetectVideo: e.target.checked }
      });
      this.currentSettings.autoDetectVideo = e.target.checked;
    });

    document.getElementById('settingReminderDays').addEventListener('change', async (e) => {
      const val = parseInt(e.target.value) || 7;
      await chrome.runtime.sendMessage({
        action: 'saveSettings',
        settings: { reviewReminderDays: val }
      });
      this.currentSettings.reviewReminderDays = val;
    });

    document.getElementById('btnCleanCourses').addEventListener('click', async () => {
      if (!confirm('确定要清理没有任何数据的课程记录吗？')) return;
      const resp = await chrome.runtime.sendMessage({ action: 'clearInvalidCourses' });
      if (resp?.data) {
        this.showToast(`已清理 ${resp.data.removed} 条无效记录`);
        await this.loadCourses();
        this.populateExportCourseSelect();
      }
    });

    document.getElementById('btnClearAll').addEventListener('click', async () => {
      if (!confirm('确定要清空所有数据吗？此操作不可撤销！')) return;
      if (!confirm('再次确认：所有笔记、书签、截图、复习记录将全部删除！')) return;
      try {
        await chrome.storage.local.clear();
        this.showToast('所有数据已清空');
        await this.loadCourses();
        this.populateExportCourseSelect();
        this.renderCurrentTab();
      } catch (e) {
        this.showToast('清空失败: ' + e.message);
      }
    });
  },

  setupShortcutListeners() {
    document.getElementById('btnOpenShortcutsPage').addEventListener('click', () => {
      chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    });

    document.querySelectorAll('[data-action="editShortcut"]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.showShortcutRecorder(btn.dataset.key);
      });
    });
  },

  setupExportListeners() {
    document.getElementById('btnDoExport').addEventListener('click', () => this.doExport());
  },

  populateExportCourseSelect() {
    const select = document.getElementById('exportCourseSelect');
    if (!select) return;
    select.innerHTML = '<option value="__all__">📚 全部课程</option>' +
      this.courses.map(c => `<option value="${c.id}">${this.escapeHtml(c.title)}</option>`).join('');
  },

  async loadSettings() {
    const resp = await chrome.runtime.sendMessage({ action: 'getSettings' });
    this.currentSettings = resp?.data || {};
    document.getElementById('settingFloatWindow').checked = this.currentSettings.floatWindowVisible !== false;
    document.getElementById('settingAutoDetect').checked = this.currentSettings.autoDetectVideo !== false;
    document.getElementById('settingReminderDays').value = this.currentSettings.reviewReminderDays || 7;
    this.refreshShortcutBadges();
  },

  refreshShortcutBadges() {
    const shortcuts = this.currentSettings.shortcuts || this.shortcutDefaults;
    Object.keys(shortcuts).forEach(key => {
      const badge = document.getElementById('shortcut-' + key);
      if (badge) badge.textContent = shortcuts[key];
    });
  },

  updateAllShortcutHints() {
    const shortcuts = this.currentSettings?.shortcuts || this.shortcutDefaults;
    document.querySelectorAll('[data-shortcut]').forEach(el => {
      const key = el.dataset.shortcut;
      if (shortcuts[key]) {
        const label = this.shortcutLabels[key] || '';
        el.textContent = `使用 ${shortcuts[key]} ${label ? label.replace('快速', '').replace('添加', '').replace('截取', '截取').trim() : '快速操作'}`;
      }
    });
  },

  showShortcutRecorder(key) {
    const shortcuts = this.currentSettings?.shortcuts || { ...this.shortcutDefaults };
    const current = shortcuts[key] || this.shortcutDefaults[key] || '';

    this.showModal(`
      <div class="modal-header">
        <h3>⌨️ 设置快捷键 - ${this.shortcutLabels[key]}</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <div class="modal-body">
        <div class="shortcut-recorder">
          <div class="shortcut-recorder-input" id="shortcutDisplay">${current}</div>
          <p class="shortcut-recorder-hint">
            ⚠️ 受浏览器安全策略限制，此处仅更新扩展内的提示文案。<br/>
            若需要真正修改系统快捷键，请点击「打开浏览器设置」前往官方页面配置，<br/>
            配置完成后再回来在此处录入相同的快捷键以保持提示一致。<br/><br/>
            <strong>操作方式：</strong>在下方输入框中按下你想要的组合键即可捕获。
          </p>
          <div class="form-group">
            <label>手动输入（可选，格式如 Ctrl+Shift+N）</label>
            <input type="text" id="shortcutManual" placeholder="例如：Ctrl+Shift+N" value="${current}" />
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close style="margin:0;width:auto;padding:8px 16px;background:#f3f4f6;border:1px solid #e5e7eb;">取消</button>
        <button class="btn-secondary" id="openBrowserSettings" style="margin:0;width:auto;padding:8px 16px;background:#dbeafe;color:#1e40af;border:1px solid #93c5fd;">🔗 打开浏览器设置</button>
        <button class="btn-primary" id="saveShortcutBtn">保存提示</button>
      </div>
    `);

    const displayEl = document.getElementById('shortcutDisplay');
    const manualEl = document.getElementById('shortcutManual');
    let capturedKeys = [];

    const updateDisplay = () => {
      if (capturedKeys.length > 0) {
        displayEl.textContent = capturedKeys.join('+');
        manualEl.value = capturedKeys.join('+');
      }
    };

    const keydownHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      capturedKeys = [];
      if (e.ctrlKey) capturedKeys.push('Ctrl');
      if (e.altKey) capturedKeys.push('Alt');
      if (e.shiftKey) capturedKeys.push('Shift');
      if (e.metaKey) capturedKeys.push('Cmd');
      const key = e.key;
      if (key && !['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
        capturedKeys.push(key.length === 1 ? key.toUpperCase() : key);
      }
      updateDisplay();
    };

    document.addEventListener('keydown', keydownHandler);

    manualEl.addEventListener('input', (e) => {
      displayEl.textContent = e.target.value || '未设置';
    });

    document.getElementById('openBrowserSettings').addEventListener('click', () => {
      chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    });

    document.getElementById('saveShortcutBtn').addEventListener('click', async () => {
      const val = manualEl.value.trim();
      if (!val) {
        this.showToast('请输入或捕获快捷键');
        return;
      }
      const newShortcuts = { ...(this.currentSettings.shortcuts || this.shortcutDefaults) };
      newShortcuts[key] = val;
      await chrome.runtime.sendMessage({
        action: 'saveSettings',
        settings: { shortcuts: newShortcuts }
      });
      this.currentSettings.shortcuts = newShortcuts;
      this.refreshShortcutBadges();
      this.updateAllShortcutHints();
      this.closeModal();
      this.showToast(`已更新：${this.shortcutLabels[key]} = ${val}`);
      document.removeEventListener('keydown', keydownHandler);
    });

    this.bindCloseEvents();
    const origClose = this.closeModal.bind(this);
    this.closeModal = () => {
      document.removeEventListener('keydown', keydownHandler);
      this.closeModal = origClose;
      origClose();
    };
  },

  async doExport() {
    const courseId = document.getElementById('exportCourseSelect').value;
    const withNotes = document.getElementById('exportNotes').checked;
    const withBookmarks = document.getElementById('exportBookmarks').checked;
    const withScreenshots = document.getElementById('exportScreenshots').checked;
    const withReviews = document.getElementById('exportReviews').checked;
    const format = document.querySelector('input[name="exportFormat"]:checked').value;

    if (!withNotes && !withBookmarks && !withScreenshots && !withReviews) {
      this.showToast('请至少选择一项导出内容');
      return;
    }

    const progressEl = document.getElementById('exportProgress');
    progressEl.style.display = 'block';
    progressEl.textContent = '正在准备资料包...';

    try {
      const targetCourses = courseId === '__all__'
        ? this.courses
        : this.courses.filter(c => c.id === courseId);

      if (targetCourses.length === 0) {
        throw new Error('未找到课程数据');
      }

      const result = { courses: [], exportedAt: new Date().toISOString() };
      let ssCount = 0;

      for (const course of targetCourses) {
        const courseData = { ...course };

        if (withNotes) {
          const r = await chrome.runtime.sendMessage({ action: 'getNotes', filter: { courseId: course.id } });
          courseData.notes = r?.data || [];
        }
        if (withBookmarks) {
          const r = await chrome.runtime.sendMessage({ action: 'getBookmarks', filter: { courseId: course.id } });
          courseData.bookmarks = r?.data || [];
        }
        if (withScreenshots) {
          const r = await chrome.runtime.sendMessage({ action: 'getScreenshots', filter: { courseId: course.id } });
          courseData.screenshots = r?.data || [];
          ssCount += courseData.screenshots.length;
        }
        if (withReviews) {
          const r = await chrome.runtime.sendMessage({ action: 'getReviews', filter: { courseId: course.id } });
          courseData.reviews = r?.data || [];
        }

        result.courses.push(courseData);
      }

      progressEl.textContent = `已收集 ${targetCourses.length} 门课程数据，正在生成文件...`;

      const timestamp = new Date().toISOString().slice(0, 10);
      const courseLabel = courseId === '__all__' ? 'all-courses' : (targetCourses[0]?.title || 'course').replace(/[^\w\u4e00-\u9fa5]/g, '-');

      if (format === 'json') {
        const json = JSON.stringify(result, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        this.triggerDownload(blob, `study-notes-${courseLabel}-${timestamp}.json`);
        progressEl.textContent = `✅ 导出成功！共 ${targetCourses.length} 门课程，${ssCount} 张截图`;
        setTimeout(() => progressEl.style.display = 'none', 4000);
        this.showToast('JSON 资料包已下载');
      } else {
        if (withScreenshots && ssCount > 0) {
          progressEl.textContent = `正在处理 ${ssCount} 张截图...`;
          await this.exportMarkdownWithScreenshots(result, courseLabel, timestamp, ssCount);
        } else {
          const md = this.buildMarkdown(result);
          const blob = new Blob([md], { type: 'text/markdown' });
          this.triggerDownload(blob, `study-notes-${courseLabel}-${timestamp}.md`);
          progressEl.textContent = `✅ 导出成功！Markdown 文件已下载`;
          setTimeout(() => progressEl.style.display = 'none', 4000);
          this.showToast('Markdown 笔记已下载');
        }
      }
    } catch (e) {
      console.error(e);
      progressEl.textContent = '❌ 导出失败：' + e.message;
      this.showToast('导出失败: ' + e.message);
      setTimeout(() => progressEl.style.display = 'none', 4000);
    }
  },

  dataUrlToBlob(dataUrl) {
    const parts = dataUrl.split(',');
    const mime = parts[0].match(/:(.*?);/)[1];
    const binary = atob(parts[1]);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  },

  triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  buildMarkdown(result) {
    let md = `# 网课学习笔记 - 导出\n\n`;
    md += `导出时间：${new Date().toLocaleString()}\n\n`;
    md += `> 📂 **使用说明**：Markdown 文件与所有 PNG 截图下载后，请放在**同一文件夹**下即可正常预览所有图片，`;
    md += `文档中的图片文件名与下载的 PNG 文件名一一对应。受浏览器安全限制，文件会分别下载，请手动整理到同一目录。\n\n`;
    md += `---\n\n`;

    for (const course of result.courses) {
      md += `## 📚 ${course.title}\n\n`;
      if (course.url) md += `课程链接：${course.url}\n\n`;

      if (course.chapters && course.chapters.length > 0) {
        for (const chapter of course.chapters) {
          md += `### 📖 ${chapter.title}\n\n`;
          const chapterNotes = (course.notes || []).filter(n => n.chapterId === chapter.id);
          const chapterBms = (course.bookmarks || []).filter(b => b.chapterId === chapter.id);
          const chapterSss = (course.screenshots || []).filter(s => s.chapterId === chapter.id);

          if (chapterBms.length > 0) {
            md += `#### 🔖 书签\n\n`;
            for (const bm of chapterBms) {
              md += `- **[${this.formatTime(bm.timestamp)}]** ${bm.title || '未命名书签'}`;
              if (bm.tags && bm.tags.length) md += `  \`${bm.tags.join('` `')}\``;
              md += '\n';
              if (bm.description) md += `  > ${bm.description}\n`;
            }
            md += '\n';
          }

          if (chapterNotes.length > 0) {
            md += `#### 📝 笔记\n\n`;
            for (const note of chapterNotes) {
              md += `- **[${this.formatTime(note.timestamp)}]** ${note.content}`;
              if (note.tags && note.tags.length) md += `  \`${note.tags.join('` `')}\``;
              md += '\n';
            }
            md += '\n';
          }

          if (chapterSss.length > 0) {
            md += `#### 📷 截图\n\n`;
            for (const ss of chapterSss) {
              const safeTitle = (ss.title || 'screenshot').replace(/[^\w\u4e00-\u9fa5]/g, '_');
              const filename = `screenshot-${safeTitle}-${ss.id}.png`;
              md += `![${ss.title || '截图'} - ${this.formatTime(ss.timestamp)}](${filename})\n\n`;
              if (ss.description) md += `> ${ss.description}\n\n`;
            }
          }
        }
      }

      if (course.reviews && course.reviews.length > 0) {
        md += `### 🔁 复习计划\n\n`;
        for (const r of course.reviews) {
          const status = r.status === 'mastered' ? '✅ 已掌握' : (r.status === 'pending' ? '⏳ 待复习' : r.status);
          md += `- **${r.title}** - ${status}`;
          if (r.nextReviewAt) md += `  下次复习：${new Date(r.nextReviewAt).toLocaleDateString()}`;
          md += '\n';
          if (r.description) md += `  > ${r.description}\n`;
        }
        md += '\n';
      }

      md += `---\n\n`;
    }

    return md;
  },

  async exportMarkdownWithScreenshots(result, courseLabel, timestamp, ssCount) {
    const progressEl = document.getElementById('exportProgress');
    const md = this.buildMarkdown(result);
    const mdBlob = new Blob([md], { type: 'text/markdown' });

    let downloaded = 0;
    progressEl.textContent = `正在下载截图 (${downloaded}/${ssCount})...`;

    for (const course of result.courses) {
      for (const ss of course.screenshots || []) {
        try {
          const imageData = ss.annotatedData || ss.imageData;
          if (imageData) {
            const blob = this.dataUrlToBlob(imageData);
            const safeTitle = (ss.title || 'screenshot').replace(/[^\w\u4e00-\u9fa5]/g, '_');
            const filename = `screenshot-${safeTitle}-${ss.id}.png`;
            this.triggerDownload(blob, filename);
            downloaded++;
            progressEl.textContent = `正在下载截图 (${downloaded}/${ssCount})...`;
            await new Promise(r => setTimeout(r, 150));
          }
        } catch (e) {
          console.warn('Screenshot download failed:', ss.id, e);
        }
      }
    }

    this.triggerDownload(mdBlob, `study-notes-${courseLabel}-${timestamp}.md`);
    progressEl.textContent = `✅ 导出成功！Markdown + ${ssCount} 张截图已下载（请放同一文件夹）`;
    this.showToast(`Markdown + ${ssCount} 张截图已下载`);
    setTimeout(() => progressEl.style.display = 'none', 6000);
  },

  renderCurrentTab() {
    switch (this.activeTab) {
      case 'notes': this.renderNotes(); break;
      case 'bookmarks': this.renderBookmarks(); break;
      case 'screenshots': this.renderScreenshots(); break;
      case 'reviews': this.renderReviews(); break;
    }
  },

  async renderNotes() {
    const container = document.getElementById('notesList');
    if (!this.currentCourseId) {
      container.innerHTML = this.getEmptyState('📚', '请先选择课程');
      return;
    }

    const filter = { courseId: this.currentCourseId };
    if (this.currentChapterId) filter.chapterId = this.currentChapterId;
    const resp = await chrome.runtime.sendMessage({ action: 'getNotes', filter });
    let notes = resp?.data || [];

    const search = document.getElementById('searchNotes').value.toLowerCase().trim();
    if (search) {
      notes = notes.filter(n =>
        n.content?.toLowerCase().includes(search) ||
        n.tags?.some(t => t.toLowerCase().includes(search))
      );
    }

    if (notes.length === 0) {
      const shortcut = this.currentSettings?.shortcuts?.quickNote || this.shortcutDefaults.quickNote;
      container.innerHTML = this.getEmptyState('📝', '还没有笔记', `使用 ${shortcut} 快速记录`);
      return;
    }

    container.innerHTML = notes.map(note => `
      <div class="list-item" data-id="${note.id}">
        <div class="item-header">
          <span class="item-title">${this.escapeHtml(note.content?.substring(0, 50) || '无内容')}${note.content?.length > 50 ? '...' : ''}</span>
          <span class="item-time" data-action="jump" data-time="${note.timestamp}" data-course="${note.courseId}">${this.formatTime(note.timestamp)}</span>
        </div>
        ${note.content?.length > 50 ? `<div class="item-content">${this.escapeHtml(note.content)}</div>` : ''}
        <div class="item-meta">
          <div class="item-tags">
            ${(note.tags || []).map(t => `<span class="tag">${this.escapeHtml(t)}</span>`).join('')}
          </div>
          <div class="item-actions">
            <button class="item-action" data-action="addReview" title="加入复习">🔁</button>
            <button class="item-action" data-action="edit" title="编辑">✏️</button>
            <button class="item-action" data-action="delete" title="删除">🗑️</button>
          </div>
        </div>
      </div>
    `).join('');

    this.bindNoteEvents(container);
  },

  bindNoteEvents(container) {
    container.querySelectorAll('.list-item').forEach(item => {
      const id = item.dataset.id;
      item.querySelector('[data-action="jump"]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.jumpToTimestampForCourse(e.currentTarget.dataset.course, parseFloat(e.currentTarget.dataset.time));
      });
      item.querySelector('[data-action="addReview"]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const resp = await chrome.runtime.sendMessage({ action: 'getNotes', filter: {} });
        const note = resp?.data?.find(n => n.id === id);
        if (note) {
          this.showReviewModal({
            courseId: note.courseId,
            chapterId: note.chapterId,
            title: note.content?.substring(0, 30) || '笔记复习',
            description: note.content,
            timestamp: note.timestamp,
            sourceType: 'note',
            sourceId: note.id
          });
        }
      });
      item.querySelector('[data-action="edit"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showNoteEditModal(id);
      });
      item.querySelector('[data-action="delete"]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('确定删除这条笔记吗？')) {
          await chrome.runtime.sendMessage({ action: 'deleteNote', noteId: id });
          this.renderNotes();
          this.showToast('已删除');
        }
      });
    });
  },

  async renderBookmarks() {
    const container = document.getElementById('bookmarksList');
    if (!this.currentCourseId) {
      container.innerHTML = this.getEmptyState('📚', '请先选择课程');
      return;
    }

    const filter = { courseId: this.currentCourseId };
    if (this.currentChapterId) filter.chapterId = this.currentChapterId;
    const resp = await chrome.runtime.sendMessage({ action: 'getBookmarks', filter });
    let bookmarks = resp?.data || [];

    const search = document.getElementById('searchBookmarks').value.toLowerCase().trim();
    if (search) {
      bookmarks = bookmarks.filter(b =>
        b.title?.toLowerCase().includes(search) ||
        b.description?.toLowerCase().includes(search)
      );
    }

    const tagFilter = document.getElementById('filterBookmarkTag').value.toLowerCase().trim();
    if (tagFilter) {
      bookmarks = bookmarks.filter(b => b.tags?.some(t => t.toLowerCase().includes(tagFilter)));
    }

    if (bookmarks.length === 0) {
      const shortcut = this.currentSettings?.shortcuts?.quickBookmark || this.shortcutDefaults.quickBookmark;
      container.innerHTML = this.getEmptyState('🔖', '还没有书签', `使用 ${shortcut} 快速添加`);
      return;
    }

    container.innerHTML = bookmarks.map(bm => `
      <div class="list-item" data-id="${bm.id}">
        <div class="item-header">
          <span class="item-title">${this.escapeHtml(bm.title || '未命名书签')}</span>
          <span class="item-time" data-action="jump" data-time="${bm.timestamp}" data-course="${bm.courseId}">${this.formatTime(bm.timestamp)}</span>
        </div>
        ${bm.description ? `<div class="item-content">${this.escapeHtml(bm.description)}</div>` : ''}
        <div class="item-meta">
          <div class="item-tags">
            ${(bm.tags || []).map(t => `<span class="tag">${this.escapeHtml(t)}</span>`).join('')}
          </div>
          <div class="item-actions">
            <button class="item-action" data-action="addReview" title="加入复习">🔁</button>
            <button class="item-action" data-action="edit" title="编辑">✏️</button>
            <button class="item-action" data-action="delete" title="删除">🗑️</button>
          </div>
        </div>
      </div>
    `).join('');

    this.bindBookmarkEvents(container);
  },

  bindBookmarkEvents(container) {
    container.querySelectorAll('.list-item').forEach(item => {
      const id = item.dataset.id;
      item.querySelector('[data-action="jump"]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.jumpToTimestampForCourse(e.currentTarget.dataset.course, parseFloat(e.currentTarget.dataset.time));
      });
      item.querySelector('[data-action="addReview"]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const resp = await chrome.runtime.sendMessage({ action: 'getBookmarks', filter: {} });
        const bm = resp?.data?.find(b => b.id === id);
        if (bm) {
          this.showReviewModal({
            courseId: bm.courseId,
            chapterId: bm.chapterId,
            title: bm.title,
            description: bm.description,
            timestamp: bm.timestamp,
            sourceType: 'bookmark',
            sourceId: bm.id
          });
        }
      });
      item.querySelector('[data-action="edit"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showBookmarkEditModal(id);
      });
      item.querySelector('[data-action="delete"]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('确定删除这个书签吗？')) {
          await chrome.runtime.sendMessage({ action: 'deleteBookmark', bookmarkId: id });
          this.renderBookmarks();
          this.showToast('已删除');
        }
      });
    });
  },

  async renderScreenshots() {
    const container = document.getElementById('screenshotsGrid');
    if (!this.currentCourseId) {
      container.innerHTML = this.getEmptyState('📚', '请先选择课程');
      return;
    }

    const filter = { courseId: this.currentCourseId };
    if (this.currentChapterId) filter.chapterId = this.currentChapterId;
    const resp = await chrome.runtime.sendMessage({ action: 'getScreenshots', filter });
    let screenshots = resp?.data || [];

    const search = document.getElementById('searchScreenshots').value.toLowerCase().trim();
    if (search) {
      screenshots = screenshots.filter(s =>
        s.title?.toLowerCase().includes(search) ||
        s.description?.toLowerCase().includes(search)
      );
    }

    if (screenshots.length === 0) {
      const shortcut = this.currentSettings?.shortcuts?.quickScreenshot || this.shortcutDefaults.quickScreenshot;
      container.innerHTML = this.getEmptyState('📷', '还没有截图', `使用 ${shortcut} 截取画面`);
      return;
    }

    container.innerHTML = screenshots.map(ss => `
      <div class="screenshot-card" data-id="${ss.id}" data-course="${ss.courseId}" data-time="${ss.timestamp}">
        <img class="screenshot-thumb" src="${ss.annotatedData || ss.imageData}" alt="${this.escapeHtml(ss.title || '')}" />
        <div class="screenshot-info">
          <div class="screenshot-title">${this.escapeHtml(ss.title || '未命名截图')}</div>
          <div class="screenshot-time">${this.formatTime(ss.timestamp)}</div>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.screenshot-card').forEach(card => {
      card.addEventListener('click', () => this.showScreenshotPreview(card.dataset.id));
    });
  },

  async renderReviews() {
    const container = document.getElementById('reviewsList');
    const resp = await chrome.runtime.sendMessage({ action: 'getReviews', filter: {} });
    let reviews = resp?.data || [];

    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);

    if (this.reviewFilter === 'overview') {
      reviews = reviews.filter(r =>
        r.status !== 'mastered' &&
        r.nextReviewAt &&
        r.nextReviewAt <= endOfToday.getTime()
      );
    } else if (this.currentCourseId && this.reviewFilter === 'all') {
      reviews = reviews.filter(r => r.courseId === this.currentCourseId);
    }

    const groups = {
      overdue: [],
      today: [],
      pending: [],
      mastered: []
    };

    for (const r of reviews) {
      if (r.status === 'mastered') {
        groups.mastered.push(r);
      } else if (r.nextReviewAt && r.nextReviewAt < startOfToday.getTime()) {
        groups.overdue.push(r);
      } else if (r.nextReviewAt && r.nextReviewAt >= startOfToday.getTime() && r.nextReviewAt <= endOfToday.getTime()) {
        groups.today.push(r);
      } else {
        groups.pending.push(r);
      }
    }

    let activeGroups;
    if (this.reviewFilter === 'all' || this.reviewFilter === 'overview') {
      activeGroups = ['overdue', 'today', 'pending', 'mastered'];
    } else if (this.reviewFilter === 'overdue') {
      activeGroups = ['overdue'];
    } else if (this.reviewFilter === 'today') {
      activeGroups = ['today'];
    } else if (this.reviewFilter === 'pending') {
      activeGroups = ['pending'];
    } else if (this.reviewFilter === 'mastered') {
      activeGroups = ['mastered'];
    }

    const groupTitles = {
      overdue: { label: '🔴 已过期', cls: 'review-group-overdue' },
      today: { label: '🟡 今天到期', cls: 'review-group-today' },
      pending: { label: '🔵 待复习', cls: 'review-group-pending' },
      mastered: { label: '✅ 已掌握', cls: 'review-group-mastered' }
    };

    const hasAny = activeGroups.some(g => groups[g].length > 0);
    if (!hasAny) {
      const hint = this.reviewFilter === 'overview'
        ? '今天没有需要复习的内容 🎉'
        : '从笔记、书签、截图一键加入，或手动添加';
      container.innerHTML = this.getEmptyState('🔁', '没有复习记录', hint);
      return;
    }

    let html = '';
    if (this.reviewFilter === 'overview') {
      const total = groups.overdue.length + groups.today.length;
      html += `<div style="padding:8px 12px;margin-bottom:8px;background:#fff7ed;border-radius:6px;border:1px solid #fed7aa;font-size:12px;color:#92400e;">
        🔥 <strong>今日总览</strong>：共 ${total} 项需要复习（已过期 ${groups.overdue.length}，今天到期 ${groups.today.length}），覆盖所有课程
      </div>`;
    }

    for (const g of activeGroups) {
      const items = groups[g];
      if (items.length === 0) continue;
      const meta = groupTitles[g];
      html += `<div class="review-group ${meta.cls}">`;
      html += `<div class="review-group-title"><span>${meta.label}</span><span class="count-badge">${items.length}</span></div>`;

      for (const r of items) {
        const overdue = g === 'overdue';
        const statusClass = overdue ? 'review-overdue' : (r.status === 'mastered' ? 'review-mastered' : 'review-pending');
        const statusText = overdue ? '已过期' : (r.status === 'mastered' ? '已掌握' : '待复习');
        const course = this.courses.find(c => c.id === r.courseId);
        const isMastered = r.status === 'mastered';

        html += `
          <div class="list-item" data-id="${r.id}">
            <div class="item-header">
              <span class="item-title">${this.escapeHtml(r.title || '未命名复习项')}</span>
              <span class="review-status ${statusClass}">${statusText}</span>
            </div>
            ${r.description ? `<div class="item-content">${this.escapeHtml(r.description)}</div>` : ''}
            <div class="item-meta">
              <div class="item-tags">
                <span class="tag">${course ? this.escapeHtml(course.title) : '未知课程'}</span>
                ${r.timestamp != null ? `<span class="tag" style="cursor:pointer" data-action="jump" data-time="${r.timestamp}" data-course="${r.courseId}">📍 ${this.formatTime(r.timestamp)}</span>` : ''}
                ${r.nextReviewAt ? `<span class="tag">⏰ ${new Date(r.nextReviewAt).toLocaleDateString()}</span>` : ''}
              </div>
              <div class="item-actions">
                ${!isMastered ? `<button class="item-action" data-action="schedule" title="标记已复习并设置下次提醒">📅</button>` : ''}
                <button class="item-action" data-action="toggleStatus" title="${isMastered ? '恢复为待复习' : '标记为已掌握'}">${isMastered ? '↩️' : '✅'}</button>
                <button class="item-action" data-action="edit" title="编辑">✏️</button>
                <button class="item-action" data-action="delete" title="删除">🗑️</button>
              </div>
            </div>
          </div>
        `;
      }

      html += `</div>`;
    }

    container.innerHTML = html;
    this.bindReviewEvents(container);
  },

  bindReviewEvents(container) {
    container.querySelectorAll('.list-item').forEach(item => {
      const id = item.dataset.id;
      item.querySelector('[data-action="jump"]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.jumpToTimestampForCourse(e.currentTarget.dataset.course, parseFloat(e.currentTarget.dataset.time));
      });
      item.querySelector('[data-action="schedule"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showReviewSchedulerModal(id);
      });
      item.querySelector('[data-action="toggleStatus"]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const resp = await chrome.runtime.sendMessage({ action: 'getReviews', filter: {} });
        const review = resp?.data?.find(r => r.id === id);
        if (review) {
          review.status = review.status === 'mastered' ? 'pending' : 'mastered';
          if (review.status === 'mastered') {
            review.masteredAt = Date.now();
          } else {
            review.masteredAt = null;
          }
          await chrome.runtime.sendMessage({ action: 'saveReview', review });
          this.renderReviews();
          this.showToast(review.status === 'mastered' ? '已标记为已掌握' : '已恢复为待复习');
        }
      });
      item.querySelector('[data-action="edit"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showReviewEditModal(id);
      });
      item.querySelector('[data-action="delete"]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('确定删除这条复习记录吗？')) {
          await chrome.runtime.sendMessage({ action: 'deleteReview', reviewId: id });
          this.renderReviews();
          this.showToast('已删除');
        }
      });
    });
  },

  showReviewSchedulerModal(reviewId) {
    this.showModal(`
      <div class="modal-header">
        <h3>📅 标记已复习</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <div class="modal-body">
        <p style="font-size:13px;color:#6b7280;margin-bottom:12px;">
          选择下次复习的提醒时间：
        </p>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <label class="format-option" style="padding:10px 12px;">
            <input type="radio" name="schedOption" value="1" /> ⏰ 明天再复习
          </label>
          <label class="format-option" style="padding:10px 12px;">
            <input type="radio" name="schedOption" value="3" /> 🗓️ 3 天后再复习
          </label>
          <label class="format-option" style="padding:10px 12px;">
            <input type="radio" name="schedOption" value="7" checked /> 📆 1 周后再复习
          </label>
          <label class="format-option" style="padding:10px 12px;">
            <input type="radio" name="schedOption" value="custom" /> ✏️ 自定义日期
          </label>
        </div>
        <div class="form-group" id="customDateGroup" style="margin-top:12px;display:none;">
          <label>选择下次复习日期</label>
          <input type="date" id="customReviewDate" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close style="margin:0;width:auto;padding:8px 16px;background:#f3f4f6;border:1px solid #e5e7eb;">取消</button>
        <button class="btn-primary" id="confirmScheduleBtn">确认</button>
      </div>
    `);

    const radios = document.querySelectorAll('input[name="schedOption"]');
    const customGroup = document.getElementById('customDateGroup');
    radios.forEach(r => {
      r.addEventListener('change', () => {
        customGroup.style.display = document.querySelector('input[name="schedOption"]:checked').value === 'custom' ? 'block' : 'none';
      });
    });

    document.getElementById('confirmScheduleBtn').addEventListener('click', async () => {
      const val = document.querySelector('input[name="schedOption"]:checked').value;
      let nextDate;
      if (val === 'custom') {
        const dateVal = document.getElementById('customReviewDate').value;
        if (!dateVal) {
          this.showToast('请选择日期');
          return;
        }
        nextDate = new Date(dateVal);
      } else {
        nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + parseInt(val));
      }
      nextDate.setHours(9, 0, 0, 0);

      const resp = await chrome.runtime.sendMessage({ action: 'getReviews', filter: {} });
      const review = resp?.data?.find(r => r.id === reviewId);
      if (review) {
        review.nextReviewAt = nextDate.getTime();
        review.status = 'pending';
        review.masteredAt = null;
        review.lastReviewedAt = Date.now();
        if (!review.reviewCount) review.reviewCount = 0;
        review.reviewCount++;
        await chrome.runtime.sendMessage({ action: 'saveReview', review });
        this.closeModal();
        this.renderReviews();
        this.showToast(`已安排下次复习：${nextDate.toLocaleDateString()}`);
      }
    });

    this.bindCloseEvents();
  },

  async jumpToTimestamp(timestamp) {
    await this.jumpToTimestampForCourse(this.currentCourseId, timestamp);
  },

  async jumpToTimestampForCourse(courseId, timestamp) {
    const course = this.courses.find(c => c.id === courseId);
    if (!course?.url) {
      this.showToast('无法跳转到视频位置：课程 URL 缺失');
      return;
    }
    try {
      const baseUrl = course.url.split('#')[0].split('?')[0];
      const tabs = await chrome.tabs.query({ url: baseUrl + '*' });
      let targetTab = tabs.find(t => t.url === course.url) || tabs[0];

      if (!targetTab) {
        targetTab = await chrome.tabs.create({ url: course.url });
        await new Promise(r => setTimeout(r, 2500));
      } else {
        await chrome.tabs.update(targetTab.id, { active: true });
        await chrome.windows.update(targetTab.windowId, { focused: true });
      }

      await chrome.tabs.sendMessage(targetTab.id, { action: 'jumpToTimestamp', timestamp }).catch(() => {});
      this.showToast(`已跳转到 ${this.formatTime(timestamp)}`);
    } catch (e) {
      this.showToast('跳转失败: ' + e.message);
    }
  },

  showCourseModal() {
    this.showModal(`
      <div class="modal-header">
        <h3>➕ 新建课程</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>课程名称</label>
          <input type="text" id="courseName" placeholder="请输入课程名称" />
        </div>
        <div class="form-group">
          <label>课程链接</label>
          <input type="url" id="courseUrl" placeholder="https://..." />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close style="margin:0;width:auto;padding:8px 16px;background:#f3f4f6;border:1px solid #e5e7eb;">取消</button>
        <button class="btn-primary" id="saveCourseBtn">保存</button>
      </div>
    `);

    document.getElementById('saveCourseBtn').addEventListener('click', async () => {
      const title = document.getElementById('courseName').value.trim();
      const url = document.getElementById('courseUrl').value.trim();
      if (!title) {
        this.showToast('请输入课程名称');
        return;
      }
      await chrome.runtime.sendMessage({
        action: 'saveCourse',
        course: { title, url }
      });
      this.closeModal();
      await this.loadCourses();
      this.currentCourseId = this.courses[this.courses.length - 1]?.id;
      this.currentChapterId = this.courses[this.courses.length - 1]?.chapters?.[0]?.id;
      this.renderCourseSelect();
      this.renderChapterSelect();
      this.populateExportCourseSelect();
      this.renderCurrentTab();
      this.showToast('课程已创建');
    });

    this.bindCloseEvents();
    document.getElementById('courseName').focus();
  },

  showChapterModal() {
    if (!this.currentCourseId) {
      this.showToast('请先选择课程');
      return;
    }
    this.showModal(`
      <div class="modal-header">
        <h3>➕ 新建章节</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>章节名称</label>
          <input type="text" id="chapterName" placeholder="请输入章节名称" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close style="margin:0;width:auto;padding:8px 16px;background:#f3f4f6;border:1px solid #e5e7eb;">取消</button>
        <button class="btn-primary" id="saveChapterBtn">保存</button>
      </div>
    `);

    document.getElementById('saveChapterBtn').addEventListener('click', async () => {
      const title = document.getElementById('chapterName').value.trim();
      if (!title) {
        this.showToast('请输入章节名称');
        return;
      }
      const course = this.courses.find(c => c.id === this.currentCourseId);
      if (course) {
        if (!course.chapters) course.chapters = [];
        course.chapters.push({ id: Date.now().toString(36), title, createdAt: Date.now() });
        await chrome.runtime.sendMessage({ action: 'saveCourse', course });
        this.currentChapterId = course.chapters[course.chapters.length - 1].id;
      }
      this.closeModal();
      await this.loadCourses();
      this.renderChapterSelect();
      this.renderCurrentTab();
      this.showToast('章节已创建');
    });

    this.bindCloseEvents();
    document.getElementById('chapterName').focus();
  },

  async showNoteEditModal(noteId) {
    const resp = await chrome.runtime.sendMessage({ action: 'getNotes', filter: {} });
    const note = resp?.data?.find(n => n.id === noteId);
    if (!note) return;

    this.showModal(`
      <div class="modal-header">
        <h3>✏️ 编辑笔记</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>时间点 (秒)</label>
          <input type="number" id="noteTimestamp" step="0.1" value="${note.timestamp || 0}" />
        </div>
        <div class="form-group">
          <label>笔记内容</label>
          <textarea id="noteContent" rows="5">${this.escapeHtml(note.content || '')}</textarea>
        </div>
        <div class="form-group">
          <label>标签（用逗号分隔）</label>
          <input type="text" id="noteTags" value="${(note.tags || []).join(', ')}" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close style="margin:0;width:auto;padding:8px 16px;background:#f3f4f6;border:1px solid #e5e7eb;">取消</button>
        <button class="btn-primary" id="saveNoteBtn">保存</button>
      </div>
    `);

    document.getElementById('saveNoteBtn').addEventListener('click', async () => {
      note.timestamp = parseFloat(document.getElementById('noteTimestamp').value) || 0;
      note.content = document.getElementById('noteContent').value.trim();
      const tagsStr = document.getElementById('noteTags').value.trim();
      note.tags = tagsStr ? tagsStr.split(/[,，]/).map(t => t.trim()).filter(Boolean) : [];
      if (!note.content) {
        this.showToast('请输入笔记内容');
        return;
      }
      await chrome.runtime.sendMessage({ action: 'saveNote', note });
      this.closeModal();
      this.renderNotes();
      this.showToast('已保存');
    });

    this.bindCloseEvents();
  },

  async showBookmarkEditModal(bookmarkId) {
    const resp = await chrome.runtime.sendMessage({ action: 'getBookmarks', filter: {} });
    const bookmark = resp?.data?.find(b => b.id === bookmarkId);
    if (!bookmark) return;

    this.showModal(`
      <div class="modal-header">
        <h3>✏️ 编辑书签</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>标题</label>
          <input type="text" id="bmTitle" value="${this.escapeHtml(bookmark.title || '')}" />
        </div>
        <div class="form-group">
          <label>时间点 (秒)</label>
          <input type="number" id="bmTimestamp" step="0.1" value="${bookmark.timestamp || 0}" />
        </div>
        <div class="form-group">
          <label>描述</label>
          <textarea id="bmDesc" rows="3">${this.escapeHtml(bookmark.description || '')}</textarea>
        </div>
        <div class="form-group">
          <label>标签（用逗号分隔）</label>
          <input type="text" id="bmTags" value="${(bookmark.tags || []).join(', ')}" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close style="margin:0;width:auto;padding:8px 16px;background:#f3f4f6;border:1px solid #e5e7eb;">取消</button>
        <button class="btn-primary" id="saveBmBtn">保存</button>
      </div>
    `);

    document.getElementById('saveBmBtn').addEventListener('click', async () => {
      bookmark.title = document.getElementById('bmTitle').value.trim() || '未命名书签';
      bookmark.timestamp = parseFloat(document.getElementById('bmTimestamp').value) || 0;
      bookmark.description = document.getElementById('bmDesc').value.trim();
      const tagsStr = document.getElementById('bmTags').value.trim();
      bookmark.tags = tagsStr ? tagsStr.split(/[,，]/).map(t => t.trim()).filter(Boolean) : [];
      await chrome.runtime.sendMessage({ action: 'saveBookmark', bookmark });
      this.closeModal();
      this.renderBookmarks();
      this.showToast('已保存');
    });

    this.bindCloseEvents();
  },

  showReviewModal(prefill = {}) {
    const days = this.currentSettings?.reviewReminderDays || 7;
    const defaultDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const dateStr = defaultDate.toISOString().split('T')[0];

    this.showModal(`
      <div class="modal-header">
        <h3>🔁 添加复习计划</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>标题</label>
          <input type="text" id="reviewTitle" value="${this.escapeHtml(prefill.title || '')}" placeholder="复习内容标题" />
        </div>
        <div class="form-group">
          <label>描述</label>
          <textarea id="reviewDesc" rows="3" placeholder="复习要点...">${this.escapeHtml(prefill.description || '')}</textarea>
        </div>
        <div class="form-group">
          <label>下次复习日期</label>
          <input type="date" id="reviewDate" value="${dateStr}" />
        </div>
        <div class="form-group">
          <label>状态</label>
          <select id="reviewStatus">
            <option value="pending">待复习</option>
            <option value="mastered">已掌握</option>
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close style="margin:0;width:auto;padding:8px 16px;background:#f3f4f6;border:1px solid #e5e7eb;">取消</button>
        <button class="btn-primary" id="saveReviewBtn">保存</button>
      </div>
    `);

    document.getElementById('saveReviewBtn').addEventListener('click', async () => {
      const title = document.getElementById('reviewTitle').value.trim();
      if (!title) {
        this.showToast('请输入标题');
        return;
      }
      const review = {
        courseId: prefill.courseId || this.currentCourseId,
        chapterId: prefill.chapterId || this.currentChapterId,
        title,
        description: document.getElementById('reviewDesc').value.trim(),
        timestamp: prefill.timestamp,
        status: document.getElementById('reviewStatus').value,
        nextReviewAt: new Date(document.getElementById('reviewDate').value).getTime(),
        sourceType: prefill.sourceType,
        sourceId: prefill.sourceId
      };
      await chrome.runtime.sendMessage({ action: 'saveReview', review });
      this.closeModal();
      this.renderReviews();
      this.showToast('已加入复习计划');
    });

    this.bindCloseEvents();
  },

  async showReviewEditModal(reviewId) {
    const resp = await chrome.runtime.sendMessage({ action: 'getReviews', filter: {} });
    const review = resp?.data?.find(r => r.id === reviewId);
    if (!review) return;

    const dateStr = review.nextReviewAt ? new Date(review.nextReviewAt).toISOString().split('T')[0] : '';

    this.showModal(`
      <div class="modal-header">
        <h3>✏️ 编辑复习计划</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>标题</label>
          <input type="text" id="reviewTitle" value="${this.escapeHtml(review.title || '')}" />
        </div>
        <div class="form-group">
          <label>描述</label>
          <textarea id="reviewDesc" rows="3">${this.escapeHtml(review.description || '')}</textarea>
        </div>
        <div class="form-group">
          <label>下次复习日期</label>
          <input type="date" id="reviewDate" value="${dateStr}" />
        </div>
        <div class="form-group">
          <label>状态</label>
          <select id="reviewStatus">
            <option value="pending" ${review.status === 'pending' ? 'selected' : ''}>待复习</option>
            <option value="mastered" ${review.status === 'mastered' ? 'selected' : ''}>已掌握</option>
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close style="margin:0;width:auto;padding:8px 16px;background:#f3f4f6;border:1px solid #e5e7eb;">取消</button>
        <button class="btn-primary" id="saveReviewBtn">保存</button>
      </div>
    `);

    document.getElementById('saveReviewBtn').addEventListener('click', async () => {
      review.title = document.getElementById('reviewTitle').value.trim() || '未命名';
      review.description = document.getElementById('reviewDesc').value.trim();
      review.status = document.getElementById('reviewStatus').value;
      const dateVal = document.getElementById('reviewDate').value;
      review.nextReviewAt = dateVal ? new Date(dateVal).getTime() : null;
      if (review.status === 'mastered') review.masteredAt = Date.now();
      await chrome.runtime.sendMessage({ action: 'saveReview', review });
      this.closeModal();
      this.renderReviews();
      this.showToast('已保存');
    });

    this.bindCloseEvents();
  },

  async showScreenshotPreview(screenshotId) {
    const resp = await chrome.runtime.sendMessage({ action: 'getScreenshots', filter: {} });
    const ss = resp?.data?.find(s => s.id === screenshotId);
    if (!ss) return;

    this.showModal(`
      <div class="modal-header">
        <h3>📷 ${this.escapeHtml(ss.title || '截图')}</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <div class="modal-body">
        <img class="screenshot-preview-img" src="${ss.annotatedData || ss.imageData}" />
        <div class="form-group" style="margin-top:16px;">
          <label>标题</label>
          <input type="text" id="ssTitle" value="${this.escapeHtml(ss.title || '')}" />
        </div>
        <div class="form-group">
          <label>描述</label>
          <textarea id="ssDesc" rows="2">${this.escapeHtml(ss.description || '')}</textarea>
        </div>
        <p style="font-size:12px;color:#6b7280;">
          ⏱️ 时间点：<span style="cursor:pointer;color:#4f46e5;text-decoration:underline" id="ssJump">${this.formatTime(ss.timestamp)}</span>
        </p>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close style="margin:0;width:auto;padding:8px 16px;background:#f3f4f6;border:1px solid #e5e7eb;">关闭</button>
        <button class="btn-secondary" id="reviewSsBtn" style="margin:0;width:auto;padding:8px 16px;background:#dbeafe;color:#1e40af;border:1px solid #93c5fd;">🔁 加入复习</button>
        <button class="btn-danger-outline" id="deleteSsBtn" style="margin:0;width:auto;padding:8px 16px;background:white;color:#ef4444;border:1px solid #fecaca;">删除</button>
        <button class="btn-primary" id="saveSsBtn">保存</button>
      </div>
    `);

    document.querySelector('.modal').classList.add('screenshot-preview-modal');

    document.getElementById('ssJump').addEventListener('click', async () => {
      await this.jumpToTimestampForCourse(ss.courseId, ss.timestamp);
    });

    document.getElementById('reviewSsBtn').addEventListener('click', () => {
      this.closeModal();
      this.showReviewModal({
        courseId: ss.courseId,
        chapterId: ss.chapterId,
        title: ss.title || '截图复习',
        description: ss.description,
        timestamp: ss.timestamp,
        sourceType: 'screenshot',
        sourceId: ss.id
      });
    });

    document.getElementById('saveSsBtn').addEventListener('click', async () => {
      ss.title = document.getElementById('ssTitle').value.trim() || '未命名截图';
      ss.description = document.getElementById('ssDesc').value.trim();
      await chrome.runtime.sendMessage({ action: 'saveScreenshot', screenshot: ss });
      this.closeModal();
      this.renderScreenshots();
      this.showToast('已保存');
    });

    document.getElementById('deleteSsBtn').addEventListener('click', async () => {
      if (confirm('确定删除这张截图吗？')) {
        await chrome.runtime.sendMessage({ action: 'deleteScreenshot', screenshotId: ss.id });
        this.closeModal();
        this.renderScreenshots();
        this.showToast('已删除');
      }
    });

    this.bindCloseEvents();
  },

  showModal(html) {
    const overlay = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    content.innerHTML = html;
    content.classList.remove('screenshot-preview-modal');
    overlay.style.display = 'flex';
  },

  closeModal() {
    document.getElementById('modalOverlay').style.display = 'none';
  },

  bindCloseEvents() {
    const overlay = document.getElementById('modalOverlay');
    overlay.querySelectorAll('[data-close]').forEach(el => {
      el.addEventListener('click', () => this.closeModal());
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeModal();
    });
  },

  getEmptyState(icon, title, hint) {
    return `
      <div class="empty-state">
        <div class="empty-icon">${icon}</div>
        <p>${title}</p>
        ${hint ? `<p class="empty-hint">${hint}</p>` : ''}
      </div>
    `;
  },

  formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  },

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  showToast(message) {
    let toast = document.getElementById('appToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'appToast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 2200);
  }
};

document.addEventListener('DOMContentLoaded', () => SidebarApp.init());
