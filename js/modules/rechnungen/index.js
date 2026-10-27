// Rechnungstool als Bereich. Übernommen aus der früheren Einzelseite (rechnungen-alt.html):
// gleiche Bedienung, gleiche Daten unter users/{uid}/invoices, customers und settings/profile.
// Neu: Status bezahlt/offen pro Rechnung (Feld "paid") für die Startseite.
import { deliverFile, loadScript, esc as escHtml, uiZoom } from "../../core/ui.js";
import { icon } from "../../core/icons.js";
import { watchCollection, put, remove, currentUid } from "../../core/data.js";

const LIBS = {
  jspdf: "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
  autotable: "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js",
  docx: "https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js"
};

function ensureCss() {
  if (document.getElementById("rb-css")) return;
  const l = document.createElement("link"); l.id = "rb-css"; l.rel = "stylesheet";
  l.href = new URL("./rechnungen.css", import.meta.url).href;
  document.head.appendChild(l);
}

const TEMPLATE = `<div class="wrap rb">
  <header class="top">
    <div class="brand">Rechnungsbuch<small id="brand-sub"></small></div>
    <nav class="tabs" role="tablist">
      <button type="button" role="tab" data-tab="edit" aria-selected="true" data-i18n="tabEdit">Rechnung bearbeiten</button>
      <button type="button" role="tab" data-tab="list" aria-selected="false"><span data-i18n="tabList">Rechnungen</span><span class="count" id="cnt-inv">0</span></button>
      <button type="button" role="tab" data-tab="cust" aria-selected="false"><span data-i18n="tabCust">Kunden</span><span class="count" id="cnt-cust">0</span></button>
      <button type="button" role="tab" data-tab="set" aria-selected="false" data-i18n="tabSet">Absender &amp; Bank</button>
    </nav>
    <div class="rb-lang" role="group" aria-label="Sprache / Език">
  <button type="button" id="lang-de" aria-pressed="true">DE</button>
  <button type="button" id="lang-bg" aria-pressed="false">BG</button>
</div>
  </header>


  <div class="banner" id="storage-note" hidden></div>

  <!-- EDITOR -->
  <section id="tab-edit">
    <div class="editor">
      <div>
        <div class="panel">
          <h2 id="ed-title" data-i18n="newInvoice">Neue Rechnung</h2>
          <div class="grid">
            <label class="c1"><span class="lbl" data-i18n="number">Rechnungs-Nr.</span><input type="text" inputmode="numeric" id="f-number"></label>
            <label class="c1"><span class="lbl" data-i18n="year">Jahr</span><input type="text" inputmode="numeric" id="f-year"></label>
            <label class="c2"><span class="lbl" data-i18n="date">Rechnungsdatum</span><input type="date" id="f-date"></label>
            <label class="c2"><span class="lbl" data-i18n="customer">Kunde</span><select id="f-customer"></select></label>
            <label class="c3"><span class="lbl" data-i18n="bv">Bauvorhaben (BV)</span><input type="text" id="f-bv" placeholder="Musterstraße 1, 10115 Berlin"></label>
            <label class="c3"><span class="lbl" data-i18n="period">Ausführungszeit</span><input type="text" id="f-period" placeholder="Juli 2026"></label>
            <label class="c6"><span class="lbl" data-i18n="extra">Zusatzzeilen unter der Rechnungsnummer (optional)</span><textarea id="f-extra" rows="2" placeholder="Zwischenrechnung 11&#10;Gebäude A,B"></textarea></label>
          </div>
        </div>

        <div class="panel">
          <h2 data-i18n="items">Positionen</h2>
          <div class="items" id="items">
            <div class="irow head"><span>#</span><span data-i18n="qty">Menge</span><span data-i18n="unit">Einheit</span><span data-i18n="text">Text</span><span class="num" data-i18n="price">Einzelpreis €</span><span class="num" data-i18n="total">Gesamtpreis €</span><span></span></div>
          </div>
          <div class="actions" style="margin-top:10px">
            <button type="button" class="btn" id="add-item" data-i18n="addItem">+ Position hinzufügen</button>
            <span class="hint" data-i18n="itemHint">Menge und Einzelpreis eingeben, der Gesamtpreis wird berechnet. Enter im Einzelpreis der letzten Zeile legt eine neue Position an.</span>
          </div>

          <div class="grid" style="margin-top:18px">
            <label class="c2"><span class="lbl" data-i18n="tax">Umsatzsteuer</span>
              <select id="f-taxmode">
                <option value="reverse" data-i18n="taxReverse">§13b – Steuerschuldnerschaft des Leistungsempfängers</option>
                <option value="vat" data-i18n="taxVat">mit Mehrwertsteuer</option>
              </select></label>
            <label class="c1" id="rate-wrap"><span class="lbl" data-i18n="rate">MwSt.-Satz %</span><input type="text" inputmode="decimal" id="f-rate" class="num"></label>
          </div>
          <div class="totals" id="totals"></div>
        </div>

        <div class="panel deds">
          <h2 data-i18n="deds">Abzüglich bereits gezahlter Rechnungen</h2>
          <p class="hint" style="margin-top:-6px" data-i18n="dedHint">Nur für Zwischen- oder Schlussrechnungen. Ohne Zeilen erscheint der Block nicht auf der Rechnung.</p>
          <div id="deds"></div>
          <button type="button" class="btn" id="add-ded" data-i18n="addDed">+ Abzug hinzufügen</button>
        </div>

        <div class="toolbar actions">
          <button type="button" class="btn primary" id="save"><span data-i18n="save">Speichern</span><span class="dirty" id="dirty" hidden></span></button>
          <button type="button" class="btn" id="pdf" data-i18n="pdf">PDF herunterladen</button>
          <button type="button" class="btn" id="word" data-i18n="word">Word herunterladen</button>
          <button type="button" class="btn" id="copy" data-i18n="copyAsNew">Als neue Rechnung kopieren</button>
          <button type="button" class="btn" id="new" data-i18n="newEmpty">Neue leere Rechnung</button>
        </div>
      </div>

      <div class="preview-box">
        <h2 data-i18n="preview" style="margin-left:2px">Vorschau</h2>
        <div class="paper-frame" id="paper-frame"><div class="sheet" id="sheet"></div></div>
      </div>
    </div>
  </section>

  <!-- LISTE -->
  <section id="tab-list" hidden>
    <div class="panel">
      <div class="actions" style="justify-content:space-between;margin-bottom:10px">
        <input type="text" id="search" class="search" data-i18n-ph="search" placeholder="Suchen: Nr., Kunde, BV …">
        <button type="button" class="btn primary" id="new2" data-i18n="newEmpty">Neue leere Rechnung</button>
      </div>
      <div class="tbl-wrap">
        <table class="list">
          <thead><tr><th data-i18n="thNr">Nr.</th><th data-i18n="date">Datum</th><th data-i18n="customer">Kunde</th><th data-i18n="bv">BV</th><th class="r" data-i18n="thGross">Gesamtbetrag</th><th class="r" data-i18n="thDue">Forderung</th><th data-i18n="thStatus">Status</th><th></th></tr></thead>
          <tbody id="inv-body"></tbody>
        </table>
      </div>
    </div>
  </section>

  <!-- KUNDEN -->
  <section id="tab-cust" hidden>
    <div class="cust">
      <div class="panel">
        <h2 data-i18n="custList">Kundenliste</h2>
        <div class="tbl-wrap"><table class="list"><thead><tr><th data-i18n="name">Name</th><th data-i18n="address">Adresse</th><th class="r" data-i18n="thCount">Rechnungen</th><th></th></tr></thead><tbody id="cust-body"></tbody></table></div>
      </div>
      <div class="panel">
        <h2 id="cust-form-title" data-i18n="custNew">Neuer Kunde</h2>
        <div class="grid">
          <label class="c6"><span class="lbl" data-i18n="name">Name / Firma</span><input type="text" id="c-name" placeholder="Muster GmbH"></label>
          <label class="c6"><span class="lbl" data-i18n="addressLines">Adresse (eine Zeile pro Zeile auf der Rechnung)</span><textarea id="c-address" rows="3" placeholder="Musterstraße 1, 10115 Berlin"></textarea></label>
        </div>
        <div class="actions" style="margin-top:12px">
          <button type="button" class="btn primary" id="c-save" data-i18n="custSave">Kunde speichern</button>
          <button type="button" class="btn" id="c-reset" data-i18n="cancel">Abbrechen</button>
        </div>
        <p class="hint" data-i18n="custHint">Änderungen am Kunden gelten für neue Rechnungen. Bereits gespeicherte Rechnungen behalten die Adresse, mit der sie erstellt wurden.</p>
      </div>
    </div>
  </section>

  <!-- EINSTELLUNGEN -->
  <section id="tab-set" hidden>
    <div class="panel" style="max-width:760px">
      <h2 data-i18n="sender">Absender</h2>
      <div class="grid">
        <label class="c3"><span class="lbl" data-i18n="name">Name</span><input type="text" id="s-name"></label>
        <label class="c3"><span class="lbl" data-i18n="address">Adresse</span><input type="text" id="s-address"></label>
        <label class="c3"><span class="lbl" data-i18n="taxNo">Steuernummer</span><input type="text" id="s-taxNo"></label>
        <label class="c3"><span class="lbl" data-i18n="filePrefix">Dateiname beginnt mit</span><input type="text" id="s-filePrefix"></label>
        <label class="c2"><span class="lbl" data-i18n="bank">Bank</span><input type="text" id="s-bank"></label>
        <label class="c2"><span class="lbl">IBAN</span><input type="text" id="s-iban"></label>
        <label class="c2"><span class="lbl">BIC</span><input type="text" id="s-bic"></label>
        <label class="c3"><span class="lbl" data-i18n="greeting">Grußformel</span><input type="text" id="s-greeting"></label>
        <label class="c6"><span class="lbl" data-i18n="note">Hinweis am Ende</span><input type="text" id="s-note"></label>
      </div>
      <div class="actions" style="margin-top:14px"><button type="button" class="btn primary" id="s-save" data-i18n="save">Speichern</button></div>
    </div>
    <div class="panel" style="max-width:760px">
      <h2 data-i18n="backup">Datensicherung</h2>
      <p class="hint" style="margin-top:-6px" data-i18n="backupHint">Speichert alle Rechnungen, Kunden und Absenderdaten in einer Datei. Mit „Sicherung laden“ holst du sie zurück oder überträgst sie auf einen anderen Browser oder Computer.</p>
      <div class="actions">
        <button type="button" class="btn" id="b-export" data-i18n="backupExport">Sicherung herunterladen</button>
        <button type="button" class="btn" id="b-import" data-i18n="backupImport">Sicherung laden</button>
        <input type="file" id="b-file" accept=".json,application/json" hidden>
      </div>
    </div>
  </section>
</div>`;

