/* Partner+ – Oberfläche (Deutsch / Russisch, hell / dunkel) */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const MONTHS_RU = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const SEL = (window.Core && window.Core.SELEKTION) || [
    { key: 'R', color: '#e03131', label: 'Heißer Kontakt', ru: 'Горячий контакт' }, { key: 'B', color: '#1c6dd0', label: 'Autorität', ru: 'Авторитет' },
    { key: 'G', color: '#2f9e44', label: 'Potenzieller Partner', ru: 'Потенциальный партнёр' }, { key: 'O', color: '#f08c00', label: 'Starker potenzieller Partner', ru: 'Сильный потенциальный партнёр' }];
  const now = new Date();
  const TOUCH = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);

  // ---------- Sprache ----------
  // lang = Sprache der Oberfläche. Beim Überfahren zeigt ein Hinweis die jeweils andere Sprache.
  let lang = 'de';
  const t = (de, ru) => (lang === 'ru' ? ru : de);
  const other = (de, ru) => (lang === 'ru' ? de : ru);
  /** Text mit Übersetzung beim Überfahren */
  const L = (de, ru) => (de === ru ? esc(de) : `<span class="tr" data-tip="${esc(other(de, ru))}">${esc(t(de, ru))}</span>`);
  /** nur das Attribut (für ganze Buttons/Links) */
  const tipA = (de, ru) => (de === ru ? '' : ` data-tip="${esc(other(de, ru))}"`);
  const MONTHS = () => (lang === 'ru' ? MONTHS_RU : MONTHS_DE);
  const mon = i => MONTHS()[i];
  const monL = i => L(MONTHS_DE[i], MONTHS_RU[i]);
  const MON = () => MONTHS().map(m => m.slice(0, 3));
  const selLabel = s => t(s.label, s.ru);

  // Schwebender Hinweis (fährt kurz ein, wird nie abgeschnitten)
  const tip = document.createElement('div'); tip.id = 'tip'; tip.className = 'tip'; tip.hidden = true; document.body.appendChild(tip);
  let tipEl = null, tipTimer = null;
  document.addEventListener('mouseover', e => {
    const el = e.target.closest('[data-tip]');
    if (el === tipEl) return;
    tipEl = el; clearTimeout(tipTimer); tip.hidden = true; tip.classList.remove('in');
    if (!el) return;
    tipTimer = setTimeout(() => {
      if (!el.isConnected) return;
      tip.textContent = el.dataset.tip; tip.classList.toggle('note', !!el.dataset.note); tip.hidden = false;
      const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
      let x = r.left, y = r.bottom + 6;
      if (el.closest('nav')) { x = r.right + 8; y = r.top + (r.height - h) / 2; }
      x = Math.max(8, Math.min(x, innerWidth - w - 8)); if (y + h > innerHeight - 8) y = r.top - h - 6;
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
      requestAnimationFrame(() => tip.classList.add('in'));
    }, 250);
  });
  document.addEventListener('scroll', () => { tip.hidden = true; tipEl = null; }, true);
  // Touch (iPad): Finger kurz gedrückt halten zeigt die Übersetzung / den Kommentar
  let pressTimer = null, hideTimer = null;
  document.addEventListener('touchstart', e => {
    const el = e.target.closest('[data-tip]'); clearTimeout(pressTimer); if (!el) return;
    pressTimer = setTimeout(() => {
      tip.textContent = el.dataset.tip; tip.classList.toggle('note', !!el.dataset.note); tip.hidden = false;
      const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
      let x = Math.max(8, Math.min(r.left, innerWidth - w - 8)), y = r.top - h - 8; if (y < 8) y = r.bottom + 8;
      tip.style.left = x + 'px'; tip.style.top = y + 'px'; requestAnimationFrame(() => tip.classList.add('in'));
      clearTimeout(hideTimer); hideTimer = setTimeout(() => { tip.hidden = true; tip.classList.remove('in'); }, 2500);
    }, 450);
  }, { passive: true });
  document.addEventListener('click', () => { tip.hidden = true; tip.classList.remove('in'); clearTimeout(tipTimer); }, true);
  ['touchend', 'touchmove', 'touchcancel'].forEach(ev => document.addEventListener(ev, () => clearTimeout(pressTimer), { passive: true }));

  // ---------- API: Desktop (Electron) oder Browser-Vorschau ----------
  let api, info = {};
  async function makeApi() {
    if (window.desktop) return { call: (m, ...a) => window.desktop.call(m, ...a), mode: 'desktop' };
    // ---- Web / iPad: dieselbe Logik, Datenbank im Speicher des Geräts (IndexedDB) ----
    const SQL = await window.initSqlJs(window.SQLJS_WASM_B64
      ? { wasmBinary: Uint8Array.from(atob(window.SQLJS_WASM_B64), c => c.charCodeAt(0)) }
      : { locateFile: f => f });
    const store = await openStore();
    let bytes = await store.get('db');
    if (!bytes) { // ältere Vorschau-Daten aus localStorage übernehmen
      try { const s = localStorage.getItem('pp-db'); if (s) bytes = Uint8Array.from(atob(s), c => c.charCodeAt(0)); } catch (e) { /* */ }
    }
    let db;
    try { db = bytes ? new SQL.Database(bytes) : new SQL.Database(); } catch (e) { db = new SQL.Database(); bytes = null; }
    let core = new window.Core(db);
    if (bytes && core.schemaVersion() < window.Core.MIGRATIONS.length) await snapshot('vor-update');
    core.migrate();
    if (!bytes) core.seed(now.getFullYear());
    let timer = null;
    const persistNow = async () => { clearTimeout(timer); timer = null; await store.set('db', db.export()); };
    const persist = () => { clearTimeout(timer); timer = setTimeout(persistNow, 250); };
    window.addEventListener('pagehide', () => { if (timer) persistNow(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && timer) persistNow(); });
    await persistNow();
    // Gerät bitten, die Daten nicht automatisch zu löschen
    let persisted = false;
    try { if (navigator.storage && navigator.storage.persist) persisted = await navigator.storage.persist(); } catch (e) { /* */ }
    // Automatischer Schnappschuss pro Tag (die letzten 10 im Gerät)
    async function snapshot(reason) {
      const list = (await store.get('snapshots')) || [];
      list.unshift({ ts: new Date().toISOString(), reason, data: (db || null) ? db.export() : bytes });
      while (list.length > 10) list.pop();
      await store.set('snapshots', list);
    }
    const snaps = (await store.get('snapshots')) || [];
    if (!snaps.length || snaps[0].ts.slice(0, 10) !== new Date().toISOString().slice(0, 10)) await snapshot('start');
    const stamp = () => new Date().toISOString().slice(0, 10);
    const replaceDb = async u8 => {
      const test = new SQL.Database(u8); const c2 = new window.Core(test);
      c2.one('SELECT COUNT(*) AS n FROM contacts'); // prüft, ob es eine gültige Partner+-Datei ist
      await snapshot('vor-wiederherstellung');
      db = test; core = c2; core.migrate(); await persistNow();
    };
    const web = {
      info: () => ({ dbPath: t('Speicher dieses Geräts (Browser)', 'Память этого устройства (браузер)'), version: '0.5.0', schema: core.schemaVersion(), web: true, persisted, pwa: !!window.PP_PWA }),
      resetDemo: async () => { await store.del('db'); try { localStorage.removeItem('pp-db'); } catch (e) { /* */ } location.reload(); },
      lastExport: () => store.get('lastExport'),
      exportExcel: async () => {
        if (!window.ExcelJS) throw new Error(t('In dieser Vorschau nicht verfügbar', 'В этом превью недоступно'));
        const wb = window.PartnerExcel.build(core, window.Core, window.ExcelJS);
        const buf = await wb.xlsx.writeBuffer();
        return saveFile(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `PartnerPlus_${stamp()}.xlsx`);
      },
      importExcel: async () => {
        if (!window.ExcelJS) throw new Error(t('In dieser Vorschau nicht verfügbar', 'В этом превью недоступно'));
        const f = await pickFile('.xlsx'); if (!f) return null;
        const wb = new window.ExcelJS.Workbook(); await wb.xlsx.load(await f.arrayBuffer());
        await snapshot('vor-import');
        const r = window.PartnerExcel.importContacts(core, window.Core, wb); await persistNow(); return r;
      },
      backupNow: async () => {
        await persistNow();
        const name = await saveFile(new Blob([db.export()], { type: 'application/octet-stream' }), `PartnerPlus_Sicherung_${stamp()}.partnerplus`);
        if (name) await store.set('lastExport', new Date().toISOString());
        return name;
      },
      loadBackupFile: async () => {
        const f = await pickFile('.partnerplus,.sqlite,application/octet-stream'); if (!f) return null;
        await replaceDb(new Uint8Array(await f.arrayBuffer())); return f.name;
      },
      listBackups: async () => ((await store.get('snapshots')) || []).map(s => ({ file: `${s.ts.slice(0, 16).replace('T', ' ')} · ${s.reason}`, id: s.ts, size: s.data ? s.data.length : 0 })),
      restoreBackup: async id => { const s = ((await store.get('snapshots')) || []).find(x => x.ts === id || `${x.ts.slice(0, 16).replace('T', ' ')} · ${x.reason}` === id); if (!s) throw new Error('?'); await replaceDb(s.data); return true; },
      checkUpdates: async () => {
        if (!('serviceWorker' in navigator)) return { message: t('Updates kommen automatisch beim nächsten Öffnen.', 'Обновления приходят автоматически при следующем открытии.') };
        const reg = await navigator.serviceWorker.getRegistration(); if (reg) await reg.update();
        return { message: t('Geprüft. Eine neue Version wird beim nächsten Öffnen geladen.', 'Проверено. Новая версия загрузится при следующем открытии.') };
      },
    };
    return {
      mode: 'web',
      call: async (m, ...a) => {
        if (web[m]) return web[m](...a);
        if (['openDataFolder', 'chooseDb'].includes(m)) throw new Error(t('Nur in der Desktop-App verfügbar', 'Доступно только в настольной программе'));
        const r = core[m](...a);
        if (/^(save|delete|add|set|seed|clear)/.test(m)) persist();
        return r;
      },
    };
  }
  // IndexedDB als einfacher Schlüssel-Wert-Speicher (Fallback: nur im Arbeitsspeicher)
  function openStore() {
    const mem = new Map();
    const memStore = { get: async k => mem.get(k), set: async (k, v) => { mem.set(k, v); }, del: async k => { mem.delete(k); } };
    return new Promise(resolve => {
      let req;
      try { req = indexedDB.open('partnerplus', 1); } catch (e) { resolve(memStore); return; }
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onerror = () => resolve(memStore);
      req.onsuccess = () => {
        const idb = req.result;
        const tx = (mode, fn) => new Promise((res, rej) => { const t2 = idb.transaction('kv', mode); const r = fn(t2.objectStore('kv')); t2.oncomplete = () => res(r && r.result); t2.onerror = () => rej(t2.error); });
        resolve({ get: k => tx('readonly', s => s.get(k)), set: (k, v) => tx('readwrite', s => s.put(v, k)), del: k => tx('readwrite', s => s.delete(k)) });
      };
    });
  }
  // Datei speichern: auf iPad über das Teilen-Menü („In Dateien sichern“), sonst Download
  async function saveFile(blob, name) {
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return name; } catch (e) { if (e && e.name === 'AbortError') return null; }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    return name;
  }
  function pickFile(accept) {
    return new Promise(resolve => {
      const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.style.display = 'none';
      i.onchange = () => { resolve(i.files[0] || null); i.remove(); };
      document.body.appendChild(i); i.click();
    });
  }
  const call = (m, ...a) => api.call(m, ...a).catch(e => { toast(e.message || String(e)); throw e; });

  function toast(msg) {
    const el = $('#toast'); el.textContent = msg; el.classList.remove('hidden');
    clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.add('hidden'), 2600);
  }

  // ---------- Navigation ----------
  const VIEWS = [
    { id: 'kontakte', de: 'Kontakt-Potenzial', ru: 'Потенциал контактов' },
    { id: 'kunden', de: 'Kundenbestand', ru: 'Клиентская база' },
    { id: 'gaeste', de: 'BIS-Gäste', ru: 'Гости BIS' },
    { id: 'ffg', de: 'Potenzial FFG', ru: 'Потенциал FFG' },
    { id: 'umsatz', de: 'Umsatzplanung', ru: 'Планирование оборота' },
    { id: 'woche', de: 'Wochenplan', ru: 'План недели' },
    { sep: true },
    { id: 'auswertung', de: 'Auswertung', ru: 'Анализ' },
    { id: 'daten', de: 'Daten & Backup', ru: 'Данные и бэкап' },
  ];
  const state = {
    view: 'kontakte', contacts: [],
    f: { chips: new Set(), colors: new Set(), ref: '', q: '', sort: null, dir: 1, example: true },
    year: now.getFullYear(), month: now.getMonth() + 1, umonth: now.getMonth() + 1,
  };
  function renderSide() {
    $('#brandSub').textContent = t('Prototyp 0.5', 'Прототип 0.5');
    $('#lang').innerHTML = `<button data-lang="de" class="${lang === 'de' ? 'on' : ''}" data-tip="Немецкий">DE</button><button data-lang="ru" class="${lang === 'ru' ? 'on' : ''}" data-tip="Russisch">RU</button>`;
    $('#theme').innerHTML = `<button data-theme-set="light" class="${theme === 'light' ? 'on' : ''}"${tipA('Hell', 'Светлая')}>☀ ${esc(t('Hell', 'Светлая'))}</button><button data-theme-set="dark" class="${theme === 'dark' ? 'on' : ''}"${tipA('Dunkel', 'Тёмная')}>☾ ${esc(t('Dunkel', 'Тёмная'))}</button>`;
    $('#sideFoot').textContent = api.mode === 'web' ? (window.PP_PWA ? t('Daten nur auf diesem Gerät', 'Данные только на этом устройстве') : t('Browser-Vorschau · Beispieldaten', 'Онлайн-превью · примеры')) : t('Daten: ', 'Данные: ') + info.dbPath;
  }
  function renderNav(counts) {
    $('#nav').innerHTML = VIEWS.map(v => v.sep ? '<div class="sep"></div>' :
      `<a data-view="${v.id}" class="${state.view === v.id ? 'active' : ''}"${tipA(v.de, v.ru)}>${esc(t(v.de, v.ru))}${counts && counts[v.id] != null ? `<span class="cnt">${counts[v.id]}</span>` : ''}</a>`).join('');
  }
  $('#nav').addEventListener('click', e => { const a = e.target.closest('a[data-view]'); if (a) go(a.dataset.view); });
  $('#lang').addEventListener('click', async e => {
    const b = e.target.closest('[data-lang]'); if (!b || b.dataset.lang === lang) return;
    lang = b.dataset.lang; document.documentElement.lang = lang;
    try { localStorage.setItem('pp-lang', lang); } catch (err) { /* */ }
    call('saveSetting', 'lang', lang).catch(() => {});
    tip.hidden = true; tipEl = null;
    renderSide(); await render();
  });
  // ---------- Hell / Dunkel ----------
  let theme = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  const applyTheme = () => { document.documentElement.dataset.theme = theme; };
  $('#theme').addEventListener('click', e => {
    const b = e.target.closest('[data-theme-set]'); if (!b || b.dataset.themeSet === theme) return;
    theme = b.dataset.themeSet; applyTheme();
    try { localStorage.setItem('pp-theme', theme); } catch (err) { /* */ }
    call('saveSetting', 'theme', theme).catch(() => {});
    renderSide();
  });
  async function go(view) { closeCellMenu(); state.view = view; await render(); $('#main').scrollTop = 0; }
  function refreshNav() {
    const c = state.contacts;
    renderNav({ kontakte: c.length, kunden: c.filter(x => x.kunde).length });
  }
  async function render() {
    state.contacts = await call('listContacts');
    refreshNav();
    const fn = { kontakte: viewKontakte, kunden: viewKunden, gaeste: viewGaeste, ffg: viewFfg, umsatz: viewUmsatz, woche: viewWoche, auswertung: viewAuswertung, daten: viewDaten }[state.view];
    await fn();
  }

  const xBtn = (field, on) => `<button class="x ${on ? 'on' : ''}" data-x="${field}" aria-label="${esc(t('ankreuzen', 'отметить'))}"></button>`;
  const dots = (sel, editable) => `<span class="dots">${SEL.map(s => editable
    ? `<button class="dot ${sel.includes(s.key) ? 'on' : ''}" style="--c:${s.color}" data-sel="${s.key}" data-tip="${esc(selLabel(s))}"></button>`
    : (sel.includes(s.key) ? `<span class="dot on" style="--c:${s.color}" data-tip="${esc(selLabel(s))}"></span>` : '')).join('')}</span>`;
  const legend = () => `<div class="legend"><b>${L('Selektion:', 'Селекция:')}</b>${SEL.map(s => `<span class="item"><span class="dot on" style="--c:${s.color}"></span>${L(s.label, s.ru)}</span>`).join('')}<span class="muted">· ${L('Mehrere Kreise pro Person möglich.', 'Можно несколько кружков на одного человека.')}</span></div>`;
  const delBtn = attr => `<button class="del" ${attr} aria-label="${esc(t('Löschen', 'Удалить'))}">✕</button>`;
  function armDelete(btn, action) {
    if (btn.classList.contains('confirm')) { action(); return; }
    btn.classList.add('confirm'); btn.textContent = t('Löschen?', 'Удалить?');
    setTimeout(() => { if (btn.isConnected) { btn.classList.remove('confirm'); btn.textContent = '✕'; } }, 3000);
  }
  const head = (de, ru, subDe, subRu, right) => `<div class="head"><div><h1>${L(de, ru)}</h1><p class="sub" style="margin:0">${esc(t(subDe, subRu))}</p></div>${right ? `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${right}</div>` : ''}</div>`;

  // =====================================================================
  // Kontakt-Potenzial
  // =====================================================================
  const COLS = [
    { f: 'name', de: 'Name, Vorname', ru: 'Фамилия, имя', t: 'text', w: 180, ex: 'Mustermann, Max', tipDe: 'Nachname, Vorname', tipRu: 'Фамилия, имя' },
    { f: 'selektion', de: 'Selektion', ru: 'Селекция', t: 'sel', w: 92, ex: 'dots', tipDe: 'Kreise anklicken – siehe Legende unten', tipRu: 'Нажмите на кружки, расшифровка внизу' },
    { f: 'alter_', de: 'Alter', ru: 'Возраст', t: 'num', w: 52, ex: '25' },
    { f: 'beruf', de: 'Beruf / Ausbildung', ru: 'Профессия / образование', t: 'text', w: 140, ex: 'Ingenieur' },
    { f: 'taetigkeit', de: 'Aktuelle Tätigkeit', ru: 'Текущая работа', t: 'text', w: 140, ex: 'Hausmeister' },
    { f: 'bezug', de: 'Bezug zur Person', ru: 'Кем приходится', t: 'text', w: 120, ex: 'Bruder', tipDe: 'Woher kennst du die Person?', tipRu: 'Откуда вы знакомы?' },
    { f: 'eigenkontakt', de: 'Eigenkontakt', ru: 'Свой контакт', t: 'x', ex: '×', tipDe: 'Ankreuzen, wenn es dein eigener Kontakt ist', tipRu: 'Отметить, если это ваш собственный контакт' },
    { f: 'empf_von', de: 'Empf. von', ru: 'Рекоменд. от', t: 'ref', w: 130, ex: 'Musterfrau', tipDe: 'Wer hat den Kontakt empfohlen?', tipRu: 'Кто порекомендовал этот контакт?' },
    { f: 'lp', de: 'LP', ru: 'LP', t: 'x', ex: '×', tipDe: 'Lebenspartner/in vorhanden', tipRu: 'Есть спутник жизни (Lebenspartner)' },
    { f: 'kinder', de: 'Kinder (Alter)', ru: 'Дети (возраст)', t: 'text', w: 90, ex: '10 / 12 J.' },
    { f: 'telefon', de: 'Telefon', ru: 'Телефон', t: 'text', w: 120, ex: '0176 …' },
    { f: 'kundenseminar', de: 'Kund. Seminar', ru: 'Семинар клиентов', t: 'x', ex: '×', tipDe: 'War auf einem Kundenseminar', tipRu: 'Был на семинаре для клиентов' },
    { f: 'bis', de: 'BIS', ru: 'BIS', t: 'x', ex: '×', tipDe: 'Berufsinformationsseminar besucht', tipRu: 'Был на BIS (информационный семинар о профессии)' },
    { f: 'efs', de: 'EFS', ru: 'EFS', t: 'x', ex: '×', tipDe: 'Einführungsseminar besucht (2. Teil nach dem BIS)', tipRu: 'Был на EFS (вводный семинар, вторая часть после BIS)' },
    { f: 'kunde', de: 'Kunde', ru: 'Клиент', t: 'x', ex: '×', tipDe: 'Ist Kunde → erscheint im Kundenbestand', tipRu: 'Клиент → появляется в клиентской базе' },
    { f: 'vip_vm', de: 'VIP / VM', ru: 'VIP / VM', t: 'x', ex: '×', tipDe: 'VIP-Kunde', tipRu: 'VIP-клиент' },
    { f: 'bemerkungen', de: 'Bemerkungen', ru: 'Заметки', t: 'text', w: 220, ex: 'Will Haus kaufen' },
  ];
  const colHead = col => {
    // Überfahren zeigt die andere Sprache; bei Abkürzungen die Erklärung
    const tipTxt = col.de === col.ru ? t(col.tipDe || col.de, col.tipRu || col.ru) : `${other(col.de, col.ru)}${col.tipDe ? ' · ' + t(col.tipDe, col.tipRu) : ''}`;
    return `<span class="tr" data-tip="${esc(tipTxt)}">${esc(t(col.de, col.ru))}</span>`;
  };
  const CHIPS = [
    { id: 'eigen', de: 'Eigenkontakte', ru: 'Свои контакты', test: c => c.eigenkontakt },
    { id: 'empf', de: 'Empfehlungen', ru: 'Рекомендации', test: c => (c.empf_von || '').trim() },
    { id: 'kundenseminar', de: 'Kundenseminar', ru: 'Семинар клиентов', test: c => c.kundenseminar },
    { id: 'bis', de: 'BIS', ru: 'BIS', test: c => c.bis },
    { id: 'efs', de: 'EFS', ru: 'EFS', test: c => c.efs },
    { id: 'kunde', de: 'Kunden', ru: 'Клиенты', test: c => c.kunde },
    { id: 'nichtkunde', de: 'Noch kein Kunde', ru: 'Ещё не клиент', test: c => !c.kunde },
    { id: 'vip', de: 'VIP / VM', ru: 'VIP / VM', test: c => c.vip_vm },
    { id: 'ohnesel', de: 'Ohne Selektion', ru: 'Без селекции', test: c => !c.selektion },
  ];
  function filtered() {
    const f = state.f;
    let rows = state.contacts.filter(c => {
      for (const id of f.chips) if (!CHIPS.find(x => x.id === id).test(c)) return false;
      for (const k of f.colors) if (!(c.selektion || '').includes(k)) return false;
      if (f.ref && (c.empf_von || '').trim() !== f.ref) return false;
      if (f.q) { const q = f.q.toLowerCase(); if (!COLS.some(col => String(c[col.f] == null ? '' : c[col.f]).toLowerCase().includes(q))) return false; }
      return true;
    });
    if (f.sort) {
      const k = f.sort;
      rows = rows.slice().sort((a, b) => {
        let x = a[k], y = b[k];
        if (k === 'selektion') { x = (x || '').length; y = (y || '').length; }
        if (typeof x === 'number' || typeof y === 'number') return ((x || 0) - (y || 0)) * f.dir;
        return String(x || '').localeCompare(String(y || ''), 'de') * f.dir;
      });
    }
    return rows;
  }
  function contactRow(c) {
    return `<tr data-id="${c.id}">${COLS.map(col => {
      const v = c[col.f];
      if (col.t === 'x') return `<td class="c">${xBtn(col.f, v)}</td>`;
      if (col.t === 'sel') return `<td>${dots(c.selektion || '', true)}</td>`;
      const cls = col.t === 'num' ? 'cell num' : 'cell';
      const list = col.t === 'ref' ? ' list="refs"' : '';
      return `<td style="min-width:${col.w}px"><input class="${cls}" data-f="${col.f}" value="${esc(v)}"${list}${col.t === 'num' ? ' inputmode="numeric"' : ''}></td>`;
    }).join('')}<td>${delBtn('data-delc')}</td></tr>`;
  }
  async function viewKontakte() {
    const f = state.f;
    const refs = {};
    state.contacts.forEach(c => { const r = (c.empf_von || '').trim(); if (r) refs[r] = (refs[r] || 0) + 1; });
    const refOpts = Object.entries(refs).sort((a, b) => b[1] - a[1]);
    const rows = filtered();
    $('#main').innerHTML = `
      ${head('Kontakt-Potenzial', 'Потенциал контактов', 'Jeden Namen hier eintragen – egal wo du die Person kennengelernt hast. Danach nur noch ankreuzen.', 'Вносите сюда любое имя, где бы вы ни познакомились. Дальше только ставьте отметки.',
        `<button class="btn" id="tglEx">${f.example ? L('Beispielzeile ausblenden', 'Скрыть строку-образец') : L('Beispielzeile zeigen', 'Показать строку-образец')}</button><button class="btn primary" id="addC">+ ${L('Neuer Kontakt', 'Новый контакт')}</button>`)}
      <div class="toolbar">
        <input class="search" id="q" placeholder="${esc(t('Suchen …', 'Поиск …'))}" value="${esc(f.q)}">
        ${CHIPS.map(ch => `<button class="chip ${f.chips.has(ch.id) ? 'on' : ''}" data-chip="${ch.id}"${tipA(ch.de, ch.ru)}>${esc(t(ch.de, ch.ru))}<span class="n">${state.contacts.filter(ch.test).length}</span></button>`).join('')}
      </div>
      <div class="toolbar">
        <span class="muted">${L('Selektion:', 'Селекция:')}</span>
        ${SEL.map(s => `<button class="chip ${f.colors.has(s.key) ? 'on' : ''}" data-color="${s.key}"${tipA(s.label, s.ru)}><span class="dot on" style="--c:${s.color};width:12px;height:12px"></span>${esc(selLabel(s))}</button>`).join('')}
        <span class="muted" style="margin-left:10px">${L('Empfohlen von:', 'Рекомендовал:')}</span>
        <select class="inp" id="ref"><option value="">${esc(t('alle', 'все'))}</option>${refOpts.map(([n, k]) => `<option value="${esc(n)}" ${f.ref === n ? 'selected' : ''}>${esc(n)} (${k})</option>`).join('')}</select>
        ${f.chips.size || f.colors.size || f.ref || f.q ? `<button class="btn small" id="reset">${L('Filter zurücksetzen', 'Сбросить фильтры')}</button>` : ''}
        <span class="count">${lang === 'ru' ? `<b>${rows.length}</b> из ${state.contacts.length} контактов` : `<b>${rows.length}</b> von ${state.contacts.length} Kontakten`}</span>
      </div>
      <div class="tablewrap"><table class="grid" id="ct"><thead><tr>
        ${COLS.map(col => `<th class="sortable ${col.t === 'x' ? 'c' : ''}" data-sort="${col.f}">${colHead(col)}${f.sort === col.f ? (f.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}<th></th>
      </tr></thead><tbody>
        ${f.example ? `<tr class="example">${COLS.map((col, i) => `<td class="${col.t === 'x' ? 'c' : ''}${i === 0 ? ' lbl' : ''}">${i === 0 ? `<span class="tag">${L('Beispiel', 'Образец')}</span>` : ''}${col.ex === 'dots' ? dots('RBGO', false) : esc(col.ex)}</td>`).join('')}<td></td></tr>` : ''}
        ${rows.map(contactRow).join('') || `<tr><td colspan="${COLS.length + 1}" style="padding:24px;text-align:center" class="muted">${esc(t('Keine Kontakte für diesen Filter.', 'Нет контактов по этому фильтру.'))}</td></tr>`}
      </tbody></table></div>
      <datalist id="refs">${state.contacts.map(c => `<option value="${esc(c.name)}">`).join('')}</datalist>
      ${legend()}
      <div class="legend"><b>${L('Abkürzungen:', 'Сокращения:')}</b> ${esc(t('LP = Lebenspartner/in · BIS = Berufsinformationsseminar · EFS = Einführungsseminar (nach dem BIS) · VIP = VIP-Kunde · VM = Vermögensberater',
        'LP = спутник жизни (Lebenspartner) · BIS = информационный семинар о профессии · EFS = вводный семинар (после BIS) · VIP = VIP-клиент · VM = финансовый консультант (Vermögensberater)'))}</div>`;

    const m = $('#main');
    $('#q').addEventListener('input', e => { f.q = e.target.value; rerenderKeepFocus('#q'); });
    $('#ref').addEventListener('change', e => { f.ref = e.target.value; viewKontakte(); });
    $('#addC').onclick = async () => {
      f.chips.clear(); f.colors.clear(); f.ref = ''; f.q = ''; f.sort = null;
      await call('saveContact', { name: '' });
      await render();
      const inp = m.querySelector('#ct tbody tr[data-id] input[data-f="name"]'); if (inp) inp.focus();
    };
    $('#tglEx').onclick = () => { f.example = !f.example; viewKontakte(); };
    if ($('#reset')) $('#reset').onclick = () => { f.chips.clear(); f.colors.clear(); f.ref = ''; f.q = ''; viewKontakte(); };
    m.querySelectorAll('[data-chip]').forEach(b => b.onclick = () => { const id = b.dataset.chip; f.chips.has(id) ? f.chips.delete(id) : f.chips.add(id); viewKontakte(); });
    m.querySelectorAll('[data-color]').forEach(b => b.onclick = () => { const k = b.dataset.color; f.colors.has(k) ? f.colors.delete(k) : f.colors.add(k); viewKontakte(); });
    m.querySelectorAll('th[data-sort]').forEach(th => th.onclick = () => {
      const k = th.dataset.sort;
      if (f.sort === k) { if (f.dir === 1) f.dir = -1; else { f.sort = null; f.dir = 1; } } else { f.sort = k; f.dir = 1; }
      viewKontakte();
    });
    const tbody = m.querySelector('#ct tbody');
    tbody.addEventListener('change', async e => {
      const inp = e.target.closest('input[data-f]'); if (!inp) return;
      const id = +inp.closest('tr').dataset.id; const fld = inp.dataset.f;
      let val = inp.value.trim(); if (fld === 'alter_') val = val === '' ? null : parseInt(val, 10) || null;
      const upd = await call('saveContact', { id, [fld]: val });
      Object.assign(state.contacts.find(c => c.id === id), upd);
      refreshNav();
    });
    tbody.addEventListener('click', async e => {
      const tr = e.target.closest('tr[data-id]'); if (!tr) return;
      const id = +tr.dataset.id; const c = state.contacts.find(x => x.id === id);
      const xb = e.target.closest('[data-x]');
      if (xb) {
        const fld = xb.dataset.x; const v = c[fld] ? 0 : 1;
        Object.assign(c, await call('saveContact', { id, [fld]: v }));
        xb.classList.toggle('on', !!v); refreshNav(); updateChipCounts(); return;
      }
      const sb = e.target.closest('[data-sel]');
      if (sb) {
        const k = sb.dataset.sel; let s = c.selektion || '';
        s = s.includes(k) ? s.replace(k, '') : SEL.map(x => x.key).filter(x => s.includes(x) || x === k).join('');
        Object.assign(c, await call('saveContact', { id, selektion: s }));
        sb.classList.toggle('on', s.includes(k)); return;
      }
      const db = e.target.closest('[data-delc]');
      if (db) armDelete(db, async () => { await call('deleteContact', id); toast(t('Kontakt gelöscht', 'Контакт удалён')); render(); });
    });
  }
  function updateChipCounts() {
    document.querySelectorAll('[data-chip]').forEach(b => { const ch = CHIPS.find(x => x.id === b.dataset.chip); b.querySelector('.n').textContent = state.contacts.filter(ch.test).length; });
  }
  function rerenderKeepFocus(sel) {
    const el = $(sel); const pos = el ? el.selectionStart : 0;
    viewKontakte(); const n = $(sel); if (n) { n.focus(); n.setSelectionRange(pos, pos); }
  }

  // =====================================================================
  // Kundenbestand
  // =====================================================================
  async function viewKunden() {
    const groups = (info.products) || window.Core.PRODUCT_GROUPS;
    const products = groups.flatMap(g => g.items);
    const kunden = await call('listKunden');
    const today = new Date().toISOString().slice(0, 10);
    const n = kunden.length;
    const cov = products.map(p => kunden.filter(k => k.products.includes(p)).length);
    const shade = v => { const r = n ? v / n : 0; return `background:rgba(42,120,214,${0.08 + r * 0.75});color:${r > 0.5 ? '#fff' : 'var(--ink)'}`; };
    $('#main').innerHTML = `
      ${head('Kundenbestand', 'Клиентская база', 'Alle Kontakte mit Kreuz bei „Kunde“. Grün = Vertrag vorhanden. Die letzte Zeile zeigt Lücken im Bestand.', 'Все контакты с отметкой «Клиент». Зелёный = договор есть. Нижняя строка показывает пробелы.')}
      <div class="tablewrap"><table class="grid kb"><thead>
        <tr><th rowspan="2" style="min-width:170px">${L('Name, Vorname', 'Фамилия, имя')}</th><th rowspan="2">${L('VM Name', 'Консультант')}</th>
          ${groups.map(g => `<th class="grp" colspan="${g.items.length}">${L(g.group, g.ru || g.group)}</th>`).join('')}
          <th class="grp" colspan="3">${L('Service', 'Сервис')}</th><th class="grp" colspan="3">${L('Empfehlungen', 'Рекомендации')}</th></tr>
        <tr>${groups.map(g => g.items.map((p, i) => `<th class="v ${i === 0 ? 'g0' : ''}">${p}</th>`).join('')).join('')}
          <th class="g0">${L('Letzter', 'Последний')}</th><th>${L('Nächster', 'Следующий')}</th><th>${L('Grund', 'Причина')}</th><th class="v g0">${L('Kunden', 'Клиенты')}</th><th class="v">${L('Partner', 'Партнёры')}</th><th class="v">VIP</th></tr>
      </thead><tbody>
        ${kunden.map(k => `<tr data-id="${k.id}"><td><b>${esc(k.name)}</b></td>
          <td><input class="cell" data-k="vm_name" value="${esc(k.vm_name)}" style="width:100px"></td>
          ${groups.map(g => g.items.map((p, i) => `<td class="p ${i === 0 ? 'g0' : ''}"><button class="pc ${k.products.includes(p) ? 'on' : ''}" data-p="${esc(p)}" aria-label="${esc(p)}"></button></td>`).join('')).join('')}
          <td class="g0"><input class="cell" type="date" data-k="letzter" value="${esc(k.letzter)}"></td>
          <td><input class="cell ${k.naechster && k.naechster < today ? 'overdue' : ''}" type="date" data-k="naechster" value="${esc(k.naechster)}"${k.naechster && k.naechster < today ? ` data-tip="${esc(t('Termin überfällig', 'Встреча просрочена'))}"` : ''}></td>
          <td><input class="cell" data-k="grund" value="${esc(k.grund)}" style="width:120px"></td>
          ${['empf_kunden', 'empf_partner', 'empf_vip'].map((fl, i) => `<td class="${i === 0 ? 'g0' : ''}"><input class="cell num" data-k="${fl}" value="${k[fl] || 0}" style="width:38px"></td>`).join('')}
        </tr>`).join('') || `<tr><td colspan="40" class="muted" style="padding:24px;text-align:center">${esc(t('Noch keine Kunden. In Kontakt-Potenzial bei „Kunde“ ankreuzen.', 'Клиентов пока нет. Отметьте «Клиент» в потенциале контактов.'))}</td></tr>`}
      </tbody><tfoot><tr><td>${esc(t(`Abdeckung (${n} Kunden)`, `Покрытие (${n} клиентов)`))}</td><td></td>
        ${cov.map((v, i) => `<td class="p ${groups.some(g => g.items[0] === products[i]) ? 'g0' : ''}"><div class="cov" style="${shade(v)}" data-tip="${esc(lang === 'ru' ? `${products[i]}: ${v} из ${n} клиентов (${n ? Math.round(v / n * 100) : 0} %)` : `${products[i]}: ${v} von ${n} Kunden (${n ? Math.round(v / n * 100) : 0} %)`)}">${v}</div></td>`).join('')}
        <td colspan="6"></td></tr></tfoot></table></div>
      <p class="muted" style="margin-top:8px">${esc(t('Tipp: Spalten mit hellen Zahlen unten sind Lücken – gute Liste für Service-Gespräche.', 'Совет: светлые цифры внизу означают пробелы. Это хороший список для сервисных встреч.'))}</p>`;
    const tb = $('#main tbody');
    tb.addEventListener('click', async e => {
      const b = e.target.closest('[data-p]'); if (!b) return;
      const id = +b.closest('tr').dataset.id; const on = !b.classList.contains('on');
      await call('setProduct', id, b.dataset.p, on); b.classList.toggle('on', on);
    });
    tb.addEventListener('change', async e => {
      const i = e.target.closest('[data-k]'); if (!i) return;
      const id = +i.closest('tr').dataset.id; let v = i.value; if (/^empf/.test(i.dataset.k)) v = parseInt(v, 10) || 0;
      await call('saveKundenInfo', { contact_id: id, [i.dataset.k]: v });
    });
  }

  // =====================================================================
  // BIS-Gäste (früher „Cash-Flow-Gäste“)
  // =====================================================================
  const GCOLS = [
    { f: 'bis', de: 'BIS', ru: 'BIS' }, { f: 'efs', de: 'EFS', ru: 'EFS' }, { f: 'berufsstart', de: 'Berufs-Start', ru: 'Старт в профессии' }, { f: 'gespraech_eltern', de: 'Gespräch Eltern/LP', ru: 'Разговор с родителями/LP' },
    { f: 'bereits_kunde', de: 'Bereits Kunde', ru: 'Уже клиент' }, { f: 'eigene_ffg', de: 'Eigene FFG', ru: 'Своё FFG' }, { f: 'kunde_geworden', de: 'Kunde geworden', ru: 'Стал клиентом' },
  ];
  async function viewGaeste() {
    const g = await call('listGaeste');
    const sum = fl => g.filter(x => x[fl]).length;
    $('#main').innerHTML = `
      ${head('BIS-Gäste', 'Гости BIS', 'Angemeldete Gäste und Nachverfolgung. BIS = Berufsinformationsseminar, EFS = Einführungsseminar (zweiter Teil nach dem BIS).', 'Записанные гости и дальнейшая работа с ними. BIS = информационный семинар о профессии, EFS = вводный семинар (вторая часть после BIS).')}
      <div class="toolbar">
        <input class="inp" id="gName" list="allc" placeholder="${esc(t('Name, Vorname (neu oder vorhanden)', 'Фамилия, имя (новый или из списка)'))}" style="width:260px">
        <input class="inp" id="gDate" type="date" value="${new Date().toISOString().slice(0, 10)}">
        <button class="btn primary" id="gAdd">+ ${L('Gast anmelden', 'Записать гостя')}</button>
        <span class="count">${esc(lang === 'ru' ? `${g.length} гостей · ${sum('bis')} на BIS · ${sum('efs')} на EFS · ${sum('kunde_geworden')} стали клиентами` : `${g.length} Gäste · ${sum('bis')} im BIS · ${sum('efs')} im EFS · ${sum('kunde_geworden')} Kunde geworden`)}</span>
      </div>
      <datalist id="allc">${state.contacts.map(c => `<option value="${esc(c.name)}">`).join('')}</datalist>
      <div class="tablewrap"><table class="grid"><thead><tr><th>${L('Name, Vorname', 'Фамилия, имя')}</th><th>${L('Datum zum', 'Дата')}</th>
        ${GCOLS.map(c => `<th class="c">${L(c.de, c.ru)}</th>`).join('')}<th>${L('Empfehlungen (Anzahl)', 'Рекомендации (кол-во)')}</th><th class="c">${L('VIP Kunde', 'VIP-клиент')}</th><th>${L('Tel.Nr.', 'Телефон')}</th><th></th></tr></thead>
      <tbody>${g.map(r => `<tr data-id="${r.id}"><td><b>${esc(r.name)}</b></td>
        <td><input class="cell" type="date" data-g="datum" value="${esc(r.datum)}"></td>
        ${GCOLS.map(c => `<td class="c">${xBtn(c.f, r[c.f])}</td>`).join('')}
        <td><input class="cell num" data-g="empfehlungen" value="${r.empfehlungen || 0}" style="width:60px"></td>
        <td class="c">${xBtn('vip_kunde', r.vip_kunde)}</td><td class="muted">${esc(r.telefon)}</td><td>${delBtn('data-delg')}</td></tr>`).join('') || `<tr><td colspan="14" class="muted" style="padding:24px;text-align:center">${esc(t('Noch keine Gäste.', 'Гостей пока нет.'))}</td></tr>`}
      </tbody></table></div>
      <p class="muted" style="margin-top:8px">${esc(t('Ein Gast ist gleichzeitig ein Kontakt: neue Namen erscheinen automatisch im Kontakt-Potenzial, BIS/EFS/Kunde werden dort mit angekreuzt.', 'Гость одновременно является контактом: новые имена сами появляются в потенциале контактов, а BIS/EFS/Клиент отмечаются и там.'))}</p>`;
    $('#gAdd').onclick = async () => {
      const name = $('#gName').value.trim(); if (!name) { $('#gName').focus(); return; }
      const id = await call('addGast', name, $('#gDate').value);
      await call('saveGast', { id, bis: 1 });
      toast(t('Gast angemeldet', 'Гость записан')); render();
    };
    const tb = $('#main tbody');
    tb.addEventListener('click', async e => {
      const tr = e.target.closest('tr[data-id]'); if (!tr) return; const id = +tr.dataset.id;
      const xb = e.target.closest('[data-x]');
      if (xb) { const on = !xb.classList.contains('on'); await call('saveGast', { id, [xb.dataset.x]: on ? 1 : 0 }); xb.classList.toggle('on', on); return; }
      const d = e.target.closest('[data-delg]'); if (d) armDelete(d, async () => { await call('deleteGast', id); render(); });
    });
    tb.addEventListener('change', async e => {
      const i = e.target.closest('[data-g]'); if (!i) return;
      let v = i.value; if (i.dataset.g === 'empfehlungen') v = parseInt(v, 10) || 0;
      await call('saveGast', { id: +i.closest('tr').dataset.id, [i.dataset.g]: v });
    });
  }

  // =====================================================================
  // Potenzial FFG – Monatsliste der Top-Kontakte zum Anrufen
  // =====================================================================
  async function viewFfg() {
    const settings = await call('getSettings');
    const ziel = parseInt(settings.ffg_ziel, 10) || 20;
    const y = state.year, mo = state.month;
    const list = await call('listFfg', y, mo);
    const counts = await Promise.all(MONTHS_DE.map((_, i) => call('listFfg', y, i + 1).then(r => r.length)));
    const done = list.filter(r => r.ffg_done).length;
    $('#main').innerHTML = `
      ${head('Potenzial FFG', 'Потенциал FFG', 'Pro Monat die Top-Kontakte aus dem Kontakt-Potenzial auswählen, die angerufen werden.', 'На каждый месяц выберите из потенциала контактов топ-людей, которым будете звонить.',
        `${yearSel()}<button class="btn primary" id="pick">+ ${L('Kontakte auswählen', 'Выбрать контакты')}</button>`)}
      <div class="tabs">${MONTHS_DE.map((_, i) => `<button class="${i + 1 === mo ? 'on' : ''}" data-m="${i + 1}"${tipA(MONTHS_DE[i], MONTHS_RU[i])}>${esc(mon(i))}${counts[i] ? `<small>${counts[i]}</small>` : ''}</button>`).join('')}</div>
      <div class="toolbar"><b>${esc(mon(mo - 1))} ${y}:</b> ${list.length} ${esc(t('von', 'из'))} <input class="inp" id="ziel" value="${ziel}" style="width:50px;text-align:right"> ${esc(t('Kontakten geplant', 'контактов запланировано'))}
        <div class="progress" data-tip="${list.length} / ${ziel}"><div style="width:${Math.min(100, list.length / ziel * 100)}%"></div></div>
        <span class="count">${esc(lang === 'ru' ? `Позвонили ${list.filter(r => r.angerufen).length} · Встреча ${list.filter(r => r.termin).length} · FFG проведено ${done}` : `Angerufen ${list.filter(r => r.angerufen).length} · Termin ${list.filter(r => r.termin).length} · FFG geführt ${done}`)}</span></div>
      <div class="tablewrap"><table class="grid"><thead><tr><th>#</th><th>${L('Name, Vorname', 'Фамилия, имя')}</th><th>${L('Selektion', 'Селекция')}</th><th>${L('Telefon', 'Телефон')}</th><th class="c">${L('Angerufen', 'Позвонили')}</th><th class="c">${L('Termin', 'Встреча')}</th><th class="c">${L('FFG geführt', 'FFG проведено')}</th><th>${L('Notiz', 'Заметка')}</th><th></th></tr></thead>
      <tbody>${list.map((r, i) => `<tr data-id="${r.id}"><td class="muted" style="padding-left:8px">${i + 1}</td><td><b>${esc(r.name)}</b></td><td>${dots(r.selektion || '', false)}</td><td>${esc(r.telefon)}</td>
        ${['angerufen', 'termin', 'ffg_done'].map(fl => `<td class="c">${xBtn(fl, r[fl])}</td>`).join('')}
        <td><input class="cell" data-n="notiz" value="${esc(r.notiz)}" style="min-width:220px"></td><td>${delBtn('data-delf')}</td></tr>`).join('') || `<tr><td colspan="9" class="muted" style="padding:24px;text-align:center">${esc(t('Für diesen Monat noch keine Kontakte ausgewählt.', 'На этот месяц контакты ещё не выбраны.'))}</td></tr>`}
      </tbody></table></div>`;
    bindYear(viewFfg);
    document.querySelectorAll('.tabs [data-m]').forEach(b => b.onclick = () => { state.month = +b.dataset.m; viewFfg(); });
    $('#ziel').onchange = async e => { await call('saveSetting', 'ffg_ziel', parseInt(e.target.value, 10) || 20); viewFfg(); };
    $('#pick').onclick = () => pickContacts(list.map(r => r.contact_id), async ids => { await call('addFfg', y, mo, ids); viewFfg(); });
    const tb = $('#main tbody');
    tb.addEventListener('click', async e => {
      const tr = e.target.closest('tr[data-id]'); if (!tr) return; const id = +tr.dataset.id;
      const xb = e.target.closest('[data-x]');
      if (xb) { const on = !xb.classList.contains('on'); await call('saveFfg', { id, [xb.dataset.x]: on ? 1 : 0 }); xb.classList.toggle('on', on); return; }
      const d = e.target.closest('[data-delf]'); if (d) armDelete(d, async () => { await call('deleteFfg', id); viewFfg(); });
    });
    tb.addEventListener('change', async e => { const i = e.target.closest('[data-n]'); if (i) await call('saveFfg', { id: +i.closest('tr').dataset.id, notiz: i.value }); });
  }
  function pickContacts(exclude, onDone) {
    const sel = new Set(); let colorF = '';
    const score = c => (c.selektion.includes('O') ? 8 : 0) + (c.selektion.includes('R') ? 4 : 0) + (c.selektion.includes('G') ? 2 : 0) + (c.selektion.includes('B') ? 1 : 0);
    const cnt = () => (lang === 'ru' ? `выбрано: ${sel.size}` : `${sel.size} ausgewählt`);
    const draw = () => {
      const rows = state.contacts.filter(c => !exclude.includes(c.id) && c.name && (!colorF || (c.selektion || '').includes(colorF))).sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name, 'de'));
      $('#modal').innerHTML = `<div class="box"><header><b>${esc(lang === 'ru' ? `Выбрать контакты на ${mon(state.month - 1).toLowerCase()}` : `Kontakte für ${mon(state.month - 1)} auswählen`)}</b>
        <div class="toolbar" style="margin:0"><button class="chip ${!colorF ? 'on' : ''}" data-cf="">${esc(t('alle', 'все'))}</button>${SEL.map(s => `<button class="chip ${colorF === s.key ? 'on' : ''}" data-cf="${s.key}" data-tip="${esc(selLabel(s))}"><span class="dot on" style="--c:${s.color};width:12px;height:12px"></span></button>`).join('')}</div></header>
        <div class="body">${rows.map(c => `<label class="pickrow"><input type="checkbox" data-pid="${c.id}" ${sel.has(c.id) ? 'checked' : ''}><span><b>${esc(c.name)}</b> <span class="muted">${esc(c.bemerkungen || '')}</span></span>${dots(c.selektion || '', false)}<span class="muted">${esc(c.telefon)}</span></label>`).join('') || `<p class="muted">${esc(t('Keine weiteren Kontakte.', 'Больше контактов нет.'))}</p>`}</div>
        <footer><span class="muted" style="margin-right:auto">${cnt()}</span><button class="btn" data-close>${L('Abbrechen', 'Отмена')}</button><button class="btn primary" data-ok>${L('Hinzufügen', 'Добавить')}</button></footer></div>`;
    };
    draw(); $('#modal').classList.remove('hidden');
    $('#modal').onclick = async e => {
      if (e.target.id === 'modal' || e.target.closest('[data-close]')) { $('#modal').classList.add('hidden'); return; }
      const cf = e.target.closest('[data-cf]'); if (cf) { colorF = cf.dataset.cf; draw(); return; }
      if (e.target.closest('[data-ok]')) { $('#modal').classList.add('hidden'); if (sel.size) await onDone([...sel]); }
    };
    $('#modal').onchange = e => { const cb = e.target.closest('[data-pid]'); if (cb) { const id = +cb.dataset.pid; cb.checked ? sel.add(id) : sel.delete(id); $('#modal footer .muted').textContent = cnt(); } };
  }
  function yearSel() { const y = now.getFullYear(); return `<select class="inp" id="year">${[y - 1, y, y + 1].map(v => `<option ${v === state.year ? 'selected' : ''}>${v}</option>`).join('')}</select>`; }
  function bindYear(fn) { $('#year').onchange = e => { state.year = +e.target.value; fn(); }; }

  // =====================================================================
  // Umsatzplanung
  // =====================================================================
  const fmt = v => (Math.round((v || 0) * 100) / 100).toLocaleString(lang === 'ru' ? 'ru-RU' : 'de-DE');
  function monthChart(data, series, curMonth) {
    const max = Math.max(1, ...data.flatMap(d => series.map(s => d[s.key])));
    return `<div class="series-legend">${series.map(s => `<span><i style="background:${s.color}"></i>${L(s.de, s.ru)}</span>`).join('')}</div>
      <div class="vchart">${data.map((d, i) => `<div class="col ${i + 1 === curMonth ? 'cur' : ''}" data-tip="${esc(`${mon(i)}: ${series.map(s => `${t(s.de, s.ru)} ${fmt(d[s.key])}`).join(' · ')}`)}">${series.map(s => `<div class="b" style="height:${d[s.key] / max * 100}%;background:${s.color}"></div>`).join('')}</div>`).join('')}</div>
      <div class="vlabels">${MON().map(m => `<span>${m}</span>`).join('')}</div>`;
  }
  async function viewUmsatz() {
    const y = state.year, mo = state.umonth;
    const all = await call('listUmsatz', y);
    const st = await call('getSettings');
    const data = MONTHS_DE.map((_, i) => { const r = all.filter(u => u.month === i + 1); return { policiert: r.reduce((a, b) => a + (b.policiert || 0), 0), pot: r.reduce((a, b) => a + (b.pot || 0), 0) }; });
    const rows = all.filter(u => u.month === mo);
    const sp = data[mo - 1].policiert, spot = data[mo - 1].pot;
    const stufe = parseFloat(st.provisionsstufe) || 0, ausz = parseFloat(st.auszahlung) || 0;
    const yearPol = data.reduce((a, b) => a + b.policiert, 0), yearPot = data.reduce((a, b) => a + b.pot, 0);
    const SER = [{ key: 'policiert', de: 'Policiert', ru: 'Оформлено', color: 'var(--s1)' }, { key: 'pot', de: 'Potenzial', ru: 'Потенциал', color: 'var(--s2)' }];
    $('#main').innerHTML = `
      ${head('Umsatzplanung', 'Планирование оборота', 'Pro Monat: Kunde, policierte Einheiten und Potenzial. Das Jahr auf einen Blick oben.', 'По месяцам: клиент, оформленные единицы (Einheiten) и потенциал. Весь год — на графике сверху.', yearSel())}
      <div class="cards">
        <div class="card"><div class="k">${L('Policiert', 'Оформлено')} ${y}</div><div class="v">${fmt(yearPol)}</div><div class="d">${esc(t('Einheiten', 'единиц (Einheiten)'))}</div></div>
        <div class="card"><div class="k">${L('Potenzial', 'Потенциал')} ${y}</div><div class="v">${fmt(yearPot)}</div><div class="d">${esc(t('noch offen: ', 'ещё открыто: '))}${fmt(Math.max(0, yearPot - yearPol))}</div></div>
        <div class="card"><div class="k">${L('Quote policiert / Pot.', 'Доля оформлено / потенциал')}</div><div class="v">${yearPot ? Math.round(yearPol / yearPot * 100) : 0} %</div><div class="d">${esc(t('über alle Monate', 'за все месяцы'))}</div></div>
      </div>
      <div class="panel" style="margin-bottom:12px">${monthChart(data, SER, y === now.getFullYear() ? now.getMonth() + 1 : 0)}</div>
      <div class="tabs">${MONTHS_DE.map((_, i) => `<button class="${i + 1 === mo ? 'on' : ''}" data-m="${i + 1}"${tipA(MONTHS_DE[i], MONTHS_RU[i])}>${esc(mon(i))}</button>`).join('')}</div>
      <div class="umsgrid" style="display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:12px;align-items:start">
        <div class="tablewrap"><table class="grid" style="min-width:0"><thead><tr><th>${L('Kunde', 'Клиент')}</th><th style="text-align:right">${L('Policiert', 'Оформлено')}</th><th style="text-align:right">${L('Pot.', 'Потенциал')}</th><th></th></tr></thead>
          <tbody>${rows.map(u => `<tr data-id="${u.id}"><td><input class="cell" data-u="kunde" value="${esc(u.kunde)}" list="allc"></td><td><input class="cell num" data-u="policiert" value="${u.policiert || ''}"></td><td><input class="cell num" data-u="pot" value="${u.pot || ''}"></td><td>${delBtn('data-delu')}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td><button class="btn small" id="uAdd">+ ${L('Zeile', 'Строка')}</button> &nbsp;${esc(t('Summe', 'Итого'))} ${esc(mon(mo - 1))}</td><td style="text-align:right">${fmt(sp)}</td><td style="text-align:right">${fmt(spot)}</td><td></td></tr></tfoot></table></div>
        <div class="panel"><h3>${L('Abrechnung', 'Расчёт')} ${esc(mon(mo - 1))}</h3>
          <div class="kv"><label>${L('Provisionsstufe', 'Ступень провизии')}</label><input class="inp" data-s="provisionsstufe" value="${esc(st.provisionsstufe)}">
            <label>${L('Auszahlung %', 'Выплата %')}</label><input class="inp" data-s="auszahlung" value="${esc(st.auszahlung)}">
            <span>${L('Gesamt policiert', 'Всего оформлено')}</span><span class="res">${fmt(sp)}</span>
            <span>${L('Provision', 'Провизия')}</span><span class="res">${fmt(sp * stufe * ausz / 100)} €</span></div>
          <p class="muted" style="font-size:11px;margin-bottom:0">${esc(t('Formel wie im Excel: Policiert × Stufe × Auszahlung % / 100. Erfolgsprovision, Leistungszuschuss, KLB, Dynamik folgen nach Abstimmung.', 'Формула как в Excel: оформлено × ступень × выплата % / 100. Erfolgsprovision, Leistungszuschuss, KLB, Dynamik добавим после согласования.'))}</p></div>
      </div>
      <datalist id="allc">${state.contacts.map(c => `<option value="${esc(c.name)}">`).join('')}</datalist>`;
    bindYear(viewUmsatz);
    document.querySelectorAll('.tabs [data-m]').forEach(b => b.onclick = () => { state.umonth = +b.dataset.m; viewUmsatz(); });
    $('#uAdd').onclick = async () => { await call('saveUmsatz', { year: y, month: mo, kunde: '', policiert: 0, pot: 0 }); await viewUmsatz(); const ins = document.querySelectorAll('[data-u="kunde"]'); if (ins.length) ins[ins.length - 1].focus(); };
    document.querySelectorAll('[data-s]').forEach(i => i.onchange = async () => { await call('saveSetting', i.dataset.s, i.value); viewUmsatz(); });
    const tb = $('#main tbody');
    tb.addEventListener('change', async e => {
      const i = e.target.closest('[data-u]'); if (!i) return;
      let v = i.value; if (i.dataset.u !== 'kunde') v = parseFloat(String(v).replace(',', '.')) || 0;
      await call('saveUmsatz', { id: +i.closest('tr').dataset.id, [i.dataset.u]: v });
      if (i.dataset.u !== 'kunde') viewUmsatz();
    });
    tb.addEventListener('click', e => { const d = e.target.closest('[data-delu]'); if (d) armDelete(d, async () => { await call('deleteUmsatz', +d.closest('tr').dataset.id); viewUmsatz(); }); });
  }

  // =====================================================================
  // Wochenplan – „Plane deine Woche in festen Blöcken“ (Karriere Start 2026, S. 18)
  // =====================================================================
  const WP_COLORS = { routine: '#d2c3e6', schulung: '#c4d0db', akquise: '#fddcc6', training: '#bed297', termine: '#e7c4c2' };
  const WP = [
    { k: 'morgen', c: 'routine', de: 'Morgenroutine', ru: 'Утренняя рутина' },
    { k: 'meeting', c: 'schulung', de: 'Wochenstart Meeting', ru: 'Встреча начала недели' },
    { k: 'konzepte', c: 'akquise', de: 'Konzepte', ru: 'Концепции' },
    { k: 'fach', c: 'schulung', de: 'Fachschulung', ru: 'Профобучение' },
    { k: 'training', c: 'training', de: 'Training', ru: 'Тренинг' },
    { k: 'schulung', c: 'schulung', de: 'Schulung', ru: 'Обучение' },
    { k: 'ausbildung', c: 'schulung', de: 'Ausbildung', ru: 'Образование' },
    { k: 'planung', c: 'schulung', de: 'Ausbildung/Planung', ru: 'Образование/планирование' },
    { k: 'akquise', c: 'akquise', de: 'Akquise', ru: 'Привлечение клиентов' },
    { k: 'termine', c: 'termine', de: 'Termine', ru: 'Встречи' },
    { k: 'partner', c: 'akquise', de: 'Partnergewinnung', ru: 'Поиск партнёров' },
    { k: 'vm', c: 'schulung', de: 'VM Schulung', ru: 'Обучение VM' },
    { k: 'vba', c: 'schulung', de: 'VBA Schulung', ru: 'Обучение VBA' },
    { k: 'abend', c: 'routine', de: 'Abendroutine', ru: 'Вечерняя рутина' },
    { k: 'frei', c: 'routine', de: '', ru: '', brDe: 'Frei / Privat', brRu: 'Свободно / личное' },
  ];
  const wpBy = k => WP.find(x => x.k === k);
  const WP_ROWS = ['Vor 09:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', 'Nach 20:00'];
  const wpRow = i => (i === 0 ? t('Vor 09:00', 'До 09:00') : i === 12 ? t('Nach 20:00', 'После 20:00') : WP_ROWS[i]);
  const DAYS_DE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  const DAYS_RU = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
  // Beispielwoche genau wie im Heft
  const WP_EXAMPLE = (() => {
    const M = 'morgen', A = 'abend', F = 'frei', W = 'meeting', K = 'konzepte', T = 'termine', Tr = 'training', Ak = 'akquise';
    return [
      [M, W, W, K, K, K, T, T, Tr, Tr, T, T, A],
      [M, F, K, K, Tr, Tr, 'partner', 'partner', T, T, ['vm', '18:30 VM Schulung'], ['vba', '19:30 VBA Schulung'], A],
      [M, F, 'fach', 'fach', Tr, Tr, Ak, Ak, T, T, T, T, A],
      [M, F, Tr, Tr, Ak, Ak, K, K, T, T, T, T, A],
      [M, F, 'schulung', 'schulung', Ak, Ak, Tr, Tr, T, T, T, T, A],
      [M, F, 'ausbildung', 'ausbildung', 'planung', Tr, Tr, Ak, Ak, Ak, T, T, A],
      [M, F, F, F, F, F, F, F, F, F, F, F, A],
    ].map(day => day.map(v => (Array.isArray(v) ? { kind: v[0], text: v[1] } : { kind: v, text: '' })));
  })();
  function isoWeek(d) {
    const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
    return { year: x.getUTCFullYear(), week: Math.ceil(((x - y0) / 86400000 + 1) / 7) };
  }
  function weekMonday(year, week) {
    const jan4 = new Date(Date.UTC(year, 0, 4)); const d = jan4.getUTCDay() || 7;
    const mon0 = new Date(jan4); mon0.setUTCDate(jan4.getUTCDate() - d + 1 + (week - 1) * 7);
    return mon0;
  }
  const wpState = { ...isoWeek(now), showExample: true };
  const cellLabel = c => { if (!c) return ''; if (c.text) return c.text; const p = wpBy(c.kind); return p ? t(p.de, p.ru) : ''; };
  // Überfahren: Kommentar (wie in Excel), sonst Übersetzung des Blocks
  const cellTip = c => {
    if (!c) return '';
    if (c.comment) return c.comment;
    const p = wpBy(c.kind); if (!p || !p.de) return c.text || '';
    return c.text ? `${c.text} · ${other(p.de, p.ru)}` : other(p.de, p.ru);
  };
  function cellHtml(c, d, r) {
    const p = c && wpBy(c.kind); const tipTxt = cellTip(c);
    return `<td class="cell ${c && c.comment ? 'has-note' : ''}" data-d="${d}" data-r="${r}" style="${p ? `background:${WP_COLORS[p.c]}` : ''}"${tipTxt ? ` data-tip="${esc(tipTxt)}"` : ''}${c && c.comment ? ' data-note="1"' : ''}>${esc(cellLabel(c))}</td>`;
  }
  function wpTable(cells, edit, band) {
    const dayNames = lang === 'ru' ? DAYS_RU : DAYS_DE;
    return `<div class="wp-wrap"><table class="wp-grid ${edit ? 'edit' : ''}">
      ${band ? `<tr class="band"><td colspan="8">${band}</td></tr>` : ''}
      <tr><th class="blank"></th>${dayNames.map((d, i) => `<th${tipA(DAYS_DE[i], DAYS_RU[i])}>${esc(d)}</th>`).join('')}</tr>
      ${WP_ROWS.map((_, r) => `<tr><td class="time">${esc(wpRow(r))}</td>${dayNames.map((_, d) => cellHtml(cells[d] && cells[d][r], d, r)).join('')}</tr>`).join('')}
    </table></div>`;
  }
  async function viewWoche() {
    const { year, week } = wpState;
    const rows = await call('getWeek', year, week);
    const cells = Array.from({ length: 7 }, () => Array(13).fill(null));
    rows.forEach(r => { cells[r.day][r.slot] = { kind: r.kind, text: r.text, comment: r.comment || '' }; });
    const mon0 = weekMonday(year, week); const sun = new Date(mon0); sun.setUTCDate(mon0.getUTCDate() + 6);
    const dd = d => `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.`;
    const cur = isoWeek(now); const isCur = cur.year === year && cur.week === week;
    const groups = [
      { c: 'termine', de: 'Termine', ru: 'Встречи' }, { c: 'akquise', de: 'Akquise / Konzepte / Partnergewinnung', ru: 'Привлечение / концепции / партнёры' },
      { c: 'training', de: 'Training', ru: 'Тренинг' }, { c: 'schulung', de: 'Schulung / Meeting', ru: 'Обучение / встречи' }, { c: 'routine', de: 'Routine / Frei', ru: 'Рутина / свободно' },
    ];
    const sum = g => cells.flat().filter(c => c && wpBy(c.kind) && wpBy(c.kind).c === g).length;
    $('#main').innerHTML = `<div class="wp">
      <div class="head"><div><h1 class="wp-title">${L('Wochenplan', 'План недели')}</h1><p class="sub" style="margin:0;font-size:16px;color:var(--ink)">${esc(t('Plane deine Woche in festen Blöcken', 'Планируй неделю фиксированными блоками'))}</p></div>
        <div class="wp-week"><button class="btn" id="wPrev" aria-label="${esc(t('Vorige Woche', 'Предыдущая неделя'))}">‹</button><b>${esc(t('KW', 'Неделя'))} ${week} · ${dd(mon0)}–${dd(sun)}${sun.getUTCFullYear()}</b><button class="btn" id="wNext" aria-label="${esc(t('Nächste Woche', 'Следующая неделя'))}">›</button>${isCur ? '' : `<button class="btn small" id="wToday">${L('Diese Woche', 'Текущая неделя')}</button>`}</div></div>
      <p class="muted" style="margin:0 0 8px;font-size:12px">${esc(TOUCH ? t('Feld antippen → Block auswählen und bei Bedarf einen Kommentar schreiben. Felder mit Kommentar haben ein rotes Dreieck; Finger kurz darauf halten zeigt den Kommentar.', 'Нажмите на ячейку → выберите блок и при необходимости напишите комментарий. У ячеек с комментарием красный уголок; задержите на ней палец, чтобы прочитать комментарий.') : t('Feld anklicken → Block auswählen und bei Bedarf einen Kommentar schreiben. Felder mit Kommentar haben ein rotes Dreieck; Maus darüber zeigt den Kommentar.', 'Нажмите на ячейку → выберите блок и при необходимости напишите комментарий. У ячеек с комментарием красный уголок, при наведении он показывается.'))}</p>
      <div class="toolbar"><button class="btn" id="wEx">${L('Beispielwoche übernehmen', 'Взять пример недели')}</button><button class="btn" id="wCopy">${L('Vorwoche kopieren', 'Скопировать прошлую неделю')}</button><button class="btn danger" id="wClear">${L('Woche leeren', 'Очистить неделю')}</button>
        <button class="btn" id="wTgl" style="margin-left:auto">${wpState.showExample ? L('Beispielwoche ausblenden', 'Скрыть пример') : L('Beispielwoche zeigen', 'Показать пример')}</button></div>
      <div id="wMine">${wpTable(cells, true, `${esc(t('Meine Woche', 'Моя неделя'))} · ${esc(t('KW', 'неделя'))} ${week}`)}</div>
      <div class="wp-sum">${groups.map(g => `<span style="background:${WP_COLORS[g.c]}"${tipA(g.de, g.ru)}>${esc(t(g.de, g.ru))}<b>${sum(g.c)} ${esc(t('Std.', 'ч'))}</b></span>`).join('')}</div>
      ${wpState.showExample ? wpTable(WP_EXAMPLE, false, esc(t('Beispielwoche', 'Пример недели'))) : ''}
    </div>`;

    const go2 = d => { const m = weekMonday(wpState.year, wpState.week); m.setUTCDate(m.getUTCDate() + d * 7); Object.assign(wpState, isoWeek(new Date(m.getUTCFullYear(), m.getUTCMonth(), m.getUTCDate()))); viewWoche(); };
    $('#wPrev').onclick = () => go2(-1); $('#wNext').onclick = () => go2(1);
    if ($('#wToday')) $('#wToday').onclick = () => { Object.assign(wpState, isoWeek(now)); viewWoche(); };
    $('#wTgl').onclick = () => { wpState.showExample = !wpState.showExample; viewWoche(); };
    const fillAll = src => { const all = []; for (let d = 0; d < 7; d++) for (let r = 0; r < 13; r++) { const c = src[d] && src[d][r]; all.push({ day: d, slot: r, kind: c ? c.kind : '', text: c ? c.text : '', comment: '' }); } return all; };
    $('#wEx').onclick = async () => { await call('setSlots', year, week, fillAll(WP_EXAMPLE)); toast(t('Beispielwoche übernommen', 'Пример недели перенесён')); viewWoche(); };
    $('#wCopy').onclick = async () => {
      const m = weekMonday(year, week); m.setUTCDate(m.getUTCDate() - 7); const pw = isoWeek(new Date(m.getUTCFullYear(), m.getUTCMonth(), m.getUTCDate()));
      const prev = await call('getWeek', pw.year, pw.week);
      if (!prev.length) { toast(t('Die Vorwoche ist leer.', 'Прошлая неделя пустая.')); return; }
      const src = Array.from({ length: 7 }, () => Array(13).fill(null)); prev.forEach(r => { src[r.day][r.slot] = r; });
      await call('setSlots', year, week, fillAll(src)); toast(t('Vorwoche kopiert (ohne Kommentare)', 'Прошлая неделя скопирована (без комментариев)')); viewWoche();
    };
    $('#wClear').onclick = e => armDelete(e.currentTarget, async () => { await call('clearWeek', year, week); viewWoche(); });

    // Klick auf ein Feld → Menü mit Blöcken + Kommentar
    const grid = $('#wMine table');
    const refreshCell = (d, r) => {
      const old = grid.querySelector(`td.cell[data-d="${d}"][data-r="${r}"]`);
      const tmp = document.createElement('tbody'); tmp.innerHTML = `<tr>${cellHtml(cells[d][r], d, r)}</tr>`;
      const td = tmp.querySelector('td'); td.classList.add('sel'); old.replaceWith(td);
      const box = document.querySelector('.wp-sum'); if (box) box.querySelectorAll('b').forEach((b, i) => { b.textContent = `${sum(groups[i].c)} ${t('Std.', 'ч')}`; });
      return td;
    };
    const save = (d, r) => { const c = cells[d][r]; return call('setSlots', year, week, [{ day: d, slot: r, kind: c ? c.kind : '', text: c ? c.text : '', comment: c ? c.comment : '' }]); };
    grid.addEventListener('click', async e => {
      const td0 = e.target.closest('td.cell'); if (!td0) return;
      const d = +td0.dataset.d, r = +td0.dataset.r;
      if (cellMenuCommit) await cellMenuCommit(); // offenes Menü zuerst speichern
      openCellMenu(grid.querySelector(`td.cell[data-d="${d}"][data-r="${r}"]`), d, r);
    });
    function openCellMenu(td, d, r) {
      closeCellMenu();
      grid.querySelectorAll('td.sel').forEach(x => x.classList.remove('sel')); td.classList.add('sel');
      const c = cells[d][r] || { kind: '', text: '', comment: '' };
      const dayN = (lang === 'ru' ? DAYS_RU : DAYS_DE)[d];
      const menu = document.createElement('div'); menu.className = 'cellmenu'; menu.id = 'cellmenu';
      const opts = WP.filter(p => !['vm', 'vba'].includes(p.k));
      menu.innerHTML = `<div class="cm-head">${esc(dayN)} · ${esc(wpRow(r))}</div>
        <div class="cm-list">${opts.map(p => `<button class="cm-opt ${c.kind === p.k ? 'on' : ''}" data-k="${p.k}"${tipA(p.brDe || p.de, p.brRu || p.ru)}><i style="background:${WP_COLORS[p.c]}"></i>${esc(t(p.brDe || p.de, p.brRu || p.ru))}</button>`).join('')}</div>
        <label class="cm-lbl" for="cmNote">${L('Kommentar', 'Комментарий')}</label>
        <textarea id="cmNote" rows="3" placeholder="${esc(t('z. B. Termin mit Familie Weber, Thema Baufi', 'например: встреча с семьёй Weber, тема Baufi'))}">${esc(c.comment || '')}</textarea>
        <div class="cm-foot"><button class="btn small danger" data-clear>${L('Feld leeren', 'Очистить ячейку')}</button><button class="btn small primary" data-done>${L('Fertig', 'Готово')}</button></div>`;
      document.body.appendChild(menu);
      // Position neben dem Feld, immer im Fenster
      const rc = td.getBoundingClientRect(); const mw = menu.offsetWidth, mh = menu.offsetHeight;
      let x = rc.right + 6, y = rc.top;
      if (x + mw > innerWidth - 8) x = rc.left - mw - 6;
      if (x < 8) x = Math.max(8, Math.min(rc.left, innerWidth - mw - 8));
      if (y + mh > innerHeight - 8) y = Math.max(8, innerHeight - mh - 8);
      menu.style.left = x + 'px'; menu.style.top = y + 'px';
      const note = menu.querySelector('#cmNote');
      let cur = Object.assign({}, c);
      const commit = async () => {
        cur.comment = note.value.trim();
        const empty = !cur.kind && !cur.text && !cur.comment;
        cells[d][r] = empty ? null : { ...cur };
        refreshCell(d, r); await save(d, r);
      };
      menu.addEventListener('click', async ev => {
        const o = ev.target.closest('[data-k]');
        if (o) {
          cur.kind = o.dataset.k; if (cur.text && wpBy(c.kind) !== wpBy(cur.kind)) cur.text = '';
          menu.querySelectorAll('.cm-opt').forEach(b => b.classList.toggle('on', b === o));
          await commit(); note.focus(); return;
        }
        if (ev.target.closest('[data-clear]')) { cur = { kind: '', text: '', comment: '' }; note.value = ''; await commit(); closeCellMenu(); return; }
        if (ev.target.closest('[data-done]')) { await commit(); closeCellMenu(); }
      });
      note.addEventListener('keydown', async ev => {
        if (ev.key === 'Escape') { closeCellMenu(); }
        if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { await commit(); closeCellMenu(); }
      });
      cellMenuCommit = commit;
    }
  }
  let cellMenuCommit = null;
  function closeCellMenu() {
    const m = $('#cellmenu'); if (!m) return;
    m.remove(); cellMenuCommit = null;
    document.querySelectorAll('td.sel').forEach(x => x.classList.remove('sel'));
  }
  // Klick außerhalb: Kommentar speichern und Menü schließen
  document.addEventListener('mousedown', async e => {
    const m = $('#cellmenu'); if (!m || m.contains(e.target) || e.target.closest('#wMine td.cell')) return;
    if (cellMenuCommit) await cellMenuCommit();
    closeCellMenu();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCellMenu(); });

  // =====================================================================
  // Auswertung – für das Gespräch mit dem Bitroer
  // =====================================================================
  const FUNNEL_RU = { 'Kontakte': 'Контакты', 'Kundenseminar': 'Семинар клиентов', 'BIS': 'BIS', 'EFS': 'EFS', 'Kunde': 'Клиент', 'VIP / VM': 'VIP / VM' };
  async function viewAuswertung() {
    const s = await call('stats', state.year);
    const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
    const maxF = Math.max(1, s.funnel[0].value);
    const curM = state.year === now.getFullYear() ? now.getMonth() + 1 : 12;
    const products = s.coverage.slice().sort((a, b) => a.value - b.value);
    const coverShow = products.filter(p => ['Riester', 'Rürup', 'BAV', 'RisikoLV', 'BU', 'KV Zusatz', 'Depot', 'Sparplan', 'Bausparen', 'VSP', 'Rechtsschutz', 'Wohngebäude', 'KFZ'].includes(p.product)).slice(0, 8);
    const ru = lang === 'ru';
    const card = (kDe, kRu, v, d) => `<div class="card"><div class="k">${L(kDe, kRu)}</div><div class="v">${v}</div><div class="d">${esc(d)}</div></div>`;
    $('#main').innerHTML = `
      ${head('Auswertung', 'Анализ', 'Überblick für das Planungsgespräch mit dem Bitroer.', 'Обзор для встречи с битроером по планированию.',
        `${yearSel()}${api.mode === 'web' ? '' : `<button class="btn" id="print">${L('Drucken / PDF', 'Печать / PDF')}</button>`}`)}
      <div class="cards">
        ${card('Kontakte', 'Контакты', s.total, ru ? `${s.ohneSel} без селекции` : `${s.ohneSel} ohne Selektion`)}
        ${card('Eigenkontakte', 'Свои контакты', s.quelle.eigen, ru ? `${pct(s.quelle.eigen, s.total)} % всех контактов` : `${pct(s.quelle.eigen, s.total)} % aller Kontakte`)}
        ${card('Empfehlungen', 'Рекомендации', s.quelle.empf, ru ? `${pct(s.quelle.empf, s.total)} % · от ${s.referrer.length} человек` : `${pct(s.quelle.empf, s.total)} % · von ${s.referrer.length} Personen`)}
        ${card('Kunden', 'Клиенты', s.kundenCount, ru ? `${pct(s.kundenCount, s.total)} % контактов` : `${pct(s.kundenCount, s.total)} % der Kontakte`)}
        ${card(`FFG ${MONTHS_DE[curM - 1].slice(0, 3)}`, `FFG ${MONTHS_RU[curM - 1].slice(0, 3)}`, `${s.ffg[curM - 1].done} / ${s.ffg[curM - 1].geplant}`, t('geführt / geplant', 'проведено / запланировано'))}
      </div>
      <div class="panels">
        <div class="panel"><h3>${L('Schwachstellen & Gesprächspunkte', 'Слабые места и темы для разговора')}</h3>${s.hints.length ? `<ul class="hints">${s.hints.map(h => `<li data-tip="${esc(ru ? h.de : h.ru)}">${esc(ru ? h.ru : h.de)}</li>`).join('')}</ul>` : `<p class="muted">${esc(t('Keine Auffälligkeiten.', 'Ничего необычного.'))}</p>`}</div>
        <div class="panel"><h3>${L('Weg vom Kontakt zum Kunden', 'Путь от контакта к клиенту')} <small>${esc(t('Anzahl · Anteil aller Kontakte', 'количество · доля от всех контактов'))}</small></h3>
          ${s.funnel.map((f, i) => `<div class="hbar"><span>${L(f.label, FUNNEL_RU[f.label] || f.label)}</span><div class="track" data-tip="${esc(t(f.label, FUNNEL_RU[f.label]))}: ${f.value}"><div class="fill" style="width:${f.value / maxF * 100}%"></div></div><span class="val">${f.value}${i ? ` · ${pct(f.value, s.total)} %` : ''}</span></div>`).join('')}</div>
        <div class="panel"><h3>${L('Selektion', 'Селекция')}</h3>
          ${s.selektion.map(x => `<div class="hbar"><span><span class="dot on" style="--c:${x.color};width:10px;height:10px;display:inline-block;vertical-align:-1px;margin-right:6px"></span>${L(x.label, x.ru)}</span><div class="track"><div class="fill" style="width:${x.value / Math.max(1, s.total) * 100}%"></div></div><span class="val">${x.value}</span></div>`).join('')}
          <div class="hbar"><span class="muted">${L('ohne Selektion', 'без селекции')}</span><div class="track"><div class="fill" style="width:${s.ohneSel / Math.max(1, s.total) * 100}%;background:#b9b8b2"></div></div><span class="val">${s.ohneSel}</span></div></div>
        <div class="panel"><h3>${L('Top-Empfehlungsgeber', 'Кто больше всех рекомендует')} <small>${esc(t('Klick zeigt die Kontakte', 'клик покажет контакты'))}</small></h3>
          <div class="reflist">${s.referrer.slice(0, 8).map(r => `<a data-ref="${esc(r.name)}">${esc(r.name)}</a><span>${r.value}</span>`).join('') || `<span class="muted">${esc(t('Noch keine Empfehlungen.', 'Рекомендаций пока нет.'))}</span>`}</div></div>
        <div class="panel"><h3>${L('Umsatz', 'Оборот')} ${state.year}</h3>${monthChart(s.umsatz, [{ key: 'policiert', de: 'Policiert', ru: 'Оформлено', color: 'var(--s1)' }, { key: 'pot', de: 'Potenzial', ru: 'Потенциал', color: 'var(--s2)' }], curM)}</div>
        <div class="panel"><h3>${L('Potenzial FFG', 'Потенциал FFG')} ${state.year}</h3>${monthChart(s.ffg, [{ key: 'geplant', de: 'Geplant', ru: 'Запланировано', color: 'var(--s2)' }, { key: 'done', de: 'FFG geführt', ru: 'FFG проведено', color: 'var(--s1)' }], curM)}</div>
        <div class="panel"><h3>${L('Kundenbestand: größte Lücken', 'Клиентская база: самые большие пробелы')} <small>${esc(t('Kunden mit Vertrag', 'клиенты с договором'))}</small></h3>
          ${coverShow.map(p => `<div class="hbar"><span>${esc(p.product)}</span><div class="track"><div class="fill" style="width:${p.value / Math.max(1, s.kundenCount) * 100}%"></div></div><span class="val">${p.value} / ${s.kundenCount}</span></div>`).join('')}</div>
      </div>`;
    bindYear(viewAuswertung);
    if ($('#print')) $('#print').onclick = () => window.print();
    document.querySelectorAll('[data-ref]').forEach(a => a.onclick = () => { state.f.ref = a.dataset.ref; state.f.chips.clear(); state.f.colors.clear(); go('kontakte'); });
  }

  // =====================================================================
  // Daten & Backup
  // =====================================================================
  async function viewDaten() {
    info = await call('info');
    const backups = await call('listBackups');
    const web = api.mode === 'web';
    const btn = (a, de, ru, cls) => `<button class="btn ${cls || ''}" data-a="${a}">${L(de, ru)}</button>`;
    const fmtDate = iso => (iso ? new Date(iso).toLocaleString(lang === 'ru' ? 'ru-RU' : 'de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : t('noch nie', 'ещё ни разу'));
    let body;
    if (web) {
      const last = await call('lastExport');
      body = `
      ${head('Daten & Backup', 'Данные и бэкап', 'Die Daten liegen nur auf diesem Gerät. Sichere sie regelmäßig als Datei (z. B. in iCloud Drive).', 'Данные хранятся только на этом устройстве. Регулярно сохраняйте их файлом (например, в iCloud Drive).')}
      <div class="section"><h3>${L('Sicherung als Datei', 'Резервная копия файлом')}</h3>
        <p>${esc(t('Wichtig: Wenn Safari-Daten gelöscht werden oder das iPad zurückgesetzt wird, sind die Daten nur über diese Datei wiederherstellbar. Speichere sie über „Teilen → In Dateien sichern“ in iCloud Drive.', 'Важно: если очистить данные Safari или сбросить iPad, данные можно вернуть только из этого файла. Сохраните его через «Поделиться → Сохранить в Файлы» в iCloud Drive.'))}</p>
        <p>${esc(t('Letzte Sicherung: ', 'Последняя копия: '))}<b>${esc(fmtDate(last))}</b>${info.persisted ? '' : ` · <span class="muted">${esc(t('Speicher nicht dauerhaft geschützt – App über „Zum Home-Bildschirm“ öffnen.', 'Хранилище не защищено от очистки — открывайте программу с экрана «Домой».'))}</span>`}</p>
        <div class="toolbar">${btn('backupNow', 'Sicherung speichern', 'Сохранить копию', 'primary')}${btn('loadBackupFile', 'Sicherung laden …', 'Загрузить копию …')}</div></div>
      <div class="section"><h3>Excel</h3>
        <p>${esc(t('Export: alle Tabellen als .xlsx (z. B. für den Bitroer). Import: liest das Blatt „Kontakt-Potenzial“ (vorhandene Namen werden aktualisiert).', 'Экспорт: все таблицы в .xlsx (например, для битроера). Импорт: читает лист «Kontakt-Potenzial» (существующие имена обновляются).'))}</p>
        <div class="toolbar">${btn('exportExcel', 'Nach Excel exportieren', 'Экспорт в Excel')}${btn('importExcel', 'Aus Excel importieren …', 'Импорт из Excel …')}</div></div>
      <div class="section"><h3>${L('Automatische Schnappschüsse', 'Автоматические снимки')}</h3>
        <p>${esc(t('Einmal pro Tag, vor Import und vor Wiederherstellung (die letzten 10, auf diesem Gerät). Hilft bei Fehlern, ersetzt aber nicht die Sicherung als Datei.', 'Раз в день, перед импортом и восстановлением (последние 10, на этом устройстве). Помогает при ошибках, но не заменяет копию файлом.'))}</p>
        <div class="backups">${backups.map(b => `<div><span>${esc(b.file)}</span><span><span class="muted">${Math.round(b.size / 1024)} KB</span> <button class="btn small" data-restore="${esc(b.id)}">${L('Wiederherstellen', 'Восстановить')}</button></span></div>`).join('') || `<div class="muted">${esc(t('Noch keine.', 'Пока нет.'))}</div>`}</div></div>
      <div class="section"><h3>${L('Programm', 'Программа')}</h3><p>${esc(t('Version', 'Версия'))} ${esc(info.version)} · ${esc(t('Datenbank-Version', 'Версия базы'))} ${info.schema}. ${esc(t('Updates werden automatisch geladen; die Daten bleiben erhalten.', 'Обновления загружаются автоматически, данные сохраняются.'))}</p>
        <div class="toolbar">${btn('checkUpdates', 'Nach Updates suchen', 'Проверить обновления')}${btn('resetDemo', 'Alles löschen und Beispieldaten laden', 'Удалить всё и загрузить примеры', 'danger')}</div></div>`;
    } else {
      body = `
      ${head('Daten & Backup', 'Данные и бэкап', 'Deine Daten gehören dir und liegen in einer eigenen Datei auf deinem Computer.', 'Ваши данные принадлежат вам и лежат в отдельном файле на вашем компьютере.')}
      <div class="section"><h3>${L('Speicherort der Datenbank', 'Где хранится база данных')}</h3>
        <p>${esc(t('Die Datei liegt außerhalb des Programms. Ein Update ersetzt nur das Programm – die Datei bleibt, wie sie ist. Vor jedem Update wird automatisch ein Backup erstellt.', 'Файл лежит отдельно от программы. Обновление заменяет только программу, файл остаётся как есть. Перед каждым обновлением автоматически делается бэкап.'))}</p>
        <p><code>${esc(info.dbPath)}</code> · ${esc(t('Datenbank-Version', 'Версия базы'))} ${info.schema} · ${esc(t('App-Version', 'Версия программы'))} ${esc(info.version)}</p>
        <div class="toolbar">${btn('openDataFolder', 'Ordner öffnen', 'Открыть папку')}${btn('chooseDb', 'Andere Datenbank-Datei öffnen …', 'Открыть другой файл базы …')}</div></div>
      <div class="section"><h3>Excel</h3>
        <p>${esc(t('Export: alle Tabellen als .xlsx (z. B. für den Bitroer). Import: liest das Blatt „Kontakt-Potenzial“ (Spalten wie in der Tabelle; vorhandene Namen werden aktualisiert).', 'Экспорт: все таблицы в .xlsx (например, для битроера). Импорт: читает лист «Kontakt-Potenzial» (колонки как в таблице, существующие имена обновляются).'))}</p>
        <div class="toolbar">${btn('exportExcel', 'Nach Excel exportieren', 'Экспорт в Excel', 'primary')}${btn('importExcel', 'Aus Excel importieren …', 'Импорт из Excel …')}</div></div>
      <div class="section"><h3>${L('Backups', 'Резервные копии')}</h3>
        <p>${esc(t('Automatisch bei jedem Start (die letzten 30 bleiben erhalten), vor jedem Update und vor jedem Import. Ordner „Backups“ neben der Datenbank.', 'Автоматически при каждом запуске (хранятся последние 30), перед каждым обновлением и импортом. Папка «Backups» рядом с базой.'))}</p>
        <div class="toolbar">${btn('backupNow', 'Backup jetzt erstellen', 'Сделать бэкап сейчас')}</div>
        <div class="backups">${backups.map(b => `<div><span>${esc(b.file)}</span><span><span class="muted">${Math.round(b.size / 1024)} KB</span> <button class="btn small" data-restore="${esc(b.file)}">${L('Wiederherstellen', 'Восстановить')}</button></span></div>`).join('') || `<div class="muted">${esc(t('Noch keine Backups.', 'Бэкапов пока нет.'))}</div>`}</div></div>
      <div class="section"><h3>${L('Updates', 'Обновления')}</h3><p>${esc(t('Die App prüft beim Start, ob es eine neue Version gibt, und installiert sie auf Wunsch. (Im Prototyp noch nicht aktiv.)', 'Программа при запуске проверяет новую версию и устанавливает её по желанию. (В прототипе ещё не включено.)'))}</p>
        <div class="toolbar">${btn('checkUpdates', 'Nach Updates suchen', 'Проверить обновления')}</div></div>`;
    }
    $('#main').innerHTML = body;
    document.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
      const a = b.dataset.a;
      if (a === 'resetDemo' && !b.classList.contains('confirm')) { b.classList.add('confirm'); b.textContent = t('Wirklich alles löschen? Nochmal tippen', 'Точно удалить всё? Нажмите ещё раз'); return; }
      try {
        const r = await call(a);
        if (a === 'exportExcel' && r) toast(t('Gespeichert: ', 'Сохранено: ') + r);
        else if (a === 'importExcel' && r) toast(t(`Import: ${r.added} neu, ${r.updated} aktualisiert`, `Импорт: ${r.added} новых, ${r.updated} обновлено`));
        else if (a === 'backupNow' && r) toast(web ? t('Sicherung gespeichert', 'Копия сохранена') : t('Backup erstellt', 'Бэкап создан'));
        else if (a === 'loadBackupFile' && r) toast(t('Sicherung geladen', 'Копия загружена'));
        else if (a === 'checkUpdates') toast(r && r.message ? r.message : t('Prototyp: Update-Kanal noch nicht eingerichtet.', 'Прототип: канал обновлений ещё не настроен.'));
        else if (a === 'chooseDb' && r) toast(t('Datenbank geöffnet', 'База открыта'));
        viewDaten(); refreshCounts(); renderBanner();
      } catch (e) { /* Hinweis schon gezeigt */ }
    });
    document.querySelectorAll('[data-restore]').forEach(b => b.onclick = () => armRestore(b));
  }
  // Erinnerung (nur Web/iPad): Sicherung älter als 7 Tage
  async function renderBanner() {
    const el = $('#banner'); if (!el) return;
    if (api.mode !== 'web' || !window.PP_PWA) { el.hidden = true; return; }
    const last = await call('lastExport');
    const due = !last || (Date.now() - new Date(last).getTime()) > 7 * 86400000;
    el.hidden = !due;
    el.innerHTML = due ? `<span>${esc(t('Letzte Sicherung ist älter als 7 Tage. Bitte jetzt als Datei sichern.', 'Последней копии больше 7 дней. Сохраните копию файлом.'))}</span><button class="btn small primary" id="bannerBtn">${L('Sicherung speichern', 'Сохранить копию')}</button>` : '';
    const b = $('#bannerBtn'); if (b) b.onclick = async () => { try { const r = await call('backupNow'); if (r) toast(t('Sicherung gespeichert', 'Копия сохранена')); renderBanner(); } catch (e) { /* */ } };
  }
  const ru2 = (de, ru) => t(de, ru);
  function armRestore(b) {
    if (!b.classList.contains('danger')) { b.classList.add('danger'); b.textContent = t('Sicher? Nochmal klicken', 'Точно? Нажмите ещё раз'); return; }
    call('restoreBackup', b.dataset.restore).then(() => { toast(t('Backup wiederhergestellt', 'Бэкап восстановлен')); viewDaten(); refreshCounts(); });
  }
  async function refreshCounts() { state.contacts = await call('listContacts'); refreshNav(); }

  // ---------- Start ----------
  (async function start() {
    try {
      try { const l = localStorage.getItem('pp-lang'); if (l === 'de' || l === 'ru') lang = l; const th = localStorage.getItem('pp-theme'); if (th === 'light' || th === 'dark') theme = th; } catch (e) { /* */ }
      applyTheme();
      api = await makeApi();
      const st = await call('getSettings');
      if (st.lang === 'de' || st.lang === 'ru') lang = st.lang;
      if (st.theme === 'light' || st.theme === 'dark') { theme = st.theme; applyTheme(); }
      document.documentElement.lang = lang;
      info = await call('info');
      if (!info.products && window.Core) info.products = window.Core.PRODUCT_GROUPS;
      renderSide();
      await render();
      renderBanner();
    } catch (e) {
      $('#main').innerHTML = `<div class="loading">${esc(t('Fehler beim Start: ', 'Ошибка запуска: '))}${esc(e.message || e)}</div>`;
    }
  })();
})();
