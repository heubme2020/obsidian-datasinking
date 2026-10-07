# 上架 Obsidian 社区插件（2026 流程）

> 2026 年起 Obsidian 已废弃「fork obsidian-releases + 改 community-plugins.json + PR」的旧流程，
> 改成在官方门户 **community.obsidian.md** 提交。

## 前置条件

- 一个 GitHub 账号 + 一个 Obsidian 账号（分开的）
- 一个**公开** GitHub 仓库，**根目录**放：`README.md`、`LICENSE`、`manifest.json`（以及构建后的 `main.js`、`styles.css`）

## 步骤

1. **建独立仓库**（不要塞进 datasinking 子目录——门户读的是仓库根目录）：
   - 新建公开 repo，比如 `heubme2020/obsidian-datasinking`
   - 把本目录的 `README.md`、`LICENSE`、`manifest.json`、`styles.css`、`main.js` 推到根目录

2. **打 GitHub Release**：
   - tag 必须**精确等于** `manifest.json` 的 `version`（不要 `v` 前缀）→ 现在是 `0.1.0`
   - 把 `main.js`、`manifest.json`、`styles.css` 作为**附件**传上去（不是源码 zip，缺 main.js 用户装不了）

3. **门户提交**：
   - 打开 **community.obsidian.md**
   - 用 **Obsidian 账号**登录 → **关联 GitHub 账号**（让目录能验证仓库归属）
   - 点「New plugin / Add a plugin」→ 粘贴仓库 URL（`https://github.com/heubme2020/obsidian-datasinking`）→ 提交

4. **处理审核反馈**：
   - 自动审核会列出要改的地方
   - 改完要 **bump 版本 + 发新 Release**（只改文件不发 release 不算数）

5. **通过后**：只需提交一次；以后每次发新 GitHub Release（tag 匹配版本）就自动同步更新。

## 注意

- `manifest.json` 的 `id` 全局唯一、**不能含 `obsidian`**（我们是 `datasinking` ✓）
- 门户读的是**默认分支 HEAD 的 manifest.json**，跟 release 附件要保持一致
- 提交前先本地测一遍（见 README）
