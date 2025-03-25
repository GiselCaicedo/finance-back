const fs = require('fs');
const config = require('./config');

/**
 * Inicializar la base de datos si no existe
 */
function initDatabase() {
  if (!fs.existsSync(config.DB_FILE)) {
    fs.writeFileSync(config.DB_FILE, JSON.stringify({
      transactions: [],
      fixedExpenses: config.fixedExpenses,
      fixedIncomes: config.fixedIncomes,
      financialGoals: config.financialGoals,
      budget: config.monthlyBudget
    }, null, 2));
  }
}

/**
 * Cargar datos de la base de datos
 * @returns {Object} - Datos cargados
 */
function loadDatabase() {
  try {
    return JSON.parse(fs.readFileSync(config.DB_FILE, 'utf8'));
  } catch (error) {
    console.error('Error cargando la base de datos:', error);
    return {
      transactions: [],
      fixedExpenses: config.fixedExpenses,
      fixedIncomes: config.fixedIncomes,
      financialGoals: config.financialGoals,
      budget: config.monthlyBudget
    };
  }
}

/**
 * Guardar datos en la base de datos
 * @param {Object} data - Datos a guardar
 * @returns {boolean} - Éxito de la operación
 */
function saveDatabase(data) {
  try {
    fs.writeFileSync(config.DB_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Error guardando en la base de datos:', error);
    return false;
  }
}

/**
 * Registra una nueva transacción en la base de datos
 * @param {Object} data - Datos de la transacción
 */
function registerTransaction(data) {
  const db = loadDatabase();
  db.transactions.push(data);
  saveDatabase(db);
}

module.exports = {
  initDatabase,
  loadDatabase,
  saveDatabase,
  registerTransaction
};