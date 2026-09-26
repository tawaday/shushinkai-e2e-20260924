// Staging-only, opt-in diagnostics. Never retain URLs, identity values, or tokens.
var PortalStageDiagnostics = (() => {
  "use strict";
  const BUILD = "diag-20260926-1";
  const STORE = "shushinkai_stage_diagnostics_v1";
  const RESUME = "shushinkai_stage_diagnostics_resume_v1";
  const views = ["card", "profile", "register", "alreadyRegistered", "home"];
  const actions = ["resolve", "registrationLookup", "registrationConfirm"];
  const runPattern = /^d[a-f0-9]{24}$/;
  const requestPattern = /^d[a-f0-9]{24}_[1-9][0-9]{0,2}$/;
  const view = value => views.includes(value) ? value : value ? "other" : "absent";
  function params() {
    const query = new URLSearchParams(location.search);
    const state = query.get("liff.state") || "";
    const nested = new URLSearchParams(state.includes("?") ? state.slice(state.indexOf("?") + 1) : state.replace(/^[?#]/, ""));
    return {query, nested};
  }
  const first = params();
  let enabled = first.query.get("diag") === "1" || first.nested.get("diag") === "1";
  if (!enabled && first.query.has("code") && first.query.has("state")) {
    try { enabled = Number(sessionStorage.getItem(RESUME)) > Date.now(); } catch (_) {}
  }
  if (!enabled) return null;
  try { sessionStorage.setItem(RESUME, String(Date.now() + 10 * 60 * 1000)); } catch (_) {}
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const run = "d" + Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  const choices = {
    event: ["boot", "before-init", "after-init", "request", "response", "failure", "screen", "pageshow"],
    queryView: [...views, "absent", "other"], stateView: [...views, "absent", "other"], launchView: [...views, "absent", "other"],
    action: [...actions, "other"], responseView: [...views, "absent", "other"], serverView: [...views, "absent", "other"],
    method: ["POST"], entry: ["GET", "POST", "absent"], host: ["gas", "gas-content", "other", "absent"],
    kind: ["health", "identity-form", "registered", "redirect", "error", "other-ok", "invalid"],
    branch: ["identity-form", "registered", "redirect", "welcome", "error", "other"],
    server: ["stage-diag-20260926-1", "absent", "other"],
    front: [BUILD], reason: ["fetch-or-json", "start", "other"]
  };
  const flags = ["inLine", "loggedIn", "hasLiffState", "oauthCallback", "redirected", "ok", "registered", "hasRedirect", "diagPresent", "requestMatched", "restoredPage"];
  // Whitelist both keys and values, including records restored from sessionStorage.
  function safe(input) {
    const out = {};
    if (!input || typeof input !== "object") return out;
    for (const [key, value] of Object.entries(input)) {
      if (choices[key] && choices[key].includes(value)) out[key] = value;
      else if (flags.includes(key) && typeof value === "boolean") out[key] = value;
      else if (key === "at" && typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) out[key] = value;
      else if (key === "run" && typeof value === "string" && runPattern.test(value)) out[key] = value;
      else if (key === "request" && typeof value === "string" && requestPattern.test(value)) out[key] = value;
      else if (key === "http" && Number.isInteger(value) && value >= 0 && value <= 599) out[key] = value;
      else if (["sdk", "line"].includes(key) && typeof value === "string" && /^\d[\d.A-Za-z_-]{0,31}$/.test(value)) out[key] = value;
    }
    return out;
  }
  let history = [];
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE) || "[]");
    if (Array.isArray(saved)) history = saved.slice(-49).map(safe).filter(row => row.event && row.run);
  } catch (_) {}
  let counter = 0, panel, summary, detailsText, copyStatus;
  function textLog() { return JSON.stringify({build: BUILD, records: history}, null, 2); }
  function persist() {
    try { sessionStorage.setItem(STORE, JSON.stringify(history)); } catch (_) {}
  }
  const labels = {health:"稼働確認用", "identity-form":"本人確認", registered:"登録済み", redirect:"目的画面へ移動", error:"エラー", "other-ok":"想定外の成功応答", invalid:"応答形式が不明", welcome:"ようこそ", other:"その他"};
  function render() {
    if (!panel) return;
    const current = history.filter(row => row.run === run);
    const latest = event => current.filter(row => row.event === event).slice(-1)[0] || {};
    const boot = latest("before-init"), init = latest("after-init"), request = latest("request"), response = latest("response"), screen = latest("screen");
    summary.textContent = [
      "読込版: " + BUILD,
      "検証番号: " + (request.request || run),
      "行き先: " + (boot.launchView || "未取得") + " → " + (init.queryView || "初期化待ち") + " / state: " + (init.stateView || "未取得"),
      "LINE内: " + (typeof init.inLine === "boolean" ? init.inLine ? "はい" : "いいえ" : "未取得"),
      "応答: " + (labels[response.kind] || "未受信") + " / HTTP: " + (response.http || "―"),
      "サーバー入口: " + (response.entry || "未取得") + " / 版: " + (response.server || "未取得"),
      "検証番号の照合: " + (typeof response.requestMatched === "boolean" ? response.requestMatched ? "一致" : "未一致" : "未取得"),
      "表示: " + (labels[screen.branch] || "処理中")
    ].join("\n");
    detailsText.textContent = textLog();
  }
  function record(event, data) {
    history.push(safe(Object.assign({at:new Date().toISOString(), run, event}, data)));
    history = history.slice(-50);
    persist(); render();
  }
  function mount() {
    if (panel) return;
    panel = document.createElement("aside"); panel.className = "stageDiagnostics";
    const heading = document.createElement("h2"); heading.textContent = "STAGING診断";
    const note = document.createElement("p"); note.textContent = "異常が出たら閉じる前に、この欄を撮影するか診断記録をコピーしてください。登録操作は不要です。";
    summary = document.createElement("pre");
    const copy = document.createElement("button"); copy.type = "button"; copy.textContent = "診断記録をコピー";
    copyStatus = document.createElement("p"); copyStatus.setAttribute("role", "status");
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(textLog()); copyStatus.textContent = "コピーしました。この会話へ貼り付けられます。"; }
      catch (_) { copyStatus.textContent = "コピーできませんでした。診断欄の画像、または下の詳細ログを共有してください。"; }
    });
    const details = document.createElement("details");
    const caption = document.createElement("summary"); caption.textContent = "詳細ログ（初回・開き直しの記録）";
    detailsText = document.createElement("pre"); details.append(caption, detailsText);
    panel.append(heading, note, summary, copy, copyStatus, details); document.body.append(panel); render();
  }
  function locationInfo() {
    const p = params();
    return {queryView:view(p.query.get("view")), stateView:view(p.nested.get("view")), hasLiffState:p.query.has("liff.state"), oauthCallback:p.query.has("code") && p.query.has("state")};
  }
  function env() {
    const info = {};
    try {
      info.inLine = liff.isInClient(); info.loggedIn = liff.isLoggedIn();
      info.sdk = liff.getVersion(); info.line = liff.getLineVersion();
    } catch (_) {}
    return info;
  }
  function kind(result) {
    if (!result || typeof result.ok !== "boolean") return "invalid";
    if (!result.ok) return "error";
    if (result.environment === "portal-stage-20260926" && result.realLineAuth === true) return "health";
    if (result.view === "register") return "identity-form";
    if (result.view === "alreadyRegistered") return "registered";
    if (result.redirectUrl) return "redirect";
    return "other-ok";
  }
  record("boot", Object.assign({front:BUILD}, locationInfo()));
  document.addEventListener("DOMContentLoaded", mount);
  window.addEventListener("pageshow", event => record("pageshow", {restoredPage:!!event.persisted}));
  return {
    beforeInit(launch) { record("before-init", Object.assign({launchView:view(launch)}, locationInfo(), env())); },
    afterInit(launch) { record("after-init", Object.assign({launchView:view(launch)}, locationInfo(), env())); },
    beginRequest(data) {
      const request = run + "_" + (++counter);
      record("request", {request, method:"POST", action:actions.includes(data.action) ? data.action : "other", launchView:view(data.view)});
      return request;
    },
    response(request, response, result) {
      const diag = result && result.diagnostics;
      let host = "absent";
      try { const name = new URL(response.url).hostname; host = name === "script.google.com" ? "gas" : name === "script.googleusercontent.com" ? "gas-content" : "other"; } catch (_) {}
      const data = {request, http:response.status, redirected:!!response.redirected, host, kind:kind(result), responseView:view(result && result.view), hasRedirect:!!(result && result.redirectUrl), diagPresent:!!diag, requestMatched:!!diag && diag.requestId === request, entry:diag && ["GET","POST"].includes(diag.entry) ? diag.entry : "absent", server:diag ? diag.build === "stage-diag-20260926-1" ? diag.build : "other" : "absent", serverView:view(diag && diag.view)};
      if (result && typeof result.ok === "boolean") data.ok = result.ok;
      if (result && typeof result.registered === "boolean") data.registered = result.registered;
      record("response", data);
    },
    screen(branch) { record("screen", {branch}); },
    failure(reason, request) { record("failure", {reason, request}); }
  };
})();
