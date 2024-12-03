const Item = require('../models/Item');
const db = require('../config/db');

const dashboardController = {
    async userItems(req, res, next) {
        try {
            const userId = req.session.userId;
            const [items] = await db.execute('SELECT * FROM items WHERE seller_id = ?', [userId]);
            return items;
        } catch (error) {
            next(error); // Pass error to middleware
        }
    },

    async purchasedItems(req, res, next) {
        try {
            const userId = req.session.userId;
            const [purchases] = await db.execute(
                'SELECT t.*, i.title FROM transactions t JOIN items i ON t.item_id = i.id WHERE t.buyer_id = ? AND t.status = ?',
                [userId, 'completed']
            );
            return purchases;
        } catch (error) {
            next(error); // Pass error to middleware
        }
    },
};

module.exports = dashboardController;


