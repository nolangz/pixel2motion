/* ============================================================
   Lightweight i18n — English / 简体中文
   ------------------------------------------------------------
   Translates any [data-i18n] (textContent), [data-i18n-ph]
   (placeholder) and [data-i18n-aria] (aria-label). Language is
   remembered in localStorage; defaults to the browser language.
   Exposes window.t(key) and window.setLang(lang) (used by
   waitlist.js for its status messages).
   ============================================================ */
(function () {
  const DICT = {
    "nav.waitlist":  { en: "Join waitlist",      zh: "加入候补" },
    "hero.eyebrow":  { en: "Premium commercial site · coming soon", zh: "高品质商业付费版 · 筹备上线" },
    "hero.lead":     {
      en: "A higher-quality paid Pixel2Motion experience is being prepared for launch. Join the waitlist for early access to commercial-grade logo and data motion design.",
      zh: "更高品质的 Pixel2Motion 商业付费版正在筹备上线。加入候补名单，第一时间体验面向商业项目的 Logo 与数据动效服务。"
    },
    "cta.waitlist":  { en: "Join the waitlist",  zh: "加入候补名单" },
    "cta.github":    { en: "View on GitHub",     zh: "在 GitHub 查看" },

    "svc.eyebrow":   { en: "What we animate",     zh: "我们能做什么" },
    "svc.title":     { en: "Logo and data, in motion.", zh: "让 Logo 与数据动起来。" },
    "svc.sub":       {
      en: "The paid commercial site is being crafted for teams that need polished, presentation-ready motion from raw brand and data assets.",
      zh: "商业付费版正在为团队级使用场景打磨：把原始品牌与数据素材，变成可直接用于展示的高完成度动效。"
    },
    "svc.logo.title": { en: "Logo animation",     zh: "Logo 动画" },
    "svc.logo.desc":  {
      en: "Your mark in motion — reveals, intros, loaders, and loops choreographed to the last frame. Brand moments that feel alive.",
      zh: "让你的标志动起来——开场、揭幕、加载与循环动画，逐帧精心编排，让品牌瞬间鲜活生动。"
    },
    "svc.logo.use":   { en: "Splash screens · brand intros · loading states · social", zh: "启动画面 · 品牌开场 · 加载状态 · 社交媒体" },
    "svc.data.title": { en: "Data chart animation", zh: "数据图表动画" },
    "svc.data.desc":  {
      en: "Numbers that move — charts and visualizations animated with clarity and rhythm, so the story lands the moment it appears.",
      zh: "让数字动起来——清晰且富有节奏感的图表与可视化动画，让数据故事在出现的瞬间就被读懂。"
    },
    "svc.data.use":   { en: "Decks · reports · launches · dashboards", zh: "演示 · 报告 · 发布 · 仪表盘" },

    "wl.title":       { en: "Join the waitlist",  zh: "加入候补名单" },
    "wl.desc":        {
      en: "The current site will stay simple while the higher-quality paid commercial site is prepared. Leave your email and we'll reach out at launch.",
      zh: "当前页面会保持简洁；更高品质的商业付费版正在筹备上线。留下邮箱，上线时第一时间通知你。"
    },
    "wl.label":       { en: "Email for launch updates", zh: "接收上线通知的邮箱" },
    "wl.placeholder": { en: "you@example.com",    zh: "you@example.com" },
    "wl.button":      { en: "Notify me",          zh: "通知我" },
    "wl.note":        { en: "We'll only use your email to send Pixel2Motion launch updates.", zh: "我们只会用你的邮箱发送 Pixel2Motion 上线通知。" },

    /* used by waitlist.js */
    "status.invalid": { en: "Please enter a valid email address.", zh: "请输入有效的邮箱地址。" },
    "status.joining": { en: "Joining…",           zh: "提交中…" },
    "status.success": { en: "You're on the list — we'll be in touch. 🔥", zh: "已加入候补名单——我们会与你联系。🔥" },
    "status.error":   { en: "Something went wrong. Please try again, or email hi@lykno.ai.", zh: "出了点问题，请重试，或邮件联系 hi@lykno.ai。" }
  };

  const SUPPORTED = ["en", "zh"];
  function detect() {
    const saved = localStorage.getItem("p2m-lang");
    if (saved && SUPPORTED.includes(saved)) return saved;
    return (navigator.language || "en").toLowerCase().indexOf("zh") === 0 ? "zh" : "en";
  }

  let lang = detect();
  window.__lang = lang;
  window.t = (key) => (DICT[key] && (DICT[key][lang] || DICT[key].en)) || key;

  function apply() {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const v = DICT[el.getAttribute("data-i18n")];
      if (v) el.textContent = v[lang] || v.en;
    });
    document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
      const v = DICT[el.getAttribute("data-i18n-ph")];
      if (v) el.setAttribute("placeholder", v[lang] || v.en);
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      const v = DICT[el.getAttribute("data-i18n-aria")];
      if (v) el.setAttribute("aria-label", v[lang] || v.en);
    });
    const tg = document.getElementById("lang-toggle");
    if (tg) tg.textContent = lang === "en" ? "中文" : "EN"; // shows the language you switch TO
  }

  window.setLang = function (l) {
    if (!SUPPORTED.includes(l)) return;
    lang = l;
    window.__lang = l;
    localStorage.setItem("p2m-lang", l);
    apply();
    document.dispatchEvent(new CustomEvent("langchange", { detail: l }));
  };

  apply(); // script is at end of body, DOM is ready
  const tg = document.getElementById("lang-toggle");
  if (tg) tg.addEventListener("click", () => window.setLang(window.__lang === "en" ? "zh" : "en"));
})();
