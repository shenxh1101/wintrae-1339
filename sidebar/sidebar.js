const SidebarApp = {
  courses: [],
  currentCourseId: null,
  currentChapterId: null,
  activeTab: 'notes',
  reviewFilter: 'all',

  async init() {
    await this.loadCourses();
    this.setupTabs();
    this.setupEventListeners();
    this.renderCurrentTab();
    this.loadSettings();
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
      this.renderCurrentTab();
      this.showToast('数据已刷新');
    });

    this.setupSettingsListeners();
  },

  setupSettingsListeners() {
    document.getElementById('settingFloatWindow').addEventListener('change', async (e) => {
      await chrome.runtime.sendMessage({
        action: 'saveSettings',
        settings: { floatWindowVisible: e.target.checked }
      });
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { action: 'toggleFloatWindow', visible: e.target.checked }).catch(() => {});
      }
    });

    document.getElementById('settingAutoDetect').addEventListener('change', async (e) => {
      await chrome.runtime.sendMessage({
        action: 'saveSettings',
        settings: { autoDetectVideo: e.target.checked }
      });
    });

    document.getElementById('settingReminderDays').addEventListener('change', async (e) => {
      await chrome.runtime.sendMessage({
        action: 'saveSettings',
        settings: { reviewReminderDays: parseInt(e.target.value) || 7 }
      });
    });

    document.getElementById('btnExportAll').addEventListener('click', async () => {
      try {
        const { Storage } = window;
        if (Storage) {
          await Storage.exportAllData();
          this.showToast('数据已导出');
        }
      } catch (e) {
        this.showToast('导出失败: ' + e.message);
      }
    });

    document.getElementById('btnExportNotes').addEventListener('click', async () => {
      try {
        const { Storage } = window;
        if (Storage) {
          await Storage.exportNotes(this.currentCourseId);
          this.showToast('笔记已导出');
        }
      } catch (e) {
        this.showToast('导出失败: ' + e.message);
      }
    });

    document.getElementById('btnCleanCourses').addEventListener('click', async () => {
      if (!confirm('确定要清理没有任何数据的课程记录吗？')) return;
      const resp = await chrome.runtime.sendMessage({ action: 'clearInvalidCourses' });
      if (resp?.data) {
        this.showToast(`已清理 ${resp.data.removed} 条无效记录`);
        await this.loadCourses();
      }
    });

    document.getElementById('btnClearAll').addEventListener('click', async () => {
      if (!confirm('确定要清空所有数据吗？此操作不可撤销！')) return;
      if (!confirm('再次确认：所有笔记、书签、截图、复习记录将全部删除！')) return;
      try {
        await chrome.storage.local.clear();
        this.showToast('所有数据已清空');
        await this.loadCourses();
        this.renderCurrentTab();
      } catch (e) {
        this.showToast('清空失败: ' + e.message);
      }
    });
  },

  async loadSettings() {
    const resp = await chrome.runtime.sendMessage({ action: 'getSettings' });
    const settings = resp?.data || {};
    document.getElementById('settingFloatWindow').checked = settings.floatWindowVisible !== false;
    document.getElementById('settingAutoDetect').checked = settings.autoDetectVideo !== false;
    document.getElementById('settingReminderDays').value = settings.reviewReminderDays || 7;
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
      container.innerHTML = this.getEmptyState('📝', '还没有笔记', '使用 Ctrl+Shift+N 快速记录');
      return;
    }

    container.innerHTML = notes.map(note => `
      <div class="list-item" data-id="${note.id}">
        <div class="item-header">
          <span class="item-title">${this.escapeHtml(note.content?.substring(0, 50) || '无内容')}${note.content?.length > 50 ? '...' : ''}</span>
          <span class="item-time" data-action="jump" data-time="${note.timestamp}">${this.formatTime(note.timestamp)}</span>
        </div>
        ${note.content?.length > 50 ? `<div class="item-content">${this.escapeHtml(note.content)}</div>` : ''}
        <div class="item-meta">
          <div class="item-tags">
            ${(note.tags || []).map(t => `<span class="tag">${this.escapeHtml(t)}</span>`).join('')}
          </div>
          <div class="item-actions">
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
        await this.jumpToTimestamp(parseFloat(e.currentTarget.dataset.time));
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
      container.innerHTML = this.getEmptyState('🔖', '还没有书签', '使用 Ctrl+Shift+B 快速添加');
      return;
    }

    container.innerHTML = bookmarks.map(bm => `
      <div class="list-item" data-id="${bm.id}">
        <div class="item-header">
          <span class="item-title">${this.escapeHtml(bm.title || '未命名书签')}</span>
          <span class="item-time" data-action="jump" data-time="${bm.timestamp}">${this.formatTime(bm.timestamp)}</span>
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
        await this.jumpToTimestamp(parseFloat(e.currentTarget.dataset.time));
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
      container.innerHTML = this.getEmptyState('📷', '还没有截图', '使用 Ctrl+Shift+S 截取画面');
      return;
    }

    container.innerHTML = screenshots.map(ss => `
      <div class="screenshot-card" data-id="${ss.id}">
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
    const filter = this.reviewFilter === 'all' ? {} : { status: this.reviewFilter };
    if (this.currentCourseId && this.reviewFilter === 'all') {
      filter.courseId = this.currentCourseId;
    }
    const resp = await chrome.runtime.sendMessage({ action: 'getReviews', filter });
    const reviews = resp?.data || [];

    if (reviews.length === 0) {
      container.innerHTML = this.getEmptyState('🔁', '没有复习记录', '点击上方按钮添加复习计划');
      return;
    }

    const now = Date.now();
    container.innerHTML = reviews.map(r => {
      const overdue = r.nextReviewAt && r.nextReviewAt < now && r.status === 'pending';
      const statusClass = overdue ? 'review-overdue' : (r.status === 'mastered' ? 'review-mastered' : 'review-pending');
      const statusText = overdue ? '已过期' : (r.status === 'mastered' ? '已掌握' : '待复习');
      const course = this.courses.find(c => c.id === r.courseId);

      return `
        <div class="list-item" data-id="${r.id}">
          <div class="item-header">
            <span class="item-title">${this.escapeHtml(r.title || '未命名复习项')}</span>
            <span class="review-status ${statusClass}">${statusText}</span>
          </div>
          ${r.description ? `<div class="item-content">${this.escapeHtml(r.description)}</div>` : ''}
          <div class="item-meta">
            <div class="item-tags">
              <span class="tag">${course ? this.escapeHtml(course.title) : '未知课程'}</span>
              ${r.timestamp != null ? `<span class="tag" style="cursor:pointer" data-action="jump" data-time="${r.timestamp}">📍 ${this.formatTime(r.timestamp)}</span>` : ''}
              ${r.nextReviewAt ? `<span class="tag">⏰ ${new Date(r.nextReviewAt).toLocaleDateString()}</span>` : ''}
            </div>
            <div class="item-actions">
              <button class="item-action" data-action="toggleStatus" title="切换状态">${r.status === 'mastered' ? '↩️' : '✅'}</button>
              <button class="item-action" data-action="edit" title="编辑">✏️</button>
              <button class="item-action" data-action="delete" title="删除">🗑️</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    this.bindReviewEvents(container);
  },

  bindReviewEvents(container) {
    container.querySelectorAll('.list-item').forEach(item => {
      const id = item.dataset.id;
      item.querySelector('[data-action="jump"]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.jumpToTimestamp(parseFloat(e.currentTarget.dataset.time));
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

  async jumpToTimestamp(timestamp) {
    const course = this.courses.find(c => c.id === this.currentCourseId);
    if (course?.url) {
      const tabs = await chrome.tabs.query({ url: course.url.split('#')[0].split('?')[0] + '*' });
      let targetTab = tabs.find(t => t.url === course.url) || tabs[0];

      if (!targetTab) {
        targetTab = await chrome.tabs.create({ url: course.url });
        await new Promise(r => setTimeout(r, 2000));
      } else {
        await chrome.tabs.update(targetTab.id, { active: true });
      }

      await chrome.tabs.sendMessage(targetTab.id, { action: 'jumpToTimestamp', timestamp }).catch(() => {});
    } else {
      this.showToast('无法跳转到视频位置');
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
    const settingsResp = chrome.runtime.sendMessage({ action: 'getSettings' });
    settingsResp.then(settingsData => {
      const days = settingsData?.data?.reviewReminderDays || 7;
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
        this.showToast('已添加');
      });

      this.bindCloseEvents();
    });
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
        <p style="font-size:12px;color:#6b7280;">⏱️ 时间点：${this.formatTime(ss.timestamp)}</p>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-close style="margin:0;width:auto;padding:8px 16px;background:#f3f4f6;border:1px solid #e5e7eb;">关闭</button>
        <button class="btn-danger-outline" id="deleteSsBtn" style="margin:0;width:auto;padding:8px 16px;background:white;color:#ef4444;border:1px solid #fecaca;">删除</button>
        <button class="btn-primary" id="saveSsBtn">保存</button>
      </div>
    `);

    document.querySelector('.modal').classList.add('screenshot-preview-modal');

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
    toast._timer = setTimeout(() => toast.classList.remove('show'), 2000);
  }
};

document.addEventListener('DOMContentLoaded', () => SidebarApp.init());
