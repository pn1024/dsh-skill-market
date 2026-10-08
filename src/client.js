/**
 * dsh-skill-market — Browser half (client plugin)
 *
 * Registers three UI entry points:
 * 1. Sidebar nav entry — DOM-injected row next to 任务看板 (same pattern as
 *    @linxin666 plugins: plain DOM row, self-healing MutationObserver)
 * 2. shell.overlay — skill center panel (search/install/browse/readme)
 * 3. conversation.input.left — "技能" button in chat input bar (quick skill selector)
 *
 * Uses vanilla JS + React.createElement (no build step), same pattern as 1e0zj/dsh-plugin-mall.
 * React instance obtained via require("react") from the shell's module loader.
 *
 * RPC calls go through ctx.get("connection").rpc.call('/api', 'skill-hub/<endpoint>', payload, signal)
 */

window.__ModuleLoader__.load({
  id: "dsh-skill-market",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = require("react");
    var h = React.createElement;
    var useState = React.useState;
    var useEffect = React.useEffect;
    var useRef = React.useRef;
    var useCallback = React.useCallback;
    var useMemo = React.useMemo;

    // ── CSS (injected once) ──────────────────────────────────────────

    var CSS = `
.dsh-skill-hub-overlay {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.4); backdrop-filter: blur(4px);
  animation: dsh-sh-fade-in 0.15s ease-out;
}
.dsh-skill-hub-panel {
  width: 880px; max-width: 95vw; height: 560px; max-height: 88vh;
  background: var(--dsh-bg-elevated, #1a1a2e); color: var(--dsh-fg, #e0e0e0);
  border: 1px solid var(--dsh-border, rgba(255,255,255,0.1));
  border-radius: 12px; display: flex; flex-direction: column;
  box-shadow: 0 24px 64px rgba(0,0,0,0.5); overflow: hidden;
  font-family: var(--dsh-sh-font), var(--dsh-font, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: 13px; line-height: 1.5;
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
}
.dsh-skill-hub-panel { --dsh-sh-font: "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans SC", "Source Han Sans SC", "Hiragino Sans GB", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.dsh-skill-hub-panel.light {
  background: #fff; color: #1a1a1a; border-color: rgba(0,0,0,0.12);
}
/* light theme: fix all text color issues */
.dsh-skill-hub-panel.light .dsh-sh-card-desc { color: #666; opacity: 1; }
.dsh-skill-hub-panel.light .dsh-sh-card-meta { color: #999; opacity: 1; }
.dsh-skill-hub-panel.light .dsh-sh-card { border-color: rgba(0,0,0,0.08); }
.dsh-skill-hub-panel.light .dsh-sh-card:hover { background: rgba(99,102,241,0.04); }
.dsh-skill-hub-panel.light .dsh-sh-tab { color: #666; }
.dsh-skill-hub-panel.light .dsh-sh-tab.active { color: #333; }
.dsh-skill-hub-panel.light .dsh-sh-close { color: #666; }
.dsh-skill-hub-panel.light .dsh-sh-empty { color: #999; }
.dsh-skill-hub-panel.light .dsh-sh-loading { color: #999; }
.dsh-skill-hub-panel.light .dsh-sh-search-input {
  color: #333; background: rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.12);
}
.dsh-skill-hub-panel.light .dsh-sh-search-input:focus { border-color: #6366f1; }
.dsh-skill-hub-panel.light .dsh-sh-readme { color: #333; }
.dsh-skill-hub-panel.light .dsh-sh-readme code { background: rgba(0,0,0,0.06); }
.dsh-skill-hub-panel.light .dsh-sh-readme pre { background: rgba(0,0,0,0.04); }
.dsh-skill-hub-panel.light .dsh-sh-readme blockquote { border-left-color: rgba(0,0,0,0.2); }
.dsh-skill-hub-panel.light .dsh-sh-detail-meta { color: #888; opacity: 1; }
.dsh-skill-hub-panel.light .dsh-sh-detail-section-title { color: #888; opacity: 1; }
.dsh-skill-hub-panel.light .dsh-sh-cat-item { color: #555; }
.dsh-skill-hub-panel.light .dsh-sh-cat-item:hover { background: rgba(0,0,0,0.04); }
.dsh-skill-hub-panel.light .dsh-sh-cat-item.active { background: rgba(99,102,241,0.1); color: #6366f1; }
.dsh-skill-hub-panel.light .dsh-sh-cat-sidebar { border-right-color: rgba(0,0,0,0.08); }
.dsh-skill-hub-panel.light .dsh-sh-pkg-info { color: #aaa; opacity: 1; }
/* Light theme overrides for input bar elements (outside the panel) */
:root[data-theme="light"] .dsh-sh-input-btn,
:root.light .dsh-sh-input-btn { background: rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.1); color: #333; }
:root[data-theme="light"] .dsh-sh-input-btn:hover,
:root.light .dsh-sh-input-btn:hover { background: rgba(0,0,0,0.08); }
:root[data-theme="light"] .dsh-sh-quick-pick,
:root.light .dsh-sh-quick-pick { background: #fff; border-color: rgba(0,0,0,0.12); box-shadow: 0 12px 32px rgba(0,0,0,0.15); }
:root[data-theme="light"] .dsh-sh-quick-pick-item:hover,
:root.light .dsh-sh-quick-pick-item:hover { background: rgba(0,0,0,0.04); }
:root[data-theme="light"] .dsh-sh-quick-pick-name,
:root.light .dsh-sh-quick-pick-name { color: #333; }
:root[data-theme="light"] .dsh-sh-quick-pick-desc,
:root.light .dsh-sh-quick-pick-desc { color: #888; }
.dsh-skill-hub-panel.light .dsh-sh-btn { background: rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.12); color: #333; }
.dsh-skill-hub-panel.light .dsh-sh-btn:hover { background: rgba(0,0,0,0.08); }
.dsh-skill-hub-panel.light .dsh-sh-btn.primary { background: #6366f1; color: #fff; border-color: transparent; }
.dsh-skill-hub-panel.light .dsh-sh-btn.primary:hover { opacity: 0.9; }
.dsh-skill-hub-panel.light .dsh-sh-btn.danger { color: #ef4444; border-color: rgba(239,68,68,0.3); }
.dsh-skill-hub-panel.light .dsh-sh-btn.danger:hover { background: rgba(239,68,68,0.08); }
.dsh-skill-hub-panel.light .dsh-sh-header { border-bottom-color: rgba(0,0,0,0.08); }
.dsh-skill-hub-panel.light .dsh-sh-tabs { border-bottom-color: rgba(0,0,0,0.06); }
.dsh-skill-hub-panel.light .dsh-sh-quick-pick { background: #fff; border-color: rgba(0,0,0,0.12); }
.dsh-skill-hub-panel.light .dsh-sh-quick-pick-item:hover { background: rgba(0,0,0,0.04); }
.dsh-skill-hub-panel.light .dsh-sh-quick-pick-desc { color: #888; }
.dsh-skill-hub-panel.light .dsh-sh-input-btn { background: rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.12); color: #333; }
.dsh-skill-hub-panel.light .dsh-sh-input-btn:hover { background: rgba(0,0,0,0.08); }
.dsh-skill-hub-panel.light .dsh-sh-sidebar-btn { color: #555; }
.dsh-skill-hub-panel.light .dsh-sh-sidebar-btn:hover { background: rgba(0,0,0,0.04); }
.dsh-skill-hub-panel.light .dsh-sh-spinner { border-color: rgba(0,0,0,0.1); border-top-color: #6366f1; }
.dsh-skill-hub-panel.light .dsh-sh-toast { background: #fff; border-color: rgba(0,0,0,0.12); color: #333; }
    .dsh-sh-header {
      display: flex; align-items: center; gap: 12px; padding: 10px 16px;
      border-bottom: 1px solid var(--dsh-border, rgba(255,255,255,0.08)); flex-shrink: 0;
    }
.dsh-sh-title { font-size: 16px; font-weight: 600; white-space: nowrap; }
.dsh-sh-search-wrap { flex: 1 1 0; min-width: 0; position: relative; }
.dsh-sh-search-input {
  box-sizing: border-box;
  width: 100%; padding: 8px 12px 8px 34px;
  background: var(--dsh-bg-input, rgba(0,0,0,0.2));
  border: 1px solid var(--dsh-border, rgba(255,255,255,0.1));
  border-radius: 8px; color: inherit; font-size: 13px; outline: none;
  transition: border-color 0.15s;
}
.dsh-sh-search-input:focus { border-color: var(--dsh-accent, #6366f1); }
.dsh-sh-search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); opacity: 0.5; font-size: 14px; }
.dsh-sh-close {
  flex: none;
  background: none; border: none; color: inherit; cursor: pointer;
  font-size: 20px; padding: 4px 8px; opacity: 0.6; border-radius: 4px;
}
.dsh-sh-close:hover { opacity: 1; background: rgba(255,255,255,0.08); }
    .dsh-sh-tabs { display: flex; gap: 6px; padding: 6px 18px 0; flex-shrink: 0; border-bottom: 1px solid var(--dsh-border, rgba(255,255,255,0.06)); }
    .dsh-sh-tab {
      padding: 9px 18px; cursor: pointer; font-size: 14px; font-weight: 500; opacity: 0.82;
      letter-spacing: 0.6px;
      border-bottom: 2px solid transparent; transition: all 0.15s; background: none; border-top: none; border-left: none; border-right: none; color: inherit;
    }
.dsh-sh-tab.active { opacity: 1; border-bottom-color: var(--dsh-accent, #6366f1); font-weight: 600; color: var(--dsh-fg, #e0e0e0); }
.dsh-sh-tab:hover { opacity: 1; }
.dsh-sh-body { flex: 1; overflow-y: auto; overflow-x: hidden; }
.dsh-sh-body::-webkit-scrollbar { width: 6px; }
.dsh-sh-body::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.3); border-radius: 3px; }
.dsh-sh-list { padding: 8px 12px; }

/* Category sidebar */
.dsh-sh-main { flex: 1; display: flex; overflow: hidden; }
    .dsh-sh-cat-sidebar {
      width: 152px; flex-shrink: 0; padding: 10px 0; overflow-y: auto;
      border-right: 1px solid var(--dsh-border, rgba(255,255,255,0.06));
    }
.dsh-sh-cat-sidebar::-webkit-scrollbar { width: 4px; }
.dsh-sh-cat-sidebar::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.3); border-radius: 2px; }
    .dsh-sh-cat-item {
      padding: 8px 14px; cursor: pointer; font-size: 13px; font-weight: 500; opacity: 0.82;
      letter-spacing: 0.3px;
      transition: all 0.12s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      margin: 1px 6px; border-radius: 6px;
    }
.dsh-sh-cat-item:hover { opacity: 1; background: rgba(255,255,255,0.05); }
.dsh-sh-cat-item.active { opacity: 1; background: rgba(99,102,241,0.18); color: #818cf8; font-weight: 600; }
.dsh-sh-cat-header { font-size: 10px; font-weight: 600; opacity: 0.4; padding: 8px 12px 4px; text-transform: uppercase; letter-spacing: 0.5px; }
.dsh-sh-content { flex: 1; overflow-y: auto; }

    /* Grid layout */
    .dsh-sh-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 8px 12px; }
    .dsh-sh-grid .dsh-sh-card { width: auto; min-width: 0; margin-bottom: 0; }
.dsh-sh-card {
  display: flex; align-items: flex-start; gap: 10px; padding: 12px;
  border-radius: 10px; cursor: pointer; margin-bottom: 0;
  border: 1px solid transparent;
  transition: background 0.14s ease, border-color 0.14s ease, transform 0.14s ease;
}
.dsh-sh-card:hover {
  background: var(--dsh-bg-hover, rgba(255,255,255,0.05));
  border-color: var(--dsh-border, rgba(255,255,255,0.12));
  transform: translateY(-1px);
}
    /* 头像：优先用官方 iconUrl，没有就按 slug 生成稳定的彩色字母块 */
    .dsh-sh-avatar {
      flex: none; width: 36px; height: 36px; border-radius: 9px;
      display: flex; align-items: center; justify-content: center;
      font-size: 15px; font-weight: 600; color: #fff; overflow: hidden;
      letter-spacing: 0;
    }
    .dsh-sh-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dsh-sh-card-body { flex: 1; min-width: 0; }
    .dsh-sh-card-head { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
    .dsh-sh-card-title {
      font-weight: 600; font-size: 13px; letter-spacing: 0.2px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
    }
    .dsh-sh-verified {
      flex: none; width: 14px; height: 14px; border-radius: 50%;
      background: #6366f1; color: #fff; font-size: 9px; font-weight: 700;
      display: inline-flex; align-items: center; justify-content: center;
      line-height: 1;
    }
    .dsh-sh-card-desc {
      font-size: 12px; line-height: 1.55; opacity: 0.7;
      overflow: hidden; text-overflow: ellipsis; display: -webkit-box;
      -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    }
    /* 统计行：star / 下载 / 版本 / 作者，等宽数字对齐 */
    .dsh-sh-card-stats {
      display: flex; gap: 10px; font-size: 11px; margin-top: 6px;
      flex-wrap: wrap; align-items: center;
      font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1;
    }
    .dsh-sh-stat { display: inline-flex; align-items: center; gap: 3px; opacity: 0.75; white-space: nowrap; }
    .dsh-sh-stat.muted { opacity: 0.5; }
    .dsh-sh-stat.ellipsis { max-width: 120px; overflow: hidden; text-overflow: ellipsis; display: inline-block; }
    .dsh-sh-stat-ico { opacity: 0.9; }
    .dsh-sh-stat-ico.star { color: #f5a623; }
.dsh-sh-card-badge { font-size: 10px; padding: 1px 6px; border-radius: 4px; font-weight: 500; }
.dsh-sh-card-badge.installed { background: rgba(99,102,241,0.2); color: #818cf8; }
.dsh-sh-card-badge.source { background: rgba(100,200,100,0.15); opacity: 0.8; }
.dsh-sh-card-actions { display: flex; gap: 6px; flex-shrink: 0; }
    .dsh-sh-btn {
      padding: 4px 10px; font-size: 11px; border-radius: 6px; cursor: pointer;
      border: 1px solid var(--dsh-border, rgba(255,255,255,0.15)); background: var(--dsh-bg-btn, rgba(255,255,255,0.06));
      color: inherit; transition: all 0.12s; white-space: nowrap;
    }
.dsh-sh-btn:hover { background: var(--dsh-bg-btn-hover, rgba(255,255,255,0.12)); }
.dsh-sh-btn.primary { background: var(--dsh-accent, #6366f1); border-color: transparent; color: #fff; }
.dsh-sh-btn.primary:hover { opacity: 0.9; }
.dsh-sh-btn.danger { color: #ef4444; border-color: rgba(239,68,68,0.3); }
.dsh-sh-btn.danger:hover { background: rgba(239,68,68,0.1); }
.dsh-sh-btn.loading { opacity: 0.5; pointer-events: none; }
    .dsh-sh-detail { padding: 16px 20px; max-width: 700px; margin: 0 auto; }
.dsh-sh-detail-header { margin-bottom: 16px; }
.dsh-sh-detail-title { font-size: 20px; font-weight: 600; margin-bottom: 4px; }
.dsh-sh-detail-meta { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; opacity: 0.6; }
.dsh-sh-detail-section { margin-top: 20px; }
.dsh-sh-detail-section-title { font-size: 13px; font-weight: 600; opacity: 0.7; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
    .dsh-sh-readme { font-size: 12px; line-height: 1.6; overflow-x: hidden; word-wrap: break-word; }
.dsh-sh-readme h1 { font-size: 18px; font-weight: 600; margin: 16px 0 8px; }
.dsh-sh-readme h2 { font-size: 16px; font-weight: 600; margin: 14px 0 6px; }
.dsh-sh-readme h3 { font-size: 14px; font-weight: 600; margin: 12px 0 4px; }
.dsh-sh-readme p { margin: 8px 0; }
.dsh-sh-readme code { font-family: var(--dsh-font-mono, "SF Mono", Monaco, monospace); font-size: 12px; background: rgba(128,128,128,0.15); padding: 2px 5px; border-radius: 3px; }
.dsh-sh-readme pre { background: rgba(128,128,128,0.1); border-radius: 6px; padding: 12px; overflow-x: auto; margin: 10px 0; }
.dsh-sh-readme pre code { background: none; padding: 0; }
.dsh-sh-readme ul, .dsh-sh-readme ol { padding-left: 20px; margin: 8px 0; }
.dsh-sh-readme a { color: var(--dsh-accent, #818cf8); text-decoration: none; }
.dsh-sh-readme a:hover { text-decoration: underline; }
.dsh-sh-readme blockquote { border-left: 3px solid var(--dsh-border, rgba(128,128,128,0.3)); padding-left: 12px; opacity: 0.7; margin: 8px 0; }
.dsh-sh-readme table { border-collapse: collapse; margin: 10px 0; font-size: 12px; }
.dsh-sh-readme th, .dsh-sh-readme td { border: 1px solid var(--dsh-border, rgba(128,128,128,0.2)); padding: 6px 10px; }
.dsh-sh-readme img { max-width: 100%; border-radius: 6px; }
.dsh-sh-readme hr { border: none; border-top: 1px solid var(--dsh-border, rgba(128,128,128,0.2)); margin: 16px 0; }
    .dsh-sh-empty { text-align: center; padding: 32px 16px; opacity: 0.5; font-size: 13px; }
    .dsh-sh-loading { text-align: center; padding: 28px 16px; opacity: 0.5; font-size: 13px; }
.dsh-sh-spinner { display: inline-block; width: 20px; height: 20px; border: 2px solid rgba(128,128,128,0.2); border-top-color: var(--dsh-accent, #6366f1); border-radius: 50%; animation: dsh-sh-spin 0.6s linear infinite; }
@keyframes dsh-sh-spin { to { transform: rotate(360deg); } }
@keyframes dsh-sh-fade-in { from { opacity: 0; } to { opacity: 1; } }
.dsh-sh-toast {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  padding: 10px 20px; border-radius: 8px; font-size: 13px; z-index: 10000;
  background: var(--dsh-bg-elevated, #1a1a2e); border: 1px solid var(--dsh-border, rgba(255,255,255,0.1));
  box-shadow: 0 8px 24px rgba(0,0,0,0.3); animation: dsh-sh-fade-in 0.2s ease-out;
}
.dsh-sh-toast.success { border-color: rgba(99,102,241,0.5); }
.dsh-sh-toast.error { border-color: rgba(239,68,68,0.5); }
.dsh-sh-input-btn {
  display: inline-flex; align-items: center; gap: 4px; cursor: pointer;
  padding: 4px 8px; border-radius: 6px; border: 1px solid var(--dsh-border, rgba(128,128,128,0.2));
  background: var(--dsh-bg-btn, rgba(128,128,128,0.08)); color: var(--dsh-fg, inherit);
  font-size: 12px; transition: all 0.12s; white-space: nowrap;
}
.dsh-sh-input-btn:hover { background: var(--dsh-bg-btn-hover, rgba(255,255,255,0.12)); }
    /* Sidebar nav entry row (task-board style, plain DOM) */
    .dsh-sh-nav-entry {
      box-sizing: border-box;
      display: flex; align-items: center; gap: 8px;
      width: 100%; height: 36px; padding: 0 10px;
      background: transparent; border: none; border-radius: 8px;
      color: var(--dsw-alias-label-secondary);
      cursor: pointer; font-size: 13px; white-space: nowrap;
      font-family: inherit;
    }
    .dsh-sh-nav-entry:hover {
      background: var(--dsw-alias-interactive-bg-hover);
      color: var(--dsw-alias-label-primary);
    }
    .dsh-sh-nav-entry[data-active] {
      background: var(--dsw-alias-interactive-bg-active);
      color: var(--dsw-alias-label-primary);
      font-weight: 600;
    }
    .dsh-sh-nav-entry-icon {
      display: inline-flex; align-items: center; justify-content: center;
      width: 24px; height: 24px; flex: none;
    }
    .dsh-sh-nav-entry-icon svg { display: block; width: 18px; height: 18px; }
    .dsh-sh-nav-entry-label { overflow: hidden; text-overflow: ellipsis; }
    /* Collapsed rail: icon-only, centered, matching the shell's 56px rail */
    [data-dsh-frame][data-sidebar-collapsed] .dsh-sh-nav-entry,
    [data-sidebar-collapsed] .dsh-sh-nav-entry {
      justify-content: center; padding: 0;
      width: 36px; height: 36px; margin: 0 auto 12px;
      border-radius: 50%;
    }
    [data-dsh-frame][data-sidebar-collapsed] .dsh-sh-nav-entry-label,
    [data-sidebar-collapsed] .dsh-sh-nav-entry-label { display: none; }
.dsh-sh-quick-pick {
  position: absolute; bottom: 100%; left: 0; margin-bottom: 4px;
  width: 280px; max-height: 320px; overflow-y: auto;
  background: #ffffff; border: 1px solid rgba(0,0,0,0.12);
  border-radius: 8px; box-shadow: 0 12px 32px rgba(0,0,0,0.2); z-index: 100;
  color: #1a1a2e;
}
    .dsh-sh-quick-pick-item { padding: 8px 12px; cursor: pointer; border-radius: 4px; margin: 1px; }
    .dsh-sh-quick-pick-item:hover { background: rgba(99,102,241,0.08); }
    .dsh-sh-quick-pick-name { font-weight: 500; font-size: 13px; }
.dsh-sh-error { padding: 12px 20px; color: #ef4444; font-size: 13px; }
.dsh-sh-pkg-info { font-size: 11px; opacity: 0.4; padding: 8px 20px; text-align: center; }

/* ── 详情页统计卡 ─────────────────────────────────────────── */
.dsh-sh-stat-row {
  display: flex; gap: 10px; margin: 14px 0 4px; flex-wrap: wrap;
}
.dsh-sh-stat-card {
  flex: 1 1 90px; min-width: 90px; padding: 10px 12px; border-radius: 10px;
  border: 1px solid var(--dsh-border, rgba(255,255,255,0.1));
  background: var(--dsh-bg-input, rgba(128,128,128,0.08));
  display: flex; flex-direction: column; gap: 2px;
}
.dsh-sh-stat-card-label {
  font-size: 10px; opacity: 0.55; letter-spacing: 0.6px; text-transform: uppercase;
}
.dsh-sh-stat-card-value {
  font-size: 17px; font-weight: 650; letter-spacing: 0.2px;
  font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1;
}
.dsh-sh-stat-card-value .dsh-sh-stat-ico { font-size: 12px; margin-right: 3px; }
.dsh-sh-detail-sub { font-size: 12px; opacity: 0.65; margin-top: 4px; line-height: 1.6; }
.dsh-sh-detail-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
.dsh-sh-tag {
  font-size: 11px; padding: 2px 8px; border-radius: 999px;
  background: var(--dsh-bg-input, rgba(128,128,128,0.1));
  border: 1px solid var(--dsh-border, rgba(255,255,255,0.08)); opacity: 0.8;
}

/* 浅色主题补充 */
.dsh-skill-hub-panel.light .dsh-sh-stat { color: #6b7280; opacity: 1; }
.dsh-skill-hub-panel.light .dsh-sh-stat.muted { color: #9ca3af; }
.dsh-skill-hub-panel.light .dsh-sh-card-desc { color: #5f6368; opacity: 1; }
.dsh-skill-hub-panel.light .dsh-sh-stat-card { background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.08); }
.dsh-skill-hub-panel.light .dsh-sh-stat-card-label { color: #9ca3af; opacity: 1; }
.dsh-skill-hub-panel.light .dsh-sh-stat-card-value { color: #111827; }
.dsh-skill-hub-panel.light .dsh-sh-tag { background: rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.08); color: #4b5563; opacity: 1; }
.dsh-skill-hub-panel.light .dsh-sh-detail-sub { color: #6b7280; opacity: 1; }
    `;

    var cssInjected = false;
    function injectCSS() {
      if (cssInjected) return;
      cssInjected = true;
      var style = document.createElement("style");
      style.setAttribute("data-dsh-skill-hub", "");
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    // ── Minimal Markdown renderer ────────────────────────────────────

    function escapeHtml(text) {
      return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function renderMarkdown(md) {
      if (!md) return "";
      // Remove frontmatter
      var lines = md.split("\n");
      if (lines[0] && lines[0].trim() === "---") {
        var endIdx = -1;
        for (var i = 1; i < lines.length; i++) {
          if (lines[i].trim() === "---") { endIdx = i; break; }
        }
        if (endIdx >= 0) lines = lines.slice(endIdx + 1);
      }
      var text = lines.join("\n");

      // Code blocks (```lang ... ```)
      text = text.replace(/```(\w*)\n([\s\S]*?)```/g, function(m, lang, code) {
        return '<pre><code>' + escapeHtml(code.trimEnd()) + '</code></pre>';
      });
      // Inline code
      text = text.replace(/`([^`]+)`/g, function(m, code) { return '<code>' + escapeHtml(code) + '</code>'; });
      // Headers
      text = text.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
      text = text.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
      text = text.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
      // Bold and italic
      text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      // Links [text](url)
      text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      // Images ![alt](src)
      text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" />');
      // Horizontal rules
      text = text.replace(/^---$/gm, '<hr/>');
      // Blockquotes
      text = text.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');
      // Tables (simple)
      text = text.replace(/^\|(.+)\|$/gm, function(m, row) {
        var cells = row.split("|").map(function(c) { return c.trim(); });
        if (cells[0] === "") cells.shift();
        if (cells[cells.length - 1] === "") cells.pop();
        if (cells.every(function(c) { return /^[-:]+$/.test(c); })) return ""; // separator row
        var tag = "td";
        return "<tr>" + cells.map(function(c) { return "<" + tag + ">" + c + "</" + tag + ">"; }).join("") + "</tr>";
      });
      text = text.replace(/(<tr>[\s\S]*?<\/tr>)/g, function(m) {
        return '<table>' + m + '</table>';
      });
      // Lists (ul)
      text = text.replace(/^[\*\-]\s+(.+)$/gm, '<li>$1</li>');
      text = text.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li)/g, function(m) {
        if (m.indexOf("<ul>") === 0) return m;
        return "<ul>" + m + "</ul>";
      });
      // Paragraphs (remaining lines)
      text = text.replace(/\n\n/g, '</p><p>');
      text = text.replace(/^(?!<[hupoltb])(.+)$/gm, function(m, line) {
        if (line.trim() === "") return "";
        return "<p>" + line + "</p>";
      });
      // Clean up empty paragraphs and nested wrappers
      text = text.replace(/<p><\/p>/g, "");
      text = text.replace(/<ul>\s*<\/ul>/g, "");
      text = text.replace(/<\/ul>\s*<ul>/g, "");

      return text;
    }

    // ── API helper ───────────────────────────────────────────────────

    function makeApi(rpc) {
      return {
        call: function(endpoint, payload) {
          var controller = new AbortController();
          return rpc.call("/api", endpoint, payload || {}, controller.signal).then(function(result) {
            if (!result.ok) throw new Error(result.error ? result.error.message : "RPC error");
            return result.value;
          });
        }
      };
    }

    // ── Toast component ──────────────────────────────────────────────

    function Toast(_a) {
      var message = _a.message, type = _a.type, onClose = _a.onClose;
      useEffect(function() {
        var timer = setTimeout(onClose, 3000);
        return function() { clearTimeout(timer); };
      }, [onClose]);
      return h("div", { className: "dsh-sh-toast " + (type || ""), onClick: onClose },
        type === "success" ? "✓ " : type === "error" ? "✕ " : "", message
      );
    }

    // ── 数字与头像 ──────────────────────────────────────────────────

    /** 计数格式化：1160254 → "116万"，4457 → "4.5k"，812 → "812" */
    function formatCount(n) {
      var v = Number(n);
      if (!isFinite(v) || v <= 0) return "";
      if (v >= 100000000) return trimZero(v / 100000000) + "亿";
      if (v >= 10000) return trimZero(v / 10000) + "万";
      if (v >= 1000) return trimZero(v / 1000) + "k";
      return String(v);
    }
    function trimZero(x) {
      return x.toFixed(1).replace(/\.0$/, "");
    }

    var AVATAR_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

    /** 按 slug 稳定地选一个颜色，保证同一技能每次渲染颜色一致 */
    function avatarColor(seed) {
      var s = String(seed || "");
      var n = 0;
      for (var i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0;
      return AVATAR_COLORS[n % AVATAR_COLORS.length];
    }

    /** 技能头像：优先官方 iconUrl，加载失败回退到彩色字母块 */
    function SkillIcon(_a) {
      var skill = _a.skill, size = _a.size;
      var _b = useState(!!skill.iconUrl), showImg = _b[0], setShowImg = _b[1];
      var name = skill.displayName || skill.name || skill.slug || "?";
      var dim = (size || 36) + "px";
      if (showImg && skill.iconUrl) {
        return h("div", {
          className: "dsh-sh-avatar",
          style: { width: dim, height: dim, borderRadius: Math.round((size || 36) / 4) + "px" }
        },
          h("img", {
            src: skill.iconUrl,
            alt: "",
            loading: "lazy",
            onError: function() { setShowImg(false); }
          })
        );
      }
      return h("div", {
        className: "dsh-sh-avatar",
        style: {
          width: dim, height: dim,
          borderRadius: Math.round((size || 36) / 4) + "px",
          background: avatarColor(skill.slug || skill.name),
          fontSize: Math.round((size || 36) * 0.42) + "px"
        }
      }, name.trim().charAt(0).toUpperCase());
    }

    // ── Skill Card component ──────────────────────────────────────────

    function SkillCard(_a) {
      var skill = _a.skill, onInstall = _a.onInstall, onUninstall = _a.onUninstall, onDetail = _a.onDetail, onUse = _a.onUse, installing = _a.installing;
      var name = skill.displayName || skill.name || skill.slug || "未命名技能";
      var desc = skill.summaryZh || skill.summary || skill.description || "暂无描述";
      var starText = formatCount(skill.stars);
      var dlText = formatCount(skill.downloads);

      return h("div", { className: "dsh-sh-card", onClick: function() { onDetail(skill); } },
        h(SkillIcon, { skill: skill, size: 36 }),
        h("div", { className: "dsh-sh-card-body" },
          h("div", { className: "dsh-sh-card-head" },
            h("span", { className: "dsh-sh-card-title", title: name }, name),
            skill.verified ? h("span", { className: "dsh-sh-verified", title: "官方认证" }, "✓") : null,
            skill.installed ? h("span", { className: "dsh-sh-card-badge installed" }, "已安装") : null
          ),
          h("div", { className: "dsh-sh-card-desc", title: desc }, desc),
          h("div", { className: "dsh-sh-card-stats" },
            starText
              ? h("span", { className: "dsh-sh-stat", title: "Star " + skill.stars },
                  h("span", { className: "dsh-sh-stat-ico star" }, "★"), starText)
              : null,
            dlText
              ? h("span", { className: "dsh-sh-stat", title: "下载量 " + skill.downloads },
                  h("span", { className: "dsh-sh-stat-ico" }, "↓"), dlText)
              : null,
            skill.version ? h("span", { className: "dsh-sh-stat muted" }, "v" + skill.version) : null,
            skill.author ? h("span", { className: "dsh-sh-stat muted ellipsis", title: skill.author }, skill.author) : null,
            h("span", { className: "dsh-sh-card-badge source" }, skill.sourceLabel || skill.source)
          )
        ),
        h("div", { className: "dsh-sh-card-actions" },
          skill.installed
            ? h("button", { className: "dsh-sh-btn", onClick: function(e) { e.stopPropagation(); onUse(skill); } }, "使用")
            : h("button", {
                className: "dsh-sh-btn primary" + (installing ? " loading" : ""),
                onClick: function(e) { e.stopPropagation(); onInstall(skill); },
                disabled: installing
              }, installing ? "安装中..." : "安装"),
          skill.installed
            ? h("button", { className: "dsh-sh-btn danger", onClick: function(e) { e.stopPropagation(); onUninstall(skill); } }, "卸载")
            : h("button", { className: "dsh-sh-btn", onClick: function(e) { e.stopPropagation(); onDetail(skill); } }, "查看")
        )
      );
    }

    /** tags 可能是字符串数组，也可能是 SkillHub 的 [{key,name}] 结构，统一成名字数组 */
    function tagNames(tags) {
      if (!tags || !tags.length) return [];
      return tags.map(function(t) {
        if (typeof t === "string") return t;
        return t && (t.name || t.key) ? String(t.name || t.key) : "";
      }).filter(Boolean);
    }

    /** 详情页顶部的统计卡（Star / 下载 / 安装），无数据的不显示 */
    function StatRow(_a) {
      var detail = _a.detail;
      var cards = [];
      if (Number(detail.stars) > 0) {
        cards.push({ label: "Star", value: formatCount(detail.stars), ico: "★", star: true });
      }
      if (Number(detail.downloads) > 0) {
        cards.push({ label: "下载量", value: formatCount(detail.downloads), ico: "↓", star: false });
      }
      if (Number(detail.installs) > 0) {
        cards.push({ label: "安装量", value: formatCount(detail.installs), ico: "⤓", star: false });
      }
      if (!cards.length) return null;
      return h("div", { className: "dsh-sh-stat-row" },
        cards.map(function(c) {
          return h("div", { className: "dsh-sh-stat-card", key: c.label },
            h("div", { className: "dsh-sh-stat-card-label" }, c.label),
            h("div", { className: "dsh-sh-stat-card-value" },
              h("span", { className: "dsh-sh-stat-ico" + (c.star ? " star" : "") }, c.ico),
              c.value
            )
          );
        })
      );
    }

    // ── Detail View component ────────────────────────────────────────

    function DetailView(_a) {
      var skill = _a.skill, rpc = _a.rpc, onBack = _a.onBack, onInstall = _a.onInstall, onUninstall = _a.onUninstall, onUse = _a.onUse;
      var _b = useState(null), detail = _b[0], setDetail = _b[1];
      var _c = useState(true), loading = _c[0], setLoading = _c[1];
      var _d = useState(null), error = _d[0], setError = _d[1];
      var _e = useState(false), installing = _e[0], setInstalling = _e[1];

      useEffect(function() {
        var aborted = false;
        setLoading(true); setError(null); setDetail(null);
        makeApi(rpc).call("skill-hub/detail", { slug: skill.slug, source: skill.source, ownerHandle: skill.ownerHandle })
          .then(function(d) { if (!aborted) { setDetail(d); setLoading(false); } })
          .catch(function(e) { if (!aborted) { setError(e.message); setLoading(false); } });
        return function() { aborted = true; };
      }, [skill]);

      var doInstall = function() {
        setInstalling(true);
        makeApi(rpc).call("skill-hub/install", { slug: skill.slug, source: skill.source, ownerHandle: skill.ownerHandle })
          .then(function() { setInstalling(false); onInstall(skill); })
          .catch(function(e) { setInstalling(false); setError(e.message); });
      };

      if (loading) return h("div", { className: "dsh-sh-loading" }, h("span", { className: "dsh-sh-spinner" }), " 加载中...");
      if (error) return h("div", { className: "dsh-sh-error" }, "加载失败: ", error);
      if (!detail) return h("div", { className: "dsh-sh-empty" }, "未找到技能详情");

      var readme = detail.readme || "";
      var readmeHtml = renderMarkdown(readme);
      var isInstalled = detail.installed || skill.installed;
      var tags = tagNames(detail.tags);
      var metaBits = [];
      if (detail.author) metaBits.push("作者 " + detail.author);
      if (detail.version) metaBits.push("版本 v" + detail.version);
      metaBits.push("来源 " + (detail.source || skill.source));
      var subText = detail.summaryZh || detail.summary || skill.summaryZh || skill.summary || "";

      return h("div", { className: "dsh-sh-detail" },
        h("div", { className: "dsh-sh-detail-header" },
          h("div", { style: { display: "flex", alignItems: "center", gap: "12px" } },
            h("button", { className: "dsh-sh-btn", onClick: onBack }, "← 返回"),
            h(SkillIcon, { skill: detail, size: 44 }),
            h("div", { style: { minWidth: 0 } },
              h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
                h("div", { className: "dsh-sh-detail-title" }, detail.displayName || detail.name),
                detail.verified ? h("span", { className: "dsh-sh-verified", title: "官方认证" }, "✓") : null,
                isInstalled ? h("span", { className: "dsh-sh-card-badge installed" }, "已安装") : null
              ),
              h("div", { className: "dsh-sh-detail-meta" },
                metaBits.map(function(t, i) { return h("span", { key: i }, t); })
              )
            )
          ),
          subText ? h("div", { className: "dsh-sh-detail-sub" }, subText) : null,
          h(StatRow, { detail: detail }),
          tags.length
            ? h("div", { className: "dsh-sh-detail-tags" },
                tags.map(function(t) { return h("span", { className: "dsh-sh-tag", key: t }, t); })
              )
            : null,
          h("div", { style: { display: "flex", gap: "8px", marginTop: "14px" } },
            isInstalled
              ? h("button", { className: "dsh-sh-btn primary", onClick: function() { onUse(detail); } }, "使用此技能")
              : h("button", { className: "dsh-sh-btn primary" + (installing ? " loading" : ""), onClick: doInstall, disabled: installing }, installing ? "安装中..." : "安装"),
            isInstalled
              ? h("button", { className: "dsh-sh-btn danger", onClick: function() { onUninstall(detail); } }, "卸载")
              : null
          )
        ),
        readme
          ? h("div", { className: "dsh-sh-detail-section" },
              h("div", { className: "dsh-sh-detail-section-title" }, "README"),
              h("div", { className: "dsh-sh-readme", dangerouslySetInnerHTML: { __html: readmeHtml } })
            )
          : h("div", { className: "dsh-sh-empty" }, "暂无 README 文档")
      );
    }

    // ── Main Skill Center Panel ──────────────────────────────────────

    function SkillCenterPanel(_a) {
      var rpc = _a.rpc, onClose = _a.onClose, onUseSkill = _a.onUseSkill, initialTab = _a.initialTab;
      var _b = useState("market"), tab = _b[0], setTab = _b[1];
      var _c = useState(""), keyword = _c[0], setKeyword = _c[1];
      var _d = useState([]), items = _d[0], setItems = _d[1];
      var _e = useState(null), error = _e[0], setError = _e[1];
      var _f = useState(false), loading = _f[0], setLoading = _f[1];
      var _g = useState(null), selectedSkill = _g[0], setSelectedSkill = _g[1];
      var _h = useState({}), installingMap = _h[0], setInstallingMap = _h[1];
      var _i = useState({}), toast = _i[0], setToast = _i[1];
      var _j = useState(1), page = _j[0];
      var _k = useState([]), categories = _k[0], setCategories = _k[1];
      var _l = useState(""), activeCategory = _l[0], setActiveCategory = _l[1];
      var searchTimer = useRef(null);
      var api = useMemo(function() { return makeApi(rpc); }, [rpc]);

      // Apply initial tab
      useEffect(function() {
        if (initialTab) setTab(initialTab);
      }, [initialTab]);

      // Load categories on mount
      useEffect(function() {
        api.call("skill-hub/categories", {})
          .then(function(r) { setCategories(r.categories || []); })
          .catch(function() { /* silent */ });
      }, []);

      // Search (market tab)
      useEffect(function() {
        if (tab !== "market") return;
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(function() {
          setLoading(true); setError(null);
          api.call("skill-hub/search", { keyword: keyword, page: 1, pageSize: 60, category: activeCategory })
            .then(function(r) { setItems(r.items || []); setLoading(false); })
            .catch(function(e) { setError(e.message); setLoading(false); });
        }, keyword ? 300 : 100);
        return function() { if (searchTimer.current) clearTimeout(searchTimer.current); };
      }, [keyword, tab, activeCategory]);

      // Installed tab
      useEffect(function() {
        if (tab !== "installed") return;
        setLoading(true); setError(null);
        api.call("skill-hub/installed", {})
          .then(function(r) { setItems(r.skills || []); setLoading(false); })
          .catch(function(e) { setError(e.message); setLoading(false); });
      }, [tab]);

      var showToast = function(message, type) {
        setToast({ message: message, type: type });
      };

      var doInstall = function(skill) {
        var key = skill.slug || skill.name;
        setInstallingMap(function(prev) { var n = Object.assign({}, prev); n[key] = true; return n; });
        api.call("skill-hub/install", { slug: skill.slug, source: skill.source, ownerHandle: skill.ownerHandle })
          .then(function() {
            setInstallingMap(function(prev) { var n = Object.assign({}, prev); n[key] = false; return n; });
            // Update item as installed
            setItems(function(prev) { return prev.map(function(it) { return (it.slug || it.name) === key ? Object.assign({}, it, { installed: true }) : it; }); });
            showToast("技能 \"" + (skill.displayName || skill.name) + "\" 安装成功", "success");
          })
          .catch(function(e) {
            setInstallingMap(function(prev) { var n = Object.assign({}, prev); n[key] = false; return n; });
            showToast("安装失败: " + e.message, "error");
          });
      };

      var doUninstall = function(skill) {
        if (!confirm("确定卸载技能 \"" + (skill.displayName || skill.name) + "\"？")) return;
        api.call("skill-hub/uninstall", { slug: skill.slug || skill.name })
          .then(function() {
            setItems(function(prev) { return prev.map(function(it) { return (it.slug || it.name) === (skill.slug || skill.name) ? Object.assign({}, it, { installed: false }) : it; }).filter(function(it) { return tab !== "installed" || it.installed; }); });
            showToast("技能已卸载", "success");
          })
          .catch(function(e) { showToast("卸载失败: " + e.message, "error"); });
      };

      var doUse = function(skill) {
        onUseSkill(skill);
        onClose();
      };

      // ESC to close
      useEffect(function() {
        var handler = function(e) { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return function() { window.removeEventListener("keydown", handler); };
      }, [onClose]);

      // Detect theme
      var _k = useState(false), isLight = _k[0], setIsLight = _k[1];
      useEffect(function() {
        try {
          var root = document.documentElement;
          var check = function() { setIsLight(root.getAttribute("data-theme") === "light" || root.classList.contains("light") || !root.classList.contains("dark")); };
          check();
          var observer = new MutationObserver(check);
          observer.observe(root, { attributes: true, attributeFilter: ["class", "data-theme"] });
          return function() { observer.disconnect(); };
        } catch(e) { /* fallback to dark */ }
      }, []);

      return h("div", { className: "dsh-skill-hub-overlay", onClick: onClose },
        h("div", { className: "dsh-skill-hub-panel" + (isLight ? " light" : ""), onClick: function(e) { e.stopPropagation(); } },
          // Header
          h("div", { className: "dsh-sh-header" },
            h("div", { className: "dsh-sh-title" }, "⚡ 技能中心"),
            h("div", { className: "dsh-sh-search-wrap" },
              h("span", { className: "dsh-sh-search-icon" }, "🔍"),
              h("input", {
                className: "dsh-sh-search-input",
                placeholder: tab === "market" ? "搜索技能（支持中文）..." : "筛选已安装技能...",
                value: keyword,
                onChange: function(e) { setKeyword(e.target.value); },
                autoFocus: true
              })
            ),
            h("button", { className: "dsh-sh-close", onClick: onClose, title: "关闭" }, "×")
          ),
          // Tabs
          h("div", { className: "dsh-sh-tabs" },
            h("button", { className: "dsh-sh-tab" + (tab === "market" ? " active" : ""), onClick: function() { setTab("market"); setSelectedSkill(null); setKeyword(""); } }, "技能市场"),
            h("button", { className: "dsh-sh-tab" + (tab === "installed" ? " active" : ""), onClick: function() { setTab("installed"); setSelectedSkill(null); setKeyword(""); } }, "已安装"),
            h("button", { className: "dsh-sh-tab" + (tab === "about" ? " active" : ""), onClick: function() { setTab("about"); setSelectedSkill(null); } }, "关于")
          ),
          // Body
          h("div", { className: "dsh-sh-body" },
            function() {
              if (tab === "about") {
                return h("div", { className: "dsh-sh-detail" },
                  h("h2", null, "dsh-skill-market"),
                  h("p", { style: { opacity: 0.7 } }, "DeepSeek Harness 技能市场插件 — 聚合 SkillHub + ClawHub 双数据源"),
                  h("div", { className: "dsh-sh-detail-section" },
                    h("div", { className: "dsh-sh-detail-section-title" }, "功能"),
                    h("ul", null,
                      h("li", null, "搜索技能：聚合 SkillHub（腾讯镜像）和 ClawHub（官方源）双数据源"),
                      h("li", null, "分类导航：左侧 13 个分类一键筛选"),
                      h("li", null, "一键安装/卸载：安装到本地技能目录，自动热发现"),
                      h("li", null, "已安装技能：通过 dsh 官方注册表列出全部已注册技能（含插件自带）"),
                      h("li", null, "站内 README 预览：无需跳转外部页面"),
                      h("li", null, "双主题适配：自动跟随深色/浅色主题")
                    )
                  ),
                  h("div", { className: "dsh-sh-detail-section" },
                    h("div", { className: "dsh-sh-detail-section-title" }, "数据源"),
                    h("p", null, h("strong", null, "SkillHub"), " (api.skillhub.tencent.com) — 腾讯云中国镜像，高速直连"),
                    h("p", null, h("strong", null, "ClawHub"), " (clawhub.com) — OpenClaw 官方技能社区")
                  ),
                  h("div", { className: "dsh-sh-detail-section" },
                    h("div", { className: "dsh-sh-detail-section-title" }, "使用方法"),
                    h("p", null, "1. 在「技能市场」搜索你需要的技能，或按分类筛选"),
                    h("p", null, "2. 点击「安装」一键下载到本地"),
                    h("p", null, "3. 安装后点击「使用」或在输入栏输入 /技能名 调用"),
                    h("p", null, "4. 在「已安装」查看/卸载已装技能")
                  )
                );
              }
              if (selectedSkill) {
                return h(DetailView, { skill: selectedSkill, rpc: rpc, onBack: function() { setSelectedSkill(null); }, onInstall: doInstall, onUninstall: doUninstall, onUse: doUse });
              }
              if (loading) return h("div", { className: "dsh-sh-loading" }, h("span", { className: "dsh-sh-spinner" }), " 加载中...");
              if (error) return h("div", { className: "dsh-sh-error" }, "错误: ", error);
              // Filter installed by keyword
              var filtered = tab === "installed" && keyword
                ? items.filter(function(s) {
                    var k = keyword.toLowerCase();
                    return (s.name || "").toLowerCase().indexOf(k) >= 0 || (s.description || "").toLowerCase().indexOf(k) >= 0;
                  })
                : items;
              if (!filtered || filtered.length === 0) {
                return h("div", { className: "dsh-sh-empty" },
                  tab === "market" ? (keyword ? "未找到匹配的技能" : "输入关键词搜索或选择分类浏览技能...") : "暂无已安装技能"
                );
              }
              // Market tab: show category sidebar + grid; Installed tab: list only
              if (tab === "market") {
                return h("div", { className: "dsh-sh-main" },
                  // Category sidebar
                  h("div", { className: "dsh-sh-cat-sidebar" },
                    h("div", { className: "dsh-sh-cat-item" + (!activeCategory ? " active" : ""), onClick: function() { setActiveCategory(""); } }, "全部分类"),
                    categories.map(function(cat) {
                      return h("div", {
                        key: cat.key,
                        className: "dsh-sh-cat-item" + (activeCategory === cat.key ? " active" : ""),
                        onClick: function() { setActiveCategory(cat.key); },
                        title: cat.nameEn || cat.name
                      }, cat.name || cat.nameEn);
                    })
                  ),
                  // Content area with grid
                  h("div", { className: "dsh-sh-content" },
                    h("div", { className: "dsh-sh-grid" },
                      filtered.map(function(skill) {
                        var key = skill.slug || skill.name;
                        return h(SkillCard, {
                          key: key,
                          skill: skill,
                          onInstall: doInstall,
                          onUninstall: doUninstall,
                          onDetail: setSelectedSkill,
                          onUse: doUse,
                          installing: installingMap[key] || false
                        });
                      })
                    )
                  )
                );
              }
              // Installed tab: simple list
              return h("div", { className: "dsh-sh-list" },
                filtered.map(function(skill) {
                  var key = skill.slug || skill.name;
                  return h(SkillCard, {
                    key: key,
                    skill: skill,
                    onInstall: doInstall,
                    onUninstall: doUninstall,
                    onDetail: setSelectedSkill,
                    onUse: doUse,
                    installing: installingMap[key] || false
                  });
                })
              );
            }()
          ),
          toast.message ? h(Toast, { message: toast.message, type: toast.type, onClose: function() { setToast({}); } }) : null
        )
      );
    }

    // ── Chat input button (quick skill picker) ───────────────────────

    function ChatInputButton(_a) {
      var rpc = _a.rpc, onInsertSkill = _a.onInsertSkill;
      var _b = useState(false), open = _b[0], setOpen = _b[1];
      var _c = useState(""), keyword = _c[0], setKeyword = _c[1];
      var _d = useState([]), skills = _d[0], setSkills = _d[1];
      var _e = useState(false), loading = _e[0], setLoading = _e[1];
      var api = useMemo(function() { return makeApi(rpc); }, [rpc]);
      var containerRef = useRef(null);
      var searchTimer = useRef(null);
      var allSkills = useRef([]);

      // Load installed skills when opened
      useEffect(function() {
        if (!open) return;
        setLoading(true);
        api.call("skill-hub/installed", {})
          .then(function(r) { allSkills.current = r.skills || []; setSkills(allSkills.current); setLoading(false); })
          .catch(function() { setLoading(false); });
      }, [open]);

      // Filter by keyword (local filter first, then remote search with debounce)
      useEffect(function() {
        if (!open) return;
        if (searchTimer.current) clearTimeout(searchTimer.current);
        if (!keyword) {
          setSkills(allSkills.current);
          return;
        }
        // Local filter first (instant)
        var k = keyword.toLowerCase();
        var local = allSkills.current.filter(function(s) {
          return (s.name || "").toLowerCase().indexOf(k) >= 0 || (s.description || "").toLowerCase().indexOf(k) >= 0;
        });
        setSkills(local);
        // Remote search with debounce
        searchTimer.current = setTimeout(function() {
          setLoading(true);
          api.call("skill-hub/search", { keyword: keyword, page: 1, pageSize: 10 })
            .then(function(r) {
              var remote = r.items || [];
              // Merge: remote items not in local
              var localSlugs = {};
              allSkills.current.forEach(function(s) { localSlugs[(s.slug || s.name).toLowerCase()] = true; });
              var merged = local.slice();
              remote.forEach(function(s) {
                if (!localSlugs[(s.slug || s.name).toLowerCase()]) merged.push(s);
              });
              setSkills(merged);
              setLoading(false);
            })
            .catch(function() { setLoading(false); });
        }, 400);
        return function() { if (searchTimer.current) clearTimeout(searchTimer.current); };
      }, [keyword, open]);

      // Click outside to close
      useEffect(function() {
        if (!open) return;
        var handler = function(e) {
          if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return function() { document.removeEventListener("mousedown", handler); };
      }, [open]);

      var selectSkill = function(skill) {
        onInsertSkill(skill);
        setOpen(false);
        setKeyword("");
      };

      return h("div", { ref: containerRef, style: { position: "relative" } },
        h("button", {
          className: "dsh-sh-input-btn",
          onClick: function() { setOpen(!open); },
          title: "选择技能"
        }, "⚡ 技能"),
        open ? h("div", { className: "dsh-sh-quick-pick" },
          h("div", { style: { padding: "6px", borderBottom: "1px solid var(--dsh-border, rgba(255,255,255,0.06))" } },
            h("input", {
              style: { width: "100%", padding: "4px 8px", background: "var(--dsh-bg-input, rgba(0,0,0,0.2))", border: "1px solid var(--dsh-border, rgba(255,255,255,0.1))", borderRadius: "4px", color: "inherit", fontSize: "12px", outline: "none" },
              placeholder: "搜索技能...",
              value: keyword,
              onChange: function(e) { setKeyword(e.target.value); },
              autoFocus: true
            })
          ),
          loading
            ? h("div", { style: { padding: "12px", textAlign: "center", opacity: 0.5 } }, "加载中...")
            : skills.length === 0
              ? h("div", { style: { padding: "12px", textAlign: "center", opacity: 0.5 } }, keyword ? "未找到匹配技能" : "暂无技能")
              : skills.slice(0, 20).map(function(skill) {
                  return h("div", {
                    key: skill.slug || skill.name,
                    className: "dsh-sh-quick-pick-item",
                    onClick: function() { selectSkill(skill); }
                  },
                    h("div", { className: "dsh-sh-quick-pick-name" },
                      (skill.displayName || skill.name),
                      skill.installed ? h("span", { style: { fontSize: "10px", marginLeft: "6px", color: "#818cf8" } }, "已安装") : null
                    ),
                  );
                })
        ) : null
      );
    }

    // ── Sidebar nav entry (DOM injection, task-board pattern) ────────

    /** Lightning bolt icon — 18px, matches the shell's nav glyph style */
    var NAV_ICON = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 1.5L3 9h4.5l-1 5.5L13 7H8.5l.5-5.5z"/></svg>';

    /** Family selectors — all sibling plugin entries for stable ordering */
    var FAMILY_SELECTORS = [
      '[data-dsh-taskboard-entry]',
      '[data-dsh-ssh-entry]',
      '[data-dsh-skill-explorer-entry]',
      '[data-dsh-skillhub-entry]'
    ];

    /** Find the sidebar shell root element, or undefined while not yet mounted. */
    function navSidebarRoot() {
      var column = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]');
      if (!column) return undefined;
      var logoRow = column.querySelector('[class*="logoRow"]');
      return logoRow ? logoRow.parentElement : column.firstElementChild;
    }

    /** The New Session button: nested in the logo row on current shells, a direct child on legacy shells. */
    function navNewSessionButton(root) {
      var nested = root.querySelector('button[class*="newSession"]');
      if (nested) return nested;
      for (var i = 0; i < root.children.length; i++) {
        if (root.children[i].tagName === 'BUTTON') return root.children[i];
      }
      return undefined;
    }

    /** Build the entry row (a detached button; insert once the shell is up). */
    function navCreateEntry(onToggle) {
      var entry = document.createElement('button');
      entry.type = 'button';
      entry.setAttribute('data-dsh-skillhub-entry', '');
      entry.setAttribute('data-dsh-plugin', 'skill-hub');
      entry.setAttribute('data-dsh-part', 'sidebar-entry');
      entry.className = 'dsh-sh-nav-entry';
      entry.setAttribute('aria-label', '技能中心');
      entry.setAttribute('title', '技能中心');
      entry.innerHTML =
        '<span class="dsh-sh-nav-entry-icon">' + NAV_ICON + '</span>' +
        '<span class="dsh-sh-nav-entry-label">技能中心</span>';
      entry.addEventListener('click', onToggle);
      return entry;
    }

    /** Re-insert the entry after the New Session row, positioned in the family block. */
    function navPlaceEntry(root, entry) {
      var button = navNewSessionButton(root);
      if (!button) return false;
      if (entry.parentElement !== root) {
        var row = button.closest('[class*="logoRow"]');
        var base = (row && row.parentElement === root) ? row : button;
        var family = Array.prototype.slice.call(root.children).filter(function(el) {
          return el instanceof HTMLElement && el.matches(FAMILY_SELECTORS.join(', '));
        });
        // position: 'after' — insert after the last family entry (or after base if no family yet)
        var anchor = family.length > 0
          ? family[family.length - 1].nextElementSibling
          : base.nextElementSibling;
        root.insertBefore(entry, anchor);
      }
      return true;
    }

    /**
     * Mount the sidebar entry, waiting for the shell to render and self-healing
     * on later React re-renders.
     * @param onToggle - click handler (opens/toggles the skill center panel)
     * @returns disposer removing the entry and its observers
     */
    function mountNavEntry(onToggle) {
      // DOM-level idempotency: never mount a second entry
      if (document.querySelector('[data-dsh-skillhub-entry]')) {
        return function() {};
      }
      var entry = navCreateEntry(onToggle);
      var root;
      var placed = false;

      function tryPlace() {
        if (root !== undefined && !root.isConnected) {
          rootObserver.disconnect();
          root = undefined;
          placed = false;
        }
        if (placed) {
          if (document.body.contains(entry)) return;
          rootObserver.disconnect();
          root = undefined;
          placed = false;
        }
        if (root === undefined) root = navSidebarRoot();
        if (root === undefined) return;
        placed = navPlaceEntry(root, entry);
        if (placed) {
          rootObserver.observe(root, { childList: true, subtree: true });
        }
      }

      // Body-level watcher: detects whole sidebar pane rebuilds
      var waitObserver = new MutationObserver(function() { tryPlace(); });
      waitObserver.observe(document.body, { childList: true, subtree: true });

      // Self-heal: if a React re-render displaces the row, re-insert it in the same frame
      var rootObserver = new MutationObserver(function() {
        if (root === undefined || !root.isConnected) {
          placed = false;
          tryPlace();
          return;
        }
        if (!root.contains(entry)) {
          placed = navPlaceEntry(root, entry);
        }
      });

      tryPlace();

      return function() {
        waitObserver.disconnect();
        rootObserver.disconnect();
        entry.remove();
      };
    }

    // ── Official skill-explorer entry de-duplication ────────────────
    // The host ships its own "技能中心" entry (dsh-client-ui-skill-explorer),
    // which manages LOADED skills (enable/disable/create/delete) and collides
    // by name with our market entry that INSTALLS skills from SkillHub/ClawHub.
    // Both are useful, so instead of hiding one we rename the official row to
    // "技能管理" — the two rows become self-explanatory at a glance.
    var OFFICIAL_LABEL_SELECTOR = 'span[class*="entryLabel"]';
    var OFFICIAL_NEW_LABEL = '技能管理';

    function retitleOfficialSkillEntry() {
      var labels = document.querySelectorAll(OFFICIAL_LABEL_SELECTOR);
      for (var i = 0; i < labels.length; i++) {
        var label = labels[i];
        // never touch our own market entry
        if (label.closest('[data-dsh-skillhub-entry]')) continue;
        if ((label.textContent || '').trim() !== '技能中心') continue;
        label.textContent = OFFICIAL_NEW_LABEL;
        label.setAttribute('data-dsh-retitled', '1');
        var btn = label.closest('button');
        if (btn) {
          btn.setAttribute('title', '技能管理：浏览与管理已加载的 skill');
          btn.setAttribute('aria-label', '技能管理');
        }
      }
    }

    /** Mount the retitle with React re-render self-healing. */
    function mountOfficialRetitle() {
      retitleOfficialSkillEntry();
      var scheduled = false;
      var observer = new MutationObserver(function () {
        if (scheduled) return;
        scheduled = true;
        (window.requestAnimationFrame || function (fn) { setTimeout(fn, 16); })(function () {
          scheduled = false;
          retitleOfficialSkillEntry();
        });
      });
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    }

    // ── Plugin entry ─────────────────────────────────────────────────

    var inject = ["slots", "connection"];
    function apply(ctx) {
      injectCSS();
      mountOfficialRetitle();
      var rpc = ctx.get("connection").rpc;

      // 1. Sidebar nav entry — DOM row after 任务看板 (task-board family pattern)
      ctx.effect(function () {
        var disposer = mountNavEntry(function () {
          // Toggle overlay via custom event
          var event = new CustomEvent("dsh-skill-hub-toggle");
          window.dispatchEvent(event);
        });
        return disposer;
      }, "dsh-skill-hub: sidebar nav entry");

      // 2. Shell overlay — the skill center panel itself
      ctx.effect(function () {
        return ctx.slots.inject("shell.overlay", function () {
          return ctx.slots.register({
            name: "shell.overlay",
            id: "skill-hub",
            order: 30,
            inject: function () { return { rpc: rpc }; }
          }, SkillHubOverlay);
        });
      }, "dsh-skill-hub: overlay");

      // 3. Conversation input left — quick skill picker button
      // This is a session-scope list slot. The framework provides inputActions
      // (with setDraft(text)) as a standard prop to all session-scope slots.
      // + button and / slash commands are resident chrome / overlay slots —
      // our entry sits BESIDE them, never replaces them.
      ctx.effect(function () {
        return ctx.slots.inject("conversation.input.left", function () {
          return ctx.slots.register({
            name: "conversation.input.left",
            id: "skill-hub",
            order: 100,
            inject: function () { return { rpc: rpc }; }
          }, function (props) {
            // inputActions is a framework standard prop for session-scope slots
            var inputActions = props.inputActions;

            // Listen for insert requests from the overlay (SkillHubOverlay)
            // The overlay is in shell.overlay (root scope) and has no inputActions,
            // so it dispatches a CustomEvent that we handle here.
            useEffect(function () {
              var handler = function (e) {
                var skillName = e.detail && e.detail.skill;
                if (skillName && inputActions) {
                  inputActions.setDraft("/" + skillName + " ");
                }
              };
              window.addEventListener("dsh-skill-hub-insert", handler);
              return function () { window.removeEventListener("dsh-skill-hub-insert", handler); };
            }, [inputActions]);

            // Direct insertion when user picks a skill from the quick picker
            var onInsertSkill = function (skill) {
              var name = skill.slug || skill.name;
              if (inputActions) {
                inputActions.setDraft("/" + name + " ");
              }
            };
            return h(ChatInputButton, { rpc: rpc, onInsertSkill: onInsertSkill });
          });
        });
      }, "dsh-skill-hub: input button");
    }

    // ── Shell overlay wrapper (manages open/close state) ─────────────

    function SkillHubOverlay(props) {
      var _a = useState(false), open = _a[0], setOpen = _a[1];
      var _b = useState("market"), initialTab = _b[0], setInitialTab = _b[1];
      var rpc = props.rpc;

      useEffect(function() {
        var toggleHandler = function() { setOpen(function(prev) { return !prev; }); };
        var openHandler = function(e) {
          if (e.detail && e.detail.tab) setInitialTab(e.detail.tab);
          setOpen(true);
        };
        var insertHandler = function(e) {
          // The overlay is rendered in the shell.overlay slot, which does NOT
          // receive inputActions. Instead, the input.left slot listens for
          // this event and does the actual setDraft call. But we also try a
          // direct DOM approach as a universal fallback: find the textarea and
          // insert text at the caret.
          if (e.detail && e.detail.text) {
            var textareas = document.querySelectorAll("textarea");
            for (var i = 0; i < textareas.length; i++) {
              var ta = textareas[i];
              if (ta.offsetParent !== null) { // visible
                var start = ta.selectionStart || ta.value.length;
                var end = ta.selectionEnd || ta.value.length;
                var newVal = ta.value.slice(0, start) + e.detail.text + ta.value.slice(end);
                // Use native setter to trigger React's onChange
                var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
                nativeInputValueSetter.call(ta, newVal);
                ta.dispatchEvent(new Event("input", { bubbles: true }));
                ta.selectionStart = ta.selectionEnd = start + e.detail.text.length;
                ta.focus();
                break;
              }
            }
          }
        };
        window.addEventListener("dsh-skill-hub-toggle", toggleHandler);
        window.addEventListener("dsh-skill-hub-open", openHandler);
        window.addEventListener("dsh-skill-hub-insert", insertHandler);
        return function() {
          window.removeEventListener("dsh-skill-hub-toggle", toggleHandler);
          window.removeEventListener("dsh-skill-hub-open", openHandler);
          window.removeEventListener("dsh-skill-hub-insert", insertHandler);
        };
      }, []);

      if (!open) return null;

      var onUseSkill = function(skill) {
        var name = skill.slug || skill.name;
        // Dispatch event — the ChatInputButton (conversation.input.left) listens
        // and calls inputActions.setDraft() to insert text into the chat input
        var event = new CustomEvent("dsh-skill-hub-insert", { detail: { skill: name } });
        window.dispatchEvent(event);
      };

      return h(SkillCenterPanel, {
        rpc: rpc,
        onClose: function() { setOpen(false); },
        onUseSkill: onUseSkill,
        initialTab: initialTab
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
