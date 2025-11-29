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

// Buscar paciente por userId
router.get("/by-user/:userId",  verifyJWT, Patients.getByUserId);


router.get("/", requireRole("ADMINISTRADOR", "MEDICO"), Patients.list);

// GET /api/v1/patients/:id
router.get(  "/:id", requireRole("ADMINISTRADOR", "MEDICO", "PACIENTE", "ENFERMETO"), Patients.getById);

// PUT /api/v1/patients/:id
router.put("/:id", requireRole("ADMINISTRADOR", "MEDICO", "ENFERMERO"), Patients.update );

module.exports = router;
