const express = require('express');
const router = express.Router();
const verifyJWT = require('../middlewares/authMiddleware');
const permission = require('../middlewares/permissionMiddleware')
const Users = require('../controllers/UserController');
const requireRole = require('../middlewares/roleMiddleware');

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
//http://localhost:3003/api/v1/users
router.get('/', verifyJWT, permission('user:list'), Users.getAllUsers);
//http://localhost:3003/api/v1/users/:id
router.get('/:id', verifyJWT, Users.getUserById);
//http://localhost:3003/api/v1/users/:id/deactivate 
router.patch('/:id/deactivate', verifyJWT, permission('user:deactivate'), Users.deactivate);
//http://localhost:3003/api/v1/users/:id/activate
router.patch('/:id/activate', verifyJWT, permission('user:activate'), Users.activate);
//http://localhost:3003/api/v1/users/:id/password
router.put('/:id/password', verifyJWT, Users.updatePassword);
//http://localhost:3003/api/v1/users/:id
router.delete('/:id', verifyJWT, permission('user:delete'), Users.deleteUser);

module.exports = router;