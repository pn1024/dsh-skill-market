---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '7a896ef8-6737-435c-9fde-e4b37109aebb'
  PropagateID: '7a896ef8-6737-435c-9fde-e4b37109aebb'
  ReservedCode1: '92bac23e-c2cc-4c72-85cd-7ef5414a41f1'
  ReservedCode2: '92bac23e-c2cc-4c72-85cd-7ef5414a41f1'
---

# dsh-skill-hub

DeepSeek Harness 技能市场插件 —— 聚合 SkillHub + ClawHub 双数据源，站内 README 预览，一键安装/卸载，聊天栏技能选择器，左上角技能中心面板。

## 功能

- **搜索技能**：聚合 SkillHub（腾讯云中国镜像，高速直连）和 ClawHub（OpenClaw 官方源）双数据源，支持中文搜索
- **一键安装/卸载**：安装到 `$DSH_HOME/skills/` 目录，skill-filesystem 自动热发现
- **站内 README 预览**：无需跳转外部页面，详情页原生渲染 Markdown
- **技能中心面板**：左上角侧边栏入口 → 全屏弹窗，搜索、安装、浏览、查看一站式
- **聊天栏快捷入口**：输入栏左侧「⚡ 技能」按钮，快速选择已装技能，自动填入 `/技能名`
- **多源容错**：SkillHub 失败自动回退 ClawHub，反之亦然

## 安装

```bash
dsh plugin --profile web add "github:pn1024/dsh-skill-hub"
```

或本地路径安装：

```bash
dsh plugin --profile web add "/path/to/dsh-skill-hub"
```

## 架构

```
dsh-skill-hub/
├── package.json           # dsh.bundle.patch + dsh.client 声明
├── cordis.patch.yml       # 插件行注册 + 配置
├── src/
│   ├── index.js           # Host 端：RPC intercept (skill-hub/*)
│   └── client.js          # Browser 端：UI 插槽注册 (sidebar/overlay/input)
├── assets/                # 品牌素材（logo 图标等）
├── fix_logo.cjs           # 工具脚本：从 PNG 重新生成内置 logo base64
├── LICENSE
└── README.md
```

### Host 端 RPC 端点

| 端点 | 功能 |
|------|------|
| `skill-hub/search` | 搜索技能（SkillHub + ClawHub 双源聚合） |
| `skill-hub/detail` | 获取技能详情（README、版本、统计） |
| `skill-hub/installed` | 列出本地已安装技能 |
| `skill-hub/install` | 下载并安装技能到本地 |
| `skill-hub/uninstall` | 卸载本地技能 |
| `skill-hub/readme` | 读取已安装技能的 README/SKILL.md |

### Browser 端 UI 插槽

| 插槽 | 功能 |
|------|------|
| `sidebar.footer.action` | 侧边栏底部「⚡ 技能中心」入口按钮 |
| `shell.overlay` | 技能中心全屏弹窗面板 |
| `conversation.input.left` | 聊天输入栏左侧「⚡ 技能」快捷选择器 |

## 数据源

| 平台 | API Base | 特点 |
|------|----------|------|
| SkillHub | `https://api.skillhub.tencent.com` | 腾讯云中国镜像，高速直连，支持中文搜索 |
| ClawHub | `https://clawhub.com` | OpenClaw 官方技能社区，全球可用 |

## 配置

在 `cordis.patch.yml` 中可配置：

```yaml
- insert:
    - id: dsh-skill-hub
      name: 'dsh-skill-hub'
      config:
        skillhubApiBase: https://api.skillhub.tencent.com
        clawhubApiBase: https://clawhub.com
        localSkillsDir: ''        # 空则用 $DSH_HOME/skills
        preferSkillHub: true       # 中国用户优先用 SkillHub
```

## License

MIT

> AI生成