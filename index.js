require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');

// Importar módulos
const config = require('./config');
const database = require('./database');
const expenseController = require('./controllers/expenseController');
const reportController = require('./controllers/reportController');
const receiptController = require('./controllers/receiptController');
const goalController = require('./controllers/goalController');
const textProcessing = require('./utils/textProcessing');

// Configuración del bot de Telegram
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// Crear directorios si no existen
if (!fs.existsSync(config.tempDir)) fs.mkdirSync(config.tempDir);
if (!fs.existsSync(config.dataDir)) fs.mkdirSync(config.dataDir);

// Inicializar la base de datos
database.initDatabase();

// Manejador principal de mensajes
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  
  // Manejar imágenes (recibos)
  if (msg.photo) {
    await handlePhoto(msg, chatId);
  } else if (msg.text) {
    // Procesamiento de comandos y mensajes de texto
    if (msg.text.startsWith('/')) {
      handleCommands(msg, chatId);
    } else {
      processTextMessage(msg, chatId);
    }
  }
});

/**
 * Procesa fotos de recibos
 * @param {Object} msg - Mensaje de Telegram
 * @param {number} chatId - ID del chat
 */
async function handlePhoto(msg, chatId) {
  bot.sendMessage(chatId, '📸 Procesando tu recibo...');
  
  try {
    // Procesar el recibo y enviar resultados
    const receiptData = await receiptController.processReceiptPhoto(msg, bot, token);
    
    // Registrar la transacción
    database.registerTransaction(receiptData);
    
    // Verificar si supera el porcentaje del presupuesto
    const budgetAlert = expenseController.checkBudgetAlert(receiptData);
    
    // Enviar resultados al usuario
    let message = receiptController.formatReceiptData(receiptData);
    
    // Añadir alerta de presupuesto si es necesario
    if (budgetAlert) {
      message += `\n\n⚠️ *¡Alerta de presupuesto!* ${budgetAlert}`;
    }
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error procesando la imagen:', error);
    bot.sendMessage(chatId, '❌ Hubo un error al procesar tu recibo. Por favor, intenta nuevamente.');
  }
}

/**
 * Procesa mensajes de texto
 * @param {Object} msg - Mensaje de Telegram
 * @param {number} chatId - ID del chat
 */
function processTextMessage(msg, chatId) {
  // Procesar el texto para extraer información financiera
  const intent = textProcessing.getIntent(msg.text);
  
  switch (intent) {
    case 'gasto':
    case 'ingreso':
      expenseController.processExpenseOrIncome(msg, intent, bot);
      break;
    case 'meta':
      goalController.processGoal(msg, bot);
      break;
    case 'reporte':
      reportController.sendReport(msg, 'general', bot);
      break;
    case 'presupuesto':
      expenseController.processBudget(msg, bot);
      break;
    default:
      // No se identificó intención clara
      bot.sendMessage(chatId, 
        '❓ No pude identificar claramente qué quieres hacer.\n\n' +
        'Puedes usar comandos como:\n' +
        '/start - Iniciar el bot\n' +
        '/help - Ver ayuda\n' +
        '/reporte - Ver reportes financieros\n' +
        '/metas - Ver tus metas financieras\n' +
        '/presupuesto - Ver tu presupuesto mensual\n\n' +
        'O puedes enviarme mensajes como:\n' +
        '- "Gasté $1500 en el supermercado ayer"\n' +
        '- "Recibí $500000 de proyecto freelance"\n' +
        '- "Quiero ver mi reporte del mes"'
      );
  }
}

/**
 * Maneja los comandos del bot
 * @param {Object} msg - Mensaje de Telegram
 * @param {number} chatId - ID del chat
 */
