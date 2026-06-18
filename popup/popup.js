document.addEventListener('DOMContentLoaded', async () => {
  await loadStats();
  await loadShortcuts();

  document.getElementById('btnOpenSidebar').addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        await chrome.sidePanel.open({ tabId: tab.id });
      }
    } catch (e) {
      console.log('SidePanel not available:', e);
    }
    window.close();
  });

  document.getElementById('btnSettings').addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        await chrome.sidePanel.open({ tabId: tab.id });
      }
    } catch (e) {
    }
    window.close();
  });

  document.getElementById('popupOpenShortcuts').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
});

async function loadStats() {
  try {
    const coursesResp = await chrome.runtime.sendMessage({ action: 'getCourses' });
    const notesResp = await chrome.runtime.sendMessage({ action: 'getNotes' });
    const bookmarksResp = await chrome.runtime.sendMessage({ action: 'getBookmarks' });
    const reviewsResp = await chrome.runtime.sendMessage({ action: 'getReviews', filter: { status: 'pending' } });

    document.getElementById('statCourses').textContent = coursesResp?.data?.length || 0;
    document.getElementById('statNotes').textContent = notesResp?.data?.length || 0;
    document.getElementById('statBookmarks').textContent = bookmarksResp?.data?.length || 0;
    document.getElementById('statReviews').textContent = reviewsResp?.data?.length || 0;
  } catch (e) {
    console.error('Load stats failed:', e);
  }
}

const defaultShortcuts = {
  quickNote: 'Ctrl+Shift+N',
  quickBookmark: 'Ctrl+Shift+B',
  quickScreenshot: 'Ctrl+Shift+S',
  toggleSidebar: 'Ctrl+Shift+P'
};

const shortcutLabels = {
  quickNote: '快速笔记',
  quickBookmark: '添加书签',
  quickScreenshot: '截取画面',
  toggleSidebar: '侧边栏'
};

function renderKbd(keyStr) {
  return keyStr.split('+').map(k => `<kbd>${k.trim()}</kbd>`).join('+');
}

async function loadShortcuts() {
  try {
    const resp = await chrome.runtime.sendMessage({ action: 'getSettings' });
    const settings = resp?.data || {};
    const shortcuts = settings.shortcuts || defaultShortcuts;

    const ul = document.getElementById('popupShortcutList');
    ul.innerHTML = Object.keys(shortcutLabels).map(key =>
      `<li>${renderKbd(shortcuts[key] || defaultShortcuts[key])} ${shortcutLabels[key]}</li>`
    ).join('');

    const isCustom = settings.shortcuts && Object.keys(settings.shortcuts).some(k => settings.shortcuts[k] !== defaultShortcuts[k]);
    const note = document.getElementById('popupShortcutNote');
    if (isCustom) {
      note.innerHTML = '✨ 已使用自定义提示文案；真实系统快捷键请前往' +
        '<a href="#" id="popupOpenShortcuts2" style="color:#4f46e5;">浏览器扩展设置</a>' +
        '，若两者不一致请在侧边栏「设置」→「快捷键」中对齐。';
      note.querySelector('#popupOpenShortcuts2')?.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
      });
    }
  } catch (e) {
    console.error('Load shortcuts failed:', e);
  }
}
