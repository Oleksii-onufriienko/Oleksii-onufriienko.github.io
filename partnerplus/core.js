/*
 * Partner+ – Datenlogik (gemeinsam für Electron-Hauptprozess und Browser-Vorschau).
 * Arbeitet auf einer sql.js-Datenbank. Schema-Änderungen NUR über MIGRATIONS (nie bestehende ändern),
 * damit Updates die Daten der Nutzer nie verlieren.
 */
(function (root) {
  'use strict';

  const PRODUCT_GROUPS = [
    { group: 'Leben', ru: 'Жизнь', items: ['Riester', 'Rürup', 'BAV', 'RisikoLV', 'MZP', 'VASP'] },
    { group: 'Gesundheit', ru: 'Здоровье', items: ['BU', 'GF', 'GKV', 'KV Zusatz', 'PKV'] },
    { group: 'Bank & Bausparen / Wohnen', ru: 'Банк, стройсбережения, жильё', items: ['Depot', 'Sparplan', 'Gold', 'Konto', 'Sparbuch AK', 'Privatkredit', 'Baufi', 'Bausparen'] },
    { group: 'Sach (Privat)', ru: 'Имущество (частное)', items: ['VSP', 'KFZ', 'Young & Drive', 'Young & Home', 'Young & Life', 'Wohngebäude', 'Rechtsschutz'] },
    { group: 'Sach (Firmen)', ru: 'Имущество (фирмы)', items: ['B-Haftpflicht', 'Inhaltsvers.', 'GKM', 'Firmen-RS'] },
  ];
  const PRODUCTS = PRODUCT_GROUPS.flatMap(g => g.items);

  const SELEKTION = [
    { key: 'R', color: '#e03131', label: 'Heißer Kontakt', ru: 'Горячий контакт' },
    { key: 'B', color: '#1c6dd0', label: 'Autorität', ru: 'Авторитет' },
    { key: 'G', color: '#2f9e44', label: 'Potenzieller Partner', ru: 'Потенциальный партнёр' },
    { key: 'O', color: '#f08c00', label: 'Starker potenzieller Partner', ru: 'Сильный потенциальный партнёр' },
  ];

  const MIGRATIONS = [
    // v1 – Grundschema
    `
    CREATE TABLE contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      selektion TEXT NOT NULL DEFAULT '',
      alter_ INTEGER,
      beruf TEXT DEFAULT '',
      taetigkeit TEXT DEFAULT '',
      bezug TEXT DEFAULT '',
      eigenkontakt INTEGER DEFAULT 0,
      empf_von TEXT DEFAULT '',
      lp INTEGER DEFAULT 0,
      kinder TEXT DEFAULT '',
      telefon TEXT DEFAULT '',
      kundenseminar INTEGER DEFAULT 0,
      bis INTEGER DEFAULT 0,
      efs INTEGER DEFAULT 0,
      kunde INTEGER DEFAULT 0,
      vip_vm INTEGER DEFAULT 0,
      bemerkungen TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE kunden_info (
      contact_id INTEGER PRIMARY KEY REFERENCES contacts(id) ON DELETE CASCADE,
      vm_name TEXT DEFAULT '',
      letzter TEXT DEFAULT '',
      naechster TEXT DEFAULT '',
      grund TEXT DEFAULT '',
      empf_kunden INTEGER DEFAULT 0,
      empf_partner INTEGER DEFAULT 0,
      empf_vip INTEGER DEFAULT 0
    );
    CREATE TABLE kunden_products (
      contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
      product TEXT NOT NULL,
      PRIMARY KEY (contact_id, product)
    );
    CREATE TABLE bis_gaeste (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
      datum TEXT DEFAULT '',
      bis INTEGER DEFAULT 0,
      efs INTEGER DEFAULT 0,
      berufsstart INTEGER DEFAULT 0,
      gespraech_eltern INTEGER DEFAULT 0,
      bereits_kunde INTEGER DEFAULT 0,
      eigene_ffg INTEGER DEFAULT 0,
      kunde_geworden INTEGER DEFAULT 0,
      empfehlungen INTEGER DEFAULT 0,
      vip_kunde INTEGER DEFAULT 0
    );
    CREATE TABLE ffg_plan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
      angerufen INTEGER DEFAULT 0,
      termin INTEGER DEFAULT 0,
      ffg_done INTEGER DEFAULT 0,
      notiz TEXT DEFAULT ''
    );
    CREATE TABLE umsatz (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      kunde TEXT DEFAULT '',
      policiert REAL DEFAULT 0,
      pot REAL DEFAULT 0
    );
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    `,
    // v2 – Wochenplan (wie „Karriere Start“, S. 18)
    `
    CREATE TABLE wochenplan (
      year INTEGER NOT NULL,
      week INTEGER NOT NULL,
      day INTEGER NOT NULL,
      slot INTEGER NOT NULL,
      kind TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (year, week, day, slot)
    );
    `,
    // v3 – Kommentar je Wochenplan-Feld
    `ALTER TABLE wochenplan ADD COLUMN comment TEXT NOT NULL DEFAULT '';`,
    // v4, v5 … hier anhängen (z. B. ALTER TABLE contacts ADD COLUMN …)
  ];

  const CONTACT_FIELDS = ['name', 'selektion', 'alter_', 'beruf', 'taetigkeit', 'bezug', 'eigenkontakt', 'empf_von', 'lp', 'kinder', 'telefon', 'kundenseminar', 'bis', 'efs', 'kunde', 'vip_vm', 'bemerkungen'];
  const KINFO_FIELDS = ['vm_name', 'letzter', 'naechster', 'grund', 'empf_kunden', 'empf_partner', 'empf_vip'];
  const GAST_FIELDS = ['datum', 'bis', 'efs', 'berufsstart', 'gespraech_eltern', 'bereits_kunde', 'eigene_ffg', 'kunde_geworden', 'empfehlungen', 'vip_kunde'];
  const FFG_FIELDS = ['angerufen', 'termin', 'ffg_done', 'notiz'];
  const UMSATZ_FIELDS = ['kunde', 'policiert', 'pot', 'month', 'year'];

  function Core(db) {
    this.db = db;
    db.run('PRAGMA foreign_keys = ON');
  }

  Core.MIGRATIONS = MIGRATIONS;
  Core.PRODUCT_GROUPS = PRODUCT_GROUPS;
  Core.PRODUCTS = PRODUCTS;
  Core.SELEKTION = SELEKTION;

  Core.prototype.all = function (sql, params) {
    const st = this.db.prepare(sql);
    if (params) st.bind(params);
    const rows = [];
    while (st.step()) rows.push(st.getAsObject());
    st.free();
    return rows;
  };
  Core.prototype.one = function (sql, params) { return this.all(sql, params)[0]; };
  Core.prototype.run = function (sql, params) { this.db.run(sql, params || []); };
  Core.prototype.lastId = function () { return this.one('SELECT last_insert_rowid() AS id').id; };

  Core.prototype.schemaVersion = function () { return this.one('PRAGMA user_version').user_version; };

  /** Führt fehlende Migrationen aus. Gibt {from,to} zurück. */
  Core.prototype.migrate = function () {
    const from = this.schemaVersion();
    for (let v = from; v < MIGRATIONS.length; v++) {
      this.db.exec('BEGIN');
      try {
        this.db.exec(MIGRATIONS[v]);
        this.db.exec(`PRAGMA user_version = ${v + 1}`);
        this.db.exec('COMMIT');
      } catch (e) { this.db.exec('ROLLBACK'); throw e; }
    }
    return { from, to: MIGRATIONS.length };
  };

  function pick(obj, fields) {
    const o = {};
    for (const f of fields) if (obj[f] !== undefined) o[f] = obj[f];
    return o;
  }
  function upsert(core, table, fields, obj, keyCol) {
    keyCol = keyCol || 'id';
    const data = pick(obj, fields);
    const cols = Object.keys(data);
    if (obj[keyCol]) {
      if (cols.length) core.run(`UPDATE ${table} SET ${cols.map(c => `${c}=?`).join(',')} WHERE ${keyCol}=?`, [...cols.map(c => data[c]), obj[keyCol]]);
      return obj[keyCol];
    }
    core.run(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map(c => data[c]));
    return core.lastId();
  }

  // ---------- Kontakt-Potenzial ----------
  Core.prototype.listContacts = function () {
    return this.all('SELECT * FROM contacts ORDER BY id DESC');
  };
  Core.prototype.saveContact = function (c) {
    if (c.alter_ === '') c.alter_ = null;
    const id = upsert(this, 'contacts', CONTACT_FIELDS, c);
    this.run("UPDATE contacts SET updated_at = datetime('now') WHERE id=?", [id]);
    return this.one('SELECT * FROM contacts WHERE id=?', [id]);
  };
  Core.prototype.deleteContact = function (id) { this.run('DELETE FROM contacts WHERE id=?', [id]); return true; };

  // ---------- Kundenbestand ----------
  Core.prototype.listKunden = function () {
    const rows = this.all(`SELECT c.id, c.name, c.vip_vm, k.* FROM contacts c LEFT JOIN kunden_info k ON k.contact_id=c.id WHERE c.kunde=1 ORDER BY c.name`);
    const prods = this.all('SELECT contact_id, product FROM kunden_products');
    const map = {};
    for (const p of prods) (map[p.contact_id] = map[p.contact_id] || []).push(p.product);
    return rows.map(r => Object.assign(r, { id: r.id || r.contact_id, products: map[r.id] || [] }));
  };
  Core.prototype.setProduct = function (contactId, product, on) {
    if (on) this.run('INSERT OR IGNORE INTO kunden_products (contact_id, product) VALUES (?,?)', [contactId, product]);
    else this.run('DELETE FROM kunden_products WHERE contact_id=? AND product=?', [contactId, product]);
    return true;
  };
  Core.prototype.saveKundenInfo = function (o) {
    this.run('INSERT OR IGNORE INTO kunden_info (contact_id) VALUES (?)', [o.contact_id]);
    upsert(this, 'kunden_info', KINFO_FIELDS, o, 'contact_id');
    return true;
  };

  // ---------- BIS-Gäste ----------
  Core.prototype.findOrCreateContact = function (name) {
    name = (name || '').trim();
    const ex = this.one('SELECT id FROM contacts WHERE lower(name)=lower(?)', [name]);
    if (ex) return ex.id;
    this.run('INSERT INTO contacts (name) VALUES (?)', [name]);
    return this.lastId();
  };
  Core.prototype.listGaeste = function () {
    return this.all('SELECT g.*, c.name, c.telefon FROM bis_gaeste g JOIN contacts c ON c.id=g.contact_id ORDER BY g.datum DESC, g.id DESC');
  };
  Core.prototype.addGast = function (name, datum) {
    const cid = this.findOrCreateContact(name);
    this.run('INSERT INTO bis_gaeste (contact_id, datum) VALUES (?,?)', [cid, datum || '']);
    return this.lastId();
  };
  Core.prototype.saveGast = function (g) {
    upsert(this, 'bis_gaeste', GAST_FIELDS, g);
    // Status in den Kontakt übernehmen (eine Person = ein Datensatz)
    const row = this.one('SELECT * FROM bis_gaeste WHERE id=?', [g.id]);
    if (row) {
      if (row.bis) this.run('UPDATE contacts SET bis=1 WHERE id=?', [row.contact_id]);
      if (row.efs) this.run('UPDATE contacts SET efs=1 WHERE id=?', [row.contact_id]);
      if (row.kunde_geworden || row.bereits_kunde) this.run('UPDATE contacts SET kunde=1 WHERE id=?', [row.contact_id]);
    }
    return true;
  };
  Core.prototype.deleteGast = function (id) { this.run('DELETE FROM bis_gaeste WHERE id=?', [id]); return true; };

  // ---------- Potenzial FFG (Monatsliste) ----------
  Core.prototype.listFfg = function (year, month) {
    return this.all('SELECT f.*, c.name, c.telefon, c.selektion FROM ffg_plan f JOIN contacts c ON c.id=f.contact_id WHERE f.year=? AND f.month=? ORDER BY f.id', [year, month]);
  };
  Core.prototype.addFfg = function (year, month, ids) {
    for (const id of ids) {
      const ex = this.one('SELECT id FROM ffg_plan WHERE year=? AND month=? AND contact_id=?', [year, month, id]);
      if (!ex) this.run('INSERT INTO ffg_plan (year, month, contact_id) VALUES (?,?,?)', [year, month, id]);
    }
    return true;
  };
  Core.prototype.saveFfg = function (f) { upsert(this, 'ffg_plan', FFG_FIELDS, f); return true; };
  Core.prototype.deleteFfg = function (id) { this.run('DELETE FROM ffg_plan WHERE id=?', [id]); return true; };

  // ---------- Umsatzplanung ----------
  Core.prototype.listUmsatz = function (year) {
    return this.all('SELECT * FROM umsatz WHERE year=? ORDER BY month, id', [year]);
  };
  Core.prototype.saveUmsatz = function (u) { return upsert(this, 'umsatz', UMSATZ_FIELDS, u); };
  Core.prototype.deleteUmsatz = function (id) { this.run('DELETE FROM umsatz WHERE id=?', [id]); return true; };

  // ---------- Wochenplan ----------
  Core.prototype.getWeek = function (year, week) {
    return this.all('SELECT day, slot, kind, text, comment FROM wochenplan WHERE year=? AND week=?', [year, week]);
  };
  /** cells: [{day, slot, kind, text, comment}] – ganz leer löscht die Zelle */
  Core.prototype.setSlots = function (year, week, cells) {
    for (const c of cells) {
      if (!c.kind && !c.text && !c.comment) this.run('DELETE FROM wochenplan WHERE year=? AND week=? AND day=? AND slot=?', [year, week, c.day, c.slot]);
      else this.run('INSERT INTO wochenplan (year, week, day, slot, kind, text, comment) VALUES (?,?,?,?,?,?,?) ON CONFLICT(year, week, day, slot) DO UPDATE SET kind=excluded.kind, text=excluded.text, comment=excluded.comment', [year, week, c.day, c.slot, c.kind || '', c.text || '', c.comment || '']);
    }
    return true;
  };
  Core.prototype.clearWeek = function (year, week) { this.run('DELETE FROM wochenplan WHERE year=? AND week=?', [year, week]); return true; };

  // ---------- Einstellungen ----------
  Core.prototype.getSettings = function () {
    const o = { provisionsstufe: '9', auszahlung: '90', ffg_ziel: '20' };
    for (const r of this.all('SELECT key, value FROM settings')) o[r.key] = r.value;
    return o;
  };
  Core.prototype.saveSetting = function (key, value) {
    this.run('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, String(value)]);
    return true;
  };

  // ---------- Auswertung ----------
  Core.prototype.stats = function (year) {
    const c = this.all('SELECT * FROM contacts');
    const n = c.length;
    const cnt = f => c.filter(f).length;
    const funnel = [
      { label: 'Kontakte', value: n },
      { label: 'Kundenseminar', value: cnt(x => x.kundenseminar) },
      { label: 'BIS', value: cnt(x => x.bis) },
      { label: 'EFS', value: cnt(x => x.efs) },
      { label: 'Kunde', value: cnt(x => x.kunde) },
      { label: 'VIP / VM', value: cnt(x => x.vip_vm) },
    ];
    const quelle = { eigen: cnt(x => x.eigenkontakt), empf: cnt(x => (x.empf_von || '').trim()), ohne: cnt(x => !x.eigenkontakt && !(x.empf_von || '').trim()) };
    const refMap = {};
    for (const x of c) { const r = (x.empf_von || '').trim(); if (r) refMap[r] = (refMap[r] || 0) + 1; }
    const referrer = Object.entries(refMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    const selektion = SELEKTION.map(s => ({ key: s.key, label: s.label, ru: s.ru, color: s.color, value: cnt(x => (x.selektion || '').includes(s.key)) }));
    const ohneSel = cnt(x => !x.selektion);

    const ums = this.all('SELECT month, SUM(policiert) AS pol, SUM(pot) AS pot, COUNT(*) AS n FROM umsatz WHERE year=? GROUP BY month', [year]);
    const umsatz = Array.from({ length: 12 }, (_, i) => {
      const r = ums.find(u => u.month === i + 1) || {};
      return { month: i + 1, policiert: r.pol || 0, pot: r.pot || 0 };
    });
    const ffgRows = this.all('SELECT month, COUNT(*) AS geplant, SUM(angerufen) AS angerufen, SUM(termin) AS termin, SUM(ffg_done) AS done FROM ffg_plan WHERE year=? GROUP BY month', [year]);
    const ffg = Array.from({ length: 12 }, (_, i) => {
      const r = ffgRows.find(u => u.month === i + 1) || {};
      return { month: i + 1, geplant: r.geplant || 0, angerufen: r.angerufen || 0, termin: r.termin || 0, done: r.done || 0 };
    });

    const kunden = this.listKunden();
    const coverage = PRODUCTS.map(p => ({ product: p, value: kunden.filter(k => k.products.includes(p)).length }));
    const gaeste = this.all('SELECT * FROM bis_gaeste');

    // Schwachstellen – einfache Regeln (Annahmen, mit Bitroer abstimmen)
    const hints = [];
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
    if (n && pct(quelle.empf, n) < 30) hints.push({ de: `Nur ${pct(quelle.empf, n)} % der Kontakte kommen aus Empfehlungen. Ziel: mehr Empfehlungen pro Gespräch abfragen.`, ru: `Только ${pct(quelle.empf, n)} % контактов пришли по рекомендации. Цель: на каждой встрече спрашивать рекомендации.` });
    if (n && ohneSel > n * 0.3) hints.push({ de: `${ohneSel} Kontakte haben noch keine Selektion. Mit dem Bitroer durchgehen und markieren.`, ru: `У ${ohneSel} контактов нет селекции. Пройти их вместе с битроером и отметить.` });
    const bis = funnel[2].value, efs = funnel[3].value;
    if (bis && pct(efs, bis) < 60) hints.push({ de: `Von ${bis} BIS-Teilnehmern waren nur ${efs} im EFS (${pct(efs, bis)} %). Nachverfolgung nach dem BIS verbessern.`, ru: `Из ${bis} участников BIS только ${efs} дошли до EFS (${pct(efs, bis)} %). Улучшить работу после BIS.` });
    const noPhone = cnt(x => !(x.telefon || '').trim());
    if (noPhone) hints.push({ de: `${noPhone} Kontakte ohne Telefonnummer.`, ru: `${noPhone} контактов без номера телефона.` });
    if (kunden.length) {
      const weak = coverage.filter(x => ['BU', 'Riester', 'BAV', 'Rechtsschutz', 'VSP'].includes(x.product)).sort((a, b) => a.value - b.value)[0];
      if (weak && pct(weak.value, kunden.length) < 40) hints.push({ de: `Nur ${weak.value} von ${kunden.length} Kunden haben ${weak.product}. Gute Liste für Service-Termine.`, ru: `Только у ${weak.value} из ${kunden.length} клиентов есть ${weak.product}. Хороший список для сервисных встреч.` });
    }
    const now = new Date();
    const curM = year === now.getFullYear() ? now.getMonth() + 1 : 12;
    const f = ffg[curM - 1];
    const ziel = parseInt(this.getSettings().ffg_ziel, 10) || 20;
    if (f.geplant < ziel) hints.push({ de: `Potenzial FFG ${monthName(curM)}: ${f.geplant} von ${ziel} Kontakten geplant.`, ru: `Потенциал FFG, ${MONTHS_RU[curM - 1]}: запланировано ${f.geplant} из ${ziel} контактов.` });

    return { total: n, funnel, quelle, referrer, selektion, ohneSel, umsatz, ffg, coverage, kundenCount: kunden.length, gaesteCount: gaeste.length, hints };
  };

  const MONTHS_RU = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  function monthName(m) { return ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'][m - 1]; }
  Core.monthName = monthName;

  // ---------- Beispieldaten (frei erfunden) ----------
  Core.prototype.seed = function (year) {
    if (this.one('SELECT COUNT(*) AS n FROM contacts').n > 0) return false;
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const pickr = a => a[Math.floor(rnd() * a.length)];
    const nach = ['Schneider', 'Fischer', 'Weber', 'Becker', 'Hoffmann', 'Koch', 'Richter', 'Wolf', 'Neumann', 'Braun', 'Zimmermann', 'Krüger', 'Hartmann', 'Lange', 'Werner', 'Krause', 'Lehmann', 'Köhler', 'Huber', 'Kaiser', 'Fuchs', 'Peters', 'Scholz', 'Möller', 'Jung', 'Hahn', 'Vogel', 'Keller', 'Roth', 'Frank', 'Berger', 'Winkler', 'Lorenz', 'Baumann', 'Albrecht', 'Ludwig', 'Simon', 'Böhm', 'Franke', 'Schuster', 'Kraus', 'Engel', 'Horn', 'Sommer', 'Brandt'];
    const vor = ['Anna', 'Lukas', 'Sophie', 'Leon', 'Marie', 'Jonas', 'Laura', 'Finn', 'Julia', 'Paul', 'Lena', 'Elias', 'Sarah', 'Noah', 'Lisa', 'Ben', 'Katharina', 'Tim', 'Nina', 'David', 'Olga', 'Dmitri', 'Irina', 'Alexander', 'Natalia', 'Sergej', 'Elena', 'Viktor'];
    const berufe = [['Ingenieur', 'Ingenieur'], ['Bürokauffrau', 'Teamleitung'], ['Krankenpfleger', 'Pflege'], ['Student BWL', 'Werkstudent'], ['Erzieherin', 'Erzieherin'], ['Elektriker', 'Selbstständig'], ['Lehrerin', 'Lehrerin'], ['Informatiker', 'Entwickler'], ['Einzelhandel', 'Filialleitung'], ['Ärztin', 'Assistenzärztin'], ['Mechatroniker', 'Hausmeister'], ['Azubi Bank', 'Azubi']];
    const bezuege = ['Bruder', 'Schwester', 'Cousin', 'Freund', 'Freundin', 'Arbeitskollege', 'Nachbar', 'Sportverein', 'Studienkollege', 'Bekannte', 'Kunde von Kollege'];
    const bem = ['Will Haus kaufen', 'Erstes Kind unterwegs', 'Sucht neuen Job', 'Hat schon Depot bei Bank', 'Interesse an Altersvorsorge', 'Unzufrieden mit KFZ-Versicherung', 'Heiratet im Sommer', 'Selbstständig seit 2025', 'Zieht nach München', 'Sehr kommunikativ, viele Kontakte', '', '', ''];
    const names = [];
    for (let i = 0; i < 48; i++) {
      let nm; do { nm = `${pickr(nach)}, ${pickr(vor)}`; } while (names.includes(nm));
      names.push(nm);
    }
    const referrers = names.slice(0, 6);
    names.forEach((nm, i) => {
      const [beruf, tat] = pickr(berufe);
      const eigen = rnd() < 0.62;
      const empf = !eigen || rnd() < 0.1 ? pickr(referrers.filter(r => r !== nm)) : '';
      const sel = SELEKTION.filter(() => rnd() < 0.27).map(x => x.key).join('');
      const ks = rnd() < 0.35, bis = rnd() < 0.4, efs = bis && rnd() < 0.55, kunde = rnd() < 0.42, vip = kunde && rnd() < 0.2;
      const age = 19 + Math.floor(rnd() * 38);
      const kids = age > 29 && rnd() < 0.45 ? (rnd() < 0.5 ? `${2 + Math.floor(rnd() * 8)} J.` : `${1 + Math.floor(rnd() * 5)} / ${6 + Math.floor(rnd() * 8)} J.`) : '';
      const tel = rnd() < 0.9 ? `01${pickr(['51', '57', '60', '70', '72', '76'])} ${1000000 + Math.floor(rnd() * 8999999)}` : '';
      this.run(`INSERT INTO contacts (name, selektion, alter_, beruf, taetigkeit, bezug, eigenkontakt, empf_von, lp, kinder, telefon, kundenseminar, bis, efs, kunde, vip_vm, bemerkungen) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [nm, sel, age, beruf, tat, pickr(bezuege), eigen ? 1 : 0, empf, rnd() < 0.4 ? 1 : 0, kids, tel, ks ? 1 : 0, bis ? 1 : 0, efs ? 1 : 0, kunde ? 1 : 0, vip ? 1 : 0, pickr(bem)]);
      const id = this.lastId();
      if (kunde) {
        const m1 = 1 + Math.floor(rnd() * 10), m2 = Math.min(12, m1 + 3 + Math.floor(rnd() * 6));
        this.run('INSERT INTO kunden_info (contact_id, vm_name, letzter, naechster, grund, empf_kunden, empf_partner, empf_vip) VALUES (?,?,?,?,?,?,?,?)',
          [id, pickr(['A. Petrova', 'M. Schulz']), `${year}-${String(m1).padStart(2, '0')}-1${Math.floor(rnd() * 9)}`, `${m2 > 12 ? year + 1 : year}-${String(m2).padStart(2, '0')}-0${1 + Math.floor(rnd() * 8)}`, pickr(['Jahresgespräch', 'BU prüfen', 'Baufi-Angebot', 'Kind geboren', 'Gehaltserhöhung']), Math.floor(rnd() * 4), Math.floor(rnd() * 2), rnd() < 0.15 ? 1 : 0]);
        for (const p of PRODUCTS) {
          const base = { Riester: 0.3, BAV: 0.35, BU: 0.3, GKV: 0.7, Konto: 0.6, Sparplan: 0.45, KFZ: 0.55, VSP: 0.5, Rechtsschutz: 0.35, Depot: 0.3, Bausparen: 0.25, Wohngebäude: 0.15 }[p] || 0.06;
          if (rnd() < base) this.run('INSERT INTO kunden_products (contact_id, product) VALUES (?,?)', [id, p]);
        }
      }
      if (bis) {
        const m = 1 + Math.floor(rnd() * 11);
        this.run('INSERT INTO bis_gaeste (contact_id, datum, bis, efs, berufsstart, gespraech_eltern, bereits_kunde, eigene_ffg, kunde_geworden, empfehlungen, vip_kunde) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
          [id, `${year}-${String(m).padStart(2, '0')}-${String(5 + Math.floor(rnd() * 20)).padStart(2, '0')}`, 1, efs ? 1 : 0, rnd() < 0.3 ? 1 : 0, rnd() < 0.4 ? 1 : 0, kunde && rnd() < 0.5 ? 1 : 0, rnd() < 0.5 ? 1 : 0, kunde ? 1 : 0, Math.floor(rnd() * 5), vip ? 1 : 0]);
      }
    });
    // Umsatz Jan..aktueller Monat
    const cm = new Date().getFullYear() === year ? new Date().getMonth() + 1 : 12;
    const kundenNames = this.all('SELECT name FROM contacts WHERE kunde=1').map(r => r.name);
    for (let m = 1; m <= 12; m++) {
      const k = m <= cm ? 3 + Math.floor(rnd() * 6) : 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < k; i++) {
        const pot = 20 + Math.floor(rnd() * 120);
        const pol = m <= cm ? (rnd() < 0.65 ? Math.round(pot * (0.5 + rnd() * 0.6)) : 0) : 0;
        this.run('INSERT INTO umsatz (year, month, kunde, policiert, pot) VALUES (?,?,?,?,?)', [year, m, pickr(kundenNames), pol, pot]);
      }
    }
    // Potenzial FFG für die letzten Monate
    const ids = this.all('SELECT id FROM contacts WHERE kunde=0').map(r => r.id);
    for (let m = Math.max(1, cm - 3); m <= cm; m++) {
      const k = m === cm ? 12 : 15 + Math.floor(rnd() * 6);
      const chosen = ids.slice().sort(() => rnd() - 0.5).slice(0, k);
      for (const id of chosen) {
        const a = m < cm ? rnd() < 0.85 : rnd() < 0.4, t = a && rnd() < 0.5, d = t && (m < cm ? rnd() < 0.8 : rnd() < 0.3);
        this.run('INSERT INTO ffg_plan (year, month, contact_id, angerufen, termin, ffg_done) VALUES (?,?,?,?,?,?)', [year, m, id, a ? 1 : 0, t ? 1 : 0, d ? 1 : 0]);
      }
    }
    // Wochenplan: aktuelle Woche wie die Beispielwoche im Heft, mit ein paar Kommentaren
    const d0 = new Date(); const x = new Date(Date.UTC(d0.getFullYear(), d0.getMonth(), d0.getDate()));
    x.setUTCDate(x.getUTCDate() + 4 - (x.getUTCDay() || 7));
    const wYear = x.getUTCFullYear(), wNo = Math.ceil(((x - Date.UTC(wYear, 0, 1)) / 86400000 + 1) / 7);
    const M = 'morgen', A = 'abend', F = 'frei', W = 'meeting', K = 'konzepte', T = 'termine', Tr = 'training', Ak = 'akquise', P = 'partner';
    const plan = [
      [M, W, W, K, K, K, T, T, Tr, Tr, T, T, A],
      [M, F, K, K, Tr, Tr, P, P, T, T, ['vm', '18:30 VM Schulung'], ['vba', '19:30 VBA Schulung'], A],
      [M, F, 'fach', 'fach', Tr, Tr, Ak, Ak, T, T, T, T, A],
      [M, F, Tr, Tr, Ak, Ak, K, K, T, T, T, T, A],
      [M, F, 'schulung', 'schulung', Ak, Ak, Tr, Tr, T, T, T, T, A],
      [M, F, 'ausbildung', 'ausbildung', 'planung', Tr, Tr, Ak, Ak, Ak, T, T, A],
      [M, F, F, F, F, F, F, F, F, F, F, F, A],
    ];
    const notes = { '0-6': 'Familie Weber – Baufi-Angebot besprechen', '2-8': 'Jahresgespräch Huber, Jonas', '3-4': '10 Anrufe aus Potenzial FFG', '4-10': 'Termin mit Empfehlung von Baumann, Ben' };
    plan.forEach((day, d) => day.forEach((v, s) => {
      const kind = Array.isArray(v) ? v[0] : v, text = Array.isArray(v) ? v[1] : '';
      this.run('INSERT INTO wochenplan (year, week, day, slot, kind, text, comment) VALUES (?,?,?,?,?,?,?)', [wYear, wNo, d, s, kind, text, notes[`${d}-${s}`] || '']);
    }));
    return true;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  else root.Core = Core;
})(typeof self !== 'undefined' ? self : this);
