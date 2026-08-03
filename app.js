/* ==================================================================
   NÍTIDO — app.js
   Punto de entrada: inicializa la base de datos, conecta todos los
   eventos de la interfaz (usando delegación de eventos para el
   contenido que se re-renderiza) y arranca en la vista "Hoy".
   =================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  DB.init();

  wireNav();
  wireHomeView();
  wireManageView();
  wireLocationForm();
  wireCalendarView();
  wireSummaryView();
  wireModals();
  wireDataZone();

  UI.showView('home');

  if (DB.storageIsMemoryOnly){
    UI.showToast('Esta vista previa no permite guardar datos de forma permanente.', 'error');
  }
});

/* ---------------- Navegación ---------------- */
function wireNav(){
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => UI.showView(btn.dataset.view));
  });
}

/* ---------------- Vista Hoy ---------------- */
function wireHomeView(){
  // Lista de hoy: marcar como hecha + reordenar (delegación, la lista se re-renderiza entera)
  document.getElementById('todayList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;

    if (action === 'toggle-done'){
      const loc = DB.getById(id);
      const willBeDone = !Logic.isCompletedOnDate(loc, new Date());
      DB.toggleCompletionOnDate(id, Logic.toLocalISODate(new Date()));
      if (willBeDone) UI.lastStampedId = id;
      UI.renderHome();
    } else if (action === 'move-up'){
      moveTodayItem(id, 'up');
    } else if (action === 'move-down'){
      moveTodayItem(id, 'down');
    }
  });

  // Banner de pendientes: abrir/cerrar detalle + marcar como hecha desde ahí (delegación sobre el contenedor estable)
  document.getElementById('pendingBanner').addEventListener('click', (e) => {
    if (e.target.closest('[data-action="toggle-pending-banner"]')){
      UI.togglePendingBanner();
      return;
    }
    const markBtn = e.target.closest('[data-action="mark-pending-done"]');
    if (markBtn){
      DB.toggleCompletionOnDate(markBtn.dataset.id, Logic.toLocalISODate(new Date()));
      UI.showToast('Marcada como hecha hoy');
      UI.renderHome();
    }
  });
}

/** Sube o baja un elemento dentro de la lista de HOY, intercambiando su
 *  posición con la del vecino. El nuevo orden se guarda de forma global
 *  (afecta también a cómo se ordena esa ubicación en otras vistas). */
function moveTodayItem(id, direction){
  const ids = Logic.getTodayList(DB.getAll(), new Date()).map(entry => entry.location.id);
  const idx = ids.indexOf(id);
  const swapWith = direction === 'up' ? idx - 1 : idx + 1;
  if (idx === -1 || swapWith < 0 || swapWith >= ids.length) return;
  [ids[idx], ids[swapWith]] = [ids[swapWith], ids[idx]];
  DB.reorderSubset(ids);
  UI.renderHome();
}

/* ---------------- Vista Ubicaciones ---------------- */
function wireManageView(){
  document.getElementById('btnAddLocation').addEventListener('click', () => UI.openLocationModal());

  document.getElementById('locationsGrid').addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-action="edit-location"]');
    if (editBtn){ UI.openLocationModal(editBtn.dataset.id); return; }

    const delBtn = e.target.closest('[data-action="delete-location"]');
    if (delBtn){
      const loc = DB.getById(delBtn.dataset.id);
      UI.openConfirm(`¿Eliminar "${loc.name}"? Esta acción no se puede deshacer.`, () => {
        DB.remove(delBtn.dataset.id);
        UI.renderManage();
        UI.showToast('Ubicación eliminada');
      });
    }
  });
}

