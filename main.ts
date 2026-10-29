import {
  App,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  normalizePath,
  requestUrl,
} from "obsidian";

// ---------------------------------------------------------------------------
// DataSinking — 智能搜索：先模糊搜股票（英文名/代码），点一只列出它全部财报，点一条下载进 vault。
//
// 免费档：不填 key，走公共额度（31 篇/7 天/IP）。
// 超额：弹提示，去 https://datasink.ing 注册个免费 key（8191 篇/7 天），填进设置。
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
  word_count?: number;
  content?: string;
}

interface StockItem {
  symbol: string;
  exchange: string;
  stock_code: string;
  name: string;
  report_count: number;
}

/** 字数/字符数紧凑显示：13,300,121 → 13.3M。 */
function fmtCount(n?: number): string {
  if (!n) return "";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return String(n);
}

/** 是否「额度用完/撞限流」类错误（需要引导去领 key）。 */
function needsKey(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes("quota") ||
    lower.includes("limit") ||
    lower.includes("429") ||
    lower.includes("预览") ||
    lower.includes("31 篇") ||
    lower.includes("preview") ||
    lower.includes("免费")
  );
}

export default class DataSinkingPlugin extends Plugin {
  settings: DataSinkingSettings;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "search-reports",
      name: "Search financial reports",
      callback: () => new SearchModal(this.app, this).open(),
    });

    this.addSettingTab(new DataSinkingSettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async api<T>(path: string, withKey: boolean): Promise<T> {
    let url = `${BASE}${path}`;
    if (withKey && this.settings.apiKey) {
      const sep = path.includes("?") ? "&" : "?";
      url += `${sep}apikey=${encodeURIComponent(this.settings.apiKey)}`;
    }

    const resp = await requestUrl({ url });
    const data = resp.json as T;
    if (resp.status >= 400) {
      const err = data as unknown as { detail?: string; message?: string };
      throw new Error(err.detail ?? err.message ?? `HTTP ${resp.status}`);
    }
    return data;
  }

  /** 模糊搜股票（英文名/代码）。/search 是公开端点，不填 key。 */
  async searchStocks(query: string): Promise<StockItem[]> {
    const data = await this.api<{ items?: StockItem[] }>(
      `/search?q=${encodeURIComponent(query)}`,
      false
    );
    return data.items ?? [];
  }

  /** 列某 symbol 的全部财报（新→旧），只要元数据。 */
  async listReports(symbol: string): Promise<ReportDoc[]> {
    const sym = encodeURIComponent(symbol);
    if (this.settings.apiKey) {
      const data = await this.api<{ items?: ReportDoc[] }>(
        `/documents?symbol=${sym}&order=desc&size=200`,
        true
      );
      return data.items ?? [];
    }
    const data = await this.api<{ items?: ReportDoc[] }>(
      `/public/documents?symbol=${sym}&order=desc&size=200`,
      false
    );
    return data.items ?? [];
  }

  /** 按 id 取全文。 */
  async fetchContent(id: number): Promise<ReportDoc> {
    if (this.settings.apiKey) {
      return await this.api<ReportDoc>(`/documents/${id}`, true);
    }
    return await this.api<ReportDoc>(`/public/documents/${id}`, false);
  }

  /** 把一份带 content 的文档存成笔记。返回文件名或 null。 */
  async saveDoc(doc: ReportDoc): Promise<string | null> {
    const folder = normalizePath(this.settings.outputFolder || "");
    // 确保输出文件夹存在（vault.create 有的版本不会自动建父目录 → ENOENT）
    if (folder) {
      const existing = this.app.vault.getAbstractFileByPath(folder);
      if (!existing) {
        try {
          await this.app.vault.createFolder(folder);
        } catch {
          // 已存在/失败都继续，vault.create 会再报
        }
      }
    }
    const filename = `${doc.symbol} - ${doc.report_period}.md`;
    const path = folder ? `${folder}/${filename}` : filename;

    const content = doc.content || `# ${doc.title}\n\n(no content returned)`;
    const file = await this.app.vault.create(path, content);
    await this.app.workspace.getLeaf().openFile(file);
    new Notice(`Saved: ${filename}`);
    return filename;
  }

}

// ---- 智能搜索：股票列表 → 财报列表 → 点击下载 ----
class SearchModal extends Modal {
  private listEl: HTMLElement;
  private lastQuery = "";

  constructor(app: App, private plugin: DataSinkingPlugin) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Financial reports" });

