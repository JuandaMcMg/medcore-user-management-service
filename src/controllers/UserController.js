const axios = require("axios");
const { prepareBulkUsersFromCsv } = require("../services/bulkImportService"); 
const {PrismaClient} = require ("../generated/prisma");
const { generateVerificationCode } = require("../config/emailConfig");
const prisma = new PrismaClient();
const bcrypt = require("bcryptjs");

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL; // ej: http://localhost:3001

const { 
  logActivity, 
  logCreate, 
  logUpdate, 
  logDelete, 
  logView,
  sanitizeObject 
} = require('../services/loggerService');

const {  
  VALID_ROLES,
  isEmailValid,
  isPasswordStrong,
  calculateAge,
  isValidAge
} = require("../utils/userUtils");



function buildBulkVerification(status) {
  const st = String(status || "PENDING").toUpperCase();
  if (st !== "PENDING") {
    return { verificationCode: null, verificationCodeExpires: null };
  }
  const verificationCode = generateVerificationCode();
  const expires = new Date();
  expires.setHours(expires.getHours() + 24); // 24 horas de validez
  return { verificationCode, verificationCodeExpires: expires };
}

const createByAdmin = async (req, res) => {

  try {
    let { 
      email, 
      fullname, 
      password, 
      role, 
      id_number, 
      id_type, 
      date_of_birth,
      gender,
      phone,
      address,
      city,
      blood_type
    } = req.body;

    // Validaciones de campos obligatorios
    if (!email || !fullname || !role || !id_number || !id_type || !date_of_birth) {
      return res.status(400).json({ 
        message: "Los campos email, fullname, role, id_number, id_type y date_of_birth son obligatorios" 
      });
    }

    // Validación de email y formato
    email = email.toLowerCase().trim();
    if (!isEmailValid(email)) {
      return res.status(400).json({ message: "El correo electrónico no es válido" });
    }

    // Validación de contraseña
    if (!isPasswordStrong(password)) {
      return res.status(400).json({
        message: "La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número"
      });
    }

    // Validar rol
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ message: "Rol inválido" });
    }

    // Validar fecha de nacimiento y calcular edad
    const birthDate = new Date(date_of_birth);
    const today = new Date();
    
    // Verificar que la fecha sea válida
    if (isNaN(birthDate.getTime())) {
      return res.status(400).json({ message: "La fecha de nacimiento no es válida" });
    }
    
    // Calcular edad
    const age = calculateAge(birthDate);
    
    // Validar rango de edad (0-100 años)
    if (!isValidAge(age)) {
      return res.status(400).json({ message: "La edad debe estar entre 0 y 100 años" });
    }

    // Verificar si ya existe el email o el número de identificación
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { id_number }
        ]
      },
      select: { email: true, id_number: true }
    });

    if (existingUser) {
      const field = existingUser.email === email ? "correo electrónico" : "número de identificación";
      return res.status(400).json({ message: `El ${field} ya está registrado` });
    }

    // Encriptar contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Preparar datos para creación de usuario
    const userData = {
      email,
      password: hashedPassword,
      fullname,
      id_number,
      id_type: id_type.toUpperCase(),
      date_of_birth: birthDate,
      age,
      role: role.toUpperCase(),
      status: "ACTIVE", // Los usuarios creados por admin están activos por defecto
    };
      

    // Agregar campos opcionales si están presentes
    if (gender) userData.gender = gender.toUpperCase();
    if (phone) userData.phone = phone;
    if (address) userData.address = address;
    if (city) userData.city = city;
    if (blood_type) userData.blood_type = blood_type.toUpperCase();

    console.log("🧩 Datos enviados a Prisma:", userData);

    // Guardar en la base de datos
    const newUser = await prisma.user.create({
      data: userData
    });

    // Registrar la creación del usuario
    await logCreate('User', sanitizeObject(newUser), req.user, req, `Usuario ${email} creado por administrador`);

    return res.status(201).json({
      message: "Usuario creado exitosamente",
      user: {
        id: newUser.id,
        email: newUser.email,
        fullname: newUser.fullname,
        role: newUser.role,
        status: newUser.status,
        id_number: newUser.id_number,
        id_type: newUser.id_type,
        date_of_birth: newUser.date_of_birth,
        age: newUser.age
      }
    });
  } catch (error) { 
    console.error("createByAdmin error:", error);
    return res.status(500).json({ message: "Error creando usuario" });
  }

  
};

