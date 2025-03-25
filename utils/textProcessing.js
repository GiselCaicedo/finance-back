const natural = require('natural');
const { WordTokenizer, SentenceTokenizer } = natural;
const wordTokenizer = new WordTokenizer();
const sentenceTokenizer = new SentenceTokenizer();

const config = require('../config');

/**
 * Determina la intención principal del mensaje
 * @param {string} text - Texto del usuario
 * @returns {string} - Intención identificada
 */
function getIntent(text) {
  const textLower = text.toLowerCase();
  
  // Revisar cada grupo de palabras clave
  for (const [intent, keywords] of Object.entries(config.intentKeywords)) {
    for (const keyword of keywords) {
      if (textLower.includes(keyword)) {
        return intent;
      }
    }
  }
  
  // Si hay un monto, probablemente es un gasto
  if (extractAmountFromText(text) !== null) {
    return 'gasto';
  }
  
  return null;
}

/**
 * Extrae el monto de un texto
 * @param {string} text - Texto del usuario
 * @returns {string} - Monto en formato numérico o null
 */
function extractAmountFromText(text) {
  for (const pattern of config.amountPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      // Normalizar el formato del monto
      return match[1].trim().replace(',', '.');
    }
  }
  
  return null;
}

/**
 * Extrae la fecha de un texto
 * @param {string} text - Texto del usuario
 * @returns {string} - Fecha en formato yyyy-mm-dd
 */
function extractDateFromText(text) {
  const today = new Date();
  
  // Buscar patrones de fecha específicos
  const dateMatch = text.match(config.datePatterns[0]);
  if (dateMatch) {
    const day = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10);
    let year = dateMatch[3] ? parseInt(dateMatch[3], 10) : today.getFullYear();
    
    // Ajustar año si está en formato de 2 dígitos
    if (year < 100) {
      year += year < 50 ? 2000 : 1900;
    }
    
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  
  // Buscar palabras clave de tiempo relativo
  if (text.toLowerCase().includes('hoy')) {
    return formatDate(today);
  } else if (text.toLowerCase().includes('ayer')) {
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    return formatDate(yesterday);
  } else if (text.toLowerCase().includes('anteayer')) {
    const dayBeforeYesterday = new Date(today);
    dayBeforeYesterday.setDate(today.getDate() - 2);
    return formatDate(dayBeforeYesterday);
  }
  
  // Si no se encuentra fecha, devolver la fecha actual
  return formatDate(today);
}

/**
 * Formatea una fecha como yyyy-mm-dd
 * @param {Date} date - Objeto fecha
 * @returns {string} - Fecha formateada
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Extrae el concepto o comercio del texto
 * @param {string} text - Texto del usuario
 * @param {string} tipo - Tipo de transacción ('gasto' o 'ingreso')
 * @returns {string} - Concepto extraído o 'No especificado'
 */