export function mount(root, ctx) {
  ensureCss();
  root.innerHTML = TEMPLATE;
  const disposers = [];
  const on = (target, ev, fn, opt) => { target.addEventListener(ev, fn, opt); disposers.push(() => target.removeEventListener(ev, fn, opt)); };
  const DRAFT_KEY = "rb-draft-" + currentUid();
  /* ---------- Sprache (nur Bedienoberfläche, Rechnungen bleiben deutsch) ---------- */
  const BG = {
    tabEdit: "Редактиране на фактура", tabList: "Фактури", tabCust: "Клиенти", tabSet: "Подател и банка",
    newInvoice: "Нова фактура", editInvoice: "Редактиране на фактура", number: "Номер на фактура", year: "Година", date: "Дата на фактурата",
    customer: "Клиент", bv: "Строителен обект (BV)", period: "Период на изпълнение",
    extra: "Допълнителни редове под номера (по избор, напр. междинна фактура)",
    items: "Позиции", qty: "Количество", unit: "Мерна единица", text: "Описание", price: "Ед. цена €", total: "Обща цена €",
    addItem: "+ Добави позиция", itemHint: "Въведете количество и единична цена – общата цена се изчислява автоматично. Enter в цената на последния ред добавя нова позиция.",
    tax: "ДДС", taxReverse: "§13b – обратно начисляване (без ДДС)", taxVat: "с ДДС", rate: "Ставка ДДС %",
    deds: "Приспадане на вече платени фактури", dedHint: "Само за междинни или окончателни фактури. Без редове този блок не се показва във фактурата.",
    addDed: "+ Добави приспадане", dedLabel: "Наименование (напр. Zwischenrechnung 1)", dedRef: "Препратка (напр. Rechnung Nr.07/2025)", dedAmount: "Сума €",
    save: "Запази", pdf: "Изтегли PDF", word: "Изтегли Word", copyAsNew: "Копирай като нова фактура", newEmpty: "Нова празна фактура",
    preview: "Преглед", search: "Търсене: номер, клиент, обект …", thNr: "№", thGross: "Обща сума", thDue: "За плащане",
    open: "Отвори", copy: "Копирай", del: "Изтрий", custList: "Списък с клиенти", name: "Име / фирма", address: "Адрес",
    addressLines: "Адрес (всеки ред както във фактурата)", thCount: "Фактури", custNew: "Нов клиент", custEdit: "Редактиране на клиент",
    custSave: "Запази клиента", cancel: "Отказ", custHint: "Промените важат за нови фактури. Вече запазените фактури запазват адреса, с който са създадени.",
    sender: "Подател", taxNo: "Данъчен номер", filePrefix: "Името на файла започва с", bank: "Банка", greeting: "Заключителен поздрав", note: "Бележка в края",
    sumNet: "Общо нето", sumVat: "ДДС", sumGross: "Обща сума", sumDed: "Приспаднато", sumDue: "Сума за плащане",
    noInvoices: "Още няма фактури. Създайте първата в раздел „Редактиране на фактура“.", noCustomers: "Още няма клиенти. Добавете първия вдясно.",
    noMatch: "Няма намерени фактури.", pickCustomer: "— изберете клиент —", newCustomerOpt: "+ Нов клиент …",
    saved: "Запазено.", savedCopyHint: "Копие създадено – редактирайте и запазете.", deleted: "Изтрито.", custSaved: "Клиентът е запазен.",
    settingsSaved: "Данните на подателя са запазени.", confirmDel: "Наистина ли да се изтрие фактура {nr}?", yesDelete: "Да, изтрий",
    confirmDiscard: "Има незапазени промени. Да се отхвърлят ли?", discard: "Отхвърли", confirmDelCust: "Да се изтрие ли клиент „{name}“?",
    thStatus: "Статус", paid: "платена", open2: "отворена", togglePaid: "Смяна: платена / отворена",
    dupNumber: "Внимание: фактура {nr} вече съществува.", loading: "Зареждане …", localOnly: "Данните се запазват само в този браузър, защото онлайн хранилището не е достъпно тук.",
    exportFail: "Файлът не можа да бъде създаден: {msg}", declined: "Изтеглянето е отказано.", needCustomer: "Моля, изберете клиент.",
    backup: "Резервно копие", backupHint: "Записва всички фактури, клиенти и данни на подателя в един файл. С „Зареди копие“ ги възстановявате или прехвърляте в друг браузър или компютър.",
    backupExport: "Изтегли резервно копие", backupImport: "Зареди копие", backupLoaded: "Копието е заредено: {n} фактури, {c} клиенти.", backupBad: "Файлът не е валидно резервно копие.",
    standaloneNote: "Офлайн версия: данните се пазят само в този браузър. Изтегляйте редовно резервно копие (Подател и банка → Резервно копие).",
    logout: "Изход", loginSub: "Моля, влезте", email: "Имейл", password: "Парола", login: "Вход", forgot: "Забравена парола",
    loginBad: "Грешен имейл или парола.", loginMany: "Твърде много опити. Изчакайте малко и опитайте отново.", loginNet: "Няма връзка с интернет.",
    resetSent: "Изпратен е имейл за нова парола до {email}.", needEmail: "Моля, въведете имейл.",
    saveFail: "Запазването не успя: {msg}", posLabel: "Позиция", moveUp: "Нагоре", moveDown: "Надолу", remove: "Премахни", edit: "Редактирай"
  };
  const DE = {
    editInvoice: "Rechnung bearbeiten", newInvoice: "Neue Rechnung",
    dedLabel: "Bezeichnung (z. B. Zwischenrechnung 1)", dedRef: "Bezug (z. B. Rechnung Nr.07/2025)", dedAmount: "Betrag €",
    open: "Öffnen", copy: "Kopieren", del: "Löschen", custNew: "Neuer Kunde", custEdit: "Kunde bearbeiten",
    sumNet: "Gesamt Netto", sumVat: "MwSt.", sumGross: "Gesamtbetrag", sumDed: "Abzüglich gezahlt", sumDue: "Forderungsbetrag",
    noInvoices: "Noch keine Rechnungen. Lege die erste im Tab „Rechnung bearbeiten“ an.", noCustomers: "Noch keine Kunden. Lege rechts den ersten an.",
    noMatch: "Keine passenden Rechnungen.", pickCustomer: "— Kunde wählen —", newCustomerOpt: "+ Neuer Kunde …",
    saved: "Gespeichert.", savedCopyHint: "Kopie erstellt – bearbeiten und speichern.", deleted: "Gelöscht.", custSaved: "Kunde gespeichert.",
    settingsSaved: "Absenderdaten gespeichert.", confirmDel: "Rechnung {nr} wirklich löschen?", yesDelete: "Ja, löschen",
    confirmDiscard: "Es gibt ungespeicherte Änderungen. Verwerfen?", discard: "Verwerfen", confirmDelCust: "Kunde „{name}“ löschen?",
    paid: "bezahlt", open2: "offen", togglePaid: "Umschalten: bezahlt / offen",
    dupNumber: "Achtung: Rechnung {nr} gibt es schon.", loading: "Lade …", localOnly: "Die Daten werden nur in diesem Browser gespeichert, weil der Online-Speicher hier nicht verfügbar ist.",
    exportFail: "Datei konnte nicht erstellt werden: {msg}", declined: "Download abgebrochen.", needCustomer: "Bitte einen Kunden wählen.",
    backupLoaded: "Sicherung geladen: {n} Rechnungen, {c} Kunden.", backupBad: "Die Datei ist keine gültige Sicherung.",
    standaloneNote: "Offline-Version: Die Daten liegen nur in diesem Browser. Lade regelmäßig eine Sicherung herunter (Absender & Bank → Datensicherung).",
    loginBad: "E-Mail oder Passwort ist falsch.", loginMany: "Zu viele Versuche. Bitte kurz warten und noch einmal versuchen.", loginNet: "Keine Internetverbindung.",
    resetSent: "E-Mail zum Zurücksetzen wurde an {email} gesendet.", needEmail: "Bitte die E-Mail-Adresse eingeben.",
    saveFail: "Speichern fehlgeschlagen: {msg}", posLabel: "Position", moveUp: "Nach oben", moveDown: "Nach unten", remove: "Entfernen", edit: "Bearbeiten", cancel: "Abbrechen"
  };
  let lang = "de";
  try { if (localStorage.getItem("rb-lang") === "bg") lang = "bg"; } catch (e) {}
  const deStatic = {};
  function t(key, vars) {
    let s = (lang === "bg" ? BG[key] : (DE[key] ?? deStatic[key])) ?? deStatic[key] ?? DE[key] ?? key;
    if (vars) for (const k in vars) s = s.replace("{" + k + "}", vars[k]);
    return s;
  }
  function applyLang() {
    root.querySelectorAll("[data-i18n]").forEach(el => {
      const k = el.dataset.i18n;
      if (!(k in deStatic)) deStatic[k] = el.textContent;
      el.textContent = lang === "bg" && BG[k] ? BG[k] : deStatic[k];
    });
    root.querySelectorAll("[data-i18n-ph]").forEach(el => {
      const k = el.dataset.i18nPh;
      if (!(("ph:" + k) in deStatic)) deStatic["ph:" + k] = el.placeholder;
      el.placeholder = lang === "bg" && BG[k] ? BG[k] : deStatic["ph:" + k];
    });
    $("#lang-de").setAttribute("aria-pressed", lang === "de");
    $("#lang-bg").setAttribute("aria-pressed", lang === "bg");
    renderAll();
  }
  function setLang(l) { lang = l; try { localStorage.setItem("rb-lang", l); } catch (e) {} applyLang(); }

  /* ---------- Helfer ---------- */
  const $ = s => root.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
  function parseNum(v) {
    if (typeof v === "number") return v;
    let s = String(v ?? "").trim().replace(/\s/g, "");
    if (!s) return 0;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  const fmtMoney = n => r2(n).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function fmtQty(raw) {
    const s = String(raw ?? "").trim();
    if (!s) return "";
    return s.includes(",") ? s : s.replace(".", ",");
  }
  function qtyWithUnit(it) {
    const q = fmtQty(it.qty), u = (it.unit || "").trim();
    if (!u) return q;
    return /^(m|m²|m³|mm|cm|kg|t|l)$/.test(u) ? q + u : q + " " + u;
  }
  const fmtDate = iso => { if (!iso) return ""; const [y, m, d] = iso.split("-"); return `${d}.${m}.${y}`; };
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const uid = p => p + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  const clone = o => JSON.parse(JSON.stringify(o));
  const nrLabel = inv => `${String(inv.number).padStart(2, "0")} / ${inv.year}`;

  function calc(inv) {
    const lines = (inv.items || []).map(it => r2(parseNum(it.qty) * parseNum(it.price)));
    const net = r2(lines.reduce((a, b) => a + b, 0));
    const vatMode = inv.tax?.mode === "vat";
    const rate = vatMode ? parseNum(inv.tax.rate) : 0;
    const vat = vatMode ? r2(net * rate / 100) : 0;
    const gross = r2(net + vat);
    const dedSum = r2((inv.deductions || []).reduce((a, d) => a + parseNum(d.amount), 0));
    return { lines, net, vat, rate, vatMode, gross, dedSum, due: r2(gross - dedSum), hasDed: (inv.deductions || []).length > 0 };
  }

  /* ---------- Speicher: Firestore unter users/{uid}/… (gleiche Pfade wie die frühere Einzelseite) ---------- */
  const subs = [];
  const Store = {
    mode: "firebase",
    watch(coll, cb) { const stop = watchCollection(coll, cb); subs.push(stop); return stop; },
    put: (coll, id, data) => put(coll, id, data),
    del: (coll, id) => remove(coll, id)
  };

  /* ---------- Zustand ---------- */
  const DEFAULT_PROFILE = {
    name: "", address: "", taxNo: "",
    bank: "", iban: "", bic: "",
    greeting: "Mit freundlichen Grüßen", note: "Diese Rechnung wurde maschinell erstellt und ist ohne Unterschrift gültig",
    filePrefix: "Rechnung"
  };
  let invoices = [], customers = [], profile = { ...DEFAULT_PROFILE };
  let cur = null, curId = null, dirty = false, editCustId = null, loaded = false;

  function sortedInvoices() {
    return invoices.slice().sort((a, b) => (b.year - a.year) || (b.number - a.number) || String(b.date).localeCompare(String(a.date)));
  }
  function nextNumber(year) {
    const nums = invoices.filter(i => Number(i.year) === Number(year)).map(i => Number(i.number) || 0);
    return nums.length ? Math.max(...nums) + 1 : 1;
  }
  function blankInvoice() {
    const year = new Date().getFullYear();
    const last = sortedInvoices()[0];
    const cust = last ? customers.find(c => c.id === last.customer?.id) : customers[0];
    return {
      number: nextNumber(year), year, date: todayIso(),
      customer: cust ? { id: cust.id, name: cust.name, address: cust.address } : null,
      extra: "", bv: "", period: "",
      items: [{ qty: "", unit: "m²", text: "", price: "" }],
      tax: { mode: "reverse", rate: 19 }, deductions: []
    };
  }
  function setDirty(v) { dirty = v; $("#dirty").hidden = !v; saveDraft(); }
  function saveDraft() {
    try {
      if (dirty && cur) localStorage.setItem(DRAFT_KEY, JSON.stringify({ cur, curId }));
      else localStorage.removeItem(DRAFT_KEY);
    } catch (e) {}
  }

  /* ---------- Editor ---------- */
  function loadIntoEditor(inv, id) {
    cur = clone(inv); curId = id;
    if (!cur.items?.length) cur.items = [{ qty: "", unit: "m²", text: "", price: "" }];
    cur.deductions ||= []; cur.tax ||= { mode: "reverse", rate: 19 };
    const plain = v => typeof v === "number" ? v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }) : v;
    cur.items.forEach(it => { it.price = plain(it.price); });
    cur.deductions.forEach(d => { d.amount = plain(d.amount); });
    $("#f-number").value = cur.number ?? "";
    $("#f-year").value = cur.year ?? "";
    $("#f-date").value = cur.date || "";
    $("#f-bv").value = cur.bv || "";
    $("#f-period").value = cur.period || "";
    $("#f-extra").value = cur.extra || "";
    $("#f-taxmode").value = cur.tax.mode;
    $("#f-rate").value = String(cur.tax.rate ?? 19).replace(".", ",");
    renderCustomerSelect();
    renderItems(); renderDeds(); renderTotals(); renderPreview(); renderEdTitle();
  }
  function renderEdTitle() {
    $("#ed-title").textContent = curId ? `${t("editInvoice")} · ${nrLabel(cur)}` : t("newInvoice");
  }
  function renderCustomerSelect() {
    const sel = $("#f-customer");
    const opts = [`<option value="">${esc(t("pickCustomer"))}</option>`];
    const ids = new Set(customers.map(c => c.id));
    customers.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(c => opts.push(`<option value="${esc(c.id)}">${esc(c.name)}</option>`));
    if (cur?.customer && !ids.has(cur.customer.id)) opts.push(`<option value="__snap">${esc(cur.customer.name)}</option>`);
    opts.push(`<option value="__new">${esc(t("newCustomerOpt"))}</option>`);
    sel.innerHTML = opts.join("");
    sel.value = cur?.customer ? (ids.has(cur.customer.id) ? cur.customer.id : "__snap") : "";
  }
  function itemRow(it, i) {
    const total = r2(parseNum(it.qty) * parseNum(it.price));
    return `<div class="irow" data-i="${i}">
      <span class="pos">${i + 1}</span>
      <input type="text" class="num f-qty" inputmode="decimal" data-f="qty" id="it-qty-${i}" value="${esc(it.qty)}" aria-label="${esc(t("qty"))}">
      <span class="combo f-unit"><input type="text" data-f="unit" id="it-unit-${i}" value="${esc(it.unit)}" autocomplete="off" aria-label="${esc(t("unit"))}"><button type="button" data-op="units" tabindex="-1" aria-label="${esc(t("unit"))}" aria-haspopup="listbox">${icon("chevron-down", { size: 16 })}</button></span>
      <textarea class="f-text" data-f="text" id="it-text-${i}" rows="1" aria-label="${esc(t("text"))}">${esc(it.text)}</textarea>
      <input type="text" class="num f-price" inputmode="decimal" data-f="price" id="it-price-${i}" value="${esc(it.price)}" aria-label="${esc(t("price"))}">
      <span class="tot">${fmtMoney(total)}</span>
      <span class="ops">
        <button type="button" class="btn icon small" data-op="up" title="${esc(t("moveUp"))}" aria-label="${esc(t("moveUp"))}">${icon("arrow-up")}</button>
        <button type="button" class="btn icon small" data-op="down" title="${esc(t("moveDown"))}" aria-label="${esc(t("moveDown"))}">${icon("arrow-down")}</button>
        <button type="button" class="btn icon small danger" data-op="rm" title="${esc(t("remove"))}" aria-label="${esc(t("remove"))}">${icon("x")}</button>
      </span></div>`;
  }
  function renderItems() {
    const box = $("#items");
    box.querySelectorAll(".irow:not(.head)").forEach(n => n.remove());
    box.insertAdjacentHTML("beforeend", cur.items.map(itemRow).join(""));
    box.querySelectorAll("textarea.f-text").forEach(autoGrow);
  }
  function autoGrow(ta) { ta.style.height = "auto"; ta.style.height = Math.max(36, ta.scrollHeight + 2) + "px"; }
  function renderDeds() {
    $("#deds").innerHTML = cur.deductions.map((d, i) => `<div class="drow" data-i="${i}">
      <input type="text" data-f="label" id="d-label-${i}" value="${esc(d.label)}" placeholder="${esc(t("dedLabel"))}" aria-label="${esc(t("dedLabel"))}">
      <input type="text" data-f="ref" id="d-ref-${i}" value="${esc(d.ref)}" placeholder="${esc(t("dedRef"))}" aria-label="${esc(t("dedRef"))}">
      <input type="text" class="num" inputmode="decimal" data-f="amount" id="d-amount-${i}" value="${esc(d.amount)}" placeholder="0,00" aria-label="${esc(t("dedAmount"))}">
      <button type="button" class="btn icon small danger" data-op="rm" aria-label="${esc(t("remove"))}">${icon("x")}</button></div>`).join("");
  }
  function renderTotals() {
    if (!cur) return;
    const c = calc(cur);
    $("#rate-wrap").hidden = !c.vatMode;
    let h = `<span>${esc(t("sumNet"))}</span><span class="num">${fmtMoney(c.net)} €</span>`;
    if (c.vatMode) h += `<span>${esc(t("sumVat"))} ${fmtQty(String(c.rate))} %</span><span class="num">${fmtMoney(c.vat)} €</span>`;
    h += `<span class="${c.hasDed ? "" : "big"}">${esc(t("sumGross"))}</span><span class="num ${c.hasDed ? "" : "big"}">${fmtMoney(c.gross)} €</span>`;
    if (c.hasDed) h += `<span>${esc(t("sumDed"))}</span><span class="num">− ${fmtMoney(c.dedSum)} €</span><span class="big">${esc(t("sumDue"))}</span><span class="num big">${fmtMoney(c.due)} €</span>`;
    $("#totals").innerHTML = h;
  }
  function updateRowTotals() {
    root.querySelectorAll("#items .irow:not(.head)").forEach(row => {
      const it = cur.items[+row.dataset.i];
      row.querySelector(".tot").textContent = fmtMoney(r2(parseNum(it.qty) * parseNum(it.price)));
    });
  }
  let previewTimer = 0;
  function changed() {
    setDirty(true); renderTotals();
    clearTimeout(previewTimer); previewTimer = setTimeout(renderPreview, 120);
  }

  /* ---------- Vorschau (HTML-Abbild des PDF) ---------- */
  function renderPreview() {
    if (!cur) return;
    const p = profile, c = calc(cur);
    const cust = cur.customer || { name: "", address: "" };
    let rows = cur.items.map((it, i) => `<tr><td>${i + 1}.</td><td class="q">${esc(qtyWithUnit(it))}</td><td class="t">${esc(it.text)}</td><td class="r">${fmtMoney(parseNum(it.price))}</td><td class="r">${fmtMoney(c.lines[i])}</td></tr>`).join("");
    rows += `<tr class="sum"><td colspan="4">Gesamt Netto</td><td class="r">${fmtMoney(c.net)}</td></tr>`;
    if (c.vatMode) rows += `<tr class="sum"><td colspan="4">zzgl. ${fmtQty(String(c.rate))} % MwSt.</td><td class="r">${fmtMoney(c.vat)}</td></tr>`;
    rows += `<tr class="sum b"><td colspan="4">Gesamtbetrag</td><td class="r">${fmtMoney(c.gross)}</td></tr>`;
    if (!c.vatMode) rows += `<tr class="sum"><td colspan="5" style="font-size:10pt">Steuerschuldnerschaft des Leistungsempfängers</td></tr>`;
    let ded = "";
    if (c.hasDed) {
      ded = `<div class="ded">` + cur.deductions.map((d, i) => `<span>${i === 0 ? "Abzüglich gezahlter :" : ""}</span><i>${esc(d.label)}${d.label ? "," : ""}</i><span>${esc(d.ref)}</span><span class="r">${fmtMoney(parseNum(d.amount))}</span>`).join("")
        + `<span></span><span></span><b style="margin-top:2mm">Forderungsbetrag:</b><b class="r" style="margin-top:2mm">${fmtMoney(c.due)}</b></div>`;
    }
    $("#sheet").innerHTML = `
      <div class="hd">${esc(p.name)}<br>${esc(p.address)}</div>
      <div class="sender">${esc(p.name)} ${esc(p.address)}</div>
      <div class="rcpt">${esc(cust.name)}\n${esc(cust.address)}</div>
      <div class="meta"><span>Steuernr:</span><span>${esc(p.taxNo)}</span><span>Datum:</span><span>${fmtDate(cur.date)}</span></div>
      <div class="nr">Rechnung Nr. ${esc(nrLabel(cur))}</div>
      ${cur.extra?.trim() ? `<div class="extra">${esc(cur.extra.trim())}</div>` : ""}
      <div class="bv">${cur.bv ? "BV: " + esc(cur.bv) + "<br>" : ""}${cur.period ? "Ausführungszeit: " + esc(cur.period) : ""}</div>
      <table><colgroup><col style="width:12%"><col style="width:18%"><col style="width:34%"><col style="width:18%"><col style="width:18%"></colgroup>
        <thead><tr><th class="p">Pos</th><th>Menge</th><th>Text</th><th>Einzelpreis<br>EUR</th><th>Gesamtpreis<br>EUR</th></tr></thead>
        <tbody>${rows}</tbody></table>
      ${ded}
      <div class="end">${esc(p.greeting)}<br>${esc(p.name)}<br><br>${esc(p.note)}</div>
      <div class="bank"><span>${esc(p.bank)}</span><span>IBAN: ${esc(p.iban)}</span><span>BIC: ${esc(p.bic)}</span></div>`;
    fitSheet();
  }
  function fitSheet() {
    const frame = $("#paper-frame"), sheet = $("#sheet");
    const w = frame.clientWidth; if (!w) return;
    const natural = sheet.offsetWidth;
    const s = w / natural;
    sheet.style.transform = `scale(${s})`;
    frame.style.height = sheet.offsetHeight * s + "px";
  }

  /* ---------- PDF ---------- */
  function buildPdf(inv, p) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const c = calc(inv), L = 30, R = 181, cust = inv.customer || { name: "", address: "" };
    let y;
    doc.setFont("times", "bold"); doc.setFontSize(12);
    doc.text(p.name, 105, 32, { align: "center" });
    doc.text(p.address, 105, 37.5, { align: "center" });
    doc.setFont("times", "normal"); doc.setFontSize(9);
    const sl = `${p.name} ${p.address}`;
    doc.text(sl, L, 52); doc.setLineWidth(0.2); doc.line(L, 52.8, L + doc.getTextWidth(sl), 52.8);
    doc.setFontSize(10);
    y = 64;
    [cust.name, ...String(cust.address || "").split("\n")].filter(s => s.trim()).forEach(line => { doc.text(line, L, y); y += 4.4; });
    y = Math.max(y + 2, 76);
    doc.setFontSize(9);
    doc.text("Steuernr:", 152, y, { align: "right" }); doc.text(p.taxNo || "", R, y, { align: "right" });
    doc.text("Datum:", 152, y + 4.4, { align: "right" }); doc.text(fmtDate(inv.date), R, y + 4.4, { align: "right" });
    y += 15;
    doc.setFont("times", "bold"); doc.setFontSize(13);
    doc.text(`Rechnung Nr. ${nrLabel(inv)}`, L, y);
    doc.setFont("times", "normal"); doc.setFontSize(10);
    y += 7;
    const extra = String(inv.extra || "").trim();
    if (extra) { extra.split("\n").forEach(line => { doc.text(line, L, y); y += 5.5; }); y += 1; }
    if (inv.bv) { doc.text("BV: " + inv.bv, L, y); y += 4.4; }
    if (inv.period) { doc.text("Ausführungszeit: " + inv.period, L, y); y += 4.4; }

    const body = inv.items.map((it, i) => [`${i + 1}.`, qtyWithUnit(it), it.text || "", fmtMoney(parseNum(it.price)), fmtMoney(c.lines[i])]);
    const sumRow = (label, val, extraStyle = {}) => [
      { content: label, colSpan: 4, styles: { halign: "left", fontSize: 9, ...extraStyle } },
      { content: val, styles: { halign: "right", fontSize: 9, ...extraStyle } }];
    body.push(sumRow("Gesamt Netto", fmtMoney(c.net)));
    if (c.vatMode) body.push(sumRow(`zzgl. ${fmtQty(String(c.rate))} % MwSt.`, fmtMoney(c.vat)));
    body.push(sumRow("Gesamtbetrag", fmtMoney(c.gross), { fontStyle: "bold" }));
    if (!c.vatMode) body.push([{ content: "Steuerschuldnerschaft des Leistungsempfängers", colSpan: 5, styles: { halign: "left", fontSize: 10 } }]);
    doc.autoTable({
      startY: y - 1.5, margin: { left: L, right: 210 - R, top: 20, bottom: 18 }, theme: "grid", showHead: "firstPage",
      styles: { font: "times", fontSize: 10, textColor: 0, lineColor: 0, lineWidth: 0.2, cellPadding: { top: 1.3, bottom: 1.3, left: 1.5, right: 1.5 }, valign: "top", overflow: "linebreak" },
      headStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: "normal", halign: "center", fontSize: 11 },
      columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 27, fontSize: 10.5 }, 2: { cellWidth: 51, halign: "center", fontSize: 9 }, 3: { cellWidth: 27.5, halign: "right" }, 4: { cellWidth: 27.5, halign: "right" } },
      head: [[{ content: "Pos", styles: { halign: "left", fontSize: 8 } }, "Menge", "Text", "Einzelpreis\nEUR", "Gesamtpreis\nEUR"]],
      body
    });
    y = doc.lastAutoTable.finalY + 10;
    const need = h => { if (y + h > 280) { doc.addPage(); y = 25; } };
    doc.setFontSize(10);
    if (c.hasDed) {
      inv.deductions.forEach((d, i) => {
        need(6);
        doc.setFont("times", "normal");
        if (i === 0) doc.text("Abzüglich gezahlter :", L + 12, y);
        doc.setFont("times", "italic"); doc.text((d.label || "") + (d.label ? "," : ""), 122, y, { align: "right" });
        doc.setFont("times", "normal"); doc.text(d.ref || "", 125, y); doc.text(fmtMoney(parseNum(d.amount)), R, y, { align: "right" });
        y += 4.6;
      });
      y += 3; need(6);
      doc.setFont("times", "bold"); doc.text("Forderungsbetrag:", 125, y); doc.text(fmtMoney(c.due), R, y, { align: "right" });
      doc.setFont("times", "normal");
      y += 12;
    } else y += 4;
    need(36);
    doc.text(p.greeting || "", L, y); y += 4.6;
    doc.text(p.name, L, y); y += 9;
    doc.text(p.note || "", L, y); y += 10;
    doc.setFont("times", "bold"); doc.setFontSize(9);
    doc.text(p.bank || "", L, y); doc.text("IBAN: " + (p.iban || ""), L + 20, y); doc.text("BIC:  " + (p.bic || ""), L + 92, y);
    return doc;
  }

  /* ---------- Word ---------- */
  function buildDocx(inv, p) {
    const D = window.docx;
    const c = calc(inv), cust = inv.customer || { name: "", address: "" };
    const W = 8561, cols = [1021, 1531, 2892, 1559, 1558];
    const run = (text, o = {}) => new D.TextRun({ text, font: "Times New Roman", size: o.size || 20, bold: o.bold, italics: o.italic, underline: o.underline ? {} : undefined });
    const para = (children, o = {}) => new D.Paragraph({ children: Array.isArray(children) ? children : [children], alignment: o.align, spacing: { after: o.after ?? 0, before: o.before ?? 0 }, tabStops: o.tabs });
    const lines = (text, o) => String(text || "").split("\n").map(s => para(run(s, o), { align: o?.align }));
    const cell = (content, o = {}) => new D.TableCell({
      width: { size: o.w, type: D.WidthType.DXA }, columnSpan: o.span,
      margins: { top: 40, bottom: 40, left: 80, right: 80 },
      children: lines(content, { size: o.size || 20, bold: o.bold, align: o.align })
    });
    const A = D.AlignmentType;
    const head = new D.TableRow({ tableHeader: true, children: [
      cell("Pos", { w: cols[0], size: 16 }), cell("Menge", { w: cols[1], size: 22, align: A.CENTER }), cell("Text", { w: cols[2], size: 22, align: A.CENTER }),
      cell("Einzelpreis\nEUR", { w: cols[3], size: 22, align: A.CENTER }), cell("Gesamtpreis\nEUR", { w: cols[4], size: 22, align: A.CENTER })] });
    const rows = [head, ...inv.items.map((it, i) => new D.TableRow({ cantSplit: true, children: [
      cell(`${i + 1}.`, { w: cols[0] }), cell(qtyWithUnit(it), { w: cols[1], size: 21 }), cell(it.text || "", { w: cols[2], size: 18, align: A.CENTER }),
      cell(fmtMoney(parseNum(it.price)), { w: cols[3], align: A.RIGHT }), cell(fmtMoney(c.lines[i]), { w: cols[4], align: A.RIGHT })] }))];
    const sum = (label, val, bold) => new D.TableRow({ children: [cell(label, { w: W - cols[4], span: 4, size: 18, bold }), cell(val, { w: cols[4], size: 18, bold, align: A.RIGHT })] });
    rows.push(sum("Gesamt Netto", fmtMoney(c.net)));
    if (c.vatMode) rows.push(sum(`zzgl. ${fmtQty(String(c.rate))} % MwSt.`, fmtMoney(c.vat)));
    rows.push(sum("Gesamtbetrag", fmtMoney(c.gross), true));
    if (!c.vatMode) rows.push(new D.TableRow({ children: [cell("Steuerschuldnerschaft des Leistungsempfängers", { w: W, span: 5 })] }));
    const table = new D.Table({ width: { size: W, type: D.WidthType.DXA }, columnWidths: cols, rows });

    const T = D.TabStopType;
    const kids = [
      para(run(p.name, { bold: true, size: 24 }), { align: A.CENTER }),
      para(run(p.address, { bold: true, size: 24 }), { align: A.CENTER, after: 480 }),
      para(run(`${p.name} ${p.address}`, { size: 18, underline: true }), { after: 360 }),
      ...[cust.name, ...String(cust.address || "").split("\n")].filter(s => s.trim()).map(s => para(run(s))),
      para(run(""), { after: 120 }),
      para([run("\tSteuernr:\t" + (p.taxNo || ""), { size: 18 })], { tabs: [{ type: T.RIGHT, position: 6950 }, { type: T.RIGHT, position: W }] }),
      para([run("\tDatum:\t" + fmtDate(inv.date), { size: 18 })], { tabs: [{ type: T.RIGHT, position: 6950 }, { type: T.RIGHT, position: W }], after: 300 }),
      para(run(`Rechnung Nr. ${nrLabel(inv)}`, { bold: true, size: 26 }), { after: 160 })
    ];
    const extra = String(inv.extra || "").trim();
    if (extra) extra.split("\n").forEach(s => kids.push(para(run(s), { after: 100 })));
    if (inv.bv) kids.push(para(run("BV: " + inv.bv)));
    if (inv.period) kids.push(para(run("Ausführungszeit: " + inv.period)));
    kids.push(para(run(""), { after: 40 }), table, para(run(""), { after: 300 }));
    if (c.hasDed) {
      const tabs = [{ type: T.RIGHT, position: 5170 }, { type: T.LEFT, position: 5330 }, { type: T.RIGHT, position: W }];
      inv.deductions.forEach((d, i) => kids.push(para([
        run(i === 0 ? "Abzüglich gezahlter :" : ""), run("\t" + (d.label || "") + (d.label ? "," : ""), { italic: true }),
        run("\t" + (d.ref || "") + "\t" + fmtMoney(parseNum(d.amount)))], { tabs })));
      kids.push(para(run("\t\tForderungsbetrag:\t" + fmtMoney(c.due), { bold: true }), { tabs, before: 160, after: 360 }));
    }
    kids.push(para(run(p.greeting || "")), para(run(p.name), { after: 300 }), para(run(p.note || ""), { after: 300 }),
      para(run(`${p.bank || ""}\tIBAN: ${p.iban || ""}\tBIC:  ${p.bic || ""}`, { bold: true, size: 18 }), { tabs: [{ type: T.LEFT, position: 1134 }, { type: T.LEFT, position: 5216 }] }));
    return new D.Document({
      creator: p.name, title: `Rechnung ${nrLabel(inv)}`,
      styles: { default: { document: { run: { font: "Times New Roman", size: 20 } } } },
      sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, bottom: 1000, left: 1701, right: 1644 } } }, children: kids }]
    });
  }

  function fileBase(inv) {
    const pre = (profile.filePrefix || profile.name || "Rechnung").trim().replace(/\s+/g, "_");
    return `${pre}_${inv.number}_${String(inv.year).slice(-2)}`;
  }
  async function offerFile(filename, blob) { await deliverFile(filename, blob); }
  async function ensureLibs(kind) {
    if (kind === "pdf") { await loadScript(LIBS.jspdf); await loadScript(LIBS.autotable); }
    else await loadScript(LIBS.docx);
  }
  async function exportPdf(inv) {
    try { await ensureLibs("pdf"); await offerFile(fileBase(inv) + ".pdf", buildPdf(inv, profile).output("blob")); }
    catch (e) { toast(t("exportFail", { msg: e.message }), true); }
  }
  async function exportWord(inv) {
    try { await ensureLibs("docx"); await offerFile(fileBase(inv) + ".docx", await window.docx.Packer.toBlob(buildDocx(inv, profile))); }
    catch (e) { toast(t("exportFail", { msg: e.message }), true); }
  }

  /* ---------- Speichern / Kopieren ---------- */
  function editorInvoice() {
    const inv = clone(cur);
    inv.number = parseInt(inv.number, 10) || 0; inv.year = parseInt(inv.year, 10) || new Date().getFullYear();
    inv.items = inv.items.filter(it => String(it.qty).trim() || String(it.text).trim() || String(it.price).trim())
      .map(it => ({ qty: String(it.qty ?? "").trim(), unit: String(it.unit ?? "").trim(), text: String(it.text ?? "").trim(), price: parseNum(it.price) }));
    inv.deductions = inv.deductions.filter(d => String(d.label).trim() || String(d.ref).trim() || String(d.amount).trim())
      .map(d => ({ label: String(d.label ?? "").trim(), ref: String(d.ref ?? "").trim(), amount: parseNum(d.amount) }));
    inv.tax = { mode: inv.tax.mode, rate: parseNum(inv.tax.rate) };
    return inv;
  }
  async function saveCurrent() {
    if (!cur.customer) { toast(t("needCustomer"), true); $("#f-customer").focus(); return; }
    const inv = editorInvoice();
    const dup = invoices.find(i => i.id !== curId && Number(i.number) === inv.number && Number(i.year) === inv.year);
    const id = curId || uid("inv");
    const now = new Date().toISOString();
    const data = { ...inv, createdAt: inv.createdAt || now, updatedAt: now };
    delete data.id;
    try {
      await Store.put("invoices", id, data);
      curId = id; cur.createdAt = data.createdAt; setDirty(false); renderEdTitle();
      toast(dup ? t("dupNumber", { nr: nrLabel(inv) }) : t("saved"), !!dup);
    } catch (e) { toast(t("saveFail", { msg: e?.message || e?.code }), true); }
  }
  function copyAsNew(src) {
    const inv = clone(src);
    delete inv.id; delete inv.createdAt; delete inv.updatedAt;
    inv.year = new Date().getFullYear(); inv.number = nextNumber(inv.year); inv.date = todayIso();
    delete inv.paid; delete inv.paidAt;
    const live = customers.find(c => c.id === inv.customer?.id);
    if (live) inv.customer = { id: live.id, name: live.name, address: live.address };
    loadIntoEditor(inv, null); setDirty(true); showTab("edit");
    toast(t("savedCopyHint"));
  }
  function guardDirty(fn) {
    if (!dirty) return fn();
    confirmBox(t("confirmDiscard"), t("discard"), fn);
  }

  /* ---------- Liste ---------- */
  function renderList() {
    const q = $("#search").value.trim().toLowerCase();
    const rows = sortedInvoices().filter(inv => !q || [nrLabel(inv), inv.customer?.name, inv.bv, inv.extra, fmtDate(inv.date)].join(" ").toLowerCase().includes(q));
    $("#cnt-inv").textContent = invoices.length;
    if (!loaded) { $("#inv-body").innerHTML = `<tr><td colspan="8" class="empty">${esc(t("loading"))}</td></tr>`; return; }
    if (!rows.length) { $("#inv-body").innerHTML = `<tr><td colspan="8" class="empty">${esc(invoices.length ? t("noMatch") : t("noInvoices"))}</td></tr>`; return; }
    $("#inv-body").innerHTML = rows.map(inv => {
      const c = calc(inv);
      const tag = String(inv.extra || "").split("\n")[0].trim();
      return `<tr data-id="${esc(inv.id)}">
        <td class="n"><b>${esc(nrLabel(inv))}</b></td>
        <td class="n">${fmtDate(inv.date)}</td>
        <td>${esc(inv.customer?.name || "")}</td>
        <td>${esc(inv.bv || "")} ${tag ? `<span class="tag">${esc(tag)}</span>` : ""}</td>
        <td class="n r">${fmtMoney(c.gross)}</td>
        <td class="n r">${c.hasDed ? fmtMoney(c.due) : "—"}</td>
        <td><button type="button" class="status ${inv.paid ? "paid" : ""}" data-act="paid" title="${esc(t("togglePaid"))}">${esc(inv.paid ? t("paid") : t("open2"))}</button></td>
        <td class="a"><span class="actions" style="justify-content:flex-end;flex-wrap:nowrap">
          <button type="button" class="btn small" data-act="open">${esc(t("open"))}</button>
          <button type="button" class="btn small" data-act="copy">${esc(t("copy"))}</button>
          <button type="button" class="btn small" data-act="pdf">PDF</button>
          <button type="button" class="btn small" data-act="word">Word</button>
          <button type="button" class="btn small danger" data-act="del" aria-label="${esc(t("del"))}">${esc(t("del"))}</button></span></td></tr>`;
    }).join("");
  }

  /* ---------- Kunden ---------- */
  function renderCustomers() {
    $("#cnt-cust").textContent = customers.length;
    const counts = {}; invoices.forEach(i => { const k = i.customer?.id; if (k) counts[k] = (counts[k] || 0) + 1; });
    const list = customers.slice().sort((a, b) => a.name.localeCompare(b.name));
    $("#cust-body").innerHTML = !loaded ? `<tr><td colspan="4" class="empty">${esc(t("loading"))}</td></tr>`
      : !list.length ? `<tr><td colspan="4" class="empty">${esc(t("noCustomers"))}</td></tr>`
      : list.map(c => `<tr data-id="${esc(c.id)}"><td><b>${esc(c.name)}</b></td><td style="white-space:pre-line">${esc(c.address)}</td><td class="n r">${counts[c.id] || 0}</td>
        <td class="a"><button type="button" class="btn small" data-act="edit">${esc(t("edit"))}</button> <button type="button" class="btn small danger" data-act="del">${esc(t("del"))}</button></td></tr>`).join("");
    $("#cust-form-title").textContent = editCustId ? t("custEdit") : t("custNew");
  }
  function resetCustForm() { editCustId = null; $("#c-name").value = ""; $("#c-address").value = ""; renderCustomers(); }

  /* ---------- Einstellungen ---------- */
  const PF = ["name", "address", "taxNo", "filePrefix", "bank", "iban", "bic", "greeting", "note"];
  function renderSettings() { PF.forEach(k => { const el = $("#s-" + k); if (document.activeElement !== el) el.value = profile[k] ?? ""; }); $("#brand-sub").textContent = profile.name; }

  /* ---------- UI-Bausteine ---------- */
  function toast(msg, err) { ctx.toast(msg, { error: !!err }); }
  function confirmBox(msg, yesLabel, onYes) { ctx.confirmBox(msg, yesLabel, onYes); }
  function showTab(name) {
    root.querySelectorAll("nav.tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === name));
    ["edit", "list", "cust", "set"].forEach(n => { $("#tab-" + n).hidden = n !== name; });
    if (name === "edit") requestAnimationFrame(() => { fitSheet(); root.querySelectorAll("#items textarea.f-text").forEach(autoGrow); });
    try { localStorage.setItem("rb-tab", name); } catch (e) {}
  }
  function renderAll() {
    renderList(); renderCustomers(); renderSettings();
    if (cur) { renderCustomerSelect(); renderItems(); renderDeds(); renderTotals(); renderPreview(); renderEdTitle(); }
    if (Store.mode === "local") { $("#storage-note").hidden = false; $("#storage-note").textContent = t(window.RB_STANDALONE ? "standaloneNote" : "localOnly"); }
  }

  /* ---------- Ereignisse ---------- */
  $("#lang-de").onclick = () => setLang("de");
  $("#lang-bg").onclick = () => setLang("bg");
  root.querySelectorAll("nav.tabs button").forEach(b => b.onclick = () => showTab(b.dataset.tab));

  const bindField = (sel, fn) => $(sel).addEventListener("input", e => { fn(e.target.value); changed(); if (sel === "#f-number" || sel === "#f-year") renderEdTitle(); });
  bindField("#f-number", v => cur.number = v);
  bindField("#f-year", v => cur.year = v);
  bindField("#f-date", v => cur.date = v);
  bindField("#f-bv", v => cur.bv = v);
  bindField("#f-period", v => cur.period = v);
  bindField("#f-extra", v => cur.extra = v);
  bindField("#f-rate", v => cur.tax.rate = v);
  $("#f-taxmode").addEventListener("change", e => { cur.tax.mode = e.target.value; changed(); renderPreview(); });
  $("#f-customer").addEventListener("change", e => {
    const v = e.target.value;
    if (v === "__new") { renderCustomerSelect(); resetCustForm(); showTab("cust"); $("#c-name").focus(); return; }
    if (v === "__snap") return;
    const c = customers.find(x => x.id === v);
    cur.customer = c ? { id: c.id, name: c.name, address: c.address } : null;
    changed(); renderPreview();
  });

  $("#items").addEventListener("input", e => {
    const row = e.target.closest(".irow"); if (!row || row.classList.contains("head")) return;
    const it = cur.items[+row.dataset.i]; it[e.target.dataset.f] = e.target.value;
    if (e.target.tagName === "TEXTAREA") autoGrow(e.target);
    updateRowTotals(); changed();
  });
  $("#items").addEventListener("keydown", e => {
    if (e.key !== "Enter" || !e.target.classList.contains("f-price")) return;
    const i = +e.target.closest(".irow").dataset.i;
    if (i !== cur.items.length - 1) return;
    e.preventDefault(); addItem();
  });
  $("#items").addEventListener("click", e => {
    const b = e.target.closest("button[data-op]"); if (!b) return;
    const i = +b.closest(".irow").dataset.i, it = cur.items;
    if (b.dataset.op === "units") { openUnitMenu(b, i); return; }
    if (b.dataset.op === "up" && i > 0) [it[i - 1], it[i]] = [it[i], it[i - 1]];
    else if (b.dataset.op === "down" && i < it.length - 1) [it[i + 1], it[i]] = [it[i], it[i + 1]];
    else if (b.dataset.op === "rm") { it.splice(i, 1); if (!it.length) it.push({ qty: "", unit: "m²", text: "", price: "" }); }
    else return;
    renderItems(); changed();
  });
  const UNITS = ["m", "m²", "Stück", "Stunden"];
  function closeUnitMenu() { document.querySelectorAll(".umenu").forEach(n => n.remove()); }
  function openUnitMenu(btn, i) {
    const open = document.querySelector(".umenu");
    closeUnitMenu();
    if (open && open.dataset.i === String(i)) return;
    const combo = btn.closest(".combo"), input = combo.querySelector("input"), z = uiZoom(), rv = combo.getBoundingClientRect();
    const r = { left: rv.left / z, top: rv.top / z, bottom: rv.bottom / z, width: rv.width / z }; // in Seiten-Pixel umrechnen
    const m = document.createElement("div");
    m.className = "umenu"; m.dataset.i = i; m.setAttribute("role", "listbox");
    m.innerHTML = UNITS.map(u => `<button type="button" role="option" aria-selected="${u === input.value}">${esc(u)}</button>`).join("");
    m.style.left = r.left + "px"; m.style.minWidth = r.width + "px";
    document.body.appendChild(m); // außerhalb der Ansicht, damit „fixed“ sich auf das Fenster bezieht
    const below = r.bottom + 4 + m.offsetHeight <= window.innerHeight / z;
    m.style.top = (below ? r.bottom + 4 : r.top - 4 - m.offsetHeight) + "px";
    m.addEventListener("click", e => {
      const o = e.target.closest("button"); if (!o) return;
      cur.items[i].unit = o.textContent; input.value = o.textContent;
      closeUnitMenu(); changed(); input.focus();
    });
    m.addEventListener("keydown", e => {
      const opts = [...m.querySelectorAll("button")], k = opts.indexOf(document.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); opts[(k + 1) % opts.length].focus(); }
      if (e.key === "ArrowUp") { e.preventDefault(); opts[(k - 1 + opts.length) % opts.length].focus(); }
      if (e.key === "Escape") { closeUnitMenu(); input.focus(); }
    });
    (m.querySelector('[aria-selected="true"]') || m.querySelector("button")).focus();
  }
  on(document, "mousedown", e => { if (!e.target.closest(".umenu, .combo button")) closeUnitMenu(); });
  on(window, "scroll", closeUnitMenu, true);
  on(window, "resize", closeUnitMenu);
  $("#items").addEventListener("keydown", e => {
    if (e.key === "ArrowDown" && e.altKey && e.target.dataset.f === "unit") { e.preventDefault(); openUnitMenu(e.target.nextElementSibling, +e.target.closest(".irow").dataset.i); }
  });
  function addItem() {
    const last = cur.items[cur.items.length - 1];
    cur.items.push({ qty: "", unit: last?.unit || "m²", text: "", price: "" });
    renderItems(); changed();
    $(`#it-qty-${cur.items.length - 1}`).focus();
  }
  $("#add-item").onclick = addItem;

  $("#deds").addEventListener("input", e => {
    const row = e.target.closest(".drow"); if (!row) return;
    cur.deductions[+row.dataset.i][e.target.dataset.f] = e.target.value; changed();
  });
  $("#deds").addEventListener("click", e => {
    const b = e.target.closest("button[data-op=rm]"); if (!b) return;
    cur.deductions.splice(+b.closest(".drow").dataset.i, 1); renderDeds(); changed();
  });
  $("#add-ded").onclick = () => {
    const n = cur.deductions.length + 1;
    cur.deductions.push({ label: `Zwischenrechnung ${n}`, ref: "Rechnung Nr.", amount: "" });
    renderDeds(); changed(); $(`#d-ref-${n - 1}`).focus();
  };

  $("#save").onclick = saveCurrent;
  $("#pdf").onclick = () => exportPdf(editorInvoice());
  $("#word").onclick = () => exportWord(editorInvoice());
  $("#copy").onclick = () => copyAsNew(editorInvoice());
  const newEmpty = () => guardDirty(() => { loadIntoEditor(blankInvoice(), null); setDirty(false); showTab("edit"); $("#f-bv").focus(); });
  $("#new").onclick = newEmpty; $("#new2").onclick = newEmpty;

  $("#search").addEventListener("input", renderList);
  $("#inv-body").addEventListener("click", e => {
    const b = e.target.closest("button[data-act]"); if (!b) return;
    const inv = invoices.find(i => i.id === b.closest("tr").dataset.id); if (!inv) return;
    const act = b.dataset.act;
    if (act === "paid") {
      const data = { ...inv, paid: !inv.paid, paidAt: !inv.paid ? new Date().toISOString() : null }; delete data.id;
      Store.put("invoices", inv.id, data).catch(err => toast(t("saveFail", { msg: err?.message || err?.code }), true));
      if (curId === inv.id) { cur.paid = data.paid; cur.paidAt = data.paidAt; }
      return;
    }
    if (act === "open") guardDirty(() => { loadIntoEditor(inv, inv.id); setDirty(false); showTab("edit"); });
    if (act === "copy") guardDirty(() => copyAsNew(inv));
    if (act === "pdf") exportPdf(inv);
    if (act === "word") exportWord(inv);
    if (act === "del") confirmBox(t("confirmDel", { nr: nrLabel(inv) }), t("yesDelete"), async () => {
      try { await Store.del("invoices", inv.id); if (curId === inv.id) { curId = null; renderEdTitle(); setDirty(true); } toast(t("deleted")); }
      catch (err) { toast(t("saveFail", { msg: err?.message || err?.code }), true); }
    });
  });

  $("#cust-body").addEventListener("click", e => {
    const b = e.target.closest("button[data-act]"); if (!b) return;
    const c = customers.find(x => x.id === b.closest("tr").dataset.id); if (!c) return;
    if (b.dataset.act === "edit") { editCustId = c.id; $("#c-name").value = c.name; $("#c-address").value = c.address; renderCustomers(); $("#c-name").focus(); }
    if (b.dataset.act === "del") confirmBox(t("confirmDelCust", { name: c.name }), t("yesDelete"), async () => {
      await Store.del("customers", c.id); if (editCustId === c.id) resetCustForm(); toast(t("deleted"));
    });
  });
  $("#c-save").onclick = async () => {
    const name = $("#c-name").value.trim(); if (!name) { $("#c-name").focus(); return; }
    const id = editCustId || uid("kd");
    const data = { name, address: $("#c-address").value.trim() };
    try {
      await Store.put("customers", id, data);
      const wasNew = !editCustId;
      resetCustForm(); toast(t("custSaved"));
      if (wasNew && cur && !cur.customer) { cur.customer = { id, ...data }; changed(); renderPreview(); }
    } catch (err) { toast(t("saveFail", { msg: err?.message || err?.code }), true); }
  };
  $("#c-reset").onclick = resetCustForm;

  $("#s-save").onclick = async () => {
    const data = {}; PF.forEach(k => data[k] = $("#s-" + k).value.trim());
    try { await Store.put("settings", "profile", data); toast(t("settingsSaved")); }
    catch (err) { toast(t("saveFail", { msg: err?.message || err?.code }), true); }
  };

  const strip = ({ id, ...rest }) => rest;
  $("#b-export").onclick = () => {
    const data = { app: "rechnungsbuch", version: 1, exportedAt: new Date().toISOString(),
      invoices: Object.fromEntries(invoices.map(i => [i.id, strip(i)])),
      customers: Object.fromEntries(customers.map(c => [c.id, strip(c)])),
      profile };
    offerFile(`Rechnungen_Sicherung_${todayIso()}.json`, new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
  };
  $("#b-import").onclick = () => $("#b-file").click();
  $("#b-file").addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    let data;
    try { data = JSON.parse(await f.text()); } catch (err) { data = null; }
    if (!data || data.app !== "rechnungsbuch" || typeof data.invoices !== "object") { toast(t("backupBad"), true); return; }
    try {
      for (const [id, c] of Object.entries(data.customers || {})) await Store.put("customers", id, c);
      for (const [id, inv] of Object.entries(data.invoices)) await Store.put("invoices", id, inv);
      if (data.profile) await Store.put("settings", "profile", data.profile);
      toast(t("backupLoaded", { n: Object.keys(data.invoices).length, c: Object.keys(data.customers || {}).length }));
    } catch (err) { toast(t("saveFail", { msg: err?.message || err?.code }), true); }
  });

  const ro = new ResizeObserver(() => fitSheet()); ro.observe($("#paper-frame"));
  on(window, "beforeunload", saveDraft);

  /* ---------- Start ---------- */
  (function start() {
    applyLang();
    let draft = null;
    try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch (e) {}
    try { const tab = localStorage.getItem("rb-tab"); if (tab) showTab(tab); } catch (e) {}
    let got = { invoices: false, customers: false, settings: false };
    const ready = () => {
      if (loaded || !got.invoices || !got.customers || !got.settings) return;
      loaded = true;
      if (draft?.cur) { loadIntoEditor(draft.cur, draft.curId); setDirty(true); }
      else { const last = sortedInvoices()[0]; loadIntoEditor(last ? last : blankInvoice(), last ? last.id : null); setDirty(false); }
      renderAll();
    };
    Store.watch("invoices", list => { invoices = list; got.invoices = true; ready(); if (loaded) { renderList(); renderCustomers(); } });
    Store.watch("customers", list => { customers = list; got.customers = true; ready(); if (loaded) { renderCustomers(); renderCustomerSelect(); } });
    Store.watch("settings", list => {
      const pdoc = list.find(d => d.id === "profile");
      profile = { ...DEFAULT_PROFILE, ...(pdoc ? (({ id, ...rest }) => rest)(pdoc) : {}) };
      got.settings = true; ready(); if (loaded) { renderSettings(); renderPreview(); }
    });
    renderAll();
  })();

  return () => {
    closeUnitMenu();
    saveDraft();
    closeUnitMenu();
    ro.disconnect();
    disposers.forEach(fn => fn());
    subs.forEach(stop => stop());
  };
}

