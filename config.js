const path = require('path');

// Directorios para guardar imágenes y datos
const tempDir = path.join(__dirname, 'temp');
const dataDir = path.join(__dirname, 'data');

// Base de datos local para datos financieros
const DB_FILE = path.join(dataDir, 'financial_data.json');

// Categorías de gastos personalizadas
const expenseCategories = {
  'supermercado': ['mercado', 'super', 'carrefour', 'día', 'coto', 'jumbo', 'walmart', 'alimento', 'verdulería', 'frutería', 'compras'],
  'restaurante': ['restaurante', 'bar', 'café', 'menu', 'comida', 'almuerzo', 'cena', 'desayuno', 'merienda'],
  'transporte': ['uber', 'cabify', 'taxi', 'transporte', 'combustible', 'gasolina', 'estacionamiento', 'sube', 'colectivo', 'subte', 'tren'],
  'servicios': ['electricidad', 'agua', 'gas', 'internet', 'teléfono', 'celular', 'factura', 'servicio', 'wifi', 'etb', 'wom'],
  'entretenimiento': ['cine', 'teatro', 'concierto', 'evento', 'streaming', 'netflix', 'spotify', 'disney', 'hbo', 'prime', 'claude'],
  'salud': ['farmacia', 'médico', 'hospital', 'clínica', 'consulta', 'remedio', 'medicina', 'bodytech', 'gimnasio'],
  'tecnología': ['computadora', 'pc', 'laptop', 'celular', 'gadget', 'auricular', 'earbuds', 'hardware', 'software', 'app', 'aplicación'],
  'snacks': ['dulces', 'snacks', 'golosinas', 'chocolate', 'galletas', 'bebidas', 'refresco', 'café'],
  'educación': ['universidad', 'curso', 'libro', 'semestre', 'matrícula', 'clases'],
  'otros': []
};

// Gastos fijos preconfigurados
const fixedExpenses = [
  { nombre: 'Internet ETB', monto: 120000, categoria: 'servicios', fechaPago: 15 },
  { nombre: 'Claude IA', monto: 50000, categoria: 'entretenimiento', fechaPago: 5 },
  { nombre: 'Bodytech', monto: 80000, categoria: 'salud', fechaPago: 10 },
  { nombre: 'WOM', monto: 60000, categoria: 'servicios', fechaPago: 20 }
];

// Metas financieras
const financialGoals = [
  { nombre: 'Pantalla nueva', montoObjetivo: 600000, montoAcumulado: 0, fecha: '2024-12-31' },
  { nombre: 'Semestre universitario', montoObjetivo: 4000000, montoAcumulado: 0, fecha: '2025-01-15' }
];

// Configuración de presupuesto mensual (método base cero)
const monthlyBudget = {
  supermercado: 450000,
  restaurante: 300000,
  transporte: 200000,
  servicios: 310000,
  entretenimiento: 150000,
  salud: 100000,
  tecnología: 200000,
  snacks: 80000,
  educación: 400000,
  otros: 100000
};

// Ingresos fijos
const fixedIncomes = [
  { nombre: 'Salario', monto: 1718010, fechaIngreso: 15, frecuencia: 'mensual' }
];

// Palabras clave para detección de intenciones
const intentKeywords = {
  gasto: ['gasté', 'pagué', 'compré', 'abono', 'pagado', 'costo', 'compra', 'gasto', 'pago'],
  ingreso: ['cobré', 'recibí', 'ingresé', 'ingreso', 'depósito', 'transferencia', 'sueldo', 'honorarios', 'cobro', 'freelance'],
  meta: ['meta', 'objetivo', 'ahorrar', 'ahorro', 'reservar', 'apartado', 'destinar'],
  reporte: ['reporte', 'informe', 'estadísticas', 'análisis', 'balance', 'resumen'],
  presupuesto: ['presupuesto', 'límite', 'asignar', 'destinar']
};

// Patrones para extracción de montos
const amountPatterns = [
  /\$\s*([0-9.,]+)/,
  /([0-9.,]+)\s*pesos/i,
  /([0-9.,]+)\s*\$/,
  /([0-9.,]+)\s*ars/i,
  /(?:pagué|gasté|costó|compré|abono|costo|compra|pago|gasto)\s*(?:de)?\s*\$?\s*([0-9.,]+)/i,
  /\$?\s*([0-9.,]+)\s*(?:en|por)/i
];

// Patrones para extracción de fechas
const datePatterns = [
  /(?:el|del|fecha)\s*(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?/i,
  /(?:hoy|ayer|anteayer|mañana)/i,
  /(?:lunes|martes|miércoles|jueves|viernes|sábado|domingo)\s*(?:pasado)?/i,
];

module.exports = {
  tempDir,
  dataDir,
  DB_FILE,
  expenseCategories,
  fixedExpenses,
  financialGoals,
  monthlyBudget,
  fixedIncomes,
  intentKeywords,
  amountPatterns,
  datePatterns
};