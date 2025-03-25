const config = require('../config');
const database = require('../database');
const textUtils = require('../utils/textProcessing');

/**
 * Procesa gastos o ingresos identificados en mensajes de texto
 * @param {Object} msg - Mensaje de Telegram
 * @param {string} intent - Intención identificada ('gasto' o 'ingreso')
 * @param {Object} bot - Instancia del bot de Telegram 
 */
function processExpenseOrIncome(msg, intent, bot) {
  const chatId = msg.chat.id;
  const textData = textUtils.processText(msg.text, intent);
  
  if (textData && textData.monto) {
    // Registrar la transacción
    database.registerTransaction(textData);
    
    // Verificar alerta de presupuesto si es un gasto
    let budgetAlert = '';
    if (intent === 'gasto') {
      budgetAlert = checkBudgetAlert(textData);
    }
    
    // Enviar resultados al usuario
    let message = textUtils.formatTextData(textData);
    
    if (budgetAlert) {
      message += `\n\n⚠️ *¡Alerta de presupuesto!* ${budgetAlert}`;
    }
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } else {
    bot.sendMessage(chatId, 
      '❓ No pude identificar el monto o algunos detalles importantes.\n\n' +
      'Por favor, sé más específico. Por ejemplo:\n' +
      '- "Gasté $45000 en el supermercado"\n' +
      '- "Recibí $500000 por proyecto freelance"'
    );
  }
}

/**
 * Procesa un texto para actualizar el presupuesto mensual
 * @param {Object} msg - Mensaje de Telegram
 * @param {Object} bot - Instancia del bot de Telegram
 */
function processBudget(msg, bot) {
  const chatId = msg.chat.id;
  const text = msg.text.toLowerCase();
  
  // Verificar si es una consulta de estado de presupuesto
  if (text.includes('ver') || text.includes('estado') || text.includes('consultar')) {
    sendBudgetStatus(chatId, bot);
    return;
  }
  
  // Verificar si es una actualización de presupuesto
  const categoryMatch = text.match(/(?:presupuesto|asignar|destinar)\s+(?:para|a|en)?\s+(.+?)\s+(?:de)?\s*\$?\s*([0-9.,]+)/i);
  
  if (categoryMatch) {
    const categoryName = categoryMatch[1].trim().toLowerCase();
    const amount = parseFloat(categoryMatch[2].replace(',', '.'));
    
    // Encontrar la categoría que mejor coincida
    let bestCategory = null;
    let bestScore = 0;
    
    for (const category of Object.keys(config.expenseCategories)) {
      // Simple coincidencia por inclusión de texto
      if (categoryName.includes(category) || category.includes(categoryName)) {
        const score = Math.min(category.length, categoryName.length);
        if (score > bestScore) {
          bestScore = score;
          bestCategory = category;
        }
      }
      
      // Buscar en palabras clave de la categoría
      for (const keyword of config.expenseCategories[category]) {
        if (categoryName.includes(keyword)) {
          const score = keyword.length;
          if (score > bestScore) {
            bestScore = score;
            bestCategory = category;
          }
        }
      }
    }
    
    if (bestCategory) {
      // Actualizar presupuesto
      const db = database.loadDatabase();
      db.budget[bestCategory] = amount;
      database.saveDatabase(db);
      
      bot.sendMessage(chatId, 
        `✅ *Presupuesto actualizado*\n\n` +
        `*Categoría:* ${bestCategory}\n` +
        `*Nuevo presupuesto:* ${amount.toLocaleString()}\n\n` +
        `Usa /presupuesto para ver tu presupuesto completo.`,
        { parse_mode: 'Markdown' }
      );
    } else {
      bot.sendMessage(chatId, 
        '❓ No pude identificar claramente la categoría.\n\n' +
        'Las categorías disponibles son:\n' +
        Object.keys(config.expenseCategories).map(c => `- ${c}`).join('\n')
      );
    }
  } else {
    sendBudgetStatus(chatId, bot);
  }
}

/**
 * Envía el estado actual del presupuesto
 * @param {number} chatId - ID del chat
 * @param {Object} bot - Instancia del bot de Telegram
 */
