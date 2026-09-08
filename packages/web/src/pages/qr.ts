/**
 * /qr 三张码打印页（issue #14；执行简报 §3 v0.2「三个页面各一个二维码」）。
 * 视觉参照 docs/design/backoffice-v1.html 第 7 屏「打印贴墙」那一块（.qrs / .qr：方码 + 名字 + 贴哪）。
 *
 * 只读 public/qr/index.json（scripts/gen-qr.mjs 的构建期产物）：
 *   { siteUrl, generatedAt, items: [{ route, url, png, label }] }
 * 页面里不写任何站点 URL——码与明文 URL 都来自 index.json；换域名只改构建配置（SITE_URL / package.json.homepage）。
 *
 * 布局：A4 竖版一页三块（@page 在 qr.css），每块 = 码 60mm + 大标题（页名三语）+ 给谁 + 一句用法（三语并列，
 * 帮厨 / 采购员 / 顾客各自看得懂）+ URL 明文（扫不开时手输）。屏幕上多一个「打印」按钮（window.print），打印时隐藏。
 * 当前语言排第一并加粗；语言下拉切换时壳层会重新 render（ctx.lang 变了）。
 * 不进抽屉（shell.ts NAV 不加）：这页是给师傅打印用的，从后台或链接 #/qr 进。
 */
import "./qr.css";

import { h } from "../dom";
import { LANGS, type Lang } from "../i18n";
import type { PageCtx } from "../types";

type L10n = Record<Lang, string>;

interface QrItem {
  route: string;
  url: string;
  /** 相对站点根，如 "qr/prep.png"（gen-qr.mjs 约定） */
  png: string;
  label?: Partial<L10n>;
}
interface QrIndex {
  siteUrl: string;
  generatedAt: string;
  items: QrItem[];
}

/** 三张单入口的文案；index.json 里出现了这里没有的 route 时退回它自带的 label */
const COPY: Record<string, { title: L10n; who: L10n; where: L10n; how: L10n }> = {
  prep: {
    title: { uk: "Підготовка", zh: "备料单", en: "Prep" },
    who: { uk: "для помічника кухаря", zh: "帮厨", en: "for the prep cook" },
    where: { uk: "на стіні кухні", zh: "厨房墙上", en: "kitchen wall" },
    how: {
      uk: "Відскануйте один раз і додайте на головний екран (Safari: Поділитися → На Початковий екран)",
      zh: "扫一次，加到主屏幕（Safari 分享 → 加到主屏幕）",
      en: "Scan once and add to Home Screen (Safari: Share → Add to Home Screen)",
    },
  },
  purchase: {
    title: { uk: "Закупівля", zh: "采购单", en: "Purchasing" },
    who: { uk: "для закупівельника", zh: "采购员", en: "for the buyer" },
    where: { uk: "надіслати закупівельнику", zh: "发给采购员", en: "send to the buyer" },
    how: {
      uk: "Відскануйте і збережіть у закладки",
      zh: "收藏此页；微信里长按二维码识别",
      en: "Scan and bookmark this page",
    },
  },
  menu: {
    title: { uk: "Меню", zh: "菜单", en: "Menu" },
    who: { uk: "для гостей", zh: "顾客", en: "for guests" },
    where: { uk: "на стійці · на столах", zh: "档口 · 桌上", en: "counter · tables" },
    how: { uk: "Скануйте, щоб побачити меню", zh: "扫码看菜单", en: "Scan to see the menu" },
  },
};

/** 页面壳文案（只显示当前语言） */
const UI = {
  print: { uk: "Друкувати", zh: "打印", en: "Print" },
  hint: {
    uk: "A4, вертикально — три коди на одному аркуші. Роздрукуйте й повісьте: кухня / закупівельник / стійка.",
    zh: "A4 竖版，一页三张码。打印后贴：厨房墙上 / 发给采购员 / 档口桌上。",
    en: "A4 portrait, three codes on one sheet. Print and post: kitchen / buyer / counter.",
  },
  headline: { uk: "Роздрукуйте і повісьте", zh: "打印贴墙", en: "Print and post" },
  generated: { uk: "Згенеровано", zh: "生成于", en: "Generated" },
} as const satisfies Record<string, L10n>;

function isItem(v: unknown): v is QrItem {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o["route"] === "string" && typeof o["url"] === "string" && typeof o["png"] === "string";
}
function isIndex(v: unknown): v is QrIndex {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o["siteUrl"] === "string" && typeof o["generatedAt"] === "string" && Array.isArray(o["items"]) && o["items"].every(isItem);
}

/** 当前语言排第一，其余按 LANGS 顺序 */
function langOrder(lang: Lang): Lang[] {
  return [lang, ...LANGS.filter((l) => l !== lang)];
}

function formatWhen(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(lang === "zh" ? "zh-Hans" : lang, { dateStyle: "medium", timeStyle: "short" }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

function renderItem(item: QrItem, ctx: PageCtx): HTMLElement {
  const copy = COPY[item.route];
  const order = langOrder(ctx.lang);
  const titleOf = (l: Lang): string => copy?.title[l] ?? item.label?.[l] ?? item.route;
  const primary = titleOf(order[0] ?? ctx.lang);

  const title = h("h3", { class: "qr-title" }, primary);
  for (const l of order.slice(1)) {
    const s = titleOf(l);
    if (s !== primary) title.append(h("span", { class: "alt", lang: l }, s));
  }

  const text = h("div", { class: "qr-text" }, title);
  if (copy) {
    text.append(
      h("p", { class: "qr-who muted" }, order.map((l) => copy.who[l]).join(" · ")),
      h("p", { class: "qr-where muted" }, order.map((l) => copy.where[l]).join(" · ")),
      h(
        "ul",
        { class: "qr-how" },
        ...order.map((l, i) => h("li", { lang: l, class: i === 0 ? "cur" : null }, copy.how[l])),
      ),
    );
  }
  text.append(h("a", { class: "qr-url", href: item.url }, item.url));

  const img = h("img", {
    class: "qr-img",
    src: `${import.meta.env.BASE_URL}${item.png}`,
    alt: `QR · ${primary}`,
    width: 512,
    height: 512,
    decoding: "async",
  });
  return h("article", { class: "card qr-item", "data-route": item.route }, img, text);
}

export async function render(el: HTMLElement, ctx: PageCtx): Promise<void> {
  const lang = ctx.lang;
  const printBtn = h("button", { type: "button", class: "chip solid qr-print" }, UI.print[lang]);
  printBtn.addEventListener("click", () => {
    if (typeof window.print === "function") window.print();
  });
  const toolbar = h("div", { class: "qr-toolbar" }, h("p", { class: "muted" }, UI.hint[lang]), printBtn);
  const status = h("p", { class: "muted qr-status" }, ctx.t("data.loading"));
  const page = h("div", { class: "qr-page" }, toolbar, status);
  el.append(page);

  let index: QrIndex;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}qr/index.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: unknown = await res.json();
    if (!isIndex(json)) throw new Error("qr/index.json: unexpected shape");
    index = json;
  } catch (err) {
    console.error(err);
    status.textContent = ctx.t("data.notReady");
    return;
  }

  const head = h(
    "header",
    { class: "qr-head" },
    h("h2", {}, `${ctx.t("app.name")} · ${UI.headline[lang]}`),
    h("p", { class: "muted" }, `${index.siteUrl} · ${UI.generated[lang]} ${formatWhen(index.generatedAt, lang)}`),
  );
  status.replaceWith(head, ...index.items.map((item) => renderItem(item, ctx)));
}
