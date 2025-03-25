const database = require('../database');

/**
 * Envía reportes financieros según el tipo solicitado
 * @param {Object} msg - Mensaje de Telegram
 * @param {string} reportType - Tipo de reporte (semanal, mensual, o general para determinar)
 * @param {Object} bot - Instancia del bot de Telegram
 */
function sendReport(msg, reportType = 'general', bot) {
  const chatId = msg.chat.id;
  const text = msg.text.toLowerCase();
  
  // Determinar el tipo de reporte basado en el texto si no se especificó
  if (reportType === 'general') {
    if (text.includes('semanal') || text.includes('semana')) {
      reportType = 'semanal';
    } else if (text.includes('mensual') || text.includes('mes')) {
      reportType = 'mensual';
    } else if (text.includes('anual') || text.includes('año')) {
      reportType = 'anual';
    } else {
      reportType = 'mensual'; // Por defecto mostrar mensual
    }
  }
  
  // Generar el reporte
  const report = generateFinancialReport(reportType);
  
  // Enviar resultados
  bot.sendMessage(chatId, report, { parse_mode: 'Markdown' });
}

/**
 * Genera un reporte financiero basado en los datos almacenados
 * @param {string} reportType - Tipo de reporte (semanal, mensual, anual)
 * @returns {string} - Reporte formateado en Markdown
 */
