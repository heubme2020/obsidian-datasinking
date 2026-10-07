import {
  App,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  normalizePath,
} from "obsidian";

// ---------------------------------------------------------------------------
// DataSinking — 把财报全文拉进 Obsidian 当 Markdown 笔记。
//
// 免费档：不填 key，走公共额度（很少，够试几次）。
// 超额：弹提示，去 https://datasink.ing 注册个免费 key（8191 篇/7 天），填进设置。
// 付费：$31/年 key（524287 篇/7 天）。
// ---------------------------------------------------------------------------

interface DataSinkingSettings {
  apiKey: string;
  outputFolder: string;
}

const DEFAULT_SETTINGS: DataSinkingSettings = {
  apiKey: "",
  outputFolder: "DataSinking",
};

const BASE = "https://api.datasink.ing";
const HOMEPAGE_URL = "https://datasink.ing";
const FREE_KEY_URL = "https://datasink.ing/pricing";

interface ReportDoc {
  id: number;
  symbol: string;
  report_period: string;
  doc_type: string;
  title: string;
  content?: string;
}

/** 解析「倒数第 N 份」：空/非法 → 1（最新）；"-3" → 3（倒数第三）。 */
function parseIndex(raw: string): number {
  const s = (raw || "").trim();
  const m = /^-(\d+)$/.exec(s);
  if (!m) return 1;
  const k = parseInt(m[1], 10);
  return k >= 1 ? k : 1;
}

export default class DataSinkingPlugin extends Plugin {
  settings: DataSinkingSettings;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "fetch-report",
      name: "Fetch a report by symbol",
      callback: () => new SymbolModal(this.app, this).open(),
    });

    this.addCommand({
      id: "batch-download",
      name: "Batch download reports (comma-separated symbols)",
      callback: () => new BatchModal(this.app, this).open(),
    });

    this.addSettingTab(new DataSinkingSettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async api(path: string, withKey: boolean): Promise<unknown> {
    let url = `${BASE}${path}`;
    const qs: string[] = [];
    if (withKey && this.settings.apiKey) {
      qs.push(`apikey=${encodeURIComponent(this.settings.apiKey)}`);
    }
    qs.push("ref=obsidian"); // 追踪来源：Obsidian 插件
    url += `${path.includes("?") ? "&" : "?"}${qs.join("&")}`;
    const resp = await fetch(url);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error((data as any).detail || (data as any).message || `HTTP ${resp.status}`);
    }
    return data;
  }

  /** 拉某 symbol 的「倒数第 k 份」全文 → 存成笔记。返回文件名或 null。 */
  async saveReport(symbol: string, k: number): Promise<string | null> {
    const sym = symbol.trim();
    if (!sym) return null;

    let doc: ReportDoc | undefined;
    if (this.settings.apiKey) {
      // 有 key：正式端点，一步拿全文（size=k，取第 k-1 项 = 倒数第 k 份）
      const data = (await this.api(
        `/documents?symbol=${encodeURIComponent(sym)}&order=desc&size=${k}&with_content=1`,
        true
      )) as { items?: ReportDoc[] };
      doc = data.items?.[k - 1];
    } else {
      // 无 key：公共端点两步（列表 → 按 id 取全文），走 31 篇/7 天/IP 公共额度
      const list = (await this.api(
        `/public/documents?symbol=${encodeURIComponent(sym)}&order=desc&size=${k}`,
        false
      )) as { items?: ReportDoc[] };
      const meta = list.items?.[k - 1];
      if (meta) {
        doc = (await this.api(`/public/documents/${meta.id}`, false)) as ReportDoc;
      }
    }

    if (!doc) {
      new Notice(`DataSinking: no report #${k} for ${sym}`, 8000);
      return null;
    }

    const folder = normalizePath(this.settings.outputFolder || "");
    const filename = `${doc.symbol} - ${doc.report_period}.md`;
    const path = folder ? `${folder}/${filename}` : filename;

    const content = doc.content || `# ${doc.title}\n\n(no content returned)`;
    const file = await this.app.vault.create(path, content);
    await this.app.workspace.getLeaf().openFile(file);
    new Notice(`Saved: ${filename}`);
    return filename;
  }

  notifyError(e: unknown) {
    const msg = String((e as any)?.message || e).toLowerCase();
    if (msg.includes("quota") || msg.includes("limit") || msg.includes("429")) {
      new Notice(
        "DataSinking: free quota used up — get a free API key at datasink.ing and paste it in Settings → DataSinking.",
        10000
      );
    } else if (msg.includes("missing api key")) {
      new Notice("DataSinking: missing API key — check Settings → DataSinking.", 5000);
    } else {
      new Notice(`DataSinking error: ${String((e as any)?.message || e)}`, 8000);
    }
  }
}

