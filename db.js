/* ==================================================================
   NÍTIDO — db.js
   Capa de datos: persistencia en localStorage + CRUD de ubicaciones +
   datos de ejemplo iniciales.

   Todo se guarda bajo UNA clave de localStorage como JSON. Si
   localStorage no está disponible (modo privado restrictivo, iframes
   con almacenamiento bloqueado, etc.) se usa un respaldo en memoria
   para que la app nunca se rompa; simplemente no persistirá entre
   recargas en ese entorno concreto.
   =================================================================== */

const STORAGE_KEY = 'nitido_data_v1';
const COLORS = ['#AD7A3C','#4F7268','#B5654A','#4A6B7C','#6B7F4F','#A65D6E','#6E7370','#3D4F66'];

const SafeStorage = (function(){
  let memory = {};
  let usingMemory = false;
  try {
    const testKey = '__nitido_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
  } catch (e) {
    usingMemory = true;
    console.warn('[Nítido] localStorage no disponible en este entorno. Se usará memoria temporal: los datos no persistirán al recargar. Al abrir el archivo descargado en un navegador normal esto funciona de forma permanente.');
  }
  return {
    isMemory: usingMemory,
    getItem(key){
      if (usingMemory) return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
      try { return window.localStorage.getItem(key); } catch (e) { return memory[key] || null; }
    },
    setItem(key, value){
      if (usingMemory) { memory[key] = value; return; }
      try { window.localStorage.setItem(key, value); } catch (e) { memory[key] = value; }
    }
  };
})();

function generateId(){
  return 'loc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function getDefaultState(){
  return { version: 1, initialized: false, locations: [] };
}

function createMockLocations(){
  const now = new Date().toISOString();
  const L = (over) => Object.assign({
    id: generateId(), notes: '', daysOfWeek: [], timesPerMonth: 0, fixedDays: [],
    completions: [], createdAt: now
  }, over);

  return [
    L({ name:'Portal Calle Alcalá 120', notes:'Código portero: 1980. Cubo de basura en el patio trasero.', color:COLORS[0], frequencyType:'weekly', daysOfWeek:[1,4], order:0 }),
    L({ name:'Portal Gran Vía 45', color:COLORS[1], frequencyType:'weekly', daysOfWeek:[2,5], order:1 }),
    L({ name:'Comunidad Residencial Los Álamos', notes:'Incluye limpieza de garaje y trasteros.', color:COLORS[2], frequencyType:'weekly', daysOfWeek:[1,3,5], order:2 }),
    L({ name:'Garaje Comunidad Pinar', color:COLORS[5], frequencyType:'weekly', daysOfWeek:[3,6], order:3 }),
    L({ name:'Portal Serrano 8', notes:'Avisar por WhatsApp antes de subir.', color:COLORS[3], frequencyType:'monthly', timesPerMonth:1, fixedDays:[], order:4 }),
    L({ name:'Edificio Torres Blancas', notes:'Escaleras + portal + ascensor.', color:COLORS[4], frequencyType:'monthly', timesPerMonth:2, fixedDays:[10,25], order:5 }),
    L({ name:'Portal Plaza Mayor 3', color:COLORS[6], frequencyType:'monthly', timesPerMonth:3, fixedDays:[15], order:6 }),
    L({ name:'Trastero Comunidad Robles', notes:'Solo limpieza superficial.', color:COLORS[7], frequencyType:'monthly', timesPerMonth:1, fixedDays:[28], order:7 })
  ];
}

function loadState(){
  const raw = SafeStorage.getItem(STORAGE_KEY);
  if (!raw) return getDefaultState();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.locations)) return getDefaultState();
    return parsed;
  } catch (e) {
    console.error('[Nítido] Los datos guardados estaban corruptos. Se ha iniciado con datos vacíos para no bloquear la app.', e);
    return getDefaultState();
  }
}

const DB = {
  state: loadState(),
  storageIsMemoryOnly: SafeStorage.isMemory,

  persist(){ SafeStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); },

  /** Solo siembra datos de ejemplo la primera vez que se abre la app
   *  (nunca vuelve a hacerlo si el usuario ha vaciado todo a propósito). */
  init(){
    if (!this.state.initialized){
      this.state.locations = createMockLocations();
      this.state.initialized = true;
      this.persist();
    }
  },

  getAll(){ return this.state.locations; },
  getById(id){ return this.state.locations.find(l => l.id === id); },

  add(data){
    const maxOrder = this.state.locations.reduce((m, l) => Math.max(m, l.order), -1);
    const loc = {
      id: generateId(),
      name: data.name.trim(),
      notes: (data.notes || '').trim(),
      color: data.color || COLORS[this.state.locations.length % COLORS.length],
      frequencyType: data.frequencyType,
      daysOfWeek: data.frequencyType === 'weekly' ? [...(data.daysOfWeek || [])].sort((a,b)=>a-b) : [],
      timesPerMonth: data.frequencyType === 'monthly' ? (Number(data.timesPerMonth) || 1) : 0,
      fixedDays: data.frequencyType === 'monthly' ? [...(data.fixedDays || [])].sort((a,b)=>a-b) : [],
      completions: [],
      order: maxOrder + 1,
      createdAt: new Date().toISOString()
    };
    this.state.locations.push(loc);
    this.persist();
    return loc;
  },

  update(id, data){
    const loc = this.getById(id);
    if (!loc) return null;
    loc.name = data.name.trim();
    loc.notes = (data.notes || '').trim();
    loc.color = data.color || loc.color;
    loc.frequencyType = data.frequencyType;
    loc.daysOfWeek = data.frequencyType === 'weekly' ? [...(data.daysOfWeek || [])].sort((a,b)=>a-b) : [];
    loc.timesPerMonth = data.frequencyType === 'monthly' ? (Number(data.timesPerMonth) || 1) : 0;
    loc.fixedDays = data.frequencyType === 'monthly' ? [...(data.fixedDays || [])].sort((a,b)=>a-b) : [];
    this.persist();
    return loc;
  },

  remove(id){
    this.state.locations = this.state.locations.filter(l => l.id !== id);
    this.persist();
  },

  toggleCompletionOnDate(id, isoDate){
    const loc = this.getById(id);
    if (!loc) return;
    const idx = loc.completions.indexOf(isoDate);
    if (idx === -1) loc.completions.push(isoDate); else loc.completions.splice(idx, 1);
    this.persist();
  },

  reorderSubset(newOrderedIds){
    Logic.reorderSubset(this.state.locations, newOrderedIds);
    this.persist();
  },

  exportJSON(){
    return JSON.stringify(this.state, null, 2);
  },

  importJSON(jsonStr){
    const parsed = JSON.parse(jsonStr);
    if (!parsed || !Array.isArray(parsed.locations)) throw new Error('El archivo no tiene el formato esperado.');
    this.state = { version: 1, initialized: true, locations: parsed.locations };
    this.persist();
  },

  resetToMockData(){
    this.state.locations = createMockLocations();
    this.state.initialized = true;
    this.persist();
  },

  clearAll(){
    this.state.locations = [];
    this.state.initialized = true; // decisión activa del usuario: no reinyectar datos de ejemplo
    this.persist();
  }
};
if (typeof window !== 'undefined') window.DB = DB;
