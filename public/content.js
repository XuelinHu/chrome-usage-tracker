(() => {
  let reportedBytes = 0;

  function reportResourceDelta() {
    const entries = performance.getEntriesByType("resource");
    const totalBytes = entries.reduce((total, entry) => {
      return total + (entry.transferSize || entry.encodedBodySize || 0);
    }, 0);
    const delta = Math.max(0, totalBytes - reportedBytes);
    reportedBytes = totalBytes;

    if (delta > 0) {
      chrome.runtime.sendMessage({
        type: "resource-estimate",
        bytes: delta
      });
    }
  }

  window.setTimeout(reportResourceDelta, 1500);
  window.setInterval(reportResourceDelta, 30000);
})();
