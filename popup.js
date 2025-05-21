let countdownIntervals = {}; // Store countdown timers per reminder
let sortByTimeLeft = false;
let hideLongReminders = false;

document.addEventListener('DOMContentLoaded', () => {
  // Focus input
  document.getElementById('reminderTime').focus();

  // Pre-fill active tab's URL
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.url) document.getElementById('ticketUrl').value = tabs[0].url;
  });

  // Set reminder handler
  document.getElementById('setReminder').addEventListener('click', setReminder);

  // Open full page interface
  document.getElementById('openFullPage')?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('full.html') });
  });

  const toggleSortBtn = document.getElementById('toggleSort');
  const toggleVisibilityBtn = document.getElementById('toggleVisibility');
  const toggleSoundBtn = document.getElementById('toggleSound');

  // Load and apply stored sort and visibility states
  chrome.storage.local.get(['sortByTimeLeft', 'hideLongReminders', 'enableSound'], (result) => {
    sortByTimeLeft = result.sortByTimeLeft || false;
    hideLongReminders = result.hideLongReminders || false;
    const isSoundOn = result.enableSound !== false; // default ON

    toggleSortBtn.classList.toggle('sort-enabled', sortByTimeLeft);
    toggleSortBtn.title = `Sort by time left: ${sortByTimeLeft ? 'On' : 'Off'}`;

    toggleVisibilityBtn.classList.toggle('visibility-filter-enabled', hideLongReminders);
    toggleVisibilityBtn.title = `Hide >12h reminders: ${hideLongReminders ? 'On' : 'Off'}`;
    toggleVisibilityBtn.src = hideLongReminders
      ? 'icons/visibility_off.png'
      : 'icons/visibility.png';

    toggleSoundBtn.classList.toggle('sort-enabled', !isSoundOn);
    toggleSoundBtn.title = `Sound: ${isSoundOn ? 'On' : 'Muted'}`;
    toggleSoundBtn.src = isSoundOn
      ? 'icons/volume.png'
      : 'icons/volume_off.png';

    updateActiveRemindersList();
  });

  // Toggle sort mode on icon click
  toggleSortBtn.addEventListener('click', () => {
    sortByTimeLeft = !sortByTimeLeft;
    chrome.storage.local.set({ sortByTimeLeft });

    // Apply or remove the highlight class
    toggleSortBtn.classList.toggle('sort-enabled', sortByTimeLeft);
    toggleSortBtn.title = `Sort by time left: ${sortByTimeLeft ? 'On' : 'Off'}`;

      updateActiveRemindersList();
    });

  // Visibility toggle for long reminders
  toggleVisibilityBtn?.addEventListener('click', () => {
    hideLongReminders = !hideLongReminders;
    chrome.storage.local.set({ hideLongReminders }); // save settings

    toggleVisibilityBtn.classList.toggle('visibility-filter-enabled', hideLongReminders);
    toggleVisibilityBtn.title = `Hide >12h reminders: ${hideLongReminders ? 'On' : 'Off'}`;
    toggleVisibilityBtn.src = hideLongReminders
      ? 'icons/visibility_off.png'
      : 'icons/visibility.png';

    updateActiveRemindersList();
  });

// Toggle sound
  toggleSoundBtn.addEventListener('click', () => {
    const isMutedNow = toggleSoundBtn.src.includes('volume_off.png');

    const enableSound = isMutedNow; // If muted, enable sound
    chrome.storage.local.set({ enableSound });

    toggleSoundBtn.src = enableSound
      ? 'icons/volume.png'
      : 'icons/volume_off.png';

    toggleSoundBtn.title = `Sound: ${enableSound ? 'On' : 'Muted'}`;

    // Toggle the blue highlight class
    toggleSoundBtn.classList.toggle('sort-enabled', !enableSound);
  });
});

// Helper: Get tab group metadata (title, color, URLs) if tab is in a group
async function getEntireGroupInfo(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.groupId || tab.groupId === -1) return null;

    const group = await chrome.tabGroups.get(tab.groupId);
    const groupTabs = await chrome.tabs.query({ groupId: tab.groupId });
    
    return {
      groupId: tab.groupId,
      title: group.title,
      color: group.color,
      urls: groupTabs.map(t => t.url).filter(url => url !== tab.url)
    };
  } catch (error) {
    console.error('Error getting group info:', error);
    return null;
  }
}

// Core function: Set a new reminder and store it in Chrome sync storage
async function setReminder() {
  const ticketUrl = document.getElementById('ticketUrl').value;
  const reminderTime = parseInt(document.getElementById('reminderTime').value);
  const comment = document.getElementById('reminderComment').value.trim();

  if (!ticketUrl || isNaN(reminderTime)) {
    alert('Please enter valid URL and time');
    return;
  }

  const ticketKey = `reminder_${Date.now()}`;
  const timestamp = Date.now();
  const endTime = timestamp + reminderTime * 60000;

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentTab = tabs[0];
  let groupInfo = {};

    // Include group metadata if the tab is part of a group
  if (currentTab?.groupId && currentTab.groupId !== -1) {
    const fullGroupInfo = await getEntireGroupInfo(currentTab.id);
    if (fullGroupInfo) {
      groupInfo = {
        groupId: fullGroupInfo.groupId,
        groupTitle: fullGroupInfo.title,
        groupColor: fullGroupInfo.color,
        groupUrls: fullGroupInfo.urls
      };
    }
  }

  const { reminders = {} } = await chrome.storage.sync.get(['reminders']);

  // Save reminder object
  reminders[ticketKey] = {
    url: ticketUrl,
    reminderTime,
    timestamp,
    endTime,
    title: getDomainFromUrl(ticketUrl),
    tabTitle: currentTab?.title,
    comment,
    ...groupInfo
  };

  await chrome.storage.sync.set({ reminders });
  await chrome.alarms.create(ticketKey, { delayInMinutes: reminderTime });
  updateActiveRemindersList();

  // Reset form inputs
  document.getElementById('ticketUrl').value = '';
  document.getElementById('reminderComment').value = '';
}