/* ---------------- Formulario de ubicación ---------------- */
function wireLocationForm(){
  document.getElementById('frequencyToggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.segmented__option');
    if (btn) UI.setFrequencyType(btn.dataset.freq);
  });

  document.getElementById('dayTogglesWeekly').addEventListener('click', (e) => {
    const btn = e.target.closest('.day-toggle');
    if (btn) btn.classList.toggle('is-active');
  });

  document.getElementById('colorPicker').addEventListener('click', (e) => {
    const btn = e.target.closest('.color-swatch');
    if (!btn) return;
    document.querySelectorAll('#colorPicker .color-swatch').forEach(s => s.classList.remove('is-active'));
    btn.classList.add('is-active');
  });

  // Días fijos del mes: añadir (clic o Enter) y quitar (chip)
  const fixedDayInput = document.getElementById('fieldFixedDayInput');
  const addFixedDay = () => {
    const val = Number(fixedDayInput.value);
    if (!val || val < 1 || val > 31){
      UI.showToast('Introduce un día entre 1 y 31', 'error');
      return;
    }
    if (!UI.fixedDaysDraft.includes(val)){
      UI.fixedDaysDraft.push(val);
      UI.renderFixedDaysChips();
    }
    fixedDayInput.value = '';
    fixedDayInput.focus();
  };
  document.getElementById('btnAddFixedDay').addEventListener('click', addFixedDay);
  fixedDayInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter'){ e.preventDefault(); addFixedDay(); }
  });

  document.getElementById('fixedDaysChips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="remove-fixed-day"]');
    if (!btn) return;
    const day = Number(btn.dataset.day);
    UI.fixedDaysDraft = UI.fixedDaysDraft.filter(d => d !== day);
    UI.renderFixedDaysChips();
  });

  // Envío del formulario: validar y guardar (crea o actualiza)
  document.getElementById('locationForm').addEventListener('submit', (e) => {
    e.preventDefault();

    const name = document.getElementById('fieldName').value.trim();
    if (!name){ document.getElementById('fieldName').focus(); return; }

    const freq = document.querySelector('#frequencyToggle .segmented__option.is-active').dataset.freq;
    const activeSwatch = document.querySelector('#colorPicker .color-swatch.is-active');
    const color = activeSwatch ? activeSwatch.dataset.color : COLORS[0];
    const notes = document.getElementById('fieldNotes').value;

    let daysOfWeek = [];
    if (freq === 'weekly'){
      daysOfWeek = [...document.querySelectorAll('#dayTogglesWeekly .day-toggle.is-active')].map(b => Number(b.dataset.day));
      if (daysOfWeek.length === 0){
        document.getElementById('errorWeeklyDays').hidden = false;
        return;
      }
    }
    document.getElementById('errorWeeklyDays').hidden = true;

    const timesPerMonth = Math.max(1, Number(document.getElementById('fieldTimesPerMonth').value) || 1);
    const fixedDays = freq === 'monthly' ? [...UI.fixedDaysDraft] : [];

    const data = { name, notes, color, frequencyType: freq, daysOfWeek, timesPerMonth, fixedDays };

    if (UI.editingId){
      DB.update(UI.editingId, data);
      UI.showToast('Ubicación actualizada');
    } else {
      DB.add(data);
      UI.showToast('Ubicación añadida');
    }

    UI.closeModal();
    UI.renderManage();
  });
}

/* ---------------- Vista Calendario ---------------- */
function wireCalendarView(){
  document.getElementById('btnPrevMonth').addEventListener('click', () => {
    UI.calendarMonth--;
    if (UI.calendarMonth < 0){ UI.calendarMonth = 11; UI.calendarYear--; }
    UI.renderCalendar();
  });
  document.getElementById('btnNextMonth').addEventListener('click', () => {
    UI.calendarMonth++;
    if (UI.calendarMonth > 11){ UI.calendarMonth = 0; UI.calendarYear++; }
    UI.renderCalendar();
  });
  document.getElementById('btnToday').addEventListener('click', () => {
    const now = new Date();
    UI.calendarYear = now.getFullYear();
    UI.calendarMonth = now.getMonth();
    UI.renderCalendar();
  });
  document.getElementById('calendarGrid').addEventListener('click', (e) => {
    const cell = e.target.closest('[data-action="open-day"]');
    if (cell) UI.openDayDetail(Number(cell.dataset.index));
  });
}

/* ---------------- Vista Resumen ---------------- */
function wireSummaryView(){
  document.getElementById('btnPrint').addEventListener('click', () => window.print());
}

/* ---------------- Modales (cierre genérico) ---------------- */
function wireModals(){
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay' || e.target.closest('[data-action="close-modal"]')){
      UI.closeModal();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('modalOverlay').hidden) UI.closeModal();
  });
  document.getElementById('btnConfirmCancel').addEventListener('click', () => UI.closeModal());
  document.getElementById('btnConfirmOk').addEventListener('click', () => {
    const callback = UI.confirmCallback;
    UI.closeModal();
    if (callback) callback();
  });
}

/* ---------------- Copia de seguridad / zona de peligro ---------------- */
function wireDataZone(){
  document.getElementById('btnExport').addEventListener('click', exportData);

  document.getElementById('btnImport').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
  });
  document.getElementById('importFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importData(file);
    e.target.value = '';
  });

  document.getElementById('btnResetMock').addEventListener('click', () => {
    UI.openConfirm('¿Restaurar los datos de ejemplo? Se sustituirán las ubicaciones actuales.', () => {
      DB.resetToMockData();
      UI.renderManage();
      UI.showToast('Datos de ejemplo restaurados');
    });
  });

  document.getElementById('btnClearAll').addEventListener('click', () => {
    UI.openConfirm('¿Borrar TODOS los datos? Esta acción no se puede deshacer.', () => {
      DB.clearAll();
      UI.renderManage();
      UI.showToast('Todos los datos han sido borrados');
    });
  });
}

function exportData(){
  const blob = new Blob([DB.exportJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nitido-backup-${Logic.toLocalISODate(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  UI.showToast('Datos exportados');
}

function importData(file){
  const reader = new FileReader();
  reader.onload = () => {
    try {
      DB.importJSON(reader.result);
      UI.showToast('Datos importados correctamente');
      UI.showView(UI.currentView);
    } catch (err) {
      UI.showToast('No se pudo importar: formato no válido', 'error');
    }
  };
  reader.onerror = () => UI.showToast('No se pudo leer el archivo', 'error');
  reader.readAsText(file);
}
