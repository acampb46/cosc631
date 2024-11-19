const crypto = require('crypto');
const db = require('../config/db');
const { sendEmail, sendTextMessage } = require('../utils/notificationUtils');

const tokens = new Map(); // Temporarily store tokens in memory. Use a database for production.

module.exports = {
    generateToken: async (req, res, next) => {
        const { email, phone } = req.body;

        try {
            // Validate if the user exists
            const [user] = await db.execute('SELECT id FROM users WHERE email = ? OR phone = ?', [email, phone]);
            if (!user.length) {
                return res.status(404).json({ message: 'User not found' });
            }

            // Generate a token
            const token = crypto.randomBytes(16).toString('hex');
            const userId = user[0].id;
            const expiration = Date.now() + 15 * 60 * 1000; // Token valid for 15 minutes

            // Store the token temporarily
            tokens.set(userId, { token, expiration });

            // Send token via email or text
            if (email) {
                await sendEmail(email, 'Your Authentication Token', `Your token is: ${token}`);
            } else if (phone) {
                await sendTextMessage(phone, `Your token is: ${token}`);
            }

            res.status(200).json({ message: 'Token sent via email or text' });
        } catch (error) {
            next(error);
        }
    },

    validateToken: (req, res, next) => {
        const { token, userId } = req.body;

        const storedToken = tokens.get(userId);
        if (!storedToken) {
            return res.status(401).json({ message: 'Invalid or expired token' });
        }

        const { token: validToken, expiration } = storedToken;
        if (token !== validToken || Date.now() > expiration) {
            return res.status(401).json({ message: 'Invalid or expired token' });
        }

        // Clear the token once validated
        tokens.delete(userId);

        // Attach user info to the request for downstream handlers
        req.user = { id: userId };
        next();
    },
};
