const express = require('express');
const router = express.Router();
const { authenticate, authorizeAdmin } = require('../middleware/auth');
const {
  register,
  login,
  getProfile,
  getUserById,
  listUsers,
  updateUser,
  deleteUser,
} = require('../controllers/userController');

router.post('/register', register);
router.post('/login', login);
router.get('/profile', authenticate, getProfile);
router.get('/', authenticate, authorizeAdmin, listUsers);
router.get('/:id', getUserById);
router.put('/:id', authenticate, updateUser);
router.delete('/:id', authenticate, deleteUser);

module.exports = router;
