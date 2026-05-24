(function () {
  const STORAGE_KEY = "drift-bottle-settings";
  const VIEWED_KEY = "drift-bottle-viewed-issues";
  const BOTTLE_MARKER = "<!-- drift-bottle -->";
  const COMMENT_MARKER = "<!-- drift-comment -->";
  const REPLY_PREFIX = "<!-- drift-reply-to:";
  const MAX_ISSUE_PAGES = 5;

  const state = {
    started: false,
    loading: false,
    settings: null,
    currentUser: null,
    bottles: [],
    myBottles: [],
    currentBottle: null,
    replyTarget: null
  };

  const els = {};

  function initElements() {
    els.statusBanner = document.getElementById("status-banner");
    els.settingsPanel = document.getElementById("settings-panel");
    els.settingsToggle = document.getElementById("settings-toggle");
    els.refreshBtn = document.getElementById("refresh-btn");
    els.settingsForm = document.getElementById("settings-form");
    els.ownerInput = document.getElementById("owner-input");
    els.repoInput = document.getElementById("repo-input");
    els.tokenInput = document.getElementById("token-input");
    els.clearSettingsBtn = document.getElementById("clear-settings-btn");
    els.throwForm = document.getElementById("throw-form");
    els.throwInput = document.getElementById("throw-input");
    els.throwBtn = document.getElementById("throw-btn");
    els.throwCounter = document.getElementById("throw-counter");
    els.salvageBtn = document.getElementById("salvage-btn");
    els.salvageLock = document.getElementById("salvage-lock");
    els.emptyBottle = document.getElementById("empty-bottle");
    els.bottleDetail = document.getElementById("bottle-detail");
    els.bottleAuthor = document.getElementById("bottle-author");
    els.bottleTime = document.getElementById("bottle-time");
    els.bottleContent = document.getElementById("bottle-content");
    els.currentBottleSubtitle = document.getElementById("current-bottle-subtitle");
    els.issueLink = document.getElementById("issue-link");
    els.commentComposer = document.getElementById("comment-composer");
    els.replyTarget = document.getElementById("reply-target");
    els.cancelReplyBtn = document.getElementById("cancel-reply-btn");
    els.commentInput = document.getElementById("comment-input");
    els.submitCommentBtn = document.getElementById("submit-comment-btn");
    els.commentsSection = document.getElementById("comments-section");
    els.commentsCount = document.getElementById("comments-count");
    els.commentsList = document.getElementById("comments-list");
    els.myBottles = document.getElementById("my-bottles");
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

  function removeStorage(key) {
    const store = getUtoolsStorage();
    if (store && typeof store.removeItem === "function") {
      store.removeItem(key);
      return;
    }

    window.localStorage.removeItem(key);
  }

  function setStatus(message, type) {
    if (!message) {
      els.statusBanner.className = "status-banner";
      els.statusBanner.textContent = "";
      return;
    }

    els.statusBanner.textContent = message;
    els.statusBanner.className = "status-banner show";
    if (type) {
      els.statusBanner.classList.add(type);
    }
  }

  function setLoading(loading, message) {
    state.loading = loading;
    const disabled = Boolean(loading);
    [
      els.throwBtn,
      els.salvageBtn,
      els.submitCommentBtn,
      els.refreshBtn
    ].forEach((button) => {
      if (button) {
        button.disabled = disabled;
      }
    });

    if (loading && message) {
      setStatus(message, "success");
      return;
    }

    if (!loading && els.statusBanner.classList.contains("success")) {
      setStatus("", "");
    }
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
    state.settings = normalizeSettings(readStorage(STORAGE_KEY, null));
  }

  function saveSettings(settings) {
    state.settings = settings;
    writeStorage(STORAGE_KEY, settings);
  }

  function loadViewedIds() {
    const value = readStorage(VIEWED_KEY, []);
    return Array.isArray(value) ? value : [];
  }

  function rememberViewedIssue(issueId) {
    const current = loadViewedIds().filter((id) => id !== issueId);
    current.unshift(issueId);
    writeStorage(VIEWED_KEY, current.slice(0, 30));
  }

  function formatDate(dateValue) {
    try {
      return new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(new Date(dateValue));
    } catch (error) {
      return dateValue || "";
    }
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

  function stripBottleBody(body) {
    return String(body || "").replace(BOTTLE_MARKER, "").trim();
  }

  function buildBottleBody(message) {
    return `${BOTTLE_MARKER}\n${message.trim()}`;
  }

  function buildCommentBody(message, replyTo) {
    const parts = [COMMENT_MARKER];
    if (replyTo && replyTo.id) {
      parts.push(`<!-- drift-reply-to:${replyTo.id} -->`);
      parts.push(`回复 @${replyTo.user.login}`);
    }
    parts.push(message.trim());
    return parts.join("\n");
  }

  function parseComment(comment) {
    const rawBody = String(comment.body || "");
    const replyMatch = rawBody.match(/<!-- drift-reply-to:(\d+) -->/);
    const replyToId = replyMatch ? Number(replyMatch[1]) : null;
    let cleanBody = rawBody
      .replace(COMMENT_MARKER, "")
      .replace(/<!-- drift-reply-to:\d+ -->/, "")
      .trim();

    let replyToUser = "";
    if (cleanBody.startsWith("回复 @")) {
      const firstLineEnd = cleanBody.indexOf("\n");
      const firstLine = firstLineEnd === -1 ? cleanBody : cleanBody.slice(0, firstLineEnd);
      replyToUser = firstLine.replace("回复 @", "").trim();
      cleanBody = firstLineEnd === -1 ? "" : cleanBody.slice(firstLineEnd + 1).trim();
    }

    return {
      ...comment,
      replyToId,
      replyToUser,
      cleanBody
    };
  }

  async function githubRequest(path, options) {
    if (!state.settings) {
      throw new Error("请先完成 GitHub 配置。");
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
      let message = `GitHub 请求失败：${response.status}`;
      try {
        const payload = await response.json();
        if (payload && payload.message) {
          message = payload.message;
        }
      } catch (error) {
        // Ignore parse error and keep default message.
      }
      throw new Error(message);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  async function ensureGithubConnection() {
    const user = await githubRequest("/user");
    state.currentUser = user;
    return user;
  }

  async function fetchBottleIssues() {
    const issues = [];
    for (let page = 1; page <= MAX_ISSUE_PAGES; page += 1) {
      const batch = await githubRequest(
        `/repos/${encodeURIComponent(state.settings.owner)}/${encodeURIComponent(state.settings.repo)}/issues?state=open&per_page=100&page=${page}&sort=updated&direction=desc`
      );
      const filtered = batch.filter(
        (issue) =>
          !issue.pull_request &&
          typeof issue.body === "string" &&
          issue.body.includes(BOTTLE_MARKER)
      );
      issues.push(...filtered);
      if (batch.length < 100) {
        break;
      }
    }
    return issues;
  }

  async function fetchComments(issueNumber) {
    const comments = await githubRequest(
      `/repos/${encodeURIComponent(state.settings.owner)}/${encodeURIComponent(state.settings.repo)}/issues/${issueNumber}/comments?per_page=100`
    );
    return comments.map(parseComment);
  }

  function issueToBottle(issue) {
    return {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      author: issue.user && issue.user.login ? issue.user.login : "unknown",
      authorAvatar: issue.user && issue.user.avatar_url ? issue.user.avatar_url : "",
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      htmlUrl: issue.html_url,
      content: stripBottleBody(issue.body),
      comments: [],
      raw: issue
    };
  }

  function renderSettings() {
    const hasSettings = Boolean(state.settings);
    els.ownerInput.value = hasSettings ? state.settings.owner : "";
    els.repoInput.value = hasSettings ? state.settings.repo : "";
    els.tokenInput.value = hasSettings ? state.settings.token : "";
    els.settingsPanel.classList.toggle("hidden", hasSettings);
  }

  function renderStats() {
    const myCount = state.myBottles.length;
    els.throwCounter.textContent = `已丢 ${myCount} 个`;

    if (myCount > 0) {
      els.salvageLock.textContent = "已解锁";
      els.salvageLock.classList.remove("muted");
    } else {
      els.salvageLock.textContent = "未解锁";
      els.salvageLock.classList.add("muted");
    }
  }

  function renderMyBottles() {
    if (!state.myBottles.length) {
      els.myBottles.className = "mini-list empty-list";
      els.myBottles.textContent = state.settings
        ? "你还没有丢出任何瓶子。"
        : "先配置 GitHub 才能开始。";
      return;
    }

    els.myBottles.className = "mini-list";
    els.myBottles.innerHTML = state.myBottles
      .slice(0, 5)
      .map((bottle) => {
        const shortText =
          bottle.content.length > 80 ? `${bottle.content.slice(0, 80)}...` : bottle.content;
        return `
          <article class="mini-item">
            <div class="mini-top">
              <strong>#${bottle.number}</strong>
              <span class="meta-text">${formatDate(bottle.createdAt)}</span>
            </div>
            <div class="mini-body">${bodyToHtml(shortText)}</div>
          </article>
        `;
      })
      .join("");
  }

  function renderBottle() {
    if (!state.currentBottle) {
      els.emptyBottle.classList.remove("hidden");
      els.bottleDetail.classList.add("hidden");
      els.commentComposer.classList.add("hidden");
      els.commentsSection.classList.add("hidden");
      els.issueLink.classList.add("hidden");
      els.currentBottleSubtitle.textContent = "还没有捞到瓶子。";
      return;
    }

    els.emptyBottle.classList.add("hidden");
    els.bottleDetail.classList.remove("hidden");
    els.commentComposer.classList.remove("hidden");
    els.commentsSection.classList.remove("hidden");
    els.issueLink.classList.remove("hidden");

    els.bottleAuthor.textContent = `@${state.currentBottle.author}`;
    els.bottleTime.textContent = formatDate(state.currentBottle.createdAt);
    els.bottleContent.innerHTML = bodyToHtml(state.currentBottle.content);
    els.currentBottleSubtitle.textContent = `瓶子 #${state.currentBottle.number}`;
    els.issueLink.href = state.currentBottle.htmlUrl;
    renderReplyTarget();
    renderComments();
  }

  function renderReplyTarget() {
    if (!state.replyTarget) {
      els.replyTarget.classList.add("hidden");
      els.replyTarget.textContent = "";
      els.cancelReplyBtn.classList.add("hidden");
      els.commentInput.placeholder = "留下你的评论。";
      return;
    }

    els.replyTarget.classList.remove("hidden");
    els.cancelReplyBtn.classList.remove("hidden");
    els.replyTarget.textContent = `正在回复 @${state.replyTarget.user.login}`;
    els.commentInput.placeholder = `回复 @${state.replyTarget.user.login}`;
  }

  function renderComments() {
    const comments = state.currentBottle ? state.currentBottle.comments : [];
    els.commentsCount.textContent = `${comments.length} 条`;

    if (!comments.length) {
      els.commentsList.innerHTML = `<div class="empty-state">还没有评论，你来做第一个回复的人。</div>`;
      return;
    }

    els.commentsList.innerHTML = comments
      .map((comment) => {
        const replyLabel = comment.replyToUser
          ? `<div class="comment-reply-label">回复 @${escapeHtml(comment.replyToUser)}</div>`
          : "";
        return `
          <article class="comment-card">
            <div class="comment-top">
              <strong>@${escapeHtml(comment.user.login)}</strong>
              <span class="meta-text">${formatDate(comment.created_at)}</span>
            </div>
            ${replyLabel}
            <div class="comment-body">${bodyToHtml(comment.cleanBody)}</div>
            <div class="comment-actions">
              <button class="text-btn reply-btn" type="button" data-comment-id="${comment.id}">
                回复
              </button>
            </div>
          </article>
        `;
      })
      .join("");

    els.commentsList.querySelectorAll(".reply-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const commentId = Number(button.getAttribute("data-comment-id"));
        const target = comments.find((item) => item.id === commentId);
        if (!target) {
          return;
        }
        state.replyTarget = target;
        renderReplyTarget();
        els.commentInput.focus();
      });
    });
  }

  function chooseRandomBottle() {
    const viewed = loadViewedIds();
    const allBottles = state.bottles.map(issueToBottle);
    const myLogin = state.currentUser && state.currentUser.login ? state.currentUser.login : "";
    const nonSelf = allBottles.filter((bottle) => bottle.author !== myLogin);
    const primaryPool = nonSelf.length ? nonSelf : allBottles;
    const freshPool = primaryPool.filter((bottle) => !viewed.includes(bottle.id));
    const finalPool = freshPool.length ? freshPool : primaryPool;

    if (!finalPool.length) {
      return null;
    }

    const pick = finalPool[Math.floor(Math.random() * finalPool.length)];
    rememberViewedIssue(pick.id);
    return pick;
  }

  async function refreshData(showMessage) {
    if (!state.settings) {
      renderSettings();
      renderStats();
      renderMyBottles();
      renderBottle();
      return;
    }

    setLoading(true, "正在同步 GitHub 海面...");

    try {
      await ensureGithubConnection();
      state.bottles = await fetchBottleIssues();
      const myLogin = state.currentUser.login;
      state.myBottles = state.bottles
        .filter((issue) => issue.user && issue.user.login === myLogin)
        .map(issueToBottle)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      renderSettings();
      renderStats();
      renderMyBottles();

      if (state.currentBottle) {
        const issue = state.bottles.find((item) => item.id === state.currentBottle.id);
        if (issue) {
          const bottle = issueToBottle(issue);
          bottle.comments = await fetchComments(bottle.number);
          state.currentBottle = bottle;
        }
      }

      renderBottle();

      if (showMessage) {
        setStatus(
          `已连接 ${state.settings.owner}/${state.settings.repo}，当前登录为 @${state.currentUser.login}`,
          "success"
        );
      }
    } catch (error) {
      setStatus(error.message || "同步失败，请检查 GitHub 配置。", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSettings(event) {
    event.preventDefault();
    const settings = normalizeSettings({
      owner: els.ownerInput.value,
      repo: els.repoInput.value,
      token: els.tokenInput.value
    });

    if (!settings) {
      setStatus("请把 GitHub 仓库和 Token 填完整。", "error");
      return;
    }

    saveSettings(settings);
    await refreshData(true);
  }

  function buildIssueTitle(message) {
    const firstLine = message.split("\n").find((line) => line.trim()) || "匿名心事";
    const shortTitle = firstLine.trim().slice(0, 22);
    return `漂流瓶｜${shortTitle}`;
  }

  async function handleThrowBottle(event) {
    event.preventDefault();
    const message = els.throwInput.value.trim();

    if (!message) {
      setStatus("瓶子里得先写点内容。", "error");
      return;
    }

    if (!state.settings) {
      setStatus("请先完成 GitHub 配置。", "error");
      els.settingsPanel.classList.remove("hidden");
      return;
    }

    setLoading(true, "正在把瓶子丢进海里...");

    try {
      const issue = await githubRequest(
        `/repos/${encodeURIComponent(state.settings.owner)}/${encodeURIComponent(state.settings.repo)}/issues`,
        {
          method: "POST",
          body: {
            title: buildIssueTitle(message),
            body: buildBottleBody(message)
          }
        }
      );

      els.throwInput.value = "";
      setStatus(`瓶子已经丢出，编号 #${issue.number}。`, "success");
      await refreshData(false);
    } catch (error) {
      setStatus(error.message || "丢瓶子失败。", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSalvageBottle() {
    if (!state.settings) {
      setStatus("先完成 GitHub 配置，再开始打捞。", "error");
      els.settingsPanel.classList.remove("hidden");
      return;
    }

    if (!state.myBottles.length) {
      setStatus("规则限制：你至少先丢 1 个瓶子，才能打捞。", "error");
      return;
    }

    setLoading(true, "正在海里捞瓶子...");

    try {
      await refreshData(false);
      const bottle = chooseRandomBottle();
      if (!bottle) {
        state.currentBottle = null;
        renderBottle();
        setStatus("当前没有可打捞的瓶子。", "error");
        return;
      }

      bottle.comments = await fetchComments(bottle.number);
      state.currentBottle = bottle;
      state.replyTarget = null;
      renderBottle();

      const onlySelf =
        state.bottles.length > 0 &&
        state.bottles.every((issue) => issue.user && issue.user.login === state.currentUser.login);

      if (onlySelf) {
        setStatus("海里暂时只有你自己的瓶子，我先帮你捞起来做测试。", "success");
      } else {
        setStatus(`捞到了一个新瓶子：#${bottle.number}`, "success");
      }
    } catch (error) {
      setStatus(error.message || "打捞失败。", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitComment() {
    const message = els.commentInput.value.trim();

    if (!message) {
      setStatus("评论内容不能为空。", "error");
      return;
    }

    if (!state.currentBottle) {
      setStatus("请先打捞到一个瓶子。", "error");
      return;
    }

    setLoading(true, "正在发送评论...");

    try {
      await githubRequest(
        `/repos/${encodeURIComponent(state.settings.owner)}/${encodeURIComponent(state.settings.repo)}/issues/${state.currentBottle.number}/comments`,
        {
          method: "POST",
          body: {
            body: buildCommentBody(message, state.replyTarget)
          }
        }
      );

      els.commentInput.value = "";
      state.replyTarget = null;
      renderReplyTarget();

      const comments = await fetchComments(state.currentBottle.number);
      state.currentBottle.comments = comments;
      renderComments();
      setStatus("评论已发送。", "success");
    } catch (error) {
      setStatus(error.message || "发送评论失败。", "error");
    } finally {
      setLoading(false);
    }
  }

  function handleClearSettings() {
    removeStorage(STORAGE_KEY);
    state.settings = null;
    state.currentUser = null;
    state.bottles = [];
    state.myBottles = [];
    state.currentBottle = null;
    state.replyTarget = null;
    renderSettings();
    renderStats();
    renderMyBottles();
    renderBottle();
    setStatus("GitHub 配置已清空。", "success");
  }

  function bindEvents() {
    els.settingsToggle.addEventListener("click", () => {
      els.settingsPanel.classList.toggle("hidden");
    });
    els.refreshBtn.addEventListener("click", () => refreshData(true));
    els.settingsForm.addEventListener("submit", handleSaveSettings);
    els.clearSettingsBtn.addEventListener("click", handleClearSettings);
    els.throwForm.addEventListener("submit", handleThrowBottle);
    els.salvageBtn.addEventListener("click", handleSalvageBottle);
    els.submitCommentBtn.addEventListener("click", handleSubmitComment);
    els.cancelReplyBtn.addEventListener("click", () => {
      state.replyTarget = null;
      renderReplyTarget();
    });
  }

  async function start() {
    if (state.started) {
      return;
    }
    state.started = true;
    initElements();
    bindEvents();
    loadSettings();
    renderSettings();
    renderStats();
    renderMyBottles();
    renderBottle();

    if (!state.settings) {
      setStatus("先填 GitHub 仓库和 Token，插件就能直接工作。", "success");
      return;
    }

    await refreshData(true);
  }

  function boot() {
    if (window.utools && typeof window.utools.onPluginReady === "function") {
      window.utools.onPluginReady(start);
      if (typeof window.utools.onPluginEnter === "function") {
        window.utools.onPluginEnter(() => {
          if (state.settings) {
            refreshData(false);
          }
        });
      }
      return;
    }

    start();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
