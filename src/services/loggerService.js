// Logger service para el user-management-service
// Este servicio se comunica con el audit-service para registrar actividades

const logActivity = async (logData) => {
  try {
    const auditServiceUrl = process.env.AUDIT_SERVICE_URL;
    if (!auditServiceUrl) {
      console.warn('AUDIT_SERVICE_URL not configured. Skipping audit log.');
      return;
    }

    // En un entorno de producción, aquí harías una llamada HTTP al audit service
    // Por ahora, simplemente logueamos en consola
    console.log('🔍 Audit Log:', {
      timestamp: new Date().toISOString(),
      service: 'user-management-service',
      ...logData
    });
    
    // TODO: Implementar llamada HTTP al audit service
    // const response = await fetch(`${auditServiceUrl}/api/v1/audit/log`, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify(logData)
    // });
    
  } catch (error) {
    console.error('Error logging to audit service:', error);
  }
};

const logCreate = async (entityType, newValues, user, req, details) => {
  await logActivity({
    action: 'CREATE',
    entityType,
    entityId: newValues.id,
    userId: user.id,
    userEmail: user.email,
    userName: user.fullname,
    newValues,
    details,
    ipAddress: req?.ip || req?.socket?.remoteAddress,
    userAgent: req?.get('User-Agent')
  });
};

const logUpdate = async (entityType, oldValues, newValues, user, req, details) => {
  await logActivity({
    action: 'UPDATE',
    entityType,
    entityId: newValues.id,
    userId: user.id,
    userEmail: user.email,
    userName: user.fullname,
    oldValues,
    newValues,
    details,
    ipAddress: req?.ip || req?.socket?.remoteAddress,
    userAgent: req?.get('User-Agent')
  });
};

const logDelete = async (entityType, deletedValues, user, req, details) => {
  await logActivity({
    action: 'DELETE',
    entityType,
    entityId: deletedValues.id,
    userId: user.id,
    userEmail: user.email,
    userName: user.fullname,
    oldValues: deletedValues,
    details,
    ipAddress: req?.ip || req?.socket?.remoteAddress,
    userAgent: req?.get('User-Agent')
  });
};

const logView = async (entityType, entityId, user, req, details) => {
  await logActivity({
    action: 'VIEW',
    entityType,
    entityId,
    userId: user.id,
    userEmail: user.email,
    userName: user.fullname,
    details,
    ipAddress: req?.ip || req?.socket?.remoteAddress,
    userAgent: req?.get('User-Agent')
  });
};

// Función para sanitizar objetos removiendo campos sensibles
const sanitizeObject = (obj) => {
  if (!obj) return obj;
  
  const sensitiveFields = ['password', 'verificationCode'];
  const sanitized = { ...obj };
  
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });
  
  return sanitized;
};

module.exports = {
  logActivity,
  logCreate,
  logUpdate,
  logDelete,
  logView,
  sanitizeObject
};