/* ==================================================================
   NÍTIDO — ui.js
   Módulo de presentación: convierte los datos (DB) y la lógica
   (Logic) en HTML para las 4 vistas, además del sistema de modales
   y las notificaciones flotantes. app.js se encarga de conectar los
   eventos; este archivo solo construye lo que se ve.
   =================================================================== */

/** Escapa texto de usuario antes de insertarlo en innerHTML, para que
 *  nombres/notas con < > & " no rompan el HTML generado. */
function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

const UI = {
  currentView: 'home',
  calendarYear: new Date().getFullYear(),
  calendarMonth: new Date().getMonth(),
  editingId: null,
  lastStampedId: null,
  fixedDaysDraft: [],
  confirmCallback: null,
  pendingBannerOpen: false,
  _calendarCells: [],

  /* ---------------- Navegación entre vistas ---------------- */
  showView(viewName){
    this.currentView = viewName;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('is-active'));
    document.getElementById('view-' + viewName).classList.add('is-active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('is-active', n.dataset.view === viewName));

    if (viewName === 'home') this.renderHome();
    else if (viewName === 'manage') this.renderManage();
    else if (viewName === 'calendar') this.renderCalendar();
    else if (viewName === 'summary') this.renderSummary();

    if (typeof window.scrollTo === 'function'){ try { window.scrollTo({ top: 0 }); } catch (e) { /* entornos sin scrollTo: no es crítico */ } }
  },

  /* ======================= VISTA: HOY ======================= */
  renderHome(){
    const today = new Date();
    const todayISO = Logic.toLocalISODate(today);
    const weekdayName = WEEKDAY_NAMES_LONG[Logic.getIsoWeekday(today) - 1];
    const monthName = MONTH_NAMES[today.getMonth()];
    const list = Logic.getTodayList(DB.getAll(), today);

    document.getElementById('homeDateHeader').innerHTML = `
      <span class="date-header__weekday">${weekdayName}</span>
      <span class="date-header__day">${today.getDate()}</span>
      <div class="date-header__meta">
        <span class="date-header__month">de ${monthName}</span>
        <span class="date-header__count">${list.length} ${list.length === 1 ? 'tarea' : 'tareas'} hoy</span>
      </div>`;

    const pending = Logic.getPendingMonthly(DB.getAll(), today);
    document.getElementById('pendingBanner').innerHTML = this.pendingBannerHTML(pending);

    const stampedId = this.lastStampedId;
    this.lastStampedId = null;

    const listEl = document.getElementById('todayList');
    if (list.length === 0){
      listEl.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24"><use href="#icon-home"/></svg>
          <div class="empty-state__title">Nada programado para hoy</div>
          <div class="empty-state__text">Buen momento para revisar el calendario o adelantar alguna mensual pendiente.</div>
        </div>`;
    } else {
      listEl.innerHTML = list.map((entry, i) => this.todayItemHTML(entry, i, list.length, todayISO, stampedId)).join('');
    }
  },

  todayItemHTML(entry, index, total, todayISO, stampedId){
    const loc = entry.location;
    const justStamped = entry.done && loc.id === stampedId;
    const metaLabel = entry.kind === 'weekly' ? 'Semanal' : this.monthlyProgressLabel(loc);
    return `
      <div class="today-item ${entry.done ? 'is-done' : ''}" data-id="${loc.id}">
        <button type="button" class="today-item__stamp ${justStamped ? 'just-stamped' : ''}" data-action="toggle-done" data-id="${loc.id}" aria-label="Marcar como hecho hoy" aria-pressed="${entry.done}">
          <svg viewBox="0 0 24 24"><use href="#icon-check"/></svg>
        </button>
        <span class="today-item__dot" style="background:${loc.color}"></span>
        <div class="today-item__body">
          <div class="today-item__name">${escapeHtml(loc.name)}</div>
          <div class="today-item__meta">${metaLabel}</div>
        </div>
        <div class="today-item__reorder">
          <button type="button" class="btn-icon" data-action="move-up" data-id="${loc.id}" aria-label="Subir en la lista" ${index === 0 ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24"><use href="#icon-chevron-up"/></svg>
          </button>
          <button type="button" class="btn-icon" data-action="move-down" data-id="${loc.id}" aria-label="Bajar en la lista" ${index === total - 1 ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24"><use href="#icon-chevron-down"/></svg>
          </button>
        </div>
      </div>`;
  },

  monthlyProgressLabel(loc){
    const now = new Date();
    const done = Logic.countCompletionsInMonth(loc, now.getFullYear(), now.getMonth());
    return `Mensual · ${done}/${loc.timesPerMonth} este mes`;
  },

  /* ---------------- Banner de pendientes ---------------- */
  pendingBannerHTML(pending){
    if (pending.length === 0) return '';
    const openClass = this.pendingBannerOpen ? 'is-open' : '';
    const items = pending.map(p => `
      <div class="pending-item">
        <span class="today-item__dot" style="background:${p.location.color}"></span>
        <div class="pending-item__body">
          <div class="pending-item__name">${escapeHtml(p.location.name)}</div>
          <div class="pending-item__reason">${p.reason === 'unscheduled' ? 'Sin día fijado — por programar o realizar' : 'Su día fijado ya pasó sin marcarse'}</div>
        </div>
        <button type="button" class="btn btn--secondary btn--sm" data-action="mark-pending-done" data-id="${p.location.id}">Marcar hecha</button>
      </div>`).join('');

    return `
      <div class="pending-banner ${openClass}" id="pendingBannerEl">
        <button type="button" class="pending-banner__head" data-action="toggle-pending-banner">
          <svg class="pending-banner__icon" viewBox="0 0 24 24"><use href="#icon-warning"/></svg>
          <span>
            <span class="pending-banner__title" style="display:block">${pending.length} ${pending.length === 1 ? 'limpieza mensual pendiente' : 'limpiezas mensuales pendientes'}</span>
            <span class="pending-banner__subtitle" style="display:block">Toca para ver el detalle</span>
          </span>
          <svg class="pending-banner__chevron" viewBox="0 0 24 24"><use href="#icon-chevron-down"/></svg>
        </button>
        <div class="pending-banner__list">${items}</div>
      </div>`;
  },

  togglePendingBanner(){
    this.pendingBannerOpen = !this.pendingBannerOpen;
    const el = document.getElementById('pendingBannerEl');
    if (el) el.classList.toggle('is-open', this.pendingBannerOpen);
  },

  /* ======================= VISTA: UBICACIONES ======================= */
  renderManage(){
    const locations = [...DB.getAll()].sort((a, b) => a.order - b.order);
    const grid = document.getElementById('locationsGrid');
    if (locations.length === 0){
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <svg viewBox="0 0 24 24"><use href="#icon-pin"/></svg>
          <div class="empty-state__title">Todavía no hay ubicaciones</div>
          <div class="empty-state__text">Añade tu primer portal o ubicación para empezar a programar limpiezas.</div>
        </div>`;
      return;
    }
    grid.innerHTML = locations.map(loc => this.locationCardHTML(loc)).join('');
  },

  locationCardHTML(loc){
    const freqLabel = loc.frequencyType === 'weekly'
      ? (loc.daysOfWeek || []).map(d => WEEKDAY_NAMES_SHORT[d - 1]).join(', ')
      : `${loc.timesPerMonth}×/mes` + ((loc.fixedDays || []).length ? ` · días ${loc.fixedDays.join(', ')}` : ' · sin día fijado');
    return `
      <div class="location-card" style="--card-color:${loc.color}">
        <div class="location-card__top">
          <div>
            <div class="location-card__name">${escapeHtml(loc.name)}</div>
            ${loc.notes ? `<div class="location-card__notes">${escapeHtml(loc.notes)}</div>` : ''}
          </div>
          <div class="location-card__actions">
            <button type="button" class="btn-icon" data-action="edit-location" data-id="${loc.id}" aria-label="Editar ubicación"><svg viewBox="0 0 24 24"><use href="#icon-edit"/></svg></button>
            <button type="button" class="btn-icon" data-action="delete-location" data-id="${loc.id}" aria-label="Eliminar ubicación"><svg viewBox="0 0 24 24"><use href="#icon-trash"/></svg></button>
          </div>
        </div>
        <div class="location-card__freq">
          <svg viewBox="0 0 24 24"><use href="#icon-repeat"/></svg>
          <span>${loc.frequencyType === 'weekly' ? 'Semanal' : 'Mensual'} · ${freqLabel}</span>
        </div>
      </div>`;
  },

  /* ---------------- Formulario añadir/editar (modal) ---------------- */
  openLocationModal(id){
    this.editingId = id || null;
    const loc = id ? DB.getById(id) : null;

    document.getElementById('locationFormTitle').textContent = loc ? 'Editar ubicación' : 'Añadir ubicación';
    document.getElementById('fieldId').value = id || '';
    document.getElementById('fieldName').value = loc ? loc.name : '';
    document.getElementById('fieldNotes').value = loc ? loc.notes : '';
    document.getElementById('errorWeeklyDays').hidden = true;

    this.populateColorPicker(loc ? loc.color : COLORS[DB.getAll().length % COLORS.length]);
    this.setFrequencyType(loc ? loc.frequencyType : 'weekly');

    document.querySelectorAll('#dayTogglesWeekly .day-toggle').forEach(btn => {
      const d = Number(btn.dataset.day);
      btn.classList.toggle('is-active', loc ? (loc.daysOfWeek || []).includes(d) : false);
    });

    document.getElementById('fieldTimesPerMonth').value = loc ? (loc.timesPerMonth || 1) : 1;
    document.getElementById('fieldFixedDayInput').value = '';
    this.fixedDaysDraft = loc ? [...(loc.fixedDays || [])] : [];
    this.renderFixedDaysChips();

    this.openModalPanel('locationFormPanel');
    document.getElementById('fieldName').focus();
  },

  setFrequencyType(freq){
    document.querySelectorAll('#frequencyToggle .segmented__option').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.freq === freq);
    });
    document.getElementById('weeklyFields').hidden = freq !== 'weekly';
    document.getElementById('monthlyFields').hidden = freq !== 'monthly';
  },

  populateColorPicker(selected){
    document.getElementById('colorPicker').innerHTML = COLORS.map(c => `
      <button type="button" class="color-swatch ${c === selected ? 'is-active' : ''}" data-color="${c}" style="background:${c}" aria-label="Elegir color"></button>
    `).join('');
  },

  renderFixedDaysChips(){
    const sorted = [...this.fixedDaysDraft].sort((a, b) => a - b);
    document.getElementById('fixedDaysChips').innerHTML = sorted.map(d => `
      <span class="day-chip">Día ${d}<button type="button" data-action="remove-fixed-day" data-day="${d}" aria-label="Quitar día ${d}"><svg viewBox="0 0 24 24"><use href="#icon-close"/></svg></button></span>
    `).join('');
  },

  /* ======================= VISTA: CALENDARIO ======================= */
  renderCalendar(){
    document.getElementById('calendarMonthLabel').textContent = `${MONTH_NAMES[this.calendarMonth]} ${this.calendarYear}`;

    const cells = Logic.getMonthCalendarCells(DB.getAll(), this.calendarYear, this.calendarMonth);
    this._calendarCells = cells;
    const todayKey = Logic.toLocalISODate(new Date());

    document.getElementById('calendarGrid').innerHTML = cells.map((cell, idx) => {
      if (!cell.inMonth) return `<div class="calendar-cell calendar-cell--empty"></div>`;
      const isToday = Logic.toLocalISODate(cell.date) === todayKey;
      const shown = cell.locations.slice(0, 6);
      const dots = shown.map(loc => `<span style="background:${loc.color}"></span>`).join('');
      const more = cell.locations.length > 6 ? `<span class="calendar-cell__more">+${cell.locations.length - 6}</span>` : '';
      return `
        <button type="button" class="calendar-cell ${isToday ? 'calendar-cell--today' : ''}" data-action="open-day" data-index="${idx}">
          <span class="calendar-cell__num">${cell.day}</span>
          <span class="calendar-cell__dots">${dots}${more}</span>
        </button>`;
    }).join('');
  },

  openDayDetail(index){
    const cell = this._calendarCells[index];
    if (!cell || !cell.inMonth) return;
    document.getElementById('dayDetailTitle').textContent = `${cell.day} de ${MONTH_NAMES[cell.date.getMonth()]}`;
    const body = document.getElementById('dayDetailBody');
    if (cell.locations.length === 0){
      body.innerHTML = `<p style="color:var(--mist);font-size:14px;">No hay limpiezas programadas este día.</p>`;
    } else {
      body.innerHTML = `<div class="day-detail-list">` + cell.locations.map(loc => `
        <div class="day-detail-item">
          <span class="day-detail-item__dot" style="background:${loc.color}"></span>
          <span class="day-detail-item__name">${escapeHtml(loc.name)}</span>
          <span class="day-detail-item__tag">${loc.frequencyType === 'weekly' ? 'Semanal' : 'Mensual'}</span>
        </div>`).join('') + `</div>`;
    }
    this.openModalPanel('dayDetailPanel');
  },

  /* ======================= VISTA: RESUMEN ======================= */
  renderSummary(){
    const today = new Date();
    const weekSchedule = Logic.getWeekSchedule(DB.getAll());
    const monthlySummary = Logic.getMonthlySummary(DB.getAll(), today);

    const weekHtml = weekSchedule.map(day => `
      <div class="summary-day">
        <div class="summary-day__name">${day.name}</div>
        <div class="summary-day__items">
          ${day.locations.length === 0
            ? `<span class="summary-day__empty">Sin limpiezas programadas</span>`
            : day.locations.map(loc => `<span class="summary-tag"><span class="summary-tag__dot" style="background:${loc.color}"></span>${escapeHtml(loc.name)}</span>`).join('')}
        </div>
      </div>`).join('');

    const monthlyHtml = monthlySummary.length === 0
      ? `<p style="color:var(--mist);font-size:14px;">No hay ubicaciones de frecuencia mensual.</p>`
      : monthlySummary.map(m => `
        <div class="summary-monthly-item">
          <span class="summary-monthly-item__dot" style="background:${m.location.color}"></span>
          <div class="summary-monthly-item__body">
            <div class="summary-monthly-item__name">${escapeHtml(m.location.name)}</div>
            <div class="summary-monthly-item__detail">${m.location.timesPerMonth}× al mes · ${m.hasFixedDays ? 'días fijados ' + m.location.fixedDays.join(', ') : 'sin fecha fija'}</div>
          </div>
          <div class="summary-monthly-item__progress">${m.completedCount}/${m.location.timesPerMonth}</div>
        </div>`).join('');

    document.getElementById('summaryContent').innerHTML = `
      <div class="summary-block">
        <h2 class="summary-block__title">Semana</h2>
        <div class="summary-week">${weekHtml}</div>
      </div>
      <div class="summary-block">
        <h2 class="summary-block__title">Frecuencia mensual</h2>
        <div class="summary-monthly">${monthlyHtml}</div>
      </div>`;
  },

  /* ======================= MODALES ======================= */
  openModalPanel(panelId){
    document.querySelectorAll('.modal-overlay > .modal').forEach(p => { p.hidden = true; });
    document.getElementById(panelId).hidden = false;
    document.getElementById('modalOverlay').hidden = false;
  },

  closeModal(){
    document.getElementById('modalOverlay').hidden = true;
    this.confirmCallback = null;
  },

  openConfirm(message, onConfirm){
    document.getElementById('confirmMessage').textContent = message;
    this.confirmCallback = onConfirm;
    this.openModalPanel('confirmPanel');
  },

  /* ======================= NOTIFICACIONES ======================= */
  showToast(message, type){
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' toast--error' : '');
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .25s ease';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 260);
    }, 2400);
  }
};
if (typeof window !== 'undefined') window.UI = UI;