function sendBudgetStatus(chatId, bot) {
  const db = database.loadDatabase();
  
  // Filtrar transacciones del mes actual
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  
  const expenses = db.transactions.filter(t => {
    const transDate = new Date(t.fecha);
    return t.tipo === 'gasto' && 
           transDate >= startOfMonth && 
           transDate <= today;
  });
  
  // Agrupar gastos por categoría
  const expensesByCategory = expenses.reduce((acc, t) => {
    const category = t.categoria || 'otros';
    if (!acc[category]) acc[category] = 0;
    acc[category] += parseFloat(t.monto);
    return acc;
  }, {});
  
  // Generar mensaje
  let message = '📊 *Estado del presupuesto mensual*\n\n';
  
  let totalBudget = 0;
  let totalSpent = 0;
  
  Object.entries(db.budget).forEach(([category, budgeted]) => {
    const spent = expensesByCategory[category] || 0;
    const remaining = budgeted - spent;
    const percentage = budgeted > 0 ? (spent / budgeted) * 100 : 0;
    
    totalBudget += budgeted;
    totalSpent += spent;
    
    let status;
    if (percentage >= 100) {
      status = "⚠️ Superado";
    } else if (percentage >= 75) {
      status = "⚠️ Cerca del límite";
    } else if (percentage >= 50) {
      status = "✅ En buen camino";
    } else {
      status = "🟢 Bajo control";
    }
    
    message += `*${category}:*\n`;
    message += `- Gastado: ${spent.toLocaleString()} de ${budgeted.toLocaleString()} (${percentage.toFixed(0)}%)\n`;
    message += `- Restante: ${remaining.toLocaleString()} ${status}\n\n`;
  });
  
  // Resumen general
  const totalPercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
  message += `📈 *Resumen general:*\n`;
  message += `- Presupuesto total: ${totalBudget.toLocaleString()}\n`;
  message += `- Gasto total: ${totalSpent.toLocaleString()} (${totalPercentage.toFixed(0)}%)\n`;
  message += `- Restante: ${(totalBudget - totalSpent).toLocaleString()}\n\n`;
  
  message += `Para modificar tu presupuesto, envía un mensaje como:\n`;
  message += `"Asignar presupuesto de $200000 para restaurantes"`;
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

/**
 * Verifica si el gasto supera el porcentaje del presupuesto mensual
 * @param {Object} data - Datos de la transacción
 * @returns {string|null} - Mensaje de alerta o null si no hay alerta
 */
function checkBudgetAlert(data) {
  if (data.tipo !== 'gasto' || !data.categoria) return null;
  
  const db = database.loadDatabase();
  const category = data.categoria;
  
  // Verificar si la categoría tiene presupuesto
  if (!db.budget[category]) return null;
  
  // Obtener gastos del mes en esa categoría
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  
  const expenses = db.transactions.filter(t => {
    const transDate = new Date(t.fecha);
    return t.tipo === 'gasto' && 
           t.categoria === category &&
           transDate >= startOfMonth && 
           transDate <= today;
  });
  
  // Sumar todos los gastos incluyendo el actual
  const totalSpent = expenses.reduce((sum, t) => sum + parseFloat(t.monto), 0) + parseFloat(data.monto);
  const budgeted = db.budget[category];
  
  // Calcular porcentaje gastado
  const percentageSpent = (totalSpent / budgeted) * 100;
  
  if (percentageSpent >= 100) {
    return `Has superado el presupuesto para ${category} (${budgeted.toLocaleString()}).`;
  } else if (percentageSpent >= 75) {
    return `Has alcanzado el ${percentageSpent.toFixed(0)}% del presupuesto para ${category}.`;
  }
  
  return null;
}

/**
 * Envía información sobre los gastos fijos
 * @param {number} chatId - ID del chat
 * @param {Object} bot - Instancia del bot de Telegram
 */
function sendFixedExpenses(chatId, bot) {
  const db = database.loadDatabase();
  
  let message = '📌 *Gastos fijos configurados*\n\n';
  
  if (db.fixedExpenses.length === 0) {
    message += 'No tienes gastos fijos configurados.';
  } else {
    // Ordenar por fecha de pago
    const sortedExpenses = [...db.fixedExpenses].sort((a, b) => a.fechaPago - b.fechaPago);
    
    let totalMonthly = 0;
    
    sortedExpenses.forEach(expense => {
      totalMonthly += expense.monto;
      message += `*${expense.nombre}*\n`;
      message += `- Monto: ${expense.monto.toLocaleString()}\n`;
      message += `- Fecha de pago: Día ${expense.fechaPago} de cada mes\n`;
      message += `- Categoría: ${expense.categoria}\n\n`;
    });
    
    message += `💰 *Total mensual en gastos fijos:* ${totalMonthly.toLocaleString()}\n\n`;
  }
  
  message += `Para agregar un nuevo gasto fijo, contacta al administrador del sistema.`;
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

/**
 * Envía información sobre las fuentes de ingreso
 * @param {number} chatId - ID del chat
 * @param {Object} bot - Instancia del bot de Telegram
 */
function sendIncomeStatus(chatId, bot) {
  const db = database.loadDatabase();
  
  // Obtener promedio de ingresos variables
  const today = new Date();
  const sixMonthsAgo = new Date(today);
  sixMonthsAgo.setMonth(today.getMonth() - 6);
  
  // Filtrar ingresos variables de los últimos 6 meses
  const variableIncomes = db.transactions.filter(t => {
    const transDate = new Date(t.fecha);
    return t.tipo === 'ingreso' && 
           transDate >= sixMonthsAgo && 
           transDate <= today &&
           !t.concepto.toLowerCase().includes('salario');
  });
  
  // Calcular promedio mensual
  const variableIncomeTotal = variableIncomes.reduce((sum, t) => sum + parseFloat(t.monto), 0);
  const monthsInRange = Math.max(1, Math.ceil((today - sixMonthsAgo) / (30 * 24 * 60 * 60 * 1000)));
  const averageMonthlyVariable = variableIncomeTotal / monthsInRange;
  
  // Generar mensaje
  let message = '💵 *Fuentes de ingreso*\n\n';
  
  // Ingresos fijos
  message += '📌 *Ingresos fijos:*\n';
  if (db.fixedIncomes.length === 0) {
    message += 'No tienes ingresos fijos configurados.\n';
  } else {
    let totalFixed = 0;
    db.fixedIncomes.forEach(income => {
      totalFixed += income.monto;
      message += `- *${income.nombre}:* ${income.monto.toLocaleString()} (Día ${income.fechaIngreso})\n`;
    });
    message += `*Total mensual fijo:* ${totalFixed.toLocaleString()}\n`;
  }
  
  // Ingresos variables
  message += '\n💹 *Ingresos variables (promedio últimos 6 meses):*\n';
  message += `- *Freelance y otros:* ${Math.round(averageMonthlyVariable).toLocaleString()}/mes\n`;
  
  // Total combinado
  const totalFixedIncome = db.fixedIncomes.reduce((sum, inc) => sum + inc.monto, 0);
  const estimatedMonthlyIncome = totalFixedIncome + averageMonthlyVariable;
  
  message += '\n📊 *Proyección de ingresos mensuales:*\n';
  message += `- *Total estimado:* ${Math.round(estimatedMonthlyIncome).toLocaleString()}\n`;
  
  if (variableIncomes.length > 0) {
    // Mostrar últimos ingresos variables
    message += '\n📝 *Últimos ingresos variables:*\n';
    variableIncomes
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
      .slice(0, 3)
      .forEach(income => {
        message += `- ${income.fecha}: ${income.concepto} - ${parseFloat(income.monto).toLocaleString()}\n`;
      });
  }
  
  message += '\nPara registrar un nuevo ingreso, envía un mensaje como:\n';
  message += '"Recibí $450000 por proyecto de diseño"';
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

module.exports = {
  processExpenseOrIncome,
  processBudget,
  sendBudgetStatus,
  checkBudgetAlert,
  sendFixedExpenses,
  sendIncomeStatus
};