function extractConceptFromText(text, tipo = 'gasto') {
  const textLower = text.toLowerCase();
  
  // Lista de preposiciones para buscar "en X", "para X", "de X", etc.
  const prepositions = ['en', 'de', 'para', 'por', 'a'];
  
  // Buscar patrones como "en el supermercado", "para el médico"
  for (const prep of prepositions) {
    const pattern = new RegExp(`${prep}\\s+(el|la|los|las)?\\s*([\\wáéíóúüñ\\s]+)`, 'i');
    const match = textLower.match(pattern);
    
    if (match && match[2]) {
      // Limpiar y devolver el concepto
      let concept = match[2].trim();
      
      // Eliminar palabras finales que sean montos o fechas
      concept = concept.replace(/\$?\s*[0-9.,]+\s*(?:pesos)?$/, '').trim();
      concept = concept.replace(/\d{1,2}[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?$/, '').trim();
      
      if (concept.length > 0) {
        return concept.charAt(0).toUpperCase() + concept.slice(1);
      }
    }
  }
  
  // Para ingresos, buscar "por X", "de X"
  if (tipo === 'ingreso') {
    for (const prep of ['por', 'de']) {
      const pattern = new RegExp(`${prep}\\s+([\\wáéíóúüñ\\s]+)`, 'i');
      const match = textLower.match(pattern);
      
      if (match && match[1]) {
        let concept = match[1].trim();
        concept = concept.replace(/\$?\s*[0-9.,]+\s*(?:pesos)?$/, '').trim();
        
        if (concept.length > 0) {
          if (concept.toLowerCase().includes('freelance') || 
              concept.toLowerCase().includes('proyecto')) {
            return 'Freelance: ' + concept.charAt(0).toUpperCase() + concept.slice(1);
          }
          return concept.charAt(0).toUpperCase() + concept.slice(1);
        }
      }
    }
    
    // Si no hay preposición pero está la palabra "freelance" o "proyecto"
    if (textLower.includes('freelance') || textLower.includes('proyecto')) {
      return 'Freelance';
    }
    
    return 'Ingreso variable';
  }
  
  // Buscar en categorías si no se encuentra un concepto específico
  const categoriaEncontrada = categorizeExpense(text);
  if (categoriaEncontrada !== 'otros') {
    return categoriaEncontrada.charAt(0).toUpperCase() + categoriaEncontrada.slice(1);
  }
  
  return 'No especificado';
}

/**
 * Categoriza el gasto basado en palabras clave
 * @param {string} text - Texto del recibo o mensaje
 * @returns {string} - Categoría del gasto
 */
function categorizeExpense(text) {
  const textLower = text.toLowerCase();
  
  for (const [category, keywords] of Object.entries(config.expenseCategories)) {
    for (const keyword of keywords) {
      if (textLower.includes(keyword.toLowerCase())) {
        return category;
      }
    }
  }
  
  return 'otros';
}

/**
 * Procesa el texto del usuario para extraer información financiera
 * @param {string} text - Texto del usuario
 * @param {string} forcedIntent - Intención forzada (opcional)
 * @returns {Object} - Datos estructurados de la información financiera
 */
function processText(text, forcedIntent = null) {
  const textLower = text.toLowerCase();
  const tokens = wordTokenizer.tokenize(textLower);
  
  // Detectar la intención (gasto o ingreso)
  let tipo = forcedIntent || detectIntent(tokens, textLower);
  
  // Extraer el monto
  const monto = extractAmountFromText(text);
  
  // Extraer la fecha
  const fecha = extractDateFromText(text);
  
  // Extraer comercio o concepto
  const concepto = extractConceptFromText(text, tipo);
  
  // Categorizar
  const categoria = tipo === 'gasto' ? categorizeExpense(text) : 'ingreso';
  
  return {
    tipo: tipo,
    monto: monto,
    fecha: fecha,
    concepto: concepto,
    categoria: categoria,
    texto_completo: text,
    timestamp: new Date().toISOString()
  };
}

/**
 * Detecta la intención del mensaje (gasto o ingreso)
 * @param {Array} tokens - Array de palabras del mensaje
 * @param {string} fullText - Texto completo en minúsculas
 * @returns {string} - 'gasto', 'ingreso' o null
 */
function detectIntent(tokens, fullText) {
  // Verificar si hay palabras clave de gasto
  for (const keyword of config.intentKeywords.gasto) {
    if (fullText.includes(keyword)) {
      return 'gasto';
    }
  }
  
  // Verificar si hay palabras clave de ingreso
  for (const keyword of config.intentKeywords.ingreso) {
    if (fullText.includes(keyword)) {
      return 'ingreso';
    }
  }
  
  // Si no hay intención clara, hacer una suposición basada en contexto
  // Suponer que es un gasto por defecto si hay un monto
  return (extractAmountFromText(fullText) !== null) ? 'gasto' : null;
}

/**
 * Formatea los datos de texto para mostrar al usuario
 * @param {Object} data - Datos extraídos del texto
 * @returns {string} - Mensaje formateado en Markdown
 */
function formatTextData(data) {
  if (data.tipo === 'gasto') {
    return `💸 *Gasto registrado*\n\n` +
           `*Monto:* $${data.monto}\n` +
           `*Concepto:* ${data.concepto}\n` +
           `*Categoría:* ${data.categoria}\n` +
           `*Fecha:* ${data.fecha}\n`;
  } else if (data.tipo === 'ingreso') {
    return `💰 *Ingreso registrado*\n\n` +
           `*Monto:* $${data.monto}\n` +
           `*Concepto:* ${data.concepto}\n` +
           `*Fecha:* ${data.fecha}\n`;
  }
  
  return '';
}

module.exports = {
  getIntent,
  extractAmountFromText,
  extractDateFromText,
  formatDate,
  extractConceptFromText,
  categorizeExpense,
  processText,
  formatTextData
};