function handleCommands(msg, chatId) {
  const command = msg.text.split(' ')[0].toLowerCase();
  
  switch (command) {
    case '/start':
      bot.sendMessage(chatId, 
        '¡Bienvenido a tu Gestor Financiero Personal Mejorado! 📊\n\n' +
        'Puedes enviarme:\n' +
        '- 📸 Fotos de recibos y facturas\n' +
        '- ✍️ Texto describiendo tus gastos o ingresos\n' +
        '- 🎯 Configurar y seguir tus metas financieras\n' +
        '- 📈 Solicitar reportes y análisis\n\n' +
        'Comandos disponibles:\n' +
        '/help - Ver comandos disponibles\n' +
        '/reporte - Ver reportes financieros\n' +
        '/metas - Ver tus metas financieras\n' +
        '/presupuesto - Ver tu presupuesto mensual\n' +
        '/gastosfijos - Ver gastos fijos configurados\n' +
        '/ingresos - Ver tus fuentes de ingreso\n\n' +
        'Te ayudaré a organizar tus finanzas automáticamente.'
      );
      break;
      
    case '/help':
      bot.sendMessage(chatId, 
        '📚 *Comandos disponibles:*\n\n' +
        '/start - Iniciar el bot\n' +
        '/reporte - Ver reportes financieros\n' +
        '/reporte_semanal - Ver reporte de la última semana\n' +
        '/reporte_mensual - Ver reporte del mes actual\n' +
        '/metas - Ver tus metas financieras\n' +
        '/add_meta - Añadir nueva meta financiera\n' +
        '/presupuesto - Ver tu presupuesto mensual\n' +
        '/gastosfijos - Ver gastos fijos configurados\n' +
        '/ingresos - Ver tus fuentes de ingreso\n' +
        '/add_ingreso - Registrar nuevo ingreso\n\n' +
        '📝 *Ejemplos de mensajes:*\n' +
        '- "Gasté $45000 en el supermercado"\n' +
        '- "Recibí $500000 de proyecto freelance"\n' +
        '- "Quiero ver mi reporte del mes"\n' +
        '- "Destiné $50000 para mi meta de pantalla nueva"\n',
        { parse_mode: 'Markdown' }
      );
      break;
      
    case '/reporte':
      reportController.sendReport(msg, 'general', bot);
      break;
      
    case '/reporte_semanal':
      reportController.sendReport(msg, 'semanal', bot);
      break;
      
    case '/reporte_mensual':
      reportController.sendReport(msg, 'mensual', bot);
      break;
      
    case '/metas':
      goalController.sendGoalsStatus(chatId, bot);
      break;
      
    case '/add_meta':
      bot.sendMessage(chatId, 
        '🎯 *Agregar nueva meta financiera*\n\n' +
        'Por favor, envía un mensaje con el siguiente formato:\n' +
        '"Meta: [Nombre de la meta], Monto: $[cantidad], Fecha: [DD/MM/YYYY]"\n\n' +
        'Ejemplo: "Meta: Viaje a la playa, Monto: $1500000, Fecha: 15/12/2024"',
        { parse_mode: 'Markdown' }
      );
      break;
      
    case '/presupuesto':
      expenseController.sendBudgetStatus(chatId, bot);
      break;
      
    case '/gastosfijos':
      expenseController.sendFixedExpenses(chatId, bot);
      break;
      
    case '/ingresos':
      expenseController.sendIncomeStatus(chatId, bot);
      break;
      
    case '/add_ingreso':
      bot.sendMessage(chatId, 
        '💰 *Registrar nuevo ingreso*\n\n' +
        'Por favor, envía un mensaje con el siguiente formato:\n' +
        '"Ingreso: [concepto], Monto: $[cantidad]"\n\n' +
        'Ejemplo: "Ingreso: Proyecto diseño web, Monto: $450000"',
        { parse_mode: 'Markdown' }
      );
      break;
      
    default:
      bot.sendMessage(chatId, 'Comando no reconocido. Usa /help para ver los comandos disponibles.');
  }
}

console.log('Bot iniciado correctamente. Esperando mensajes...');