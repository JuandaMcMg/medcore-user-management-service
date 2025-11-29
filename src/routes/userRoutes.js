const express = require('express');
const router = express.Router();
const verifyJWT = require('../middlewares/authMiddleware');
const permission = require('../middlewares/permissionMiddleware')
const Users = require('../controllers/UserController');
const requireRole = require('../middlewares/roleMiddleware');
const { PrismaClient } = require("../generated/prisma")
const prisma = new PrismaClient()

const multer = require("multer");
const path = require("path");
const fs = require("fs");
const uploadCsv = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } }); // 60MB limit

const uploadDir = path.join(__dirname, "../uploads/profile-pictures");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${req.user.userId}-${Date.now()}${ext}`;
    cb(null, filename);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 60 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Solo se permiten archivos de imagen"));
    }
    cb(null, true);
  },
});

const patientRoutes = require('./patientRoutes');
//http://localhost:3003/api/v1/users/health
router.get('/health', (req, res) => {
  res.json({ 
    ok: true, 
    ts: new Date().toISOString(),
    service: "user-management-service",
    endpoint: "/api/v1/users/health"
  });
});

router.put(
  "/profile-image",
  verifyJWT,
  upload.single("profileImage"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No se subió ninguna imagen" });
      }

      // Guardar solo la ruta del archivo en la base de datos
      const imagePath = `/uploads/profile-pictures/${req.file.filename}`;
      console.log("📸 Nueva ruta imagen:", imagePath);

      const updatedUser = await prisma.user.update({
        where: { id: req.user.userId },
        data: { profileImage: imagePath },
      });

     const fullUrl = `${req.protocol}://${req.get("host")}${imagePath}`;

