// Runs only on Instela. The worker independently reads and validates the
// workspace; no facts or answers cross this bridge.
if (!globalThis.__instelaWorkspaceReady) {
  globalThis.__instelaWorkspaceReady = true;
  let opening = false;
  document.addEventListener("click", async event => {
    const link = event.target.closest?.("a[data-instela-open-application]");
    if (!event.isTrusted || !link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (!/^\/listing\/[^/]+\/apply\/?$/.test(location.pathname)) return;
    event.preventDefault();
    if (opening) return;
    opening = true;
    const notice = document.querySelector("[data-instela-launch-status]");
    if (notice) notice.textContent = "Opening your application…";
    let timeout;
    try {
      const result = await Promise.race([
        chrome.runtime.sendMessage({ type: "INSTELA_OPEN_APPLICATION" }),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("timeout")), 8000); }),
      ]);
      if (notice) notice.textContent = result?.ok ? "Application connected. Open the Instela extension on the form to autofill." : `${result?.reason ?? "The extension did not respond."} Use Open application directly below, then open the extension on that page.`;
    } catch {
      if (notice) notice.textContent = "The extension could not connect. Use Open application directly below. To reconnect Instela, reload the extension in chrome://extensions and refresh this page.";
    } finally {
      clearTimeout(timeout);
      opening = false;
    }
  });
}