// Update and render the list of active reminders in the popup
function updateActiveRemindersList() {
  chrome.storage.sync.get(['reminders'], (result) => {
    const reminders = result.reminders || {};
    const activeTicketsDiv = document.getElementById('activeTickets');
    activeTicketsDiv.innerHTML = '';

    // Clear any existing countdowns
    Object.keys(countdownIntervals).forEach(key => clearInterval(countdownIntervals[key]));
    countdownIntervals = {};

    // No active reminders
    if (Object.keys(reminders).length === 0) {
      activeTicketsDiv.innerHTML = '<p class="no-reminders">No active reminders</p>';
      return;
    }

    let reminderEntries = Object.entries(reminders);

    if (hideLongReminders) {
      const now = Date.now();
      const twelveHoursInMs = 12 * 60 * 60 * 1000;

      reminderEntries = reminderEntries.filter(([, reminder]) => {
        return (reminder.endTime - now) <= twelveHoursInMs;
      });
    }

    if (sortByTimeLeft) {
      reminderEntries.sort(([, a], [, b]) => (a.endTime - Date.now()) - (b.endTime - Date.now()));
    }

    // Render each reminder
    for (const [key, reminder] of reminderEntries) {
      const reminderDiv = document.createElement('div');
      reminderDiv.className = 'reminder-item';

      // Optional group info display
      const groupInfo = reminder.groupId ? 
        `<div class="group-info" style="color: ${getGroupColorHex(reminder.groupColor)}">
          ${reminder.groupTitle || 'Group'} (${reminder.groupUrls ? reminder.groupUrls.length + 1 : 1} tabs)
        </div>` : '';

      // HTML content for each reminder
      reminderDiv.innerHTML = `
        <div class="reminder-header">
          <span class="website-name">${reminder.title}</span>
          ${groupInfo}
        </div>
        <div class="reminder-url">
          <a href="#" class="tab-title-link" data-url="${reminder.url}">
            ${reminder.tabTitle || 'Untitled'}
          </a>
        </div>
        ${reminder.comment ? `<div class="reminder-comment">${reminder.comment}</div>` : ''}
        <div class="reminder-time">
          Reminding in: <span class="time-left" data-end="${reminder.endTime}">
            ${formatTimeLeft(reminder.endTime)}
          </span>
        </div>
        <button class="cancel-btn" data-key="${key}">Cancel Reminder</button>
      `;

      activeTicketsDiv.appendChild(reminderDiv);

      const timeLeftElement = reminderDiv.querySelector('.time-left');

      if (timeLeftElement) {
        const updateTimeLeft = () => {
          const now = Date.now();
          const diff = reminder.endTime - now;
          timeLeftElement.textContent = formatTimeLeft(reminder.endTime);
          timeLeftElement.className = diff >= 0 ? 'time-left time-positive' : 'time-left time-negative';
        };

        updateTimeLeft(); // ✅ Immediately show correct time and color

        countdownIntervals[key] = setInterval(updateTimeLeft, 1000);
      }
    }

    // Link click handlers to activate or open tab
    document.querySelectorAll('.tab-title-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const key = link.closest('.reminder-item').querySelector('.cancel-btn').dataset.key;

        // Ask background script to open the reminder (handles group recreation)
        chrome.runtime.sendMessage({ type: 'openReminderFromPopup', reminderKey: key });
      });
    });


    // Cancel button event handlers
    document.querySelectorAll('.cancel-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        cancelReminder(e.target.dataset.key);
      });
    });
  });
}

// Cancel a reminder, clear alarm and UI
function cancelReminder(key) {
  chrome.storage.sync.get(['reminders'], (result) => {
    const reminders = result.reminders || {};
    if (reminders[key]) {
      delete reminders[key];
      chrome.storage.sync.set({ reminders }, () => {
        chrome.alarms.clear(key);
        clearInterval(countdownIntervals[key]);
        delete countdownIntervals[key];

        // Request background to update the icon
        chrome.runtime.sendMessage({ type: 'checkOverdue' });

        updateActiveRemindersList(); // Refresh list
      });
    }
  });
}

// Format milliseconds into mm:ss format
function formatTimeLeft(endTime) {
  const now = Date.now();
  const diff = endTime - now;
  const absoluteDiff = Math.abs(diff);
  const minutes = Math.floor(absoluteDiff / 60000);
  const seconds = Math.floor((absoluteDiff % 60000) / 1000);
  return diff >= 0 ? `${minutes}m ${seconds}s` : `-${minutes}m ${seconds}s`;
}

// Extract hostname from a URL (with truncation if too long)
function getDomainFromUrl(url) {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    return domain.length > 20 ? `${domain.substring(0, 20)}...` : domain;
  } catch {
    return 'Custom URL';
  }
}

// Map Chrome tab group color name to actual hex value
function getGroupColorHex(color) {
  const colors = {
    grey: '#9E9E9E', blue: '#8AB4F8', red: '#F28B82',
    yellow: '#FDD663', green: '#81C995', pink: '#FF8BCB',
    purple: '#D7AEFB', cyan: '#78D9EC', orange: '#FFAD70'
  };
  return colors[color] || '#9E9E9E';
}