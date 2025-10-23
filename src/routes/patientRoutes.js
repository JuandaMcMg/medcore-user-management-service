const express = require("express");
const router = express.Router();
const verifyJWT = require("../middlewares/authMiddleware");
const requireRole = require("../middlewares/roleMiddleware");
const Patients = require("../controllers/PatientController");

// Sugerencia: todo este router requiere JWT
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

router.get("/", verifyJWT, requireRole("ADMINISTRADOR"), Patients.list);

// GET /api/v1/patients/:id
router.get(  "/:id", verifyJWT, requireRole("ADMINISTRADOR", "MEDICO"), Patients.getById);

// PUT /api/v1/patients/:id
router.put("/:id", verifyJWT, requireRole("ADMINISTRADOR", "MEDICO", "ENFERMERO"), Patients.update );

module.exports = router;
