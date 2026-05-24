(function () {
  const STORAGE_KEY = "drift-bottle-settings";
  const VIEWED_KEY = "drift-bottle-viewed-issues";
  const SUBMIT_AT_KEY = "drift-bottle-submit-at";
  const BOTTLE_MARKER = "<!-- drift-bottle -->";
  const VIEWED_LIMIT = 200;
  const MAX_THROW_LENGTH = 500;
  const MAX_REPLY_LENGTH = 300;
  const SUBMIT_COOLDOWN_MS = 10 * 1000;
  const BLOCKED_PATTERNS = [
    "约炮",
    "裸聊",
    "招嫖",
    "嫖娼",
    "赌博",
    "刷单",
    "加微信",
    "加v",
    "vx",
    "电报群",
    "telegram",
    "代开发票",
    "办证",
    "买卖账号"
  ];

  const state = {
    settings: null,
    bottles: [],
    myBottleCount: 0,
    loading: false,
    mode: "none",
    currentBottle: null,
    currentComments: [],
    noticeTimer: 0
  };

  const els = {};

  function initElements() {
    els.throwOpenBtn = document.getElementById("throw-open-btn");
    els.salvageOpenBtn = document.getElementById("salvage-open-btn");
    els.overlay = document.getElementById("overlay");
    els.modalDisplay = document.getElementById("modal-display");
    els.modalTextarea = document.getElementById("modal-textarea");
    els.modalActionBtn = document.getElementById("modal-action-btn");
    els.modalCancelBtn = document.getElementById("modal-cancel-btn");
    els.notice = document.getElementById("notice");
    els.statusLive = document.getElementById("status-live");
  }

  function getUtoolsStorage() {
    try {
      return window.utools && window.utools.dbStorage ? window.utools.dbStorage : null;
    } catch (error) {
      return null;
    }
  }

  function readStorage(key, fallbackValue) {
    const store = getUtoolsStorage();
    if (store && typeof store.getItem === "function") {
      const value = store.getItem(key);
      return value == null ? fallbackValue : value;
    }

    const raw = window.localStorage.getItem(key);
    if (raw == null) {
      return fallbackValue;
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      return fallbackValue;
    }
  }

  function writeStorage(key, value) {
    const store = getUtoolsStorage();
    if (store && typeof store.setItem === "function") {
      store.setItem(key, value);
      return;
    }

    window.localStorage.setItem(key, JSON.stringify(value));
  }

  function normalizeSettings(raw) {
    if (!raw || typeof raw !== "object") {
      return null;
    }

    const owner = String(raw.owner || "").trim();
    const repo = String(raw.repo || "").trim();
    const token = String(raw.token || "").trim();

    if (!owner || !repo || !token) {
      return null;
    }

    return { owner, repo, token };
  }

  function loadSettings() {
    const stored = normalizeSettings(readStorage(STORAGE_KEY, null));
    const bootstrapped = normalizeSettings(window.DRIFT_BOTTLE_BOOTSTRAP);
    state.settings = stored || bootstrapped;

    if (!stored && bootstrapped) {
      writeStorage(STORAGE_KEY, bootstrapped);
    }
  }

  function speak(message) {
    els.statusLive.textContent = message || "";
  }

  function showNotice(message) {
    const text = String(message || "").trim();
    if (!text) {
      return;
    }

    speak(text);
    els.notice.textContent = text;
    els.notice.classList.remove("hidden");

    if (state.noticeTimer) {
      window.clearTimeout(state.noticeTimer);
    }

    state.noticeTimer = window.setTimeout(() => {
      els.notice.classList.add("hidden");
      els.notice.textContent = "";
      state.noticeTimer = 0;
    }, 2200);
  }

  function getErrorMessage(error, fallbackMessage) {
    if (error && typeof error.message === "string" && error.message.trim()) {
      return error.message.trim();
    }

    return fallbackMessage || "操作失败";
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function bodyToHtml(text) {
    return escapeHtml(text).replace(/\n/g, "<br />");
  }

  function formatDate(dateValue) {
    try {
      const date = new Date(dateValue);
      const diff = Date.now() - date.getTime();
      const minute = 60 * 1000;
      const hour = 60 * minute;
      const day = 24 * hour;

      if (diff < minute) {
        return "刚刚";
      }

      if (diff < hour) {
        return `${Math.max(1, Math.floor(diff / minute))}分钟前`;
      }

      if (diff < day) {
        return `${Math.max(1, Math.floor(diff / hour))}小时前`;
      }

      if (diff < 30 * day) {
        return `${Math.max(1, Math.floor(diff / day))}天前`;
      }

      return new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "medium"
      }).format(date);
    } catch (error) {
      return "";
    }
  }

  function setLoading(loading) {
    state.loading = loading;
    els.throwOpenBtn.disabled = loading;
    els.salvageOpenBtn.disabled = loading;
    els.modalActionBtn.disabled = loading;
    els.modalCancelBtn.disabled = loading;
  }

  function loadViewedIds() {
    const value = readStorage(VIEWED_KEY, []);
    return Array.isArray(value) ? value : [];
  }

  function rememberViewedIssue(issueId) {
    const current = loadViewedIds().filter((id) => id !== issueId);
    current.unshift(issueId);
    writeStorage(VIEWED_KEY, current.slice(0, VIEWED_LIMIT));
  }

  function normalizeModerationText(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[\s\-_.:：,，;；|]/g, "");
  }

  function findBlockedPattern(text) {
    const normalized = normalizeModerationText(text);
    return BLOCKED_PATTERNS.find((pattern) => normalized.includes(pattern)) || "";
  }

  function validateMessage(message, mode) {
    const text = String(message || "").trim();
    if (!text) {
      return "写一点内容再发出吧";
    }

    const maxLength = mode === "throw" ? MAX_THROW_LENGTH : MAX_REPLY_LENGTH;
    if (text.length > maxLength) {
      return mode === "throw" ? `字数稍多了，请控制在 ${MAX_THROW_LENGTH} 字内` : `字数稍多了，请控制在 ${MAX_REPLY_LENGTH} 字内`;
    }

    if (findBlockedPattern(text)) {
      return "这段话不太适合放进海里，请换一种更温和的表达。功德 -1";
    }

    return "";
  }

  function getSubmitCooldownSeconds() {
    const lastSubmitAt = Number(readStorage(SUBMIT_AT_KEY, 0)) || 0;
    const remaining = SUBMIT_COOLDOWN_MS - (Date.now() - lastSubmitAt);
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }

  function rememberSubmitAt() {
    writeStorage(SUBMIT_AT_KEY, Date.now());
  }

  function openModal(mode, text, buttonText, readonly) {
    state.mode = mode;
    els.overlay.classList.remove("hidden");
    els.modalTextarea.value = text || "";
    els.modalTextarea.readOnly = Boolean(readonly);
    els.modalActionBtn.textContent = buttonText;
    els.modalCancelBtn.classList.toggle(
      "hidden",
      mode !== "throw" && mode !== "salvage-reply" && mode !== "salvage-view"
    );
    els.modalDisplay.classList.toggle("hidden", mode !== "salvage-view" && mode !== "close");
    els.modalTextarea.classList.toggle("hidden", mode === "salvage-view" || mode === "close");

    if (mode === "throw") {
      els.modalTextarea.placeholder = "";
      els.modalDisplay.innerHTML = "";
    } else if (mode === "salvage-view") {
      els.modalTextarea.placeholder = "";
      renderSalvageDisplay();
    } else if (mode === "salvage-reply") {
      els.modalTextarea.placeholder = "写下回复";
      els.modalDisplay.innerHTML = "";
    } else {
      els.modalTextarea.placeholder = "";
      els.modalDisplay.innerHTML = `<div class="reply-item-meta">${escapeHtml(text || "")}</div>`;
    }

    if (readonly) {
      els.modalTextarea.setAttribute("readonly", "readonly");
    } else {
      els.modalTextarea.removeAttribute("readonly");
    }

    requestAnimationFrame(() => {
      if (mode === "salvage-view" || mode === "close") {
        els.modalActionBtn.focus();
      } else {
        els.modalTextarea.focus();
        const end = els.modalTextarea.value.length;
        if (!readonly) {
          els.modalTextarea.setSelectionRange(end, end);
        }
      }
    });
  }

  function closeModal() {
    state.mode = "none";
    state.currentBottle = null;
    state.currentComments = [];
    els.overlay.classList.add("hidden");
    els.modalTextarea.value = "";
    els.modalDisplay.innerHTML = "";
    els.modalActionBtn.textContent = "";
    els.modalTextarea.removeAttribute("readonly");
  }

  async function githubRequest(path, options) {
    if (!state.settings) {
      throw new Error("缺少配置");
    }

    const response = await fetch(`https://api.github.com${path}`, {
      method: options && options.method ? options.method : "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${state.settings.token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: options && options.body ? JSON.stringify(options.body) : undefined
    });

    if (!response.ok) {
      let message = `GitHub ${response.status}`;
      try {
        const payload = await response.json();
        if (payload && payload.message) {
          message = payload.message;
        }
      } catch (error) {
        // Ignore parse failure.
      }
      throw new Error(message);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  async function refreshBottles() {
    const issues = await githubRequest(
      `/repos/${encodeURIComponent(state.settings.owner)}/${encodeURIComponent(state.settings.repo)}/issues?state=open&per_page=100&sort=updated&direction=desc`
    );

    state.bottles = issues.filter(
      (issue) =>
        !issue.pull_request &&
        typeof issue.body === "string" &&
        issue.body.includes(BOTTLE_MARKER)
    );

    state.myBottleCount = state.bottles.filter(
      (issue) => issue.user && issue.user.login === state.settings.owner
    ).length;
  }

  async function fetchComments(issueNumber) {
    const comments = await githubRequest(
      `/repos/${encodeURIComponent(state.settings.owner)}/${encodeURIComponent(state.settings.repo)}/issues/${issueNumber}/comments?per_page=100`
    );

    return comments
      .map((comment) => ({
        ...comment,
        body: String(comment.body || "").trim()
      }))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  function chooseBottle() {
    const viewed = loadViewedIds();
    const all = state.bottles.map((issue) => ({
      id: issue.id,
      number: issue.number,
      author: issue.user && issue.user.login ? issue.user.login : "",
      content: String(issue.body || "").replace(BOTTLE_MARKER, "").trim(),
      created_at: issue.created_at
    }));

    const notMine = all.filter((item) => item.author !== state.settings.owner);
    const pool = notMine.length ? notMine : all;
    const fresh = pool.filter((item) => !viewed.includes(item.id));
    let finalPool = fresh;

    if (!finalPool.length) {
      const latestViewedId = viewed[0];
      const withoutLatest = pool.filter((item) => item.id !== latestViewedId);
      finalPool = withoutLatest.length ? withoutLatest : pool;
    }

    if (!finalPool.length) {
      return null;
    }

    const picked = finalPool[Math.floor(Math.random() * finalPool.length)];
    rememberViewedIssue(picked.id);
    return picked;
  }

  function renderSalvageDisplay() {
    const bottle = state.currentBottle;
    if (!bottle) {
      els.modalDisplay.innerHTML = "";
      return;
    }

    const repliesHtml = state.currentComments.length
      ? `
        <div class="reply-list">
          ${state.currentComments
            .map(
              (comment) => `
                <div class="reply-item">
                  <div class="reply-item-meta">${escapeHtml(formatDate(comment.created_at))}</div>
                  <div class="reply-item-body">${bodyToHtml(comment.body || "")}</div>
                </div>
              `
            )
            .join("")}
        </div>
      `
      : "";

    els.modalDisplay.innerHTML = `
      <div class="bottle-card">
        <div class="modal-body">${bodyToHtml(bottle.content)}</div>
        <div class="bottle-meta">#${escapeHtml(String(bottle.number || ""))} · ${escapeHtml(formatDate(bottle.created_at || ""))}</div>
      </div>
      ${repliesHtml}
    `;
  }

  function openThrow() {
    openModal("throw", "", "提交", false);
  }

  async function openSalvage() {
    if (!state.settings) {
      openModal("close", "不可用", "关闭", true);
      return;
    }

    setLoading(true);
    speak("打捞中");

    try {
      await refreshBottles();

      if (!state.myBottleCount) {
        openModal("close", "先丢一个", "关闭", true);
        speak("先丢一个");
        return;
      }

      const bottle = chooseBottle();
      if (!bottle) {
        openModal("close", "海里现在没有漂流瓶", "关闭", true);
        speak("空");
        return;
      }

      state.currentBottle = bottle;
      state.currentComments = await fetchComments(bottle.number);
      openModal("salvage-view", bottle.content, "回复", true);
      speak("已打捞到一个漂流瓶");
    } catch (error) {
      openModal("close", getErrorMessage(error, "打捞失败"), "关闭", true);
    } finally {
      setLoading(false);
    }
  }

  async function submitThrow() {
    const message = els.modalTextarea.value.trim();
    const validationMessage = validateMessage(message, "throw");
    if (validationMessage) {
      showNotice(validationMessage);
      return;
    }

    const cooldownSeconds = getSubmitCooldownSeconds();
    if (cooldownSeconds > 0) {
      showNotice(`${cooldownSeconds} 秒后再试`);
      return;
    }

    setLoading(true);
    speak("提交中");

    try {
      const firstLine = message.split("\n").find((line) => line.trim()) || "匿名";
      await githubRequest(
        `/repos/${encodeURIComponent(state.settings.owner)}/${encodeURIComponent(state.settings.repo)}/issues`,
        {
          method: "POST",
          body: {
            title: `漂流瓶｜${firstLine.slice(0, 22)}`,
            body: `${BOTTLE_MARKER}\n${message}`
          }
        }
      );

      rememberSubmitAt();
      closeModal();
      showNotice("已丢出，功德 +1");
      await refreshBottles();
    } catch (error) {
      showNotice(getErrorMessage(error, "提交失败"));
    } finally {
      setLoading(false);
    }
  }

  async function submitReply() {
    if (!state.currentBottle) {
      return;
    }

    const message = els.modalTextarea.value.trim();
    const validationMessage = validateMessage(message, "reply");
    if (validationMessage) {
      showNotice(validationMessage);
      return;
    }

    const cooldownSeconds = getSubmitCooldownSeconds();
    if (cooldownSeconds > 0) {
      showNotice(`${cooldownSeconds} 秒后再试`);
      return;
    }

    setLoading(true);
    speak("回复中");

    try {
      await githubRequest(
        `/repos/${encodeURIComponent(state.settings.owner)}/${encodeURIComponent(state.settings.repo)}/issues/${state.currentBottle.number}/comments`,
        {
          method: "POST",
          body: {
            body: message
          }
        }
      );

      rememberSubmitAt();
      closeModal();
      showNotice("回复已送达，功德 +1");
    } catch (error) {
      showNotice(getErrorMessage(error, "回复失败"));
    } finally {
      setLoading(false);
    }
  }

  async function handleModalAction() {
    if (state.mode === "throw") {
      await submitThrow();
      return;
    }

    if (state.mode === "salvage-view") {
      openModal("salvage-reply", "", "提交回复", false);
      return;
    }

    if (state.mode === "salvage-reply") {
      await submitReply();
      return;
    }

    closeModal();
  }

  function bindEvents() {
    els.throwOpenBtn.addEventListener("click", openThrow);
    els.salvageOpenBtn.addEventListener("click", openSalvage);
    els.modalActionBtn.addEventListener("click", handleModalAction);
    els.modalCancelBtn.addEventListener("click", closeModal);

    els.overlay.addEventListener("click", (event) => {
      if (event.target === els.overlay) {
        closeModal();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !els.overlay.classList.contains("hidden")) {
        closeModal();
      }
    });

    els.modalTextarea.addEventListener("keydown", async (event) => {
      if (state.mode === "throw" && event.key === "Enter" && event.ctrlKey) {
        event.preventDefault();
        await submitThrow();
      }

      if (state.mode === "salvage-reply" && event.key === "Enter" && event.ctrlKey) {
        event.preventDefault();
        await submitReply();
      }
    });
  }

  async function start() {
    initElements();
    bindEvents();
    loadSettings();

    if (state.settings) {
      try {
        await refreshBottles();
      } catch (error) {
        showNotice(getErrorMessage(error, "初始化失败"));
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
