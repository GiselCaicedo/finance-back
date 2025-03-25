const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { createWorker } = require('tesseract.js');
const config = require('../config');
const textUtils = require('../utils/textProcessing');

/**
 * Procesa una foto de recibo desde Telegram
 * @param {Object} msg - Mensaje de Telegram con foto
 * @param {Object} bot - Instancia del bot de Telegram
 * @param {string} token - Token de Telegram
 * @returns {Object} - Datos extraídos del recibo
 */
async function processReceiptPhoto(msg, bot, token) {
  // Obtener la foto en la mejor resolución disponible
  const photoId = msg.photo[msg.photo.length - 1].file_id;
  const fileInfo = await bot.getFile(photoId);
  const fileUrl = `https://api.telegram.org/file/bot${token}/${fileInfo.file_path}`;
  
  // Descargar la imagen
  const response = await axios({
    method: 'GET',
    url: fileUrl,
    responseType: 'stream'
  });
  
  const imagePath = path.join(config.tempDir, `${Date.now()}.jpg`);
  const writer = fs.createWriteStream(imagePath);
  
  return new Promise((resolve, reject) => {
    response.data.pipe(writer);
    
    writer.on('finish', async () => {
      try {
        // Procesar la imagen con OCR
        const receiptData = await processReceipt(imagePath);
        fs.unlinkSync(imagePath); // Limpiar archivo temporal
        resolve(receiptData);
      } catch (error) {
        reject(error);
      }
    });
    
    writer.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Procesa una imagen de recibo usando Tesseract OCR
 * @param {string} imagePath - Ruta de la imagen a procesar
 * @returns {Object} - Datos estructurados del recibo
 */
async function processReceipt(imagePath) {
  // Inicializar Tesseract
  const worker = await createWorker('spa');
  
  // Configurar para optimizar el reconocimiento de recibos
  await worker.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,:/%-$€ ',
  });
  
  // Procesar la imagen
  const { data } = await worker.recognize(imagePath);
  await worker.terminate();
  
  // Texto extraído
  const extractedText = data.text;
  
  // Extraer información relevante
  const receiptData = {
    tipo: 'gasto',
    texto_completo: extractedText,
    monto: extractAmount(extractedText),
    fecha: extractDate(extractedText),
    concepto: extractMerchant(extractedText),
    categoria: textUtils.categorizeExpense(extractedText),
    items: extractItems(extractedText),
    timestamp: new Date().toISOString()
  };
  
  return receiptData;
}

/**
 * Extrae el monto total del texto
 * @param {string} text - Texto extraído del recibo
 * @returns {string} - Monto total formateado
 */
function extractAmount(text) {
  // Patrones comunes para montos en recibos
  const patterns = [
    /TOTAL\s*[\$€]?\s*([0-9.,]+)/i,
    /IMPORTE\s*[\$€]?\s*([0-9.,]+)/i,
    /TOTAL\s*:?\s*[\$€]?\s*([0-9.,]+)/i,
    /[\$€]\s*([0-9.,]+)/
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim().replace(',', '.');
    }
  }
  
  return null;
}

/**
 * Extrae la fecha del texto
 * @param {string} text - Texto extraído del recibo
 * @returns {string} - Fecha formateada (YYYY-MM-DD)
 */
function extractDate(text) {
  // Patrones comunes para fechas en recibos
  const patterns = [
    /FECHA\s*:?\s*(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{2,4})/i,
    /FECHA\s*:?\s*(\d{2,4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})/i,
    /(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{2,4})/,
    /(\d{2,4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})/
  ];
  
  const today = new Date();
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let day, month, year;
      
      // Determinar el formato de la fecha
      if (parseInt(match[1]) > 31) {
        // Formato yyyy-mm-dd
        year = parseInt(match[1]);
        month = parseInt(match[2]);
        day = parseInt(match[3]);
      } else {
        // Formato dd-mm-yyyy
        day = parseInt(match[1]);
        month = parseInt(match[2]);
        year = parseInt(match[3]);
        
        // Ajustar año si está en formato de 2 dígitos
        if (year < 100) {
          year += year < 50 ? 2000 : 1900;
        }
      }
      
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  
  // Si no se encuentra fecha, devolver la fecha actual
  return textUtils.formatDate(today);
}

/**
 * Extrae el nombre del comercio del texto
 * @param {string} text - Texto extraído del recibo
 * @returns {string} - Nombre del comercio
 */
function extractMerchant(text) {
  // Buscar nombres de comercios
  const lines = text.split('\n').filter(line => line.trim() !== '');
  
  // Intentar encontrar un nombre de comercio en las primeras líneas
  // Normalmente aparecen en las primeras líneas
  const possibleNames = lines.slice(0, 5);
  
  for (const line of possibleNames) {
    // Descartar líneas que probablemente no sean nombres de comercios
    if (line.toLowerCase().includes('factura') || 
        line.toLowerCase().includes('ticket') || 
        line.match(/^\d+/) || // Líneas que empiezan con números
        line.match(/total|importe|fecha|iva|rut|nit/i)) {
      continue;
    }
    
    // Si la línea parece un nombre (no muy corto, no muy largo)
    if (line.length > 3 && line.length < 40) {
      return line.trim();
    }
  }
  
  // Si no se encuentra un comercio, usar la categoría
  const categoria = textUtils.categorizeExpense(text);
  return categoria !== 'otros' ? 
    categoria.charAt(0).toUpperCase() + categoria.slice(1) : 
    'Comercio no identificado';
}

/**
 * Extrae los ítems del recibo
 * @param {string} text - Texto extraído del recibo
 * @returns {Array} - Array de ítems con nombre y precio
 */
function extractItems(text) {
  const items = [];
  const lines = text.split('\n');
  
  // Intentar identificar líneas que contengan ítems y precios
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine === '') continue;
    
    // Patrones comunes para líneas de ítems en recibos
    const priceMatch = trimmedLine.match(/(.+)\s+[\$€]?\s*([0-9.,]+)$/);
    
    if (priceMatch && priceMatch[1] && priceMatch[2]) {
      const name = priceMatch[1].trim();
      const price = priceMatch[2].replace(',', '.');
      
      // Descartar líneas que no parecen ítems
      if (name.length > 2 && 
          !name.toLowerCase().includes('total') &&
          !name.toLowerCase().includes('iva') &&
          !name.toLowerCase().includes('subtotal')) {
        items.push({
          nombre: name,
          precio: price
        });
      }
    }
  }
  
  return items;
}

/**
 * Formatea los datos del recibo para mostrarlos al usuario
 * @param {Object} data - Datos del recibo
 * @returns {string} - Mensaje formateado en Markdown
 */
function formatReceiptData(data) {
  let message = `📝 *Recibo procesado*\n\n`;
  message += `*Comercio:* ${data.concepto}\n`;
  message += `*Monto total:* $${data.monto}\n`;
  message += `*Categoría:* ${data.categoria}\n`;
  message += `*Fecha:* ${data.fecha}\n`;
  
  if (data.items && data.items.length > 0) {
    message += '\n*Detalles:*\n';
    data.items.slice(0, 5).forEach(item => {
      message += `- ${item.nombre}: $${item.precio}\n`;
    });
    
    if (data.items.length > 5) {
      message += `... y ${data.items.length - 5} ítems más\n`;
    }
  }
  
  return message;
}

module.exports = {
  processReceiptPhoto,
  processReceipt,
  formatReceiptData
};