res.json({
  message: "✅ Imagen actualizada correctamente",
  profileImage: fullUrl, // Enviamos la URL completa
});

    } catch (err) {
      console.error("❌ Error actualizando imagen:", err);
      res.status(500).json({ error: "Error actualizando imagen" });
    }
  }
);
// ruta temporal para verificar los datos
router.get('/test-doctors-relations', async (req, res) => {
  try {
    const doctors = await prisma.user.findMany({
      where: { role: 'MEDICO' },
      include: {
        userDeptRoles: {
          include: {
            department: { select: { name: true } },
            specialty: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 1
        },
      },
      take: 3 // Solo primeros 3 para prueba
    });

    console.log("Doctores con relaciones:", JSON.stringify(doctors, null, 2));

    res.json({ 
      message: "Datos de prueba",
      doctors: doctors.map(doc => ({
        id: doc.id,
        name: doc.fullname,
        email: doc.email,
        department: doc.userDeptRoles[0]?.department?.name || 'Sin departamento',
        specialty: doc.userDeptRoles[0]?.specialty?.name || 'Sin especialidad',
        relations: doc.userDeptRoles
      }))
    });
  } catch (error) {
    console.error("Test error:", error);
    res.status(500).json({ error: error.message });
  }
});


router.post('/assign-doctors-to-dept', async (req, res) => {
  try {
    // Obtener todos los médicos sin userDeptRoles
    const doctors = await prisma.user.findMany({
      where: { 
        role: 'MEDICO',
        userDeptRoles: { none: {} } // Solo médicos sin relaciones
      },
      select: { id: true, email: true }
    });

    console.log("Médicos sin relaciones:", doctors);

    // Obtener un departamento y especialidad por defecto
    const defaultDepartment = await prisma.department.findFirst();
    const defaultSpecialty = await prisma.specialty.findFirst({
      where: { departmentId: defaultDepartment?.id }
    });

    if (!defaultDepartment || !defaultSpecialty) {
      return res.status(400).json({ 
        message: "No hay departamentos o especialidades configurados" 
      });
    }

    console.log("Departamento por defecto:", defaultDepartment.name);
    console.log("Especialidad por defecto:", defaultSpecialty.name);

    // Crear relaciones para cada médico
    const results = [];
    for (const doctor of doctors) {
      const userDeptRole = await prisma.userDeptRole.create({
        data: {
          userId: doctor.id,
          departmentId: defaultDepartment.id,
          specialtyId: defaultSpecialty.id,
          role: 'MEDICO',
        },
        include: {
          department: true,
          specialty: true
        }
      });
      
      results.push({
        doctor: doctor.email,
        department: userDeptRole.department.name,
        specialty: userDeptRole.specialty.name
      });
    }

    console.log("Relaciones creadas:", results);

    return res.json({
      message: `${results.length} médicos asignados a departamento y especialidad`,
      results
    });

  } catch (error) {
    console.error("Error asignando relaciones:", error);
    return res.status(500).json({ 
      message: "Error asignando relaciones",
      error: error.message 
    });
  }
});



router.use('/patients', (req,res,next)=>{
  // Debug opcional para confirmar que entra
  console.log('[users] patients router hit:', req.method, req.originalUrl);
  next();
}, patientRoutes);

//http://localhost:3003/api/v1/users
router.post('/', verifyJWT, permission('user:create'), Users.createByAdmin); 

// http://localhost:3003/api/v1/users/doctors
router.post('/doctors', verifyJWT, Users.createDoctor);
//http://localhost:3003/api/v1/users/nurses
router.post('/nurses', verifyJWT, Users.createNurse);
//http://localhost:3003/api/v1/users
router.get('/', verifyJWT, permission('user:list'), Users.getAllUsers);
//http://localhost:3003/api/users/by-specialty?specialty=cardiologia
router.get('/by-specialty', verifyJWT, Users.getDoctorsBySpecialty);
//http://localhost:3003/api/v1/users/by-role?role=DOCTOR
router.get('/by-role', verifyJWT, Users.getUsersByRole);
//http://localhost:3003/api/v1/users/doctors/:id
router.get("/doctors/:id", verifyJWT, Users.getDoctorById);
//http://localhost:3003/api/v1/users/nurses/:id
router.get("/nurses/:id", verifyJWT, Users.getNursesById);
//http://localhost:3003/api/v1/users/:id
router.get('/:id', verifyJWT, Users.getUserById);
// http://localhost:3003/api/v1/users/doctors/state/:id
router.patch('/doctors/state/:id', verifyJWT, Users.updateDoctorStateById);
// http://localhost:3003/api/v1/users/nurses/state/:id
router.patch('/nurses/state/:id', verifyJWT, Users.updateNurseStateById);
//http://localhost:3003/api/v1/users/:id/deactivate 
router.patch('/:id/deactivate', verifyJWT, permission('user:deactivate'), Users.deactivate);
//http://localhost:3003/api/v1/users/:id/activate
router.patch('/:id/activate', verifyJWT, permission('user:activate'), Users.activate);
//http://localhost:3003/api/v1/user/:id/toggle-status
router.patch('/:id/toggle-status', Users.toggleUserStatus);
//http://localhost:3003/api/v1/users/doctors/:id
router.put('/doctors/:id', verifyJWT, Users.updateDoctorById);
//http://localhost:3003/api/v1/users/nurses/:id
router.put('/nurses/:id', verifyJWT, Users.updateNurseById);
//http://localhost:3003/api/v1/users/:id/password
router.put('/:id/password', verifyJWT, Users.updatePassword);
//http://localhost:3003/api/v1/users/:id
router.delete('/:id', verifyJWT, permission('user:delete'), Users.deleteUser);
//http://localhost:3003/api/v1/users/bulk-import
router.post('/bulk-import', verifyJWT, permission('user:create'), uploadCsv.single('file'), Users.bulkImport);

router.get('/:id', verifyJWT, Users.getUserById);
//router.get('/doctors-with-affiliations', verifyJWT, Users.listDoctorsWithAffiliations);

router.post("/api/v1/users/batch", async (req, res) => {
  const { ids } = req.body;
  const doctors = await prisma.doctor.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, email: true },
  });
  res.json({ ok: true, data: doctors });
});


//http://localhost:3003/api/v1/users/register
//router.post('/register', Users.registerUser);

module.exports = router;