    const row = contentEl.createDiv({ cls: "datasinking-search-row" });
    const input = row.createEl("input", {
      type: "text",
      cls: "datasinking-input",
    });
    input.placeholder = "Company name or ticker, e.g. Toyota / 7203 / AAPL";
    input.focus();
    const btn = row.createEl("button", {
      text: "Search",
      cls: "datasinking-search-btn",
    });

    this.listEl = contentEl.createDiv({ cls: "datasinking-list" });

    const doSearch = () => void this.search(input.value);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doSearch();
    });
    btn.addEventListener("click", doSearch);
  }

  async search(query: string) {
    const q = query.trim();
    if (!q) return;
    this.lastQuery = q;

    this.listEl.empty();
    this.listEl.createEl("div", { text: "Loading…", cls: "datasinking-loading" });

    try {
      const stocks = await this.plugin.searchStocks(q);
      this.renderStocks(stocks, q);
    } catch (e) {
      this.renderError(e);
    }
  }

  renderStocks(stocks: StockItem[], q: string) {
    this.listEl.empty();
    if (stocks.length === 0) {
      this.listEl.createEl("div", {
        text: `No stocks found for "${q}".`,
        cls: "datasinking-empty",
      });
      return;
    }

    for (const s of stocks) {
      const itemEl = this.listEl.createEl("div", { cls: "datasinking-item" });
      itemEl.createEl("div", {
        text: s.name || s.symbol,
        cls: "datasinking-item-title",
      });
      itemEl.createEl("div", {
        text: `${s.symbol} · ${s.report_count} reports`,
        cls: "datasinking-item-meta",
      });
      itemEl.addEventListener("click", () => void this.showReports(s));
    }
  }

  async showReports(stock: StockItem) {
    this.listEl.empty();
    this.listEl.createEl("div", {
      text: `Loading ${stock.name || stock.symbol}…`,
      cls: "datasinking-loading",
    });

    try {
      const items = await this.plugin.listReports(stock.symbol);
      this.renderReports(stock, items);
    } catch (e) {
      this.renderError(e);
    }
  }

  renderReports(stock: StockItem, items: ReportDoc[]) {
    this.listEl.empty();

    // 顶部一个返回链接 + 股票名
    const back = this.listEl.createEl("div", { cls: "datasinking-back" });
    back.createEl("span", { text: `← ${stock.name || stock.symbol} (${stock.symbol})` });
    back.addEventListener("click", () => void this.search(this.lastQuery));

    if (items.length === 0) {
      this.listEl.createEl("div", {
        text: `No reports for ${stock.symbol}.`,
        cls: "datasinking-empty",
      });
      return;
    }

    for (const it of items) {
      const itemEl = this.listEl.createEl("div", { cls: "datasinking-item" });
      itemEl.createEl("div", {
        text: it.title || "(untitled)",
        cls: "datasinking-item-title",
      });
      const metaBits = [
        it.report_period,
        it.doc_type,
        fmtCount(it.word_count) ? `${fmtCount(it.word_count)} chars` : "",
      ].filter(Boolean);
      itemEl.createEl("div", {
        text: metaBits.join(" · "),
        cls: "datasinking-item-meta",
      });
      itemEl.addEventListener("click", () => void this.download(it));
    }
  }

  async download(meta: ReportDoc) {
    try {
      const doc = await this.plugin.fetchContent(meta.id);
      await this.plugin.saveDoc(doc);
    } catch (e) {
      this.renderError(e);
    }
  }

  /** 出错时在列表区就地渲染；额度类错误给「领 key」链接。 */
  renderError(e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const key = needsKey(msg);
    this.listEl.empty();

    const box = this.listEl.createDiv({ cls: "datasinking-error" });
    if (key) {
      box.createEl("div", { text: "免费额度用完了", cls: "datasinking-error-title" });
      box.createEl("div", {
        text: "不填 key 每 7 天只能拉 31 篇。领个免费 key（8191 篇 / 7 天，不用注册）填进「设置 → DataSinking」就能继续。",
        cls: "datasinking-error-text",
      });
      const a = box.createEl("a", { text: "去领免费 key →", href: FREE_KEY_URL });
      a.setAttr("target", "_blank");
      a.setAttr("rel", "noopener");
    } else {
      box.createEl("div", { text: "出错了", cls: "datasinking-error-title" });
      box.createEl("div", { text: msg, cls: "datasinking-error-text" });
    }
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
