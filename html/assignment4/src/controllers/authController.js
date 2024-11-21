const bcrypt = require('bcrypt');
const User = require('../models/User');

const authController = {
    async register(req, res, next) {
        try {
            const { name, email, username, password, phone, address, paymentInfo } = req.body;
            const hashedPassword = await bcrypt.hash(password, 10);
            const userId = await User.create({ name, email, username, password: hashedPassword, phone, address, paymentInfo });
            res.status(201).send({ message: 'User registered successfully', userId });
        } catch (error) {
            next(error);
        }
    },
    async login(req, res, next) {
        try {
            const { username, password } = req.body;
            const user = await User.findByUsername(username);
            if (!user || !(await bcrypt.compare(password, user.password))) {
                return res.status(401).send({ message: 'Invalid credentials' });
            }
            // Store user data in the session
            req.session.userId = user.id;
            req.session.username = user.username;
            res.send({ message: 'Login successful' });
        } catch (error) {
            next(error);
        }
    },
    logout(req, res) {
        req.session.destroy();
        res.send({ message: 'Logged out successfully' });
    },
};

module.exports = authController;
