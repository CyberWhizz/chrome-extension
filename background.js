// -- Ensure offscreen document exists --
async function ensureOffscreenDocument() {
  const exists = await chrome.offscreen.hasDocument();
  if (!exists) {
    console.log("[DEBUG] Creating offscreen document...");
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Play notification sound when reminders fire'
    });
    console.log("[DEBUG] Offscreen document created.");
  } else {
    console.log("[DEBUG] Offscreen document already exists.");
  }
}

// -- Play custom notification sound --
async function playCustomSound() {
  await ensureOffscreenDocument();

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'playSound' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("[DEBUG] Error sending playSound:", chrome.runtime.lastError.message);
        reject(chrome.runtime.lastError.message);
      } else {
        console.log("[DEBUG] playSound response:", response);
        resolve(response);
      }
    });
  });
}

// -- Update extension icon --
async function updateExtensionIcon(overdue) {
  const iconPath = overdue
    ? {
        16: "icons/icon16_red.png",
        48: "icons/icon48_red.png",
        128: "icons/icon128_red.png"
      }
    : {
        16: "icons/icon16.png",
        48: "icons/icon48.png",
        128: "icons/icon128.png"
      };

  try {
    await chrome.action.setIcon({ path: iconPath });
    console.log("[DEBUG] Icon updated.");
  } catch (err) {
    console.error("[DEBUG] Failed to update icon:", err);
  }
}

// -- Check if any reminders are overdue --
async function checkOverdueReminders() {
  const { reminders = {} } = await chrome.storage.sync.get("reminders");
  const now = Date.now();
  const hasOverdue = Object.values(reminders).some(r => r.endTime && r.endTime < now);
  console.log("[DEBUG] Overdue check:", hasOverdue);
  await updateExtensionIcon(hasOverdue);
}

// -- Handle alarm triggers --
chrome.alarms.onAlarm.addListener(async (alarm) => {
  console.log("[DEBUG] Alarm triggered:", alarm.name);

  const { reminders = {} } = await chrome.storage.sync.get("reminders");
  const reminder = reminders[alarm.name];
  if (!reminder) return;

  const tabs = await chrome.tabs.query({ url: reminder.url });
  if (tabs.length && tabs[0].groupId !== -1) {
    const group = await chrome.tabGroups.get(tabs[0].groupId);
    const groupTabs = await chrome.tabs.query({ groupId: tabs[0].groupId });

    const orderedUrls = groupTabs.map(t => t.url);
    const reminderIndex = orderedUrls.indexOf(reminder.url);

    reminders[alarm.name] = {
      ...reminder,
      groupId: tabs[0].groupId,
      groupTitle: group.title,
      groupColor: group.color,
      groupUrls: orderedUrls,
      reminderIndex: reminderIndex
    };

    await chrome.storage.sync.set({ reminders });
  }

  await chrome.notifications.create(alarm.name, {
    type: "basic",
    iconUrl: "icons/icon48_red.png",
    title: `Reminder: ${reminder.title}`,
    message: reminder.comment
      ? `Note: ${reminder.comment}\nURL: ${reminder.url}`
      : `URL: ${reminder.url}`,
    buttons: [{ title: "Open Page" }],
    priority: 2,
    silent: true
  });

  const result = await chrome.storage.local.get('enableSound');
  const enableSound = result.enableSound !== false; // default ON
  if (enableSound) {
    await playCustomSound();
  }

  await checkOverdueReminders();
});

// -- Open reminder tab or restore group --
async function openReminder(notificationId, shouldDelete = true) {
  shouldDelete = Boolean(shouldDelete);

  const { reminders = {} } = await chrome.storage.sync.get("reminders");
  const reminder = reminders[notificationId];
  if (!reminder) {
    chrome.notifications.clear(notificationId);
    return;
  }

  const existingTabs = await chrome.tabs.query({ url: reminder.url });

  if (existingTabs.length > 0) {
    const existingTab = existingTabs[0];

    // If it's in a group, just focus it
    if (existingTab.groupId !== -1) {
      await chrome.tabs.update(existingTab.id, { active: true });
      await chrome.windows.update(existingTab.windowId, { focused: true });
    } else if (reminder.groupId && reminder.groupUrls) {
      // Re-create full group, including original tab
      await restoreTabGroup(reminder);
    } else {
      await chrome.tabs.update(existingTab.id, { active: true });
      await chrome.windows.update(existingTab.windowId, { focused: true });
    }
  } else {
    // Not open, recreate group or open single tab
    if (reminder.groupId && reminder.groupUrls) {
      await restoreTabGroup(reminder);
    } else {
      const tab = await chrome.tabs.create({ url: reminder.url, active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
    }
  }

  // Clean up the reminder if requested
  if (shouldDelete) {
    delete reminders[notificationId];
    await chrome.storage.sync.set({ reminders });
    chrome.alarms.clear(notificationId);
    chrome.notifications.clear(notificationId);
    await checkOverdueReminders();
  }
}

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  openReminder(notificationId, true);
});