async function sendVerificationEmailViaAuth(email, code) {
  try {
    await axios.post(`${AUTH_SERVICE_URL}/send-verification`, { email, verificationCode: code });
    return { success: true };
  } catch (err) {
    console.warn(`[EMAIL] No se pudo enviar email a ${email}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

const bulkImport = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: "Adjunta un archivo CSV en el campo 'file'" });
    }

    console.log(`[IMPORT] Archivo recibido: ${req.file.originalname} (${req.file.size} bytes)`);

    // Parsear CSV
    const { records, toInsert, errors, duplicatesCSV } = prepareBulkUsersFromCsv(req.file.buffer);

    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ message: "El archivo CSV está vacío o mal formateado" });
    }

    console.log(`[VALIDATION] A insertar: ${toInsert.length}, errores: ${errors.length}, dupCSV: ${duplicatesCSV.length}`);

    // Duplicados en BD
    const existingUsers = await prisma.user.findMany({
      where: { email: { in: toInsert.map(r => r.email) } },
      select: { email: true }
    });
    const existingEmails = new Set(existingUsers.map(u => u.email));
    const duplicatesDB = [];
    const finalBatch = toInsert.filter(r => {
      if (existingEmails.has(r.email)) {
        duplicatesDB.push({ email: r.email, error: "Email ya existe en la base de datos" });
        return false;
      }
      return true;
    });
    console.log(`[DUPLICATES] dupBD: ${duplicatesDB.length}, finalBatch: ${finalBatch.length}`);

    // Insertar usuarios
    const inserted = [];
    const toEmail = [];

    for (const userData of finalBatch) {
      try {
        const hashed = await bcrypt.hash(userData.passwordPlain, 10);
        const effectiveStatus = (userData.status || "PENDING").toUpperCase();
        const { verificationCode, verificationCodeExpires } = buildBulkVerification(effectiveStatus);

        const dob = userData.date_of_birth ? new Date(userData.date_of_birth) : null;
        const age = userData.age ? Number(userData.age) : (dob ? calculateAge(dob) : null);

        const newUser = await prisma.user.create({
          data: {
            email: userData.email,
            fullname: userData.fullname,
            role: userData.role,
            status: effectiveStatus,
            password: hashed,
            id_number: userData.id_number,
            id_type: userData.id_type || 'CC',
            date_of_birth: dob || undefined,
            age: typeof age === 'number' ? age : undefined,
            gender: userData.gender || undefined,
            phone: userData.phone || undefined,
            city: userData.city || undefined,
            address: userData.address || undefined,
            ...(effectiveStatus === "PENDING" && verificationCode ? {
              verificationCode,
              verificationCodeExpires
            } : {}),
          },
          select: { id: true, email: true, fullname: true, role: true, status: true }
        });

        inserted.push(newUser);

        if (newUser.status === "PENDING" && verificationCode) {
          toEmail.push({ email: newUser.email, code: verificationCode });
        }

      } catch (e) {
        console.error("[INSERT] Error al insertar usuario:", userData.email, e.message);
        errors.push({ email: userData.email, error: "Error al insertar usuario en BD", detail: e.message });
      }
    }

    console.log(`[INSERT] Insertados OK: ${inserted.length}`);

    // Enviar emails vía Auth Service
    let emailsOk = 0, emailsFail = 0;
    if (toEmail.length) {
      const results = await Promise.allSettled(
        toEmail.map(({ email, code }) => sendVerificationEmailViaAuth(email, code))
      );

      for (const r of results) {
        if (r.status === "fulfilled" && r.value.success) emailsOk++;
        else emailsFail++;
      }
      console.log(`[EMAILS] Enviados OK: ${emailsOk}, Fallidos: ${emailsFail}`);
    }

    // Log de actividad
    try {
      await logActivity({
        action: "USUARIOS_IMPORTADOS",
        userId: req.user?.id,
        userEmail: req.user?.email,
        details: `Import masivo: recibidos=${records.length}, insertados=${inserted.length}, errores=${errors.length}, dupCSV=${duplicatesCSV.length}, dupBD=${duplicatesDB.length}`,
        req
      });
    } catch (logErr) {
      console.error("[LOG] No se pudo registrar actividad:", logErr.message);
    }

    return res.status(200).json({
      message: `Importación completada. Total filas: ${records.length}, Insertados: ${inserted.length}, Errores: ${errors.length}, Duplicados CSV: ${duplicatesCSV.length}, Duplicados BD: ${duplicatesDB.length}`,
      inserted,
      duplicatesCSV,
      duplicatesDB,
      errors
    });

  } catch (error) {
    console.error("[IMPORT] Error inesperado:", error);
    return res.status(500).json({ message: "Error interno del servidor por la importación masiva" });
  }
};

// Listar todos los usuarios
const getAllUsers = async (req, res) => {
  try {
    const {
      page = "1",
      limit = "10",
      sortBy = "createdAt",     // email | fullname | role | createdAt | status
      sortOrder = "desc",
      role,
      status,
      q     
    } = req.query;

    // Validar parámetros de entrada
    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(50, Math.max(1, parseInt(limit)));
    const orderField = ["email", "fullname", "role", "createdAt", "status"].includes(sortBy) ? sortBy : "createdAt";
    const orderDirection = sortOrder === "asc" ? "asc" : "desc";

    // Filtros
    const where = {};
    if (role && VALID_ROLES.includes(role)) {
      where.role = role;
    }
    if (status) {
      where.status = status;
    }
    if (q) {
      where.OR = [
        { email: { contains: q, mode: "insensitive" } },
        { fullname: { contains: q, mode: "insensitive" } }
      ];
    }

    // Consulta con paginación y filtros
    const users = await prisma.user.findMany({
      where,
      select: { 
        id: true, 
        email: true, 
        fullname: true, 
        role: true, 
        status: true,
        id_number: true,
        id_type: true,
        age: true,
        createdAt: true 
      },
      orderBy: { [orderField]: orderDirection },
      skip: (pageNum - 1) * pageSize,
      take: pageSize
    });

    // Conteo total para paginación
    const totalUsers = await prisma.user.count({ where });
    
    // Registrar consulta de usuarios
    await logView('User', null, req.user, req, `Consulta de lista de usuarios por ${req.user.email}`);

    return res.json({
      users,
      pagination: {
        total: totalUsers,
        pages: Math.ceil(totalUsers / pageSize),
        currentPage: pageNum,
        pageSize: pageSize
      }
    });
  } catch (error) {
    console.error("getAllUsers error:", error);
    return res.status(500).json({ message: "Error listando usuarios" });
  }
};

// Filtrar usuarios por rol
const getUsersByRole = async (req, res) => {
  try {
    const { role } = req.query;

    if (!role || !VALID_ROLES.includes(role.toUpperCase())) {
      return res.status(400).json({ message: "Rol inválido o no proporcionado" });
    }

    const users = await prisma.user.findMany({
      where: { role: role.toUpperCase() },
      select: {
        id: true,
        email: true,
        fullname: true,
        role: true,
        status: true,
        id_number: true,
        id_type: true,
        age: true,
        createdAt: true
      }
    });

    await logView(
      'User',
      null,
      req.user,
      req,
      `Consulta de usuarios filtrados por rol: ${role.toUpperCase()}`
    );

    return res.json({ users, total: users.length });

  } catch (error) {
    console.error("getUsersByRole error:", error);
    return res.status(500).json({ message: "Error consultando usuarios por rol" });
  }
};

// Obtener doctor por ID
const getDoctorById = async (req, res) => {
  try {
    const { id } = req.params;

    // Buscar usuario por ID
    const user = await prisma.user.findUnique({
      where: { id },
      select: { 
        id: true,
        email: true,
        fullname: true,
        role: true,
        status: true,
        id_number: true,
        id_type: true,
        age: true,
        gender: true,
        phone: true,
        address: true,
        city: true,
        blood_type: true,
        createdAt: true
      }
    });

    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    // Verificar que sea doctor
    if (user.role.toUpperCase() !== "MEDICO") {
      return res.status(403).json({ message: "El usuario no es un médico" });
    }

    await logView('User', user.id, req.user, req, `Consulta de médico ${user.email}`);

    return res.json(user);

  } catch (error) {
    console.error("getDoctorById error:", error);
    return res.status(500).json({ message: "Error consultando doctor" });
  }
};

const updateDoctorById = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Traer usuario por ID y validar que sea doctor
    const doctor = await prisma.user.findUnique({
      where: { id },
    });

    if (!doctor || doctor.role.toUpperCase() !== "MEDICO") {
      return res.status(404).json({ message: "Usuario no es un médico" });
    }

    // Opcional: Validar campos que quieras actualizar
    const allowedFields = [
      "fullname",
      "email",
      "phone",
      "address",
      "city",
      "gender"
    ];

    const dataToUpdate = {};
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        dataToUpdate[field] = updateData[field];
      }
    }

    // Validaciones de email si se actualiza
    if (dataToUpdate.email) {
      const emailLower = dataToUpdate.email.toLowerCase().trim();
      const existingUser = await prisma.user.findFirst({
        where: {
          email: emailLower,
          NOT: { id } // excluir al mismo usuario
        }
      });
      if (existingUser) {
        return res.status(400).json({ message: "El correo ya está registrado" });
      }
      dataToUpdate.email = emailLower;
    }

    // Actualizar usuario en la base de datos
    const updatedDoctor = await prisma.user.update({
      where: { id },
      data: dataToUpdate,
      select: {
        id: true,
        email: true,
        fullname: true,
        role: true,
        phone: true,
        address: true,
        city: true,
        gender: true,
        blood_type: true,
        status: true
      }
    });

    // Registrar log de actualización
    await logUpdate(
      'User',
      sanitizeObject(doctor),
      sanitizeObject(updatedDoctor),
      req.user,
      req,
      `Usuario doctor ${doctor.email} actualizado por ${req.user.email}`
    );

    return res.json({
      message: "Usuario doctor actualizado exitosamente",
      doctor: updatedDoctor
    });

  } catch (error) {
    console.error("updateDoctorById error:", error);
    return res.status(500).json({ message: "Error actualizando usuario doctor" });
  }
};

const updateDoctorStateById = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // nuevo estado enviado en el body

    const VALID_STATUSES = ['ACTIVE', 'DISABLED'];

    if (!status || !VALID_STATUSES.includes(status.toUpperCase())) {
      return res.status(400).json({ message: `Estado inválido. Debe ser uno de: ${VALID_STATUSES.join(', ')}` });
    }

    // Buscar usuario
    const doctor = await prisma.user.findUnique({
      where: { id }
    });

    if (!doctor) {
      return res.status(404).json({ message: "Doctor no encontrado" });
    }

    if (doctor.role !== 'MEDICO') {
      return res.status(400).json({ message: "El usuario no es un médico" });
    }

    // Actualizar estado
    const updatedDoctor = await prisma.user.update({
      where: { id },
      data: { status: status.toUpperCase(), updatedAt: new Date() },
      select: { id: true, email: true, fullname: true, role: true, status: true }
    });

    return res.json({
      message: `Estado actualizado a ${status.toUpperCase()}`,
      doctor: updatedDoctor
    });

  } catch (error) {
    console.error("updateDoctorStateById error:", error);
    return res.status(500).json({ message: "Error actualizando estado del doctor" });
  }
};


const updateNurseStateById = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // nuevo estado enviado en el body

    const VALID_STATUSES = ['ACTIVE', 'DISABLED'];

    if (!status || !VALID_STATUSES.includes(status.toUpperCase())) {
      return res.status(400).json({ message: `Estado inválido. Debe ser uno de: ${VALID_STATUSES.join(', ')}` });
    }

    // Buscar usuario
    const nurse = await prisma.user.findUnique({
      where: { id }
    });

    if (!nurse) {
      return res.status(404).json({ message: "Enfermero no encontrado" });
    }

    if (nurse.role !== 'ENFERMERO') {
      return res.status(400).json({ message: "El usuario no es un enfermero" });
    }

    // Actualizar estado
    const updatedNurse = await prisma.user.update({
      where: { id },
      data: { status: status.toUpperCase(), updatedAt: new Date() },
      select: { id: true, email: true, fullname: true, role: true, status: true }
    });

    return res.json({
      message: `Estado actualizado a ${status.toUpperCase()}`,
      nurse: updatedNurse
    });

  } catch (error) {
    console.error("updateNurseStateById error:", error);
    return res.status(500).json({ message: "Error actualizando estado del enfermero" });
  }
};


const updateNurseById = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Traer usuario por ID y validar que sea enfermero
    const nurse = await prisma.user.findUnique({
      where: { id },
    });

    if (!nurse || nurse.role.toUpperCase() !== "ENFERMERO") {
      return res.status(404).json({ message: "Usuario no es un enfermero" });
    }

    // Opcional: Validar campos que quieras actualizar
    const allowedFields = [
      "fullname",
      "email",
      "phone",
      "address",
      "city",
      "gender"
    ];

    const dataToUpdate = {};
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        dataToUpdate[field] = updateData[field];
      }
    }

    // Validaciones de email si se actualiza
    if (dataToUpdate.email) {
      const emailLower = dataToUpdate.email.toLowerCase().trim();
      const existingUser = await prisma.user.findFirst({
        where: {
          email: emailLower,
          NOT: { id } // excluir al mismo usuario
        }
      });
      if (existingUser) {
        return res.status(400).json({ message: "El correo ya está registrado" });
      }
      dataToUpdate.email = emailLower;
    }

    // Actualizar usuario en la base de datos
    const updatedNurse = await prisma.user.update({
      where: { id },
      data: dataToUpdate,
      select: {
        id: true,
        email: true,
        fullname: true,
        role: true,
        phone: true,
        address: true,
        city: true,
        gender: true,
        blood_type: true,
        status: true
      }
    });

    // Registrar log de actualización
    await logUpdate(
      'User',
      sanitizeObject(nurse),
      sanitizeObject(updatedNurse),
      req.user,
      req,
      `Usuario enfermero ${nurse.email} actualizado por ${req.user.email}`
    );

    return res.json({
      message: "Usuario enfermero actualizado exitosamente",
      nurse: updatedNurse
    });

  } catch (error) {
    console.error("updateNurseById error:", error);
    return res.status(500).json({ message: "Error actualizando usuario enfermero" });
  }
};


const getNursesById = async (req, res) => {
  try {
    const { id } = req.params;

    // Buscar usuario por ID
    const user = await prisma.user.findUnique({
      where: { id },
      select: { 
        id: true,
        email: true,
        fullname: true,
        role: true,
        status: true,
        id_number: true,
        id_type: true,
        age: true,
        gender: true,
        phone: true,
        address: true,
        city: true,
        blood_type: true,
        createdAt: true
      }
    });

    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    // Verificar que sea enfermero
    if (user.role.toUpperCase() !== "ENFERMERO") {
      return res.status(403).json({ message: "El usuario no es un enfermero" });
    }

    await logView('User', user.id, req.user, req, `Consulta de enfermero ${user.email}`);

    return res.json(user);

  } catch (error) {
    console.error("getNursesById error:", error);
    return res.status(500).json({ message: "Error consultando enfermero" });
  }
};


// buscar 1 usuario
const getUserById = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { 
        id: true, 
        email: true, 
        fullname: true, 
        role: true, 
        status: true, 
        id_number: true,
        id_type: true,
        date_of_birth: true,
        age: true,
        gender: true,
        phone: true,
        address: true,
        city: true,
        blood_type: true,
        createdAt: true 
      }
    });
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    
    await logView('User', user.id, req.user, req, `Consulta de usuario ${user.email}`);
    
    res.json(user);
  } catch (error) {
    console.error("[PUBLIC] get user error:", error);
    res.status(500).json({ message: "Error consultando usuario" });
  }
};

// Desactivar usuario
const deactivate = async (req, res) => {
  try {
    // Obtener usuario antes de actualizar
    const user = await prisma.user.findUnique({
      where: { id: req.params.id }
    });

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.params.id },
      data: { status: "DISABLED", updatedAt: new Date() },
      select: { id: true, email: true, fullname: true, role: true, status: true }
    });

    await logUpdate(
      'User', 
      sanitizeObject(user), 
      sanitizeObject(updatedUser), 
      req.user, 
      req, 
      `Usuario ${user.email} desactivado por ${req.user.email}`
    );

    return res.json({ message: "Usuario desactivado" });
  } catch (error) {
    console.error("deactivate error:", error);
    return res.status(500).json({ message: "Error desactivando usuario" });
  }
};

// Activar usuario
const activate = async (req, res) => {
  try {
    // Obtener usuario antes de actualizar
    const user = await prisma.user.findUnique({
      where: { id: req.params.id }
    });

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.params.id },
      data: { status: "ACTIVE", updatedAt: new Date() },
      select: { id: true, email: true, fullname: true, role: true, status: true }
    });
    
    await logUpdate(
      'User', 
      sanitizeObject(user), 
      sanitizeObject(updatedUser), 
      req.user, 
      req, 
      `Usuario ${user.email} activado por ${req.user.email}`
    );

    return res.json({ message: "Usuario activado" });
  } catch (error) {
    console.error("activate error:", error);
    return res.status(500).json({ message: "Error activando usuario" });
  }
};

const updatePassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;

    // Verificar formato de la nueva contraseña
    if (!isPasswordStrong(newPassword)) {
      return res.status(400).json({
        message: "La nueva contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número"
      });
    }

    // Verificar que el usuario existe
    const user = await prisma.user.findUnique({
      where: { id }
    });

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    // Verificar que el usuario autenticado está modificando su propia contraseña o es admin
    if (req.user.id !== id && req.user.role !== 'ADMINISTRADOR') {
      return res.status(403).json({ message: "No tienes permisos para realizar esta acción" });
    }

    // Verificar contraseña actual
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: "La contraseña actual es incorrecta" });
    }

    // Verificar que la nueva contraseña no sea igual a la actual
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({ message: "La nueva contraseña debe ser diferente a la actual" });
    }

    // Encriptar nueva contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Actualizar contraseña
    const updatedUser = await prisma.user.update({
      where: { id },
      data: { 
        password: hashedPassword,
        updatedAt: new Date()
      },
      select: { id: true, email: true, fullname: true, role: true }
    });

    await logUpdate(
      'User',
      { id: user.id, action: 'password_change' },
      { id: updatedUser.id, action: 'password_updated' },
      req.user,
      req,
      `Contraseña actualizada para usuario ${user.email}`
    );

    return res.status(200).json({
      message: "Contraseña actualizada exitosamente",
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        fullname: updatedUser.fullname,
        role: updatedUser.role
      }
    });
  } catch (error) {
    console.error("Error al actualizar la contraseña:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Eliminar usuario (soft delete)
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que el usuario existe
    const user = await prisma.user.findUnique({
      where: { id }
    });

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    // No permitir eliminar al propio usuario
    if (req.user.id === id) {
      return res.status(400).json({ message: "No puedes eliminar tu propia cuenta" });
    }

    // Eliminar usuario (esto podría ser un soft delete cambiando el status)
    await prisma.user.update({
      where: { id },
      data: { 
        status: "DELETED",
        updatedAt: new Date()
      }
    });

    await logDelete('User', sanitizeObject(user), req.user, req, `Usuario ${user.email} eliminado por ${req.user.email}`);

    return res.json({ message: "Usuario eliminado exitosamente" });
  } catch (error) {
    console.error("deleteUser error:", error);
    return res.status(500).json({ message: "Error eliminando usuario" });
  }


};

module.exports = {
  createByAdmin,
  getAllUsers,
  getUserById,
  deactivate,
  activate,
  updatePassword,
  deleteUser,
  bulkImport,
  getUsersByRole,
  getDoctorById,
  getNursesById,
  updateDoctorById,
  updateNurseById,
  updateDoctorStateById,
  updateNurseStateById
};