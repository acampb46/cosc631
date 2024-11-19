const express = require('express');
const { generateToken, validateToken } = require('../middlewares/authMiddleware');
const authController = require('../controllers/authController');
const router = express.Router();

// User registration
router.post('/register', authController.register);

// User login
router.post('/login', authController.login);

// User logout
router.post('/logout', authController.logout);

// Token generation route
router.post('/auth/generate-token', generateToken); // To generate a token

// Token validation route
router.post('/auth/validate-token', validateToken, (req, res) => {
    res.status(200).json({ message: 'Authentication successful', user: req.user });
});

module.exports = router;