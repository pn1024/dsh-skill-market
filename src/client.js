/**
 * dsh-skill-hub — Browser half (client plugin)
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
  id: "dsh-skill-hub",
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
                  h("h2", null, "dsh-skill-hub"),
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

    // ── Brand customization: favicon + sidebar logo ────────────────
    // 2026-09-02：图标原来直接改在 node_modules 文件里，dsh 升级时会被覆盖丢失；
    // 现改为运行时替换，长期有效。换图标 = 替换 BRAND_LOGO_DATA_URL 的 data URL
    //（原始图：assets/xingxiang_logo_icon.png 1335x1335、assets/xingxiang_graphic.png 1077x1077）。
    var BRAND_LOGO_DATA_URL = "data:image/png;base64,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";

    /** 侧栏自定义文案（替换官方 "deepseek harness" 字标） */
    var BRAND_NAME_TEXT = "兴湘智能体";

    // 官方品牌组件的识别特征（来自 @deepseek-ai/dsh-client-ui-primitives）：
    //  - FishLogo（黑色鲸鱼）       : viewBox "0 0 23.16 17.04"，且 path 以 FISH_PATH_PREFIX 开头
    //  - BrandWordmark（deepseek harness 字标）: includeMark:false 时 viewBox 为 "26 0 156 24"
    //
    // ⚠️ 关键坑：侧栏展开态的 DOM 是
    //    [class*="logoRow"] > button.brandIdentity > (svg.brandMark + svg.brandName)
    //                       + button.toggle > svg(收起侧边框)
    //    三个 SVG **全部都在 <button> 里面**。早先用 closest('button') 过滤，结果鲸鱼和字标
    //    一个都没换掉，只有收起按钮被"保护"了——而它本来就不用动。
    //    所以必须靠 SVG 自身的特征来区分，不能用按钮层级判断。
    var FISH_VIEWBOX = "0 0 23.16 17.04";
    var FISH_PATH_PREFIX = "M22.9168 1.43018";
    var WORDMARK_VIEWBOX = "26 0 156 24";

    function isFishMark(svg) {
      if (svg.getAttribute("viewBox") !== FISH_VIEWBOX) return false;
      var p = svg.querySelector("path");
      return !!p && (p.getAttribute("d") || "").indexOf(FISH_PATH_PREFIX) === 0;
    }

    function isBrandWordmark(svg) {
      return svg.getAttribute("viewBox") === WORDMARK_VIEWBOX;
    }

    /** 浏览器标签页图标 → 自定义 logo */
    function brandApplyFavicon() {
      var link = document.querySelector('link[rel~="icon"], link[rel="shortcut icon"]');
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      if (link.getAttribute("href") !== BRAND_LOGO_DATA_URL) {
        link.setAttribute("href", BRAND_LOGO_DATA_URL);
      }
    }

    /** 官方鲸鱼 SVG → 自定义品牌图 */
    function brandReplaceMark(svg, heightPx) {
      svg.setAttribute("data-dsh-brand-hidden", "1");
      svg.style.display = "none";
      var img = document.createElement("img");
      img.src = BRAND_LOGO_DATA_URL;
      img.alt = "";
      img.setAttribute("data-dsh-brand-custom", "1");
      img.style.height = heightPx + "px";
      img.style.width = "auto";
      img.style.display = "block";
      svg.insertAdjacentElement("afterend", img);
    }

    /** 官方 "deepseek harness" 字标 SVG → 自定义文案 */
    function brandReplaceName(svg) {
      svg.setAttribute("data-dsh-brand-hidden", "1");
      svg.style.display = "none";
      var text = document.createElement("span");
      text.textContent = BRAND_NAME_TEXT;
      text.setAttribute("data-dsh-brand-text", "1");
      text.setAttribute("data-dsh-brand-custom", "1");
      text.style.cssText =
        "font-size:15px;font-weight:600;line-height:1.2;color:inherit;" +
        "white-space:nowrap;letter-spacing:0.5px;display:inline-block;";
      svg.insertAdjacentElement("afterend", text);
    }

    /**
     * 侧栏品牌替换。只动这两处，其它一律不碰：
     *  - [class*="logoRow"]  : 展开态，含 brandMark(鲸鱼) + brandName(字标) + 收起按钮
     *  - [class*="railMark"] : 收起态，只含鲸鱼
     * 会话区那个大鲸鱼（pXSMma_fishHitbox）不在上述容器内，不会被替换。
     */
    function brandSwapSidebarLogo() {
      var scopes = document.querySelectorAll('[class*="logoRow"], [class*="railMark"]');
      for (var i = 0; i < scopes.length; i++) {
        var svgs = scopes[i].querySelectorAll('svg:not([data-dsh-brand-hidden])');
        for (var k = 0; k < svgs.length; k++) {
          var svg = svgs[k];
          if (isFishMark(svg)) brandReplaceMark(svg, 22);
          else if (isBrandWordmark(svg)) brandReplaceName(svg);
        }
      }
    }

    /** 挂载品牌定制（含 React 重渲染自愈） */
    function mountBrand() {
      brandApplyFavicon();
      brandSwapSidebarLogo();
      var scheduled = false;
      var observer = new MutationObserver(function () {
        if (scheduled) return;
        scheduled = true;
        (window.requestAnimationFrame || function (fn) { setTimeout(fn, 16); })(function () {
          scheduled = false;
          brandApplyFavicon();
          brandSwapSidebarLogo();
        });
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
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
      mountBrand();
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
