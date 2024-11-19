const db = require('../config/db');

const Bid = {
    async placeBid({ itemId, userId, bidAmount }) {
        const [result] = await db.execute(
            'INSERT INTO bids (item_id, bidder_id, bid_amount) VALUES (?, ?, ?)',
            [itemId, userId, bidAmount]
        );
        return result.insertId;
    },
    async getHighestBid(itemId) {
        const [rows] = await db.execute(
            'SELECT * FROM bids WHERE item_id = ? ORDER BY bid_amount DESC LIMIT 1',
            [itemId]
        );
        return rows[0];
    },
};

module.exports = Bid;