/* ---------- Kachel für die Startseite ---------- */
function invoiceTotals(inv) {
  const num = v => { if (typeof v === "number") return v; let s = String(v ?? "").trim().replace(/\s/g, ""); if (s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); const n = parseFloat(s); return isFinite(n) ? n : 0; };
  const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const net = r2((inv.items || []).reduce((a, it) => a + r2(num(it.qty) * num(it.price)), 0));
  const gross = inv.tax?.mode === "vat" ? r2(net + r2(net * num(inv.tax.rate) / 100)) : net;
  const ded = r2((inv.deductions || []).reduce((a, d) => a + num(d.amount), 0));
  return (inv.deductions || []).length ? r2(gross - ded) : gross;
}
const euro = n => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

export const widgets = {
  "open-invoices"(el, ctx) {
    el.innerHTML = `<div class="tile-head"><h2>Rechnungen</h2></div><div class="empty">Lade …</div>`;
    return watchCollection("invoices", list => {
      const open = list.filter(i => !i.paid);
      const sum = open.reduce((a, i) => a + invoiceTotals(i), 0);
      el.innerHTML = `<div class="tile-head"><h2>Rechnungen</h2></div>
        <a href="#rechnungen" class="kv" style="color:inherit;text-decoration:none"><b>${open.length}</b><span>offen${open.length ? ` · ${escHtml(euro(sum))}` : " · alles bezahlt"}</span></a>`;
    });
  }
};
