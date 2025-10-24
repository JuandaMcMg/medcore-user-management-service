const axios = require("axios");
const { prepareBulkUsersFromCsv } = require("../services/bulkImportService"); 
const {PrismaClient} = require ("../generated/prisma");
const { generateVerificationCode } = require("../config/emailConfig");
const prisma = new PrismaClient();
const bcrypt = require("bcryptjs");
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL; // ej: http://localhost:3001
const ORG_SERVICE_URL = process.env.ORG_SERVICE_URL || "http://localhost:3004/api/v1";

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

const VALID_ID_TYPES = new Set(["CC", "TI", "CE", "PP", "NIT"]);const createDoctor = async (req, res) => {
  const token = req.headers.authorization; // Reenviar token
  try {
    const {
      fullname,
      email,
      password,
      id_number,
      id_type,
      date_of_birth,
      departmentId,
      specialtyId
    } = req.body;

    // Validaciones básicas
    if (!fullname || !email || !password || !id_number || !id_type || !date_of_birth) {
      return res.status(400).json({ message: "Todos los campos obligatorios deben ser enviados" });
    }

    // Validar formato del correo
    if (!isEmailValid(email)) {
      return res.status(400).json({ message: "Correo electrónico inválido" });
    }

    // Validar contraseña
    if (!isPasswordStrong(password)) {
      return res.status(400).json({ message: "La contraseña no cumple los requisitos mínimos" });
    }

    // Calcular edad
    const birthDate = new Date(date_of_birth);
    const age = calculateAge(birthDate);
    if (!isValidAge(age)) {
      return res.status(400).json({ message: "Edad fuera de rango válido" });
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

    // Crear usuario en user-management
    console.log(" [USER-MANAGEMENT] Creando usuario en base de datos...");
    const newDoctor = await prisma.user.create({
      data: {
        fullname,
        email: email.toLowerCase(),
        password: hashedPassword,
        id_number,
        id_type,
        date_of_birth: birthDate,
        age,
        role: "MEDICO",
        status: "ACTIVE"
      }
    });

    console.log("✅ [USER-MANAGEMENT] Usuario médico creado:", newDoctor.id);

    // Crear afiliación en organization-service
    console.log(" [USER-MANAGEMENT] Registrando afiliación en ORGANIZATION-SERVICE...");
    try {
      const orgResponse = await axios.post(
        "http://localhost:3004/api/v1/affiliations",
        {
          userId: newDoctor.id,
          role: "MEDICO",
          departmentId,
          specialtyId
        },
        {
          headers: {
            Authorization: token
          }
        }
      );

      console.log("✅ [ORGANIZATION-SERVICE] Afiliación registrada:", orgResponse.data);
    } catch (orgError) {
      console.error("❌ [ORGANIZATION-SERVICE] Error al crear afiliación:", orgError.response?.data || orgError.message);
      return res.status(orgError.response?.status || 500).json({
        message: "Error al registrar la afiliación del médico",
        error: orgError.response?.data || orgError.message
      });
    }

    // Registrar log de creación
    await logCreate("User", newDoctor, req.user, req, `Médico ${email} creado exitosamente`);

    return res.status(201).json({
      message: "Médico creado y afiliado correctamente",
      user: {
        id: newDoctor.id,
        fullname: newDoctor.fullname,
        email: newDoctor.email,
        role: newDoctor.role
      }
    });
  } catch (error) {
    console.error(" [USER-MANAGEMENT] Error al registrar el doctor:", error);
    return res.status(500).json({
      message: "Error al registrar el doctor",
      error: error.message
    });
  }
};

const createNurse = async (req, res) => {
  const token = req.headers.authorization;
  try {
    const {
      fullname,
      email,
      password,
      id_number,
      id_type,
      date_of_birth,
      departmentId
    } = req.body;

    if (!fullname || !email || !password || !id_number || !id_type || !date_of_birth || !departmentId) {
      return res.status(400).json({ message: "Todos los campos son obligatorios" });
    }

    if (!isEmailValid(email)) {
      return res.status(400).json({ message: "Correo electrónico inválido" });
    }

    if (!isPasswordStrong(password)) {
      return res.status(400).json({ message: "Contraseña insegura" });
    }

    const birthDate = new Date(date_of_birth);
    const age = calculateAge(birthDate);
    if (!isValidAge(age)) {
      return res.status(400).json({ message: "Edad fuera de rango válido" });
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

    const hashedPassword = await bcrypt.hash(password, 10);

    console.log("🧩 [USER-MANAGEMENT] Creando usuario enfermero...");
    const newNurse = await prisma.user.create({
      data: {
        fullname,
        email: email.toLowerCase(),
        password: hashedPassword,
        id_number,
        id_type,
        date_of_birth: birthDate,
        age,
        role: "ENFERMERO",
        status: "ACTIVE"
      }
    });

    console.log("✅ [USER-MANAGEMENT] Usuario enfermero creado:", newNurse.id);

    // Registrar afiliación con departmentId
    try {
      const orgResponse = await axios.post(
        "http://localhost:3004/api/v1/affiliations",
        {
          userId: newNurse.id,
          role: "ENFERMERO",
          departmentId
        },
        { headers: { Authorization: token } }
      );

      console.log("🏥 [ORGANIZATION-SERVICE] Afiliación registrada:", orgResponse.data);
    } catch (orgError) {
      console.error("❌ [ORGANIZATION-SERVICE] Error al crear afiliación:", orgError.response?.data || orgError.message);
      return res.status(orgError.response?.status || 500).json({
        message: "Error al registrar la afiliación del enfermero",
        error: orgError.response?.data || orgError.message
      });
    }

    await logCreate("User", newNurse, req.user, req, `Enfermero ${email} creado exitosamente`);

    return res.status(201).json({
      message: "Enfermero creado y afiliado correctamente",
      user: {
        id: newNurse.id,
        fullname: newNurse.fullname,
        email: newNurse.email,
        role: newNurse.role
      }
    });
  } catch (error) {
    console.error("❌ [USER-MANAGEMENT] Error al crear enfermero:", error);
    return res.status(500).json({ message: "Error interno al crear enfermero", error: error.message });
  }
};


async function sendVerificationEmailViaAuth(email, fullname, code, expiresInHours = 24) {
  try {
    await axios.post(
      `${AUTH_SERVICE_URL}/api/v1/auth/send-verification`,
      { email, fullname, verificationCode: code, expiresInHours },
      { timeout: 10000 }
    );
    return { success: true };
  } catch (err) {
    console.warn(
      `[EMAIL] No se pudo enviar email a ${email}: ${err.message}`,
      err.response?.status, err.response?.data
    );
    return { success: false, error: err.message };
  }
}

function normUpper(s) {
  return (s ?? "").toString().trim().toUpperCase();
}

async function upsertDepartmentByName(name) {
  const n = normUpper(name);
  if (!n) return null;
  let dep = await prisma.department.findFirst({ where: { name: n } });
  if (!dep) dep = await prisma.department.create({ data: { name: n } });
  return dep;
}

async function upsertSpecialtyByName(name, departmentId) {
  const n = normUpper(name);
  if (!n) return null;
  let sp = await prisma.specialty.findFirst({ where: { name: n } });
  if (!sp) {
    if (!departmentId) return null; // no crear sin depto
    sp = await prisma.specialty.create({ data: { name: n, departmentId } });
  }
  return sp;
}

function normalizeRole(role) {
  const r = normUpper(role);
  if (r === "ENFERMERA") return "ENFERMERO";
  return r;
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
      status: "PENDING", // Los usuarios creados por admin están activos por defecto
    };
      

    // Agregar campos opcionales si están presentes
    if (gender) userData.gender = gender.toUpperCase();
    if (phone) userData.phone = phone;
    if (address) userData.address = address;
    if (city) userData.city = city;
    if (blood_type) userData.blood_type = blood_type.toUpperCase();

    console.log("🧩 Datos enviados a Prisma:", userData);
    console.log("🧪 userData to Prisma:", JSON.stringify(userData, null, 2));

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

function buildBulkVerification(status) {
  // Solo genera código si el usuario está en estado pendiente
  if (status !== "PENDING") {
    return { verificationCode: null, verificationCodeExpires: null };
  }

  const verificationCode = generateVerificationCode(); // ya la tienes importada
  const verificationCodeExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora desde ahora

  return { verificationCode, verificationCodeExpires };
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

    for (const r of finalBatch) {
      try {
        const email = r.email.toLowerCase().trim();
        const fullname = r.fullname?.trim();
        const role = normalizeRole(r.role);
        const passwordPlain = r.passwordPlain || r.current_password || "TempPass123!";
        const status = normUpper(r.status || "PENDING");
        const phone = r.phone?.trim();
        const dob = r.date_of_birth ? new Date(r.date_of_birth) : null;
        const age = dob ? calculateAge(dob) : null;

        // ⚠️ AQUÍ: define idTypeValue a partir del CSV (tu CSV no lo trae, así que será null)
        const idTypeRaw = (r.id_type || "").toString().trim().toUpperCase();
        const idTypeValue = VALID_ID_TYPES.has(idTypeRaw) ? idTypeRaw : null;

        const hashed = await bcrypt.hash(passwordPlain, 10);
        const { verificationCode, verificationCodeExpires } = buildBulkVerification(status);
        
        const user = await prisma.user.create({
          data: {
            email,
            fullname,
            password: hashed,
            role,
            status,
            phone: phone || undefined,
            date_of_birth: dob || undefined,
            age: typeof age === "number" ? age : undefined,
            ...(status === "PENDING" && verificationCode ? { verificationCode, verificationCodeExpires } : {}),
            ...(idTypeValue ? { id_type: idTypeValue } : {}),
            ...(r.id_number ? { id_number: String(r.id_number).trim() } : {}),
          },
          select: { id: true, email: true, fullname: true, role: true, status: true }
        });

        inserted.push(user);

        // 2) Perfiles por rol
        if (role === "PACIENTE") {
          await prisma.patient.create({
            data: {
              userId: user.id,
              fullname: user.id.fullname,
              birthDate: dob || undefined,
              age: typeof age === "number" ? age : undefined,
              phone: phone || undefined,
              status: "ACTIVE"
            }
          });
        } else if (role === "MEDICO" || role === "ENFERMERO") {
          const departmentName = r.department;
          const specialtyName = r.specialization;
          const license = r.license_number;

          const dep = await upsertDepartmentByName(departmentName);
          const spec = await upsertSpecialtyByName(specialtyName, dep?.id);

          if (dep) {
            await prisma.userDeptRole.create({
              data: {
                userId: user.id,
                departmentId: dep.id,
                role,
                specialtyId: spec?.id || undefined
              }
            });
          }
        }
        // Emails de verificación (si aplica)
        if (user.status === "PENDING" && verificationCode) {
          toEmail.push({ email: user.email, fullname: user.fullname, code: verificationCode });
        }

      } catch (e) {
        console.error("[INSERT] Error al insertar fila:", r.email, e.message);
        errors.push({ email: r.email, error: "Error al insertar usuario en BD", detail: e.message });
      }
    }


    console.log(`[INSERT] Insertados OK: ${inserted.length}`);

    // Enviar emails vía Auth Service
    let emailsOk = 0, emailsFail = 0;

    if (toEmail.length) {
      const results = await Promise.allSettled(
        toEmail.map(({ email, fullname, code }) => sendVerificationEmailViaAuth(email, fullname, code, 24))
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
      limit = "20",
      sortBy = "createdAt",     // email | fullname | role | createdAt | status
      sortOrder = "desc",
      role,
      specialty,
      state,
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
    
    // Filtro por rol
    if (role) {
      let roleValue = role.toUpperCase();
      // Mapear alias comunes a los roles válidos
      const roleMap = {
        'DOCTOR': 'MEDICO',
        'NURSE': 'ENFERMERO', 
        'PATIENT': 'PACIENTE',
        'ADMIN': 'ADMINISTRADOR'
      };
      
      if (roleMap[roleValue]) {
        roleValue = roleMap[roleValue];
      }
      
      if (VALID_ROLES.includes(roleValue)) {
        where.role = roleValue;
        console.log(`🔍 Filtro aplicado - Rol: ${roleValue}`);
      } else {
        console.log(`⚠️  Rol inválido recibido: ${role}, roles válidos: ${VALID_ROLES.join(', ')}`);
      }
    }
    
    // Filtro por estado (acepta tanto 'state' como 'status' para compatibilidad)
    const userState = state || status;
    if (userState) {
      where.status = userState.toUpperCase();
    }
    
    // Filtro por búsqueda de texto
    if (q) {
      where.OR = [
        { email: { contains: q, mode: "insensitive" } },
        { fullname: { contains: q, mode: "insensitive" } }
      ];
    }

    // Filtro por especialidad (solo para médicos y enfermeros)
    if (specialty) {
      where.userDeptRoles = {
        some: {
          specialty: {
            name: { contains: specialty, mode: "insensitive" }
          }
        }
      };
    }

    console.log('🔍 Filtros aplicados:', where);

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
        createdAt: true,
        userDeptRoles: {
          select: {
            role: true,
            department: {
              select: {
                id: true,
                name: true
              }
            },
            specialty: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      },
      orderBy: { [orderField]: orderDirection },
      skip: (pageNum - 1) * pageSize,
      take: pageSize
    });

    console.log(`📊 Usuarios encontrados: ${users.length}, roles: ${users.map(u => u.role).join(', ')}`);

    // Conteo total para paginación
    const totalUsers = await prisma.user.count({ where });
    
    // Construir descripción de filtros aplicados
    const appliedFilters = [];
    if (role) appliedFilters.push(`role: ${role}`);
    if (specialty) appliedFilters.push(`specialty: ${specialty}`);
    if (userState) appliedFilters.push(`state: ${userState}`);
    if (q) appliedFilters.push(`search: ${q}`);
    
    const filtersDesc = appliedFilters.length > 0 
      ? ` con filtros: ${appliedFilters.join(', ')}` 
      : '';

    // Registrar consulta de usuarios
    await logView('User', null, req.user, req, `Consulta de lista de usuarios por ${req.user.email}${filtersDesc}`);

    return res.json({
      users,
      pagination: {
        total: totalUsers,
        pages: Math.ceil(totalUsers / pageSize),
        currentPage: pageNum,
        pageSize: pageSize
      },
      filters: {
        role,
        specialty,
        state: userState,
        search: q,
        page: pageNum,
        limit: pageSize,
        sortBy: orderField,
        sortOrder: orderDirection
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

const toggleUserStatus = async (req, res) => {
  try {
    const userId = req.params.id;
    console.log("🟢 [USER-SERVICE] Cambio de estado solicitado para:", userId);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      console.log("🔴 Usuario no encontrado:", userId);
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

     // 🚫 Si el usuario está en estado PENDING, no se puede cambiar
    if (user.status === "PENDING") {
      console.log("⚠️ El usuario aún no ha verificado su cuenta:", user.email);
      return res.status(400).json({
        message:
          "El usuario aún no ha verificado su cuenta. No puede ser activado ni deshabilitado hasta completar la verificación.",
      });
    }

    const newStatus = user.status ===  "ACTIVE" ? "DISABLED" : "ACTIVE";

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { status: newStatus },
    });

    console.log("✅ Estado actualizado:", updatedUser.status);

    return res.status(200).json({
      message: `Usuario ${newStatus === "ACTIVE" ? "activado" : "deshabilitado"}`,
      user: updatedUser,
    });

  } catch (error) {
    console.error("❌ [USER-SERVICE] Error al cambiar estado:", error);
    return res.status(500).json({ message: "Error al cambiar el estado del usuario", error: error.message });
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

// Filtrar doctores por especialidad
const getDoctorsBySpecialty = async (req, res) => {
  try {
    const { specialty } = req.query;
    const token = req.headers.authorization;

    // Validar que se proporcione la especialidad
    if (!specialty) {
      return res.status(400).json({ 
        message: "El parámetro 'specialty' es requerido" 
      });
    }

    console.log(`🔍 [USER-SERVICE] Buscando doctores por especialidad: ${specialty}`);

    // 1. Obtener afiliaciones de médicos con la especialidad específica
    let affiliationsResponse;
    try {
      affiliationsResponse = await axios.get(
        `${ORG_SERVICE_URL}/affiliations`,
        {
          params: {
            role: 'MEDICO',
            specialty: specialty
          },
          headers: {
            Authorization: token
          }
        }
      );
    } catch (affiliationError) {
      console.error("❌ Error al obtener afiliaciones:", affiliationError.response?.data || affiliationError.message);
      return res.status(500).json({
        message: "Error al consultar las afiliaciones de médicos",
        error: affiliationError.response?.data || affiliationError.message
      });
    }

    const affiliations = affiliationsResponse.data;
    console.log(`📊 [USER-SERVICE] Afiliaciones encontradas: ${affiliations.length}`);

    if (affiliations.length === 0) {
      return res.json({
        message: "No se encontraron médicos con la especialidad especificada",
        doctors: [],
        total: 0
      });
    }

    // 2. Extraer IDs de usuarios
    const userIds = affiliations
      .filter(affiliation => affiliation.userId && affiliation.user)
      .map(affiliation => affiliation.userId);

    if (userIds.length === 0) {
      return res.json({
        message: "No se encontraron usuarios médicos con la especialidad especificada",
        doctors: [],
        total: 0
      });
    }

    // 3. Obtener información completa de los usuarios
    const doctors = await prisma.user.findMany({
      where: {
        id: { in: userIds },
        status: "ACTIVE" // Solo médicos activos
      },
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

    console.log(`✅ [USER-SERVICE] Médicos encontrados: ${doctors.length}`);

    // 4. Combinar información de usuarios con sus afiliaciones
    const doctorsWithSpecialties = doctors.map(doctor => {
      const doctorAffiliations = affiliations.filter(aff => aff.userId === doctor.id);
      
      // Extraer información de departamentos y especialidades
      const departments = [];
      const specialties = [];

      doctorAffiliations.forEach(aff => {
        if (aff.department && !departments.some(dept => dept.id === aff.department.id)) {
          departments.push({
            id: aff.department.id,
            name: aff.department.name
          });
        }
        
        if (aff.specialty && !specialties.some(spec => spec.id === aff.specialty.id)) {
          specialties.push({
            id: aff.specialty.id,
            name: aff.specialty.name
          });
        }
      });

      return {
        ...doctor,
        departments,
        specialties,
        affiliations: doctorAffiliations.map(aff => ({
          id: aff.id,
          role: aff.role,
          department: aff.department ? { id: aff.department.id, name: aff.department.name } : null,
          specialty: aff.specialty ? { id: aff.specialty.id, name: aff.specialty.name } : null,
          createdAt: aff.createdAt
        }))
      };
    });

    // Registrar la consulta
    await logView(
      'User', 
      null, 
      req.user, 
      req, 
      `Consulta de médicos por especialidad: ${specialty} - Encontrados: ${doctorsWithSpecialties.length}`
    );

    return res.json({
      message: `Médicos encontrados para la especialidad: ${specialty}`,
      doctors: doctorsWithSpecialties,
      total: doctorsWithSpecialties.length,
      filters: {
        specialty,
        role: 'MEDICO'
      }
    });

  } catch (error) {
    console.error("❌ [USER-SERVICE] Error en getDoctorsBySpecialty:", error);
    return res.status(500).json({ 
      message: "Error al filtrar médicos por especialidad",
      error: error.message 
    });
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
  updateNurseStateById,
  createDoctor,
  createNurse,
  toggleUserStatus,
  getDoctorsBySpecialty
};