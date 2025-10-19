// middlewares/permissionMiddleware.js
const PERMS = require('../auth/permissions'); // role -> [keys]

/**
 * requirePermission('patient:view', { needDept: true, needSpecialty: false, paramDeptKey: 'departmentId', paramSpecKey: 'specialtyId' })
 */
module.exports = (permissionKey, opts = {}) => {
  const {
    needDept = false,
    needSpecialty = false,
    paramDeptKey = 'departmentId',    // de dónde tomar el dept (params/body/query)
    paramSpecKey = 'specialtyId'
  } = opts;

  return (req, res, next) => {
    try {
      const role = req.user?.role;
      if (!role) return res.status(401).json({ message: 'No autenticado' });

      const allowed = PERMS[role] || [];
      if (!allowed.includes(permissionKey)) {
        return res.status(403).json({ message: 'No tienes permisos' });
      }

      // Ámbito por DEPARTAMENTO
      if (needDept) {
        const targetDeptId = req.params[paramDeptKey] || req.body[paramDeptKey] || req.query[paramDeptKey];
        if (!targetDeptId) return res.status(400).json({ message: `Debe enviar ${paramDeptKey}` });
        const allowedDepts = req.user?.deptIds || [];
        if (!allowedDepts.includes(targetDeptId)) {
          return res.status(403).json({ message: 'No tienes acceso a este departamento' });
        }
      }

      // Ámbito por ESPECIALIDAD
      if (needSpecialty) {
        const targetSpecId = req.params[paramSpecKey] || req.body[paramSpecKey] || req.query[paramSpecKey];
        if (!targetSpecId) return res.status(400).json({ message: `Debe enviar ${paramSpecKey}` });
        const allowedSpecs = req.user?.specialtyIds || [];
        if (!allowedSpecs.includes(targetSpecId)) {
          return res.status(403).json({ message: 'No tienes acceso a esta especialidad' });
        }
      }
      console.log('[PERM] allowed?', allowed.includes(permissionKey), 'allowed-list:', allowed);
      next();
    } catch (err) {
      console.error('requirePermission error:', err);
      res.status(500).json({ message: 'Error de permisos' });
    }
  };
};