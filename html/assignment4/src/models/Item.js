const db = require('../config/db');

const Item = {
    async create({ title, description, price, quantity, sellerId, imageUrl }) {
        const [result] = await db.execute(
            'INSERT INTO items (title, description, price, quantity, seller_id, image_url) VALUES (?, ?, ?, ?, ?, ?)',
            [title, description, price, quantity, sellerId, imageUrl]
        );
        return result.insertId;
    },
    async getAll() {
        const [rows] = await db.execute('SELECT * FROM items WHERE quantity > 0');
        return rows;
    },
    async getById(id) {
        const [rows] = await db.execute('SELECT * FROM items WHERE id = ?', [id]);
        return rows[0];
    },
    async updateQuantity(id, quantity) {
        await db.execute('UPDATE items SET quantity = ? WHERE id = ?', [quantity, id]);
    },
};

module.exports = Item;
