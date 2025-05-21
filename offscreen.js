console.log("[DEBUG] Offscreen script loaded");

try {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'playSound') {
      const audio = new Audio(chrome.runtime.getURL('sounds/alert.mp3'));

      audio.play()
        .then(() => {
          console.log("[DEBUG] Sound played successfully");
          sendResponse({ status: 'ok' });
        })
        .catch((err) => {
          console.error("[DEBUG] Error playing sound:", err);
          sendResponse({ status: 'error', error: err.message });
        });

      return true; // Keep port open
    }
  });
} catch (e) {
  console.error("[DEBUG] Offscreen error:", e);
}