chrome.notifications.onClicked.addListener((notificationId) => {
  openReminder(notificationId, true);
});

// -- Restore a tab group --
async function restoreTabGroup(reminder) {
  let orderedUrls = [...(reminder.groupUrls || [])];

  // Ensure reminder.url is in the list, only once
  orderedUrls = orderedUrls.filter(url => url !== reminder.url);
  if (reminder.reminderIndex != null && reminder.reminderIndex >= 0) {
    orderedUrls.splice(reminder.reminderIndex, 0, reminder.url);
  } else {
    orderedUrls.push(reminder.url);
  }

  // Create all tabs in parallel and preserve order
  const createdTabs = await Promise.all(
    orderedUrls.map(url => chrome.tabs.create({ url, active: false }))
  );

  // Group all created tabs
  const tabIds = createdTabs.map(tab => tab.id);
  const groupId = await chrome.tabs.group({ tabIds });

  // Set group title and color
  if (reminder.groupTitle || reminder.groupColor) {
    await chrome.tabGroups.update(groupId, {
      title: reminder.groupTitle || '',
      color: reminder.groupColor || 'grey',
    });
  }

  // Explicitly find the tab that matches the reminder URL
  const normalizedReminderUrl = reminder.url.split('#')[0]; // ignore hash
  const targetTab = createdTabs.find(tab => tab.url.split('#')[0] === normalizedReminderUrl);

  if (targetTab) {
    await chrome.tabs.update(targetTab.id, { active: true });
    await chrome.windows.update(targetTab.windowId, { focused: true });
  } else {
    // fallback: focus first
    await chrome.tabs.update(createdTabs[0].id, { active: true });
    await chrome.windows.update(createdTabs[0].windowId, { focused: true });
  }
}


// -- Listen for manual overdue check from popup.js --
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "checkOverdue") {
    checkOverdueReminders();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'checkOverdue') {
    checkOverdueReminders();
  }

  if (message.type === 'openReminderFromPopup') {
    openReminder(message.reminderKey, false); // Don't delete if opened from U
  }
});

// -- Initial load logic --
chrome.runtime.onStartup.addListener(checkOverdueReminders);
chrome.runtime.onInstalled.addListener(checkOverdueReminders);

// Sets reminders by shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  const durationMap = {
    "quick-reminder-30min": 30,
    "quick-reminder-60min": 60,
    "quick-reminder-3h": 180,
    "quick-reminder-6h": 360,
    "quick-reminder-1d": 1440,
    "quick-reminder-2d": 2880,
    "quick-reminder-3d": 4320,
    "quick-reminder-4d": 5760,
    "quick-reminder-14d": 20160
  };

  if (!(command in durationMap)) return;

  const reminderTime = durationMap[command];
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.url) return;

  const ticketKey = `reminder_${Date.now()}`;
  const timestamp = Date.now();
  const endTime = timestamp + reminderTime * 60000;

  const domain = new URL(tab.url).hostname.replace('www.', '');
  const title = tab.title;
  const shortTitle = domain.length > 20 ? `${domain.slice(0, 20)}...` : domain;

  let groupInfo = {};
  if (tab.groupId && tab.groupId !== -1) {
    try {
      const group = await chrome.tabGroups.get(tab.groupId);
      const groupTabs = await chrome.tabs.query({ groupId: tab.groupId });
      groupInfo = {
        groupId: tab.groupId,
        groupTitle: group.title,
        groupColor: group.color,
        groupUrls: groupTabs.map(t => t.url).filter(url => url !== tab.url)
      };
    } catch (err) {
      console.warn('Group fetch failed:', err);
    }
  }

  const { reminders = {} } = await chrome.storage.sync.get(['reminders']);
  reminders[ticketKey] = {
    url: tab.url,
    reminderTime,
    timestamp,
    endTime,
    title: shortTitle,
    tabTitle: title,
    comment: '',
    ...groupInfo
  };

  await chrome.storage.sync.set({ reminders });
  await chrome.alarms.create(ticketKey, { delayInMinutes: reminderTime });

  // Show silent notification
  chrome.notifications?.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Reminder Set!',
    message: `${formatReminderTime(reminderTime)} reminder saved for "${title}"`,
    silent: true
  });

  // Play custom sound
  const { enableSound } = await chrome.storage.local.get('enableSound');
  if (enableSound !== false) {  // default is true
    await ensureOffscreenDocument();
    chrome.runtime.sendMessage({ type: 'playSound' });
  }

  chrome.runtime.sendMessage({ type: 'checkOverdue' });
});

// Helper to format duration
function formatReminderTime(minutes) {
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes / 1440 > 1 ? 's' : ''}`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes / 60 > 1 ? 's' : ''}`;
  return `${minutes} minutes`;
}
