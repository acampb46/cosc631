const db = require('../config/db');

const searchController = {
    async searchItems(req, res, next) {
        const { keyword } = req.query;

        try {
            const [items] = await db.execute(
                'SELECT * FROM items WHERE title LIKE ? OR description LIKE ?',
                [`%${keyword}%`, `%${keyword}%`]
            );
            res.send(items);
        } catch (error) {
            next(error);
        }
    },
};

module.exports = searchController;