function generateFinancialReport(reportType) {
  const db = database.loadDatabase();
  const hoy = new Date();
  let transactions, startDate, endDate;
  
  // Establecer el rango de fechas según el tipo de reporte
  switch (reportType) {
    case 'semanal':
      startDate = new Date(hoy);
      startDate.setDate(hoy.getDate() - 7);
      endDate = hoy;
      break;
    case 'anual':
      startDate = new Date(hoy.getFullYear(), 0, 1);
      endDate = hoy;
      break;
    case 'mensual':
    default:
      startDate = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      endDate = hoy;
  }
  
  // Filtrar transacciones en el rango de fechas
  transactions = db.transactions.filter(t => {
    const transDate = new Date(t.fecha);
    return transDate >= startDate && transDate <= endDate;
  });
  
  // Separar por tipo
  const expenses = transactions.filter(t => t.tipo === 'gasto');
  const incomes = transactions.filter(t => t.tipo === 'ingreso' || t.tipo === 'ingreso_fijo');
  const savings = transactions.filter(t => t.tipo === 'ahorro');
  
  // Calcular totales
  const totalExpenses = expenses.reduce((sum, t) => sum + parseFloat(t.monto), 0);
  const totalIncomes = incomes.reduce((sum, t) => sum + parseFloat(t.monto), 0);
  const totalSavings = savings.reduce((sum, t) => sum + parseFloat(t.monto), 0);
  const balance = totalIncomes - totalExpenses - totalSavings;
  
  // Calcular porcentaje de ahorro
  const savingRate = totalIncomes > 0 ? (totalSavings / totalIncomes) * 100 : 0;
  
  // Agrupar gastos por categoría
  const expensesByCategory = expenses.reduce((acc, t) => {
    const category = t.categoria || 'otros';
    if (!acc[category]) acc[category] = 0;
    acc[category] += parseFloat(t.monto);
    return acc;
  }, {});
  
  // Ordenar categorías por monto
  const sortedCategories = Object.entries(expensesByCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5); // Top 5 categorías
  
  // Generar el reporte
  let periodName;
  switch (reportType) {
    case 'semanal':
      periodName = 'la última semana';
      break;
    case 'anual':
      periodName = 'el año actual';
      break;
    case 'mensual':
    default:
      periodName = 'este mes';
  }
  
  let report = `📊 *Reporte Financiero de ${periodName}*\n\n`;
  
  // Resumen de ingresos y gastos
  report += `💰 *Ingresos totales:* ${totalIncomes.toLocaleString()}\n`;
  report += `💸 *Gastos totales:* ${totalExpenses.toLocaleString()}\n`;
  report += `🏦 *Ahorros:* ${totalSavings.toLocaleString()} (${savingRate.toFixed(1)}%)\n`;
  report += `⚖️ *Balance:* ${balance.toLocaleString()}\n\n`;
  
  // Distribución de gastos por categoría
  report += `📉 *Principales categorías de gasto:*\n`;
  if (sortedCategories.length > 0) {
    sortedCategories.forEach(([category, amount]) => {
      const percentage = (amount / totalExpenses) * 100;
      report += `- *${category}:* ${amount.toLocaleString()} (${percentage.toFixed(1)}%)\n`;
    });
  } else {
    report += `- No hay gastos registrados en este período\n`;
  }
  
  // Análisis de presupuesto
  if (reportType === 'mensual') {
    report += `\n📋 *Análisis de presupuesto:*\n`;
    
    Object.entries(db.budget).forEach(([category, budgeted]) => {
      const spent = expensesByCategory[category] || 0;
      const percentage = budgeted > 0 ? (spent / budgeted) * 100 : 0;
      
      let status;
      if (percentage >= 100) {
        status = "⚠️ Cerca del límite";
      } else if (percentage >= 50) {
        status = "✅ En buen camino";
      } else {
        status = "🟢 Bajo control";
      }
      
      report += `- *${category}:* ${spent.toLocaleString()}/${budgeted.toLocaleString()} (${percentage.toFixed(0)}%) ${status}\n`;
    });
  }
  
  // Métricas clave
  report += `\n📈 *Métricas clave:*\n`;
  report += `- *Ratio de ahorro:* ${savingRate.toFixed(1)}%\n`;
  
  if (totalIncomes > 0 && totalExpenses > 0) {
    const expenseToIncomeRatio = (totalExpenses / totalIncomes) * 100;
    report += `- *Ratio gastos/ingresos:* ${expenseToIncomeRatio.toFixed(1)}%\n`;
    
    // Calcular promedio de ingresos variables
    const fixedIncomesTotal = db.fixedIncomes.reduce((sum, inc) => sum + inc.monto, 0);
    const variableIncomesTotal = totalIncomes - fixedIncomesTotal;
    
    if (variableIncomesTotal > 0) {
      report += `- *Ingresos variables:* ${variableIncomesTotal.toLocaleString()}\n`;
    }
  }
  
  // Consejos personalizados basados en los datos
  report += `\n✨ *Consejos personalizados:*\n`;
  
  if (balance < 0) {
    report += `- Estás en déficit este período. Considera revisar tus gastos en ${sortedCategories[0] ? sortedCategories[0][0] : 'categorías principales'}.\n`;
  } else if (savingRate < 10) {
    report += `- Tu ratio de ahorro está por debajo del 10%. Intenta aumentar tus ahorros para alcanzar metas financieras.\n`;
  } else if (savingRate > 20) {
    report += `- ¡Excelente ratio de ahorro! Mantén este ritmo para alcanzar tus metas más rápido.\n`;
  }
  
  // Recordatorio de gastos fijos próximos
  const today = new Date();
  const upcomingExpenses = db.fixedExpenses.filter(exp => {
    let daysUntilPayment = exp.fechaPago - today.getDate();
    
    // Manejar casos de fin de mes
    if (daysUntilPayment < 0) {
      // Calcular días hasta el próximo mes
      const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      daysUntilPayment = lastDayOfMonth - today.getDate() + exp.fechaPago;
    }
    
    return daysUntilPayment >= 0 && daysUntilPayment <= 7;
  });
  
  if (upcomingExpenses.length > 0) {
    report += `\n⏰ *Recordatorio de pagos próximos:*\n`;
    upcomingExpenses.forEach(exp => {
      const daysUntilPayment = exp.fechaPago - today.getDate();
      report += `- *${exp.nombre}:* ${exp.monto.toLocaleString()} (en ${daysUntilPayment} día${daysUntilPayment !== 1 ? 's' : ''})\n`;
    });
  }
  
  return report;
}

module.exports = {
  sendReport,
  generateFinancialReport
};