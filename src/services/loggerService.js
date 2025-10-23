// Logger service para el user-management-service
// Este servicio se comunica con el audit-service para registrar actividades

const axios = require('axios');

const logActivity = async (logData) => {
  try {
    const auditServiceUrl = process.env.AUDIT_SERVICE_URL;
    if (!auditServiceUrl) {
      console.warn('AUDIT_SERVICE_URL not configured. Skipping audit log.');
      return;
    }

    // Preparar datos para el audit service
    const auditData = {
      userId: logData.userId,
      userEmail: logData.userEmail,
      action: logData.action,
      resourceType: logData.entityType || logData.resourceType,
      resourceId: logData.entityId || logData.resourceId,
      description: logData.details || logData.description,
      status: logData.status || 'success',
      service: 'user-management-service',
      metadata: {
        userName: logData.userName,
        newValues: logData.newValues,
        oldValues: logData.oldValues,
        ipAddress: logData.ipAddress,
        userAgent: logData.userAgent,
        ...logData.metadata
      }
    };

    console.log('🔍 Sending Audit Log:', auditData);

    // Implementar llamada HTTP al audit service
    try {
      const response = await axios.post(`${auditServiceUrl}/api/v1/audit/logs`, auditData, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 5000 // 5 segundos timeout
      });

      console.log('✅ Audit log sent successfully:', response.data);
      return response.data;
    } catch (axiosError) {
      console.error('❌ Error connecting to audit service:', axiosError.message);
      if (axiosError.response) {
        console.error('Response status:', axiosError.response.status);
        console.error('Response data:', axiosError.response.data);
      } else if (axiosError.request) {
        console.error('No response received. Is the audit service running?');
      }
      throw axiosError;
    }
    
  } catch (error) {
    console.error('❌ Error logging to audit service:', error.message);
    // No queremos que falle el proceso principal por un error de auditoría
    return { error: true, message: error.message };
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