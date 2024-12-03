const express = require('express');
const {generateToken, validateToken} = require('../middlewares/authMiddleware');
const authController = require('../controllers/authController');
const router = express.Router();

// User registration
router.post('/register', authController.register);

// Serve the register page
router.get('/register', (req, res) => {
    console.log("Rendering register.ejs");
    res.render('register', {
        pageTitle: 'Register',
        headerText: 'Register',
    });
});

// User login
router.post('/login', authController.login);

// Serve the login page
router.get('/login', (req, res) => {
    console.log("Rendering login.ejs");
    res.render('login', {
        pageTitle: 'Login Page',
        headerText: 'Please Login to Your Account',
    });
});

// User logout
router.post('/logout', authController.logout);

// Token generation route
router.post('/auth/generate-token', generateToken); // To generate a token

// Token validation route
router.post('/auth/validate-token', validateToken, (req, res) => {
    res.status(200).json({message: 'Authentication successful', user: req.user});
});

module.exports = router;
