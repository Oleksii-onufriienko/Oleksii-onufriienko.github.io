/* Partner+ – Excel-Export/-Import (gemeinsam für Desktop und iPad-/Web-Version) */
(function (root) {
  'use strict';
  function build(core, Core, ExcelJS) {
    const wb = new ExcelJS.Workbook();
    const head = ws => { ws.getRow(1).font = { bold: true }; ws.views = [{ state: 'frozen', ySplit: 1 }]; ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } }; };
    const x = v => (v ? 'x' : '');
    const selTxt = s => Core.SELEKTION.filter(o => (s || '').includes(o.key)).map(o => o.label).join(', ');

    let ws = wb.addWorksheet('Kontakt-Potenzial');
    ws.columns = ['Name, Vorname', 'Selektion', 'Alter', 'Beruf / Ausbildung', 'Aktuelle Tätigkeit', 'Bezug zur Person', 'Eigenkontakt', 'Empf. von', 'LP', 'Kinder (Alter)', 'Telefon', 'Kund. Seminar', 'BIS', 'EFS', 'Kunde', 'VIP / VM', 'Bemerkungen'].map(h => ({ header: h, width: Math.max(10, h.length + 4) }));
    for (const c of core.listContacts()) ws.addRow([c.name, selTxt(c.selektion), c.alter_, c.beruf, c.taetigkeit, c.bezug, x(c.eigenkontakt), c.empf_von, x(c.lp), c.kinder, c.telefon, x(c.kundenseminar), x(c.bis), x(c.efs), x(c.kunde), x(c.vip_vm), c.bemerkungen]);
    head(ws);

    ws = wb.addWorksheet('Kundenbestand');
    ws.columns = ['Name, Vorname', 'VM Name', ...Core.PRODUCTS, 'Letzter', 'Nächster', 'Grund', 'Empf. Kunden', 'Empf. Partner', 'Empf. VIP'].map(h => ({ header: h, width: Math.max(8, h.length + 3) }));
    for (const k of core.listKunden()) ws.addRow([k.name, k.vm_name, ...Core.PRODUCTS.map(p => x(k.products.includes(p))), k.letzter, k.naechster, k.grund, k.empf_kunden, k.empf_partner, k.empf_vip]);
    head(ws);

    ws = wb.addWorksheet('BIS-Gäste');
    ws.columns = ['Name, Vorname', 'Datum', 'BIS', 'EFS', 'Berufsstart', 'Gespräch Eltern/LP', 'Bereits Kunde', 'Eigene FFG', 'Kunde geworden', 'Empfehlungen (Anzahl)', 'VIP Kunde', 'Tel.Nr.'].map(h => ({ header: h, width: Math.max(10, h.length + 3) }));
    for (const g of core.listGaeste()) ws.addRow([g.name, g.datum, x(g.bis), x(g.efs), x(g.berufsstart), x(g.gespraech_eltern), x(g.bereits_kunde), x(g.eigene_ffg), x(g.kunde_geworden), g.empfehlungen, x(g.vip_kunde), g.telefon]);
    head(ws);

    const year = new Date().getFullYear();
    ws = wb.addWorksheet('Potenzial FFG');
    ws.columns = ['Monat', 'Name, Vorname', 'Telefon', 'Angerufen', 'Termin', 'FFG geführt', 'Notiz'].map(h => ({ header: h, width: 16 }));
    for (let m = 1; m <= 12; m++) for (const f of core.listFfg(year, m)) ws.addRow([Core.monthName(m), f.name, f.telefon, x(f.angerufen), x(f.termin), x(f.ffg_done), f.notiz]);
    head(ws);

    ws = wb.addWorksheet('Umsatzplanung');
    ws.columns = ['Monat', 'Kunde', 'Policiert', 'Pot.'].map(h => ({ header: h, width: 18 }));
    for (const u of core.listUmsatz(year)) ws.addRow([Core.monthName(u.month), u.kunde, u.policiert, u.pot]);
    head(ws);


    // Wochenplan (aktuelles Jahr, alle geplanten Wochen)
    const wp = core.all('SELECT * FROM wochenplan WHERE year=? ORDER BY week, day, slot', [year]);
    if (wp.length) {
      const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
      const SLOTS = ['Vor 09:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', 'Nach 20:00'];
      ws = wb.addWorksheet('Wochenplan');
      ws.columns = ['KW', 'Tag', 'Zeit', 'Block', 'Text', 'Kommentar'].map(h => ({ header: h, width: h === 'Kommentar' ? 40 : 16 }));
      for (const r of wp) ws.addRow([r.week, DAYS[r.day], SLOTS[r.slot], r.kind, r.text, r.comment]);
      head(ws);
    }
    return wb;
  }
  function importContacts(core, Core, wb) {
    const ws = wb.worksheets.find(w => /kontakt/i.test(w.name)) || wb.worksheets[0];
    // Kopfzeile suchen (erste Zeile mit "Name")
    let headerRow = 1;
    for (let r = 1; r <= 5; r++) if (ws.getRow(r).values.some(v => typeof v === 'string' && /^name/i.test(v.trim()))) { headerRow = r; break; }
    const headers = ws.getRow(headerRow).values.map(v => (typeof v === 'string' ? v.toLowerCase().replace(/\s+/g, ' ').trim() : ''));
    const col = re => headers.findIndex(h => re.test(h));
    const map = {
      name: col(/^name/), alter_: col(/^alter/), beruf: col(/^beruf/), taetigkeit: col(/tätigkeit/), bezug: col(/bezug/), eigenkontakt: col(/eigenkontakt/),
      empf_von: col(/^empf/), lp: col(/^lp$/), kinder: col(/kinder/), telefon: col(/^tel/), kundenseminar: col(/seminar/), bis: col(/^bis/), efs: col(/^efs/),
      kunde: col(/^kunde$/), vip_vm: col(/^vip/), bemerkungen: col(/bemerk/), selektion: col(/selektion/),
    };
    const flags = ['eigenkontakt', 'lp', 'kundenseminar', 'bis', 'efs', 'kunde', 'vip_vm'];
    const val = c => (c && typeof c === 'object' ? (c.text || c.result || '') : c);
    const existing = new Map(core.listContacts().map(c => [c.name.toLowerCase(), c.id]));
    let added = 0, updated = 0;
    ws.eachRow((row, r) => {
      if (r <= headerRow) return;
      const name = String(val(row.getCell(map.name).value) || '').trim();
      if (!name || /mustermann/i.test(name)) return;
      const c = {};
      for (const [k, idx] of Object.entries(map)) {
        if (idx < 1) continue;
        let v = val(row.getCell(idx).value);
        if (flags.includes(k)) v = v && String(v).trim() ? 1 : 0;
        else if (k === 'selektion') { const parts = String(v || '').split(/[,;]/).map(t => t.trim().toLowerCase()); v = Core.SELEKTION.filter(s => parts.includes(s.label.toLowerCase())).map(s => s.key).join(''); }
        else if (k === 'alter_') v = parseInt(v, 10) || null;
        else v = v == null ? '' : String(v);
        c[k] = v;
      }
      c.name = name;
      const id = existing.get(name.toLowerCase());
      if (id) { c.id = id; updated++; } else added++;
      core.saveContact(c);
    });
    return { added, updated };
  }
  const Excel = { build, importContacts };
  if (typeof module !== 'undefined' && module.exports) module.exports = Excel;
  else root.PartnerExcel = Excel;
})(typeof self !== 'undefined' ? self : this);