// ---- 输入单个 symbol + 指定第几份的弹窗 ----
class SymbolModal extends Modal {
  constructor(app: App, private plugin: DataSinkingPlugin) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Fetch financial report" });

    contentEl.createEl("p", { text: "Symbol (FMP-style, e.g. 600519.SS / 7203.T / 005930.KS / 2330.TW):" });
    const input = contentEl.createEl("input", { type: "text" });
    input.placeholder = "7203.T";
    input.style.width = "100%";
    input.focus();

    contentEl.createEl("p", { text: "Which report (blank or -1 = latest · -2 = 2nd latest · -3 = 3rd latest):" });
    const idx = contentEl.createEl("input", { type: "text" });
    idx.placeholder = "-1 = latest";
    idx.style.width = "100%";
    idx.style.marginBottom = "12px";

    const submit = () => this.submit(input.value, idx.value);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    idx.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });

    new Setting(contentEl)
      .addButton((btn) => btn.setButtonText("Fetch").setCta().onClick(() => submit()));

    const foot = contentEl.createEl("p", { cls: "datasinking-link" });
    foot.createEl("a", { text: "Visit datasink.ing →", href: HOMEPAGE_URL });
  }

  async submit(symbol: string, rawIdx: string) {
    this.close();
    try {
      await this.plugin.saveReport(symbol, parseIndex(rawIdx));
    } catch (e) {
      this.plugin.notifyError(e);
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ---- 批量下载的弹窗 ----
class BatchModal extends Modal {
  constructor(app: App, private plugin: DataSinkingPlugin) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Batch download reports" });
    contentEl.createEl("p", { text: "Comma-separated symbols, one report each (latest):" });

    const input = contentEl.createEl("textarea");
    input.placeholder = "600519.SS, 7203.T, 005930.KS, 2330.TW";
    input.style.width = "100%";
    input.style.height = "80px";
    input.style.marginBottom = "12px";

    const submit = () => this.submit(input.value);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
    });

    new Setting(contentEl)
      .addButton((btn) => btn.setButtonText("Download").setCta().onClick(() => submit()));

    const foot = contentEl.createEl("p", { cls: "datasinking-link" });
    foot.createEl("a", { text: "Visit datasink.ing →", href: HOMEPAGE_URL });
  }

  async submit(raw: string) {
    this.close();
    const symbols = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (symbols.length === 0) return;

    let ok = 0;
    for (const s of symbols) {
      try {
        const name = await this.plugin.saveReport(s, 1); // 批量拉各自最新
        if (name) ok++;
      } catch (e) {
        this.plugin.notifyError(e);
        break; // 撞额度/断网就停，别把剩下的也刷一遍
      }
    }
    new Notice(`DataSinking: downloaded ${ok}/${symbols.length} reports`);
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ---- 设置页 ----
class DataSinkingSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: DataSinkingPlugin) {
    super(app, plugin);
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("API key")
      .setDesc(
        "Leave empty to use the public quota (31 docs / 7 days / IP). Get a free key (8,191 docs / 7 days) at datasink.ing — no signup required."
      )
      .addText((text) =>
        text
          .setPlaceholder("your free key")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Output folder")
      .setDesc("Where reports are saved (created if missing).")
      .addText((text) =>
        text
          .setPlaceholder("DataSinking")
          .setValue(this.plugin.settings.outputFolder)
          .onChange(async (value) => {
            this.plugin.settings.outputFolder = value.trim() || "DataSinking";
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("hr");
    const info = containerEl.createEl("p");
    info.createEl("a", { text: "Visit datasink.ing →", href: HOMEPAGE_URL });
    info.createEl("br");
    info.createEl("a", { text: "Get a free API key →", href: FREE_KEY_URL });
  }
}
