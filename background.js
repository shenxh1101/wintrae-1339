import { StorageSW } from './lib/storage-sw.js';

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await StorageSW.getSettings();
  await StorageSW.saveSettings(settings);

  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (e) {
    console.log('SidePanel API not available:', e);
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (e) {
    console.log('SidePanel not available:', e);
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  switch (command) {
    case 'quick-note':
      chrome.tabs.sendMessage(tab.id, { action: 'quickNote' });
      break;
    case 'quick-bookmark':
      chrome.tabs.sendMessage(tab.id, { action: 'quickBookmark' });
      break;
    case 'quick-screenshot':
      chrome.tabs.sendMessage(tab.id, { action: 'quickScreenshot' });
      break;
    case 'toggle-sidebar':
      try {
        await chrome.sidePanel.open({ tabId: tab.id });
      } catch (e) {
        chrome.tabs.sendMessage(tab.id, { action: 'showNotification', message: '请点击扩展图标打开侧边栏' });
      }
      break;
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(result => {
    sendResponse({ success: true, data: result });
  }).catch(err => {
    console.error('Message handler error:', err);
    sendResponse({ success: false, error: err.message });
  });
  return true;
});

async function handleMessage(msg, sender) {
  const tabId = sender.tab?.id;

  switch (msg.action) {
    case 'getSettings':
      return await StorageSW.getSettings();

    case 'saveSettings':
      return await StorageSW.saveSettings(msg.settings);

    case 'getCourses':
      return await StorageSW.getCourses();

    case 'saveCourse':
      return await StorageSW.saveCourse(msg.course);

    case 'findOrCreateCourse':
      return await StorageSW.findOrCreateCourse(msg.url, msg.title);

    case 'getNotes':
      return await StorageSW.getNotes(msg.filter || {});

    case 'saveNote':
      return await StorageSW.saveNote(msg.note);

    case 'deleteNote':
      return await StorageSW.deleteNote(msg.noteId);

    case 'getBookmarks':
      return await StorageSW.getBookmarks(msg.filter || {});

    case 'saveBookmark':
      return await StorageSW.saveBookmark(msg.bookmark);

    case 'deleteBookmark':
      return await StorageSW.deleteBookmark(msg.bookmarkId);

    case 'getScreenshots':
      return await StorageSW.getScreenshots(msg.filter || {});

    case 'saveScreenshot':
      return await StorageSW.saveScreenshot(msg.screenshot);

    case 'deleteScreenshot':
      return await StorageSW.deleteScreenshot(msg.screenshotId);

    case 'getReviews':
      return await StorageSW.getReviews(msg.filter || {});

    case 'saveReview':
      return await StorageSW.saveReview(msg.review);

    case 'deleteReview':
      return await StorageSW.deleteReview(msg.reviewId);

    case 'clearInvalidCourses':
      return await StorageSW.clearInvalidCourses();

    case 'jumpToTimestamp':
      if (msg.tabId) {
        await chrome.tabs.sendMessage(msg.tabId, {
          action: 'jumpToTimestamp',
          timestamp: msg.timestamp
        });
      }
      return true;

    case 'captureTab':
      return await captureVisibleTab();

    case 'openUrl':
      await chrome.tabs.create({ url: msg.url });
      return true;

    case 'openSidebar':
      try {
        const targetTabId = msg.tabId || tabId;
        if (targetTabId) {
          await chrome.sidePanel.open({ tabId: targetTabId });
        } else {
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (activeTab?.id) await chrome.sidePanel.open({ tabId: activeTab.id });
        }
        return true;
      } catch (e) {
        console.error('Open sidebar failed:', e);
        return false;
      }

    case 'getImportExportHistory':
      return await StorageSW.getImportExportHistory();

    case 'addImportExportHistory':
      return await StorageSW.addImportExportHistory(msg.entry);

    case 'clearImportExportHistory':
      return await StorageSW.clearImportExportHistory();

    default:
      throw new Error('Unknown action: ' + msg.action);
  }
}

async function captureVisibleTab() {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    return dataUrl;
  } catch (e) {
    console.error('Capture failed:', e);
    throw new Error('截图失败: ' + e.message);
  }
}
