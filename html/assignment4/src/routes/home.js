const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Homepage Route
router.get('/', async (req, res, next) => {
    try {
        const [items] = await db.execute('SELECT * FROM items WHERE status = ?', ['available']);
        res.render('homepage', { items });
    } catch (error) {
        next(error);
    }
});