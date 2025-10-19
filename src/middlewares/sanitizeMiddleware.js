/**
 * Middleware para sanitizar inputs y prevenir XSS
 */
const xss = require('xss');

/**
 * Sanitiza un string contra XSS
 * @param {string} str - String a sanitizar
 * @returns {string} String sanitizado
 */
const sanitizeString = (str) => {
  if (str === null || str === undefined || typeof str !== 'string') {
    return str;
  }
  return xss(str, {
    whiteList: {}, // No permitir ninguna etiqueta HTML
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script'] // Elimina todo el contenido de las etiquetas script
  });
};

/**
 * Sanitiza recursivamente un objeto
 * @param {object} obj - Objeto a sanitizar
 * @returns {object} Objeto sanitizado
 */
const sanitizeObject = (obj) => {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    // Excluimos campos que no deben ser sanitizados (como contraseñas hash)
    if (key === 'password' || key === 'hashedPassword') {
      sanitized[key] = value;
      continue;
    }

    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
};

/**
 * Middleware para sanitizar los cuerpos de solicitud
 */
const sanitizeInputs = (req, res, next) => {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }
  
  next();
};

module.exports = {
  sanitizeInputs,
  sanitizeString,
  sanitizeObject
};