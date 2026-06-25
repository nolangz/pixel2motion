/* ============================================================
   Daily GitHub star count
   ------------------------------------------------------------
   Writes the repo's current star count into any element marked
   with [data-gh-stars]. The backend refreshes the value from
   GitHub once per day and serves a cached response.
   ============================================================ */

const POLL_MS = 60 * 60 * 1000; // backend is daily-cached; hourly focus refresh is enough
const GITHUB_STARS_API_ORIGIN = "https://pixel2motion.com";
const GITHUB_STARS_SITE_HOSTS = new Set(["pixel2motion.com", "www.pixel2motion.com"]);
const STARS_ENDPOINT = GITHUB_STARS_SITE_HOSTS.has(window.location.hostname) ? "/api/github-stars" : `${GITHUB_STARS_API_ORIGIN}/api/github-stars`;

async function refreshStars() {
  const targets = document.querySelectorAll("[data-gh-stars]");
  if (!targets.length) return;
  try {
    const res = await fetch(STARS_ENDPOINT, { headers: { Accept: "application/json" } });
    if (!res.ok) return; // keep the last good value
    const data = await res.json();
    if (typeof data.stargazers_count !== "number") return;
    const formatted = data.formatted || data.stargazers_count.toLocaleString("en-US");
    targets.forEach((el) => { if (el.textContent !== formatted) el.textContent = formatted; });
  } catch (_) {
    /* network error — keep the last value */
  }
}

refreshStars(); // on load
setInterval(() => { if (document.visibilityState === "visible") refreshStars(); }, POLL_MS);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshStars();
});
