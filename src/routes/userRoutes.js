const express = require('express');
const router = express.Router();
const verifyJWT = require('../middlewares/authMiddleware');
const permission = require('../middlewares/permissionMiddleware')
const Users = require('../controllers/UserController');
const requireRole = require('../middlewares/roleMiddleware');


const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } }); // 60MB limit

//http://localhost:3003/api/v1/users/health
router.get('/health', (req, res) => {
  res.json({ 
    ok: true, 
    ts: new Date().toISOString(),
    service: "user-management-service",
    endpoint: "/api/v1/users/health"
  });
});

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
router.post('/bulk-import', verifyJWT, permission('user:create'), upload.single('file'), Users.bulkImport);


//http://localhost:3003/api/v1/users/register
//router.post('/register', Users.registerUser);

module.exports = router;