// Runs only on Instela. The worker independently reads and validates the
// workspace; no facts or answers cross this bridge.
if (!globalThis.__instelaWorkspaceReady) {
  globalThis.__instelaWorkspaceReady = true;
  document.addEventListener("click", async event => {
    const link = event.target.closest?.("a[data-instela-open-application]");
    if (!event.isTrusted || !link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (!/^\/listing\/[^/]+\/apply\/?$/.test(location.pathname)) return;
    event.preventDefault();
    const notice = document.querySelector("[data-instela-launch-status]");
    try {
      const result = await chrome.runtime.sendMessage({ type: "INSTELA_OPEN_APPLICATION" });
      if (notice) notice.textContent = result?.ok ? "Application connected. Open the Instela extension on the form to autofill." : result?.reason ?? "Could not connect. Reload this page and try again.";
    } catch {
      if (notice) notice.textContent = "Reload the Instela extension and this page, then try again.";
    }
  });
}
