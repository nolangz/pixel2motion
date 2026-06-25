/* ============================================================
   Waitlist form handler
   ------------------------------------------------------------
   Posts waitlist submissions to the Cloudflare Pages Function
   at /api/waitlist and shows an inline success/error message.
   ============================================================ */

const WAITLIST_API_ORIGIN = "https://pixel2motion.com";
const WAITLIST_SITE_HOSTS = new Set(["pixel2motion.com", "www.pixel2motion.com"]);
const ENDPOINT = WAITLIST_SITE_HOSTS.has(window.location.hostname) ? "/api/waitlist" : `${WAITLIST_API_ORIGIN}/api/waitlist`;

(function () {
  const form = document.getElementById("waitlist-form");
  if (!form) return;

  const input = form.querySelector('input[type="email"]');
  const button = form.querySelector('button[type="submit"]');
  const status = document.getElementById("form-status");
  let isSubmitting = false;

  // translation helper (falls back to English if i18n isn't loaded)
  const tr = (key, fallback) => (window.t ? window.t(key) : fallback);

  const setStatus = (msg, type) => {
    status.textContent = msg;
    status.className = "form__status" + (type ? " " + type : "");
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const email = (input.value || "").trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus(tr("status.invalid", "Please enter a valid email address."), "error");
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return;
    }

    isSubmitting = true;
    form.setAttribute("aria-busy", "true");
    input.setAttribute("aria-invalid", "false");
    const original = button.textContent;
    button.textContent = tr("status.joining", "Joining…");
    setStatus("", "");

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email, page: window.location.href }),
      });
      if (!res.ok) throw new Error("Request failed: " + res.status);

      form.reset();
      setStatus(tr("status.success", "You're on the list — we'll be in touch. 🔥"), "ok");
    } catch (err) {
      console.error(err);
      setStatus(tr("status.error", "Something went wrong. Please try again, or email hi@lykno.ai."), "error");
    } finally {
      isSubmitting = false;
      form.removeAttribute("aria-busy");
      button.textContent = original;
    }
  });
})();
