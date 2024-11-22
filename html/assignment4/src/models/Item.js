const db = require('../config/db');

const Item = {
    async create({ title, description, price, quantity, sellerId, imageUrl, category, startingBid, auctionEnd, }) {
        const [result] = await db.execute(
            'INSERT INTO items (title, description, price, quantity, seller_id, image_url, category, starting_bid, auction_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [title, description, price, quantity, sellerId, imageUrl, category, startingBid, auctionEnd]
        );
        return result.insertId;
    },
    async getAll() {
        const [rows] = await db.execute('SELECT * FROM items WHERE quantity > 0');
        return rows;
    },
    async getTop3Newest() {
        const [rows] = await db.execute(`
        SELECT * FROM items
        WHERE quantity > 0
        ORDER BY created_at DESC  
        LIMIT 3                  
    `);
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
