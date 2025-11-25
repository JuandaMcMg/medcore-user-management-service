
const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();


function mustInt(v, def = 1) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

// GET /api/patients
async function list(req, res) {
  try {
    const { page = "1", size = "10", q } = req.query;
    const take = mustInt(size, 10);
    const skip = (mustInt(page, 1) - 1) * take;

    const where = {};
    if (q) {
      // buscar por nombre/email del user o por documento del paciente
      where.OR = [
        { documentNumber: { contains: q, mode: "insensitive" } },
        { user: { fullname: { contains: q, mode: "insensitive" } } },
        { user: { email: { contains: q, mode: "insensitive" } } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.patient.findMany({
        where,
        include: { user: { select: { email: true, fullname: true, phone: true } } },
        orderBy: { createdAt: "desc" },
        skip, take
      }),
      prisma.patient.count({ where })
    ]);

    return res.json({
      patients: items,
      pagination: { total, pages: Math.ceil(total / take) }
    });
  } catch (err) {
    console.error("patients.list", err);
    res.status(500).json({ message: "Error listando pacientes" });
  }
}

// GET /api/users/patients/:id  (id = patients.id)
async function getById(req, res) {
  try {
    const { id } = req.params;
    const patient = await prisma.patient.findUnique({
      where: { id },
      include: { user: { select: { email: true, fullname: true, phone: true, date_of_birth: true, age: true } } }
    });
    if (!patient) return res.status(404).json({ message: "Paciente no encontrado" });
    res.json(patient);
  } catch (err) {
    console.error("patients.getById", err);
    res.status(500).json({ message: "Error consultando paciente" });
  }
}

// PUT /api/users/patients/:id
// PUT /api/users/patients/:id
async function update(req, res) {
  try {
    const { id } = req.params; // este es el id del paciente
    const data = req.body || {};

    // Campos que pertenecen a Patient
    const patientFields = [
      "documentNumber",
      "documentType",
      "birthDate",
      "age",
      "gender",
      "phone",
      "address",
      "status"
    ];

    // Campos que pertenecen al User
    const userFields = [
      "fullname",
      "email",
      "phone",
      "date_of_birth",
      "age",
      "gender",
      "address"
    ];

    const patientData = {};
    const userData = {};

    for (const key in data) {
      if (patientFields.includes(key)) patientData[key] = data[key];
      if (userFields.includes(key)) userData[key] = data[key];
    }

    // Actualizar ambos usando Prisma en una sola operación
    const updatedPatient = await prisma.patient.update({
      where: { id },
      data: {
        ...patientData,
        ...(Object.keys(userData).length > 0 &&{
        user: { update: userData,}, //actualiza automáticamente el user asociado
        }),
      },
      include: {
        user:{
          select:{
            email: true,
            fullname: true,
            phone: true,
            date_of_birth: true,
            age: true,
            gender: true,
            address: true,
          },
        },
      },
    });

    res.json({
      message: "Paciente y usuario actualizados correctamente",
      patient: updatedPatient,
    });
  } catch (err) {
    console.error("patients.update", err);
    if (err.code === "P2025") {
      return res.status(404).json({ message: "Paciente no encontrado" });
    }
    res.status(500).json({ message: "Error actualizando paciente y usuario" });
  }
}

const getByUserId = async (req, res) => {
  try {
    const { userId } = req.params; // 👈 Debe llamarse igual que en la ruta

    if (!userId) {
      return res.status(400).json({ message: 'userId es requerido' });
    }

    // Como userId es @unique, puedes usar findUnique o findFirst.
    const patient = await prisma.patient.findUnique({
      where: { userId }, // 🔥 esto es clave
      include: {
        user: {
          select: {
            email: true,
            fullname: true,
            phone: true,
            date_of_birth: true,
            age: true,
          },
        },
      },
    });

    if (!patient) {
      return res.status(404).json({ message: 'Paciente no encontrado' });
    }

    // Formato de respuesta igual al de /users/patients/:id
    const { user, ...rest } = patient;

    return res.json({
      ...rest,
      user: user
        ? {
            email: user.email,
            fullname: user.fullname,
            phone: user.phone ?? null,
            date_of_birth: user.date_of_birth ?? null,
            age: user.age ?? null,
          }
        : null,
    });
  } catch (error) {
    console.error('[getByUserId] error:', error);
    return res
      .status(500)
      .json({ message: 'Error al obtener paciente por userId' });
  }
};

module.exports = { 
  list,
  getById,
  update,
  getByUserId
};
