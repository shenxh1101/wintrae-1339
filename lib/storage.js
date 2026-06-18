const Storage = {
  KEYS: {
    COURSES: 'courses',
    NOTES: 'notes',
    BOOKMARKS: 'bookmarks',
    SCREENSHOTS: 'screenshots',
    REVIEWS: 'reviews',
    SETTINGS: 'settings',
    CURRENT_COURSE: 'currentCourse',
    CURRENT_CHAPTER: 'currentChapter'
  },

  DEFAULT_SETTINGS: {
    shortcuts: {
      quickNote: 'Ctrl+Shift+N',
      quickBookmark: 'Ctrl+Shift+B',
      quickScreenshot: 'Ctrl+Shift+S',
      toggleSidebar: 'Ctrl+Shift+P'
    },
    floatWindowVisible: true,
    autoDetectVideo: true,
    exportFormat: 'json',
    reviewReminderDays: 7,
    theme: 'light'
  },

  async get(key, defaultValue = null) {
    try {
      const result = await chrome.storage.local.get(key);
      return result[key] !== undefined ? result[key] : defaultValue;
    } catch (e) {
      console.error('Storage get error:', e);
      return defaultValue;
    }
  },

  async set(key, value) {
    try {
      await chrome.storage.local.set({ [key]: value });
      return true;
    } catch (e) {
      console.error('Storage set error:', e);
      return false;
    }
  },

  async remove(key) {
    try {
      await chrome.storage.local.remove(key);
      return true;
    } catch (e) {
      console.error('Storage remove error:', e);
      return false;
    }
  },

  async getAll() {
    try {
      return await chrome.storage.local.get(null);
    } catch (e) {
      console.error('Storage getAll error:', e);
      return {};
    }
  },

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
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

  parseTime(timeStr) {
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
  },

  async getCourses() {
    return await this.get(this.KEYS.COURSES, []);
  },

  async saveCourse(course) {
    const courses = await this.getCourses();
    if (!course.id) {
      course.id = this.generateId();
      course.createdAt = Date.now();
      courses.push(course);
    } else {
      const idx = courses.findIndex(c => c.id === course.id);
      if (idx >= 0) {
        courses[idx] = { ...courses[idx], ...course, updatedAt: Date.now() };
      } else {
        course.createdAt = Date.now();
        courses.push(course);
      }
    }
    await this.set(this.KEYS.COURSES, courses);
    return course;
  },

  async deleteCourse(courseId) {
    const courses = (await this.getCourses()).filter(c => c.id !== courseId);
    await this.set(this.KEYS.COURSES, courses);
    const notes = (await this.getNotes()).filter(n => n.courseId !== courseId);
    await this.set(this.KEYS.NOTES, notes);
    const bookmarks = (await this.getBookmarks()).filter(b => b.courseId !== courseId);
    await this.set(this.KEYS.BOOKMARKS, bookmarks);
    const screenshots = (await this.getScreenshots()).filter(s => s.courseId !== courseId);
    await this.set(this.KEYS.SCREENSHOTS, screenshots);
    const reviews = (await this.getReviews()).filter(r => r.courseId !== courseId);
    await this.set(this.KEYS.REVIEWS, reviews);
    return true;
  },

  async findOrCreateCourse(url, title) {
    const courses = await this.getCourses();
    let course = courses.find(c => c.url === url);
    if (!course) {
      course = {
        url,
        title: title || document.title || '未知课程',
        chapters: [{ id: this.generateId(), title: '默认章节', createdAt: Date.now() }]
      };
      course = await this.saveCourse(course);
    }
    return course;
  },

  async addChapter(courseId, chapterTitle) {
    const courses = await this.getCourses();
    const course = courses.find(c => c.id === courseId);
    if (course) {
      if (!course.chapters) course.chapters = [];
      const chapter = {
        id: this.generateId(),
        title: chapterTitle,
        createdAt: Date.now()
      };
      course.chapters.push(chapter);
      await this.set(this.KEYS.COURSES, courses);
      return chapter;
    }
    return null;
  },

  async deleteChapter(courseId, chapterId) {
    const courses = await this.getCourses();
    const course = courses.find(c => c.id === courseId);
    if (course && course.chapters) {
      course.chapters = course.chapters.filter(ch => ch.id !== chapterId);
      await this.set(this.KEYS.COURSES, courses);
      return true;
    }
    return false;
  },

  async getNotes(filter = {}) {
    let notes = await this.get(this.KEYS.NOTES, []);
    if (filter.courseId) notes = notes.filter(n => n.courseId === filter.courseId);
    if (filter.chapterId) notes = notes.filter(n => n.chapterId === filter.chapterId);
    if (filter.tag) notes = notes.filter(n => n.tags && n.tags.includes(filter.tag));
    return notes.sort((a, b) => b.createdAt - a.createdAt);
  },

  async saveNote(note) {
    const notes = await this.get(this.KEYS.NOTES, []);
    if (!note.id) {
      note.id = this.generateId();
      note.createdAt = Date.now();
      notes.push(note);
    } else {
      const idx = notes.findIndex(n => n.id === note.id);
      if (idx >= 0) {
        notes[idx] = { ...notes[idx], ...note, updatedAt: Date.now() };
      }
    }
    await this.set(this.KEYS.NOTES, notes);
    return note;
  },

  async deleteNote(noteId) {
    const notes = (await this.getNotes()).filter(n => n.id !== noteId);
    await this.set(this.KEYS.NOTES, notes);
    return true;
  },

  async getBookmarks(filter = {}) {
    let bookmarks = await this.get(this.KEYS.BOOKMARKS, []);
    if (filter.courseId) bookmarks = bookmarks.filter(b => b.courseId === filter.courseId);
    if (filter.chapterId) bookmarks = bookmarks.filter(b => b.chapterId === filter.chapterId);
    if (filter.tag) bookmarks = bookmarks.filter(b => b.tags && b.tags.includes(filter.tag));
    return bookmarks.sort((a, b) => a.timestamp - b.timestamp);
  },

  async saveBookmark(bookmark) {
    const bookmarks = await this.get(this.KEYS.BOOKMARKS, []);
    if (!bookmark.id) {
      bookmark.id = this.generateId();
      bookmark.createdAt = Date.now();
      bookmarks.push(bookmark);
    } else {
      const idx = bookmarks.findIndex(b => b.id === bookmark.id);
      if (idx >= 0) {
        bookmarks[idx] = { ...bookmarks[idx], ...bookmark, updatedAt: Date.now() };
      }
    }
    await this.set(this.KEYS.BOOKMARKS, bookmarks);
    return bookmark;
  },

  async deleteBookmark(bookmarkId) {
    const bookmarks = (await this.getBookmarks()).filter(b => b.id !== bookmarkId);
    await this.set(this.KEYS.BOOKMARKS, bookmarks);
    return true;
  },

  async getScreenshots(filter = {}) {
    let screenshots = await this.get(this.KEYS.SCREENSHOTS, []);
    if (filter.courseId) screenshots = screenshots.filter(s => s.courseId === filter.courseId);
    if (filter.chapterId) screenshots = screenshots.filter(s => s.chapterId === filter.chapterId);
    return screenshots.sort((a, b) => b.createdAt - a.createdAt);
  },

  async saveScreenshot(screenshot) {
    const screenshots = await this.get(this.KEYS.SCREENSHOTS, []);
    if (!screenshot.id) {
      screenshot.id = this.generateId();
      screenshot.createdAt = Date.now();
      screenshots.push(screenshot);
    } else {
      const idx = screenshots.findIndex(s => s.id === screenshot.id);
      if (idx >= 0) {
        screenshots[idx] = { ...screenshots[idx], ...screenshot, updatedAt: Date.now() };
      }
    }
    await this.set(this.KEYS.SCREENSHOTS, screenshots);
    return screenshot;
  },

  async deleteScreenshot(screenshotId) {
    const screenshots = (await this.getScreenshots()).filter(s => s.id !== screenshotId);
    await this.set(this.KEYS.SCREENSHOTS, screenshots);
    return true;
  },

  async getReviews(filter = {}) {
    let reviews = await this.get(this.KEYS.REVIEWS, []);
    if (filter.status) reviews = reviews.filter(r => r.status === filter.status);
    if (filter.courseId) reviews = reviews.filter(r => r.courseId === filter.courseId);
    return reviews.sort((a, b) => (a.nextReviewAt || 0) - (b.nextReviewAt || 0));
  },

  async saveReview(review) {
    const reviews = await this.get(this.KEYS.REVIEWS, []);
    if (!review.id) {
      review.id = this.generateId();
      review.createdAt = Date.now();
      review.status = review.status || 'pending';
      reviews.push(review);
    } else {
      const idx = reviews.findIndex(r => r.id === review.id);
      if (idx >= 0) {
        reviews[idx] = { ...reviews[idx], ...review, updatedAt: Date.now() };
      }
    }
    await this.set(this.KEYS.REVIEWS, reviews);
    return review;
  },

  async deleteReview(reviewId) {
    const reviews = (await this.getReviews()).filter(r => r.id !== reviewId);
    await this.set(this.KEYS.REVIEWS, reviews);
    return true;
  },

  async getSettings() {
    const settings = await this.get(this.KEYS.SETTINGS, {});
    return { ...this.DEFAULT_SETTINGS, ...settings };
  },

  async saveSettings(settings) {
    const current = await this.getSettings();
    const merged = { ...current, ...settings };
    await this.set(this.KEYS.SETTINGS, merged);
    return merged;
  },

  async exportAllData() {
    const data = await this.getAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `study-notes-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  },

  async exportNotes(courseId) {
    const notes = await this.getNotes(courseId ? { courseId } : {});
    const bookmarks = await this.getBookmarks(courseId ? { courseId } : {});
    const courses = await this.getCourses();

    let markdown = '# 学习笔记导出\n\n';
    for (const course of courses) {
      if (courseId && course.id !== courseId) continue;
      markdown += `## ${course.title}\n\n`;
      const courseNotes = notes.filter(n => n.courseId === course.id);
      const courseBookmarks = bookmarks.filter(b => b.courseId === course.id);

      if (courseBookmarks.length > 0) {
        markdown += '### 书签\n';
        for (const bm of courseBookmarks) {
          markdown += `- [${this.formatTime(bm.timestamp)}] ${bm.title || '未命名书签'}`;
          if (bm.tags && bm.tags.length) markdown += ` (${bm.tags.join(', ')})`;
          markdown += '\n';
          if (bm.description) markdown += `  > ${bm.description}\n`;
        }
        markdown += '\n';
      }

      if (courseNotes.length > 0) {
        markdown += '### 笔记\n';
        for (const note of courseNotes) {
          markdown += `- ${this.formatTime(note.timestamp)}: ${note.content}\n`;
          if (note.tags && note.tags.length) markdown += `  标签: ${note.tags.join(', ')}\n`;
        }
        markdown += '\n';
      }
    }

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `study-notes-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  },

  async clearInvalidCourses() {
    const courses = await this.getCourses();
    const notes = await this.getNotes();
    const bookmarks = await this.getBookmarks();
    const screenshots = await this.getScreenshots();
    const reviews = await this.getReviews();

    const validCourseIds = new Set();
    const validCourses = courses.filter(c => {
      const hasData = notes.some(n => n.courseId === c.id)
        || bookmarks.some(b => b.courseId === c.id)
        || screenshots.some(s => s.courseId === c.id)
        || reviews.some(r => r.courseId === c.id);
      if (hasData) validCourseIds.add(c.id);
      return hasData;
    });

    await this.set(this.KEYS.COURSES, validCourses);
    return { removed: courses.length - validCourses.length };
  }
};

if (typeof module !== 'undefined') module.exports = Storage;
