/* ==================================================================
   NÍTIDO — logic.js
   Módulo de lógica de fechas y programación. Son funciones PURAS
   (sin tocar el DOM ni el almacenamiento) para que sean fáciles de
   razonar, reutilizar entre vistas y probar de forma aislada.

   Convención de día de la semana usada en toda la app:
   1=Lunes 2=Martes 3=Miércoles 4=Jueves 5=Viernes 6=Sábado 7=Domingo
   (Date.getDay() de JS devuelve 0=Domingo..6=Sábado, así que siempre
   se convierte con getIsoWeekday() antes de comparar).
   =================================================================== */

const WEEKDAY_NAMES_LONG  = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
const WEEKDAY_NAMES_SHORT = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const MONTH_NAMES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

const Logic = {

  /** Convierte Date.getDay() (0=Dom) a nuestra convención 1=Lun..7=Dom */
  getIsoWeekday(date){
    const d = date.getDay();
    return d === 0 ? 7 : d;
  },

  /** Formatea una fecha a 'YYYY-MM-DD' usando componentes LOCALES (evita el
   *  desfase típico de toISOString(), que convierte a UTC). */
  toLocalISODate(date){
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  /** ¿Una fecha ISO 'YYYY-MM-DD' cae dentro del año/mes indicados? (mes 0-11) */
  isSameMonth(isoDateStr, year, month){
    const [y, m] = isoDateStr.split('-').map(Number);
    return y === year && (m - 1) === month;
  },

  /** Nº de veces que una ubicación se ha marcado como hecha en un año/mes dado. */
  countCompletionsInMonth(location, year, month){
    return (location.completions || []).filter(d => this.isSameMonth(d, year, month)).length;
  },

  /** ¿Está marcada como hecha en esta fecha exacta? */
  isCompletedOnDate(location, date){
    return (location.completions || []).includes(this.toLocalISODate(date));
  },

  /** ¿Toca por frecuencia semanal en esta fecha? */
  matchesWeekly(location, date){
    return location.frequencyType === 'weekly' &&
      (location.daysOfWeek || []).includes(this.getIsoWeekday(date));
  },

  /** ¿Toca por frecuencia mensual con día fijo en esta fecha? (solo si tiene días fijados) */
  matchesMonthlyFixed(location, date){
    return location.frequencyType === 'monthly' &&
      (location.fixedDays || []).includes(date.getDate());
  },

  /** ¿La ubicación corresponde a esta fecha concreta (semanal o mensual con día fijo)? */
  isScheduledOn(location, date){
    return this.matchesWeekly(location, date) || this.matchesMonthlyFixed(location, date);
  },

  /**
   * Lista de tareas de HOY: semanales de ese día de la semana +
   * mensuales cuyo día fijo coincide con el día del mes.
   * Se ordena por el campo `order` (orden personalizado del usuario).
   */
  getTodayList(locations, date){
    return locations
      .filter(loc => this.isScheduledOn(loc, date))
      .map(loc => ({
        location: loc,
        kind: loc.frequencyType,
        done: this.isCompletedOnDate(loc, date)
      }))
      .sort((a, b) => a.location.order - b.location.order);
  },

  /**
   * Ubicaciones mensuales pendientes de programar o realizar. Devuelve
   * un motivo por entrada:
   *  - 'unscheduled': no tiene NINGÚN día fijado -> nunca aparecerá sola
   *    en ninguna vista de un día concreto, así que se avisa siempre
   *    hasta completar las veces necesarias este mes.
   *  - 'overdue': tiene día(s) fijados, pero ya ha pasado al menos uno
   *    este mes sin que el nº de veces completadas lo cubra todavía.
   * Una mensual con día fijado cuyo día aún no ha llegado NO se marca
   * como pendiente todavía (no tiene sentido avisar antes de tiempo).
   */
  getPendingMonthly(locations, date){
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    const result = [];

    locations.forEach(loc => {
      if (loc.frequencyType !== 'monthly') return;
      const done = this.countCompletionsInMonth(loc, year, month);
      const remaining = Math.max(0, (loc.timesPerMonth || 1) - done);
      if (remaining <= 0) return; // ya cumplida la cuota de este mes

      const fixedDays = loc.fixedDays || [];
      if (fixedDays.length === 0){
        result.push({ location: loc, remaining, reason: 'unscheduled' });
        return;
      }
      const passed = fixedDays.filter(d => d <= day).length;
      if (done < passed){
        result.push({ location: loc, remaining, reason: 'overdue' });
      }
    });

    return result;
  },

  /**
   * Patrón semanal recurrente (para la vista Resumen): qué ubicaciones
   * tocan cada día de la semana, independientemente de la fecha exacta.
   */
  getWeekSchedule(locations){
    const schedule = WEEKDAY_NAMES_LONG.map((name, idx) => ({
      weekday: idx + 1, name, locations: []
    }));
    locations.forEach(loc => {
      if (loc.frequencyType !== 'weekly') return;
      (loc.daysOfWeek || []).forEach(wd => {
        const entry = schedule.find(s => s.weekday === wd);
        if (entry) entry.locations.push(loc);
      });
    });
    schedule.forEach(s => s.locations.sort((a, b) => a.order - b.order));
    return schedule;
  },

  /** Resumen de ubicaciones mensuales (para la vista Resumen), con progreso del mes actual. */
  getMonthlySummary(locations, date){
    const year = date.getFullYear(), month = date.getMonth();
    return locations
      .filter(loc => loc.frequencyType === 'monthly')
      .map(loc => ({
        location: loc,
        completedCount: this.countCompletionsInMonth(loc, year, month),
        hasFixedDays: (loc.fixedDays || []).length > 0
      }))
      .sort((a, b) => a.location.order - b.location.order);
  },

  /**
   * Celdas del calendario mensual (incluye relleno de días de meses
   * adyacentes para completar semanas de Lunes a Domingo).
   */
  getMonthCalendarCells(locations, year, month){
    const firstDay = new Date(year, month, 1);
    const startWeekday = this.getIsoWeekday(firstDay); // 1-7
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leading = startWeekday - 1;
    const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;
    const cells = [];

    for (let i = 0; i < totalCells; i++){
      const dayNum = i - leading + 1;
      if (dayNum < 1 || dayNum > daysInMonth){
        cells.push({ inMonth: false });
        continue;
      }
      const cellDate = new Date(year, month, dayNum);
      const matches = locations.filter(loc => this.isScheduledOn(loc, cellDate));
      cells.push({ inMonth: true, day: dayNum, date: cellDate, locations: matches });
    }
    return cells;
  },

  /**
   * Redistribuye el campo `order` de un subconjunto de ubicaciones según
   * una nueva secuencia (ids), reutilizando exactamente los mismos
   * valores numéricos que ya ocupaba ese subconjunto. Así el nuevo orden
   * relativo entre ellas se respeta en TODAS las vistas (no solo en la
   * de hoy) sin desordenar a las ubicaciones que no están en la lista.
   */
  reorderSubset(allLocations, newOrderedIds){
    const subset = allLocations.filter(l => newOrderedIds.includes(l.id));
    const sortedValues = subset.map(l => l.order).sort((a, b) => a - b);
    newOrderedIds.forEach((id, idx) => {
      const loc = allLocations.find(l => l.id === id);
      if (loc) loc.order = sortedValues[idx];
    });
  }
};
if (typeof window !== 'undefined') window.Logic = Logic;

/* Exportado para poder probar este módulo con Node (ver test-logic.js).
   En el navegador, `module` no existe y esta línea no hace nada. */
if (typeof module !== 'undefined' && module.exports){
  module.exports = { Logic, WEEKDAY_NAMES_LONG, WEEKDAY_NAMES_SHORT, MONTH_NAMES };
}
