const {PrismaClient} = require ("../generated/prisma");
const prisma = new PrismaClient();
const bcrypt = require("bcryptjs");
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
    const existingUser = await prisma.users.findFirst({
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
      id_type,
      date_of_birth: birthDate,
      age,
      role,
      status: "ACTIVE", // Los usuarios creados por admin están activos por defecto
    };

    // Agregar campos opcionales si están presentes
    if (gender) userData.gender = gender.toUpperCase();
    if (phone) userData.phone = phone;
    if (address) userData.address = address;
    if (city) userData.city = city;
    if (blood_type) userData.blood_type = blood_type.toUpperCase();

    // Guardar en la base de datos
    const newUser = await prisma.users.create({
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
    const users = await prisma.users.findMany({
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
    const totalUsers = await prisma.users.count({ where });
    
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

// buscar 1 usuario
const getUserById = async (req, res) => {
  try {
    const user = await prisma.users.findUnique({
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
    const user = await prisma.users.findUnique({
      where: { id: req.params.id }
    });

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const updatedUser = await prisma.users.update({
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
    const user = await prisma.users.findUnique({
      where: { id: req.params.id }
    });

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const updatedUser = await prisma.users.update({
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
    const user = await prisma.users.findUnique({
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
    const updatedUser = await prisma.users.update({
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
    const user = await prisma.users.findUnique({
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
    await prisma.users.update({
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
  deleteUser
};