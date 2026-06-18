document.addEventListener('DOMContentLoaded', async () => {
  await loadStats();

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
