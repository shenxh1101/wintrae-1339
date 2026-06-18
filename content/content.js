const StudyNoteContent = {
  videoElement: null,
  floatWindow: null,
  currentCourse: null,
  settings: null,
  lastTimestamp: 0,

  async init() {
    await this.loadSettings();
    this.detectVideo();
    this.setupMutationObserver();
    this.setupMessageListener();

    if (this.settings?.floatWindowVisible !== false) {
      if (document.readyState === 'complete') {
        this.injectFloatWindow();
      } else {
        window.addEventListener('load', () => this.injectFloatWindow());
      }
    }
  },

  async loadSettings() {
    try {
      const resp = await chrome.runtime.sendMessage({ action: 'getSettings' });
      if (resp && resp.success) {
        this.settings = resp.data;
      }
    } catch (e) {
      console.error('Load settings failed:', e);
    }
  },

  detectVideo() {
    const videos = document.querySelectorAll('video');
    if (videos.length > 0) {
      this.videoElement = videos[0];
      return true;
    }
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        const iframeVideos = iframe.contentDocument?.querySelectorAll('video');
        if (iframeVideos && iframeVideos.length > 0) {
          this.videoElement = iframeVideos[0];
          return true;
        }
      } catch (e) {
      }
    }
    return false;
  },

  setupMutationObserver() {
    const observer = new MutationObserver(() => {
      if (!this.videoElement) {
        this.detectVideo();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  },

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      this.handleMessage(msg).then(result => {
        sendResponse({ success: true, data: result });
      }).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;
    });
  },

  async handleMessage(msg) {
    switch (msg.action) {
      case 'quickNote':
        return await this.quickNote();
      case 'quickBookmark':
        return await this.quickBookmark();
      case 'quickScreenshot':
        return await this.quickScreenshot();
      case 'jumpToTimestamp':
        return this.jumpToTimestamp(msg.timestamp);
      case 'getVideoInfo':
        return this.getVideoInfo();
      case 'showNotification':
        return this.showNotification(msg.message);
      case 'toggleFloatWindow':
        return this.toggleFloatWindow(msg.visible);
      case 'getScreenshotFromVideo':
        return this.captureVideoFrame();
      default:
        throw new Error('Unknown action: ' + msg.action);
    }
  },

  getVideoInfo() {
    if (!this.videoElement) this.detectVideo();
    return {
      hasVideo: !!this.videoElement,
      currentTime: this.videoElement?.currentTime || 0,
      duration: this.videoElement?.duration || 0,
      title: document.title,
      url: location.href
    };
  },

  async getCurrentCourse() {
    if (this.currentCourse && this.currentCourse.url === location.href) {
      return this.currentCourse;
    }
    const resp = await chrome.runtime.sendMessage({
      action: 'findOrCreateCourse',
      url: location.href,
      title: document.title
    });
    if (resp && resp.success) {
      this.currentCourse = resp.data;
      return this.currentCourse;
    }
    return null;
  },

  getCurrentTimestamp() {
    if (!this.videoElement) this.detectVideo();
    return this.videoElement?.currentTime || 0;
  },

  jumpToTimestamp(timestamp) {
    if (!this.videoElement) this.detectVideo();
    if (this.videoElement) {
      this.videoElement.currentTime = timestamp;
      this.videoElement.play().catch(() => {});
      return true;
    }
    return false;
  },

  async quickNote() {
    const course = await this.getCurrentCourse();
    const timestamp = this.getCurrentTimestamp();
    if (!course) throw new Error('无法获取课程信息');

    const note = {
      courseId: course.id,
      chapterId: course.chapters?.[0]?.id,
      content: '',
      timestamp,
      tags: []
    };

    this.showNoteDialog(note);
    return { success: true, timestamp };
  },

  async quickBookmark() {
    const course = await this.getCurrentCourse();
    const timestamp = this.getCurrentTimestamp();
    if (!course) throw new Error('无法获取课程信息');

    const bookmark = {
      courseId: course.id,
      chapterId: course.chapters?.[0]?.id,
      title: `书签 ${this.formatTime(timestamp)}`,
      description: '',
      timestamp,
      tags: []
    };

    const resp = await chrome.runtime.sendMessage({
      action: 'saveBookmark',
      bookmark
    });

    this.showNotification(`书签已保存: ${this.formatTime(timestamp)}`);
    return resp.data;
  },

  async quickScreenshot() {
    const course = await this.getCurrentCourse();
    const timestamp = this.getCurrentTimestamp();
    if (!course) throw new Error('无法获取课程信息');

    let imageData = null;
    try {
      const resp = await chrome.runtime.sendMessage({ action: 'captureTab' });
      if (resp && resp.success) {
        imageData = resp.data;
      }
    } catch (e) {
      imageData = this.captureVideoFrame();
    }

    if (!imageData) {
      imageData = this.captureVideoFrame();
    }

    if (!imageData) {
      throw new Error('截图失败，请重试');
    }

    const screenshot = {
      courseId: course.id,
      chapterId: course.chapters?.[0]?.id,
      imageData,
      annotatedData: null,
      timestamp,
      title: `截图 ${this.formatTime(timestamp)}`,
      description: '',
      annotations: []
    };

    this.openAnnotationEditor(screenshot);
    return { success: true };
  },

  captureVideoFrame() {
    if (!this.videoElement) this.detectVideo();
    if (!this.videoElement) return null;

    try {
      const canvas = document.createElement('canvas');
      const video = this.videoElement;
      const scale = 1;
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png');
    } catch (e) {
      console.error('Capture video frame failed:', e);
      return null;
    }
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

  showNotification(message) {
    let notif = document.getElementById('study-note-notification');
    if (!notif) {
      notif = document.createElement('div');
      notif.id = 'study-note-notification';
      notif.className = 'study-note-notification';
      document.body.appendChild(notif);
    }
    notif.textContent = message;
    notif.classList.add('show');
    clearTimeout(notif._timer);
    notif._timer = setTimeout(() => {
      notif.classList.remove('show');
    }, 2000);
  },

  injectFloatWindow() {
    if (this.floatWindow || !this.settings?.floatWindowVisible) return;
    if (document.getElementById('study-note-float-window')) return;

    const shortcuts = (this.settings && this.settings.shortcuts) || {
      quickNote: 'Ctrl+Shift+N',
      quickBookmark: 'Ctrl+Shift+B',
      quickScreenshot: 'Ctrl+Shift+S',
      toggleSidebar: 'Ctrl+Shift+P'
    };

    this.floatWindow = document.createElement('div');
    this.floatWindow.id = 'study-note-float-window';
    this.floatWindow.className = 'study-note-float-window';
    this.floatWindow.innerHTML = `
      <div class="study-note-float-header" id="study-note-float-header">
        <span class="study-note-float-title">📝 笔记助手</span>
        <button class="study-note-float-close" id="study-note-float-close" title="隐藏">×</button>
      </div>
      <div class="study-note-float-body">
        <button class="study-note-float-btn" id="study-note-btn-note" title="快速笔记 (${shortcuts.quickNote})">
          <span class="study-note-icon">📝</span>
          <span class="study-note-label">笔记</span>
        </button>
        <button class="study-note-float-btn" id="study-note-btn-bookmark" title="添加书签 (${shortcuts.quickBookmark})">
          <span class="study-note-icon">🔖</span>
          <span class="study-note-label">书签</span>
        </button>
        <button class="study-note-float-btn" id="study-note-btn-screenshot" title="截图 (${shortcuts.quickScreenshot})">
          <span class="study-note-icon">📷</span>
          <span class="study-note-label">截图</span>
        </button>
        <button class="study-note-float-btn" id="study-note-btn-sidebar" title="打开侧边栏 (${shortcuts.toggleSidebar})">
          <span class="study-note-icon">📋</span>
          <span class="study-note-label">列表</span>
        </button>
      </div>
    `;
    document.body.appendChild(this.floatWindow);

    this.makeDraggable(this.floatWindow, this.floatWindow.querySelector('#study-note-float-header'));

    this.floatWindow.querySelector('#study-note-btn-note').addEventListener('click', () => this.quickNote());
    this.floatWindow.querySelector('#study-note-btn-bookmark').addEventListener('click', () => this.quickBookmark());
    this.floatWindow.querySelector('#study-note-btn-screenshot').addEventListener('click', () => this.quickScreenshot());
    this.floatWindow.querySelector('#study-note-btn-sidebar').addEventListener('click', async () => {
      const ok = await chrome.runtime.sendMessage({ action: 'openSidebar' }).catch(() => false);
      if (!ok) {
        this.showNotification('打开侧边栏失败，请尝试点击扩展图标');
      }
    });
    this.floatWindow.querySelector('#study-note-float-close').addEventListener('click', async () => {
      this.floatWindow.style.display = 'none';
      try {
        await chrome.runtime.sendMessage({
          action: 'saveSettings',
          settings: { floatWindowVisible: false }
        });
        if (this.settings) this.settings.floatWindowVisible = false;
      } catch (e) {}
      this.showNotification('浮动窗口已隐藏，可在设置中重新显示');
    });
  },

  toggleFloatWindow(visible) {
    if (visible === false) {
      if (this.floatWindow) this.floatWindow.style.display = 'none';
      if (this.settings) this.settings.floatWindowVisible = false;
    } else {
      if (!this.floatWindow) {
        this.injectFloatWindow();
      } else {
        this.floatWindow.style.display = 'block';
      }
      if (this.settings) this.settings.floatWindowVisible = true;
    }
  },

  makeDraggable(element, handle) {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    handle.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = element.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      element.style.right = 'auto';
      element.style.bottom = 'auto';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      element.style.left = Math.max(0, Math.min(window.innerWidth - element.offsetWidth, initialLeft + dx)) + 'px';
      element.style.top = Math.max(0, Math.min(window.innerHeight - element.offsetHeight, initialTop + dy)) + 'px';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  },

  showNoteDialog(note) {
    const dialog = document.createElement('div');
    dialog.className = 'study-note-modal-overlay';
    dialog.innerHTML = `
      <div class="study-note-modal">
        <div class="study-note-modal-header">
          <h3>📝 添加笔记 <span class="study-note-time">${this.formatTime(note.timestamp)}</span></h3>
          <button class="study-note-modal-close" data-action="close">×</button>
        </div>
        <div class="study-note-modal-body">
          <textarea class="study-note-textarea" placeholder="在这里记录你的笔记..." rows="6"></textarea>
          <div class="study-note-tags-container">
            <label>标签（用逗号分隔）：</label>
            <input type="text" class="study-note-tags-input" placeholder="例如：重点,复习,概念" />
          </div>
        </div>
        <div class="study-note-modal-footer">
          <button class="study-note-btn study-note-btn-secondary" data-action="close">取消</button>
          <button class="study-note-btn study-note-btn-primary" data-action="save">保存</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);

    const close = () => dialog.remove();
    const save = async () => {
      const content = dialog.querySelector('.study-note-textarea').value.trim();
      const tagsStr = dialog.querySelector('.study-note-tags-input').value.trim();
      const tags = tagsStr ? tagsStr.split(/[,，]/).map(t => t.trim()).filter(Boolean) : [];
      if (!content) {
        this.showNotification('请输入笔记内容');
        return;
      }
      note.content = content;
      note.tags = tags;
      await chrome.runtime.sendMessage({ action: 'saveNote', note });
      this.showNotification('笔记已保存');
      close();
    };

    dialog.querySelector('[data-action="close"]').addEventListener('click', close);
    dialog.querySelectorAll('[data-action="close"]').forEach(el => el.addEventListener('click', close));
    dialog.querySelector('[data-action="save"]').addEventListener('click', save);
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) close();
    });
    dialog.querySelector('.study-note-textarea').focus();
  },

  openAnnotationEditor(screenshot) {
    const editor = document.createElement('div');
    editor.className = 'study-note-modal-overlay study-note-annotation-modal';
    editor.innerHTML = `
      <div class="study-note-modal" style="width: 90%; max-width: 1000px;">
        <div class="study-note-modal-header">
          <h3>🖌️ 截图标注 <span class="study-note-time">${this.formatTime(screenshot.timestamp)}</span></h3>
          <button class="study-note-modal-close" data-action="close">×</button>
        </div>
        <div class="study-note-modal-body">
          <div class="study-note-toolbar">
            <div class="study-note-tool-group">
              <button class="study-note-tool active" data-tool="arrow">➡️ 箭头</button>
              <button class="study-note-tool" data-tool="rectangle">⬜ 矩形</button>
              <button class="study-note-tool" data-tool="highlight">🖍️ 高亮</button>
              <button class="study-note-tool" data-tool="text">✏️ 文字</button>
              <button class="study-note-tool" data-tool="erase">🗑️ 撤销</button>
            </div>
            <div class="study-note-tool-group">
              <label>颜色: <input type="color" id="study-note-color" value="#ff0000" /></label>
              <label>粗细:
                <select id="study-note-size">
                  <option value="2">细</option>
                  <option value="4" selected>中</option>
                  <option value="8">粗</option>
                </select>
              </label>
            </div>
          </div>
          <div class="study-note-canvas-wrapper">
            <canvas id="study-note-canvas"></canvas>
          </div>
          <div style="margin-top: 12px;">
            <input type="text" class="study-note-input" id="study-note-screenshot-title" placeholder="截图标题" value="${screenshot.title}" />
          </div>
          <div style="margin-top: 8px;">
            <input type="text" class="study-note-input" id="study-note-screenshot-desc" placeholder="描述信息（可选）" />
          </div>
        </div>
        <div class="study-note-modal-footer">
          <button class="study-note-btn study-note-btn-secondary" data-action="close">取消</button>
          <button class="study-note-btn study-note-btn-primary" data-action="save">保存</button>
        </div>
      </div>
    `;
    document.body.appendChild(editor);

    const canvas = editor.querySelector('#study-note-canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      const maxWidth = Math.min(900, window.innerWidth * 0.85);
      const maxHeight = window.innerHeight * 0.5;
      let w = img.width;
      let h = img.height;
      const ratio = Math.min(maxWidth / w, maxHeight / h);
      if (ratio < 1) {
        w = w * ratio;
        h = h * ratio;
      }
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
    };
    img.src = screenshot.imageData;

    let currentTool = 'arrow';
    let currentColor = '#ff0000';
    let currentSize = 4;
    let isDrawing = false;
    let startX = 0, startY = 0;
    let history = [];
    let textAnnotations = [];

    const saveState = () => {
      history.push(canvas.toDataURL());
      if (history.length > 50) history.shift();
    };

    const undo = () => {
      if (history.length > 0) {
        const data = history.pop();
        const img2 = new Image();
        img2.onload = () => ctx.drawImage(img2, 0, 0);
        img2.src = data;
      }
    };

    editor.querySelectorAll('.study-note-tool').forEach(btn => {
      btn.addEventListener('click', () => {
        editor.querySelectorAll('.study-note-tool').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTool = btn.dataset.tool;
        if (currentTool === 'erase') {
          undo();
          editor.querySelectorAll('.study-note-tool').forEach(b => b.classList.remove('active'));
          editor.querySelector('[data-tool="arrow"]').classList.add('active');
          currentTool = 'arrow';
        }
      });
    });

    editor.querySelector('#study-note-color').addEventListener('input', (e) => currentColor = e.target.value);
    editor.querySelector('#study-note-size').addEventListener('change', (e) => currentSize = parseInt(e.target.value));

    canvas.addEventListener('mousedown', (e) => {
      if (currentTool === 'text') {
        const text = prompt('请输入文字：');
        if (text) {
          saveState();
          const rect = canvas.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          ctx.fillStyle = currentColor;
          ctx.font = `${currentSize * 4}px Arial, sans-serif`;
          ctx.fillText(text, x, y);
          textAnnotations.push({ x, y, text, color: currentColor, size: currentSize });
        }
        return;
      }
      saveState();
      isDrawing = true;
      const rect = canvas.getBoundingClientRect();
      startX = e.clientX - rect.left;
      startY = e.clientY - rect.top;
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!isDrawing) return;
      if (history.length > 0) {
        const prev = new Image();
        prev.onload = () => {
          ctx.drawImage(prev, 0, 0);
          const rect = canvas.getBoundingClientRect();
          const curX = e.clientX - rect.left;
          const curY = e.clientY - rect.top;
          drawPreview(curX, curY);
        };
        prev.src = history[history.length - 1];
      }
    });

    canvas.addEventListener('mouseup', (e) => {
      if (!isDrawing) return;
      isDrawing = false;
      const rect = canvas.getBoundingClientRect();
      const curX = e.clientX - rect.left;
      const curY = e.clientY - rect.top;
      drawShape(startX, startY, curX, curY);
    });

    function drawPreview(x, y) {
      drawShape(startX, startY, x, y);
    }

    function drawShape(x1, y1, x2, y2) {
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = currentSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (currentTool === 'arrow') {
        drawArrow(x1, y1, x2, y2);
      } else if (currentTool === 'rectangle') {
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      } else if (currentTool === 'highlight') {
        ctx.fillStyle = currentColor + '55';
        ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      }
    }

    function drawArrow(x1, y1, x2, y2) {
      const headLen = 15 + currentSize * 2;
      const angle = Math.atan2(y2 - y1, x2 - x1);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
    }

    const close = () => editor.remove();
    const save = async () => {
      screenshot.annotatedData = canvas.toDataURL('image/png');
      screenshot.title = editor.querySelector('#study-note-screenshot-title').value.trim() || '未命名截图';
      screenshot.description = editor.querySelector('#study-note-screenshot-desc').value.trim();
      screenshot.annotations = textAnnotations;
      await chrome.runtime.sendMessage({ action: 'saveScreenshot', screenshot });
      this.showNotification('截图已保存');
      close();
    };

    editor.querySelectorAll('[data-action="close"]').forEach(el => el.addEventListener('click', close));
    editor.querySelector('[data-action="save"]').addEventListener('click', save);
    editor.addEventListener('click', (e) => {
      if (e.target === editor) close();
    });
  }
};

StudyNoteContent.init();
