# Page Reminder

**Page Reminder** is a powerful Chrome extension that lets you create timed reminders for any open tab — complete with custom countdowns, optional comments, group tab restoration, and keyboard shortcuts.

---

## 🚀 Features

- ⏰ Set custom reminders for tabs in minutes, hours, or days
- 🔕 Notifications using custom sounds via `offscreen` audio playback
- 🧠 Restore entire tab groups when reminders fire
- 🗂️ Optional comments and live countdown timers
- 🔄 Sort and filter active reminders (e.g. hide those longer than 12 hours)
- ⌨️ Keyboard shortcuts for quick reminders (30 min to 14 days)
- 🔔 Extension icon updates if reminders are overdue
- 🔒 Reminders are synced across devices using `chrome.storage.sync`

---

## 📦 Installation (Unpacked Mode)

- Clone or download the repository
- Open Chrome and go to chrome://extensions/
- Enable Developer mode
- Click "Load unpacked" and select the extension folder
- You're ready to go!

---

## 🚀 Quick Start

- Click the extension icon in your toolbar
- Current page URL auto-fills (or enter any URL)
- Set duration in minutes (30 minutes by default, keyboard shortcuts available)
- (Optional) Add a comment
- Click "Set Reminder"

When time elapses, you'll receive a notification that can:
- Open the original tab
- Restore entire tab groups (with original colors/titles)
- Play optional alert sound

---

## 🎯 Keyboard Shortcuts

You can trigger quick reminders using these shortcuts:

| Shortcut   | Duration      |
|------------|---------------|
| Alt+1      | 30 minutes    |
| Alt+2      | 60 minutes    |
| Alt+3      | 3 hours       |
| Alt+4      | 6 hours       |

> To enable more shortcuts (1–14 days), visit  
> [`chrome://extensions/shortcuts`](chrome://extensions/shortcuts)

---

## 🛠️ Tech Stack

- **Manifest V3**
- `chrome.alarms` for time tracking
- `chrome.notifications` for silent alerts
- `chrome.tabGroups` for full group restoration
- `chrome.commands` for keyboard shortcuts
- `chrome.offscreen` for custom audio alerts
- `chrome.storage.sync` to persist reminders across sessions

---

## 🖼️ Assets & Licensing

### 🔊 Sound
- Notification sound sourced from [FreeSound.org](https://freesound.org/people/deadrobotmusic/sounds/750608/)
- Created by [deadrobotmusic](https://freesound.org/people/deadrobotmusic/)
- Licensed under [CC0 1.0 Public Domain](https://creativecommons.org/publicdomain/zero/1.0/)

### 🎨 Icons
- UI icons from [Google Material Icons](https://github.com/google/material-design-icons)
- Licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
