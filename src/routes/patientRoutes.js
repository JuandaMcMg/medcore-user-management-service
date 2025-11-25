const express = require("express");
const router = express.Router();
const verifyJWT = require("../middlewares/authMiddleware");
const requireRole = require("../middlewares/roleMiddleware");
const Patients = require("../controllers/PatientController");
const { PrismaClient } = require("../generated/prisma"); // o la ruta correcta
const prisma = new PrismaClient();

router.use(verifyJWT);

// Health
router.get("/health", (req, res) => {
  res.json({
    ok: true,
    ts: new Date().toISOString(),
    service: "user-management-service",
    endpoint: "/api/v1/users/patients/health",
  });
});

// GET /api/v1/users/patients

// Buscar paciente por userId
router.get("/by-user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const patient = await prisma.patient.findUnique({
      where: { userId }
    });

    if (!patient) {
      return res.status(404).json({ message: "Paciente no encontrado" });
    }

    return res.status(200).json(patient);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});


router.get("/", requireRole("ADMINISTRADOR", "MEDICO"), Patients.list);

// GET /api/v1/patients/:id
router.get(  "/:id", requireRole("ADMINISTRADOR", "MEDICO", "PACIENTE", "ENFERMETO"), Patients.getById);

// PUT /api/v1/patients/:id
router.put("/:id", requireRole("ADMINISTRADOR", "MEDICO", "ENFERMERO"), Patients.update );

module.exports = router;
