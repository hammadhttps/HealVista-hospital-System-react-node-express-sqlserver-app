const express = require('express');
const { loginUser, getAllUsers } = require('../controller/userController');
const router = express.Router();

router.post('/login', loginUser);
router.get('/', getAllUsers);

module.exports = router; 