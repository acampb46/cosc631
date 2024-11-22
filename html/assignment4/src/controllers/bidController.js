const Bid = require('../models/Bid');

const bidController = {
    async placeBid(req, res, next) {
        try {
            const { itemId, bidAmount } = req.body;
            const userId = req.session.userId;

            // Place the bid
            const bidId = await Bid.placeBid({ itemId, userId, bidAmount });

            // Notify other clients about the new highest bid
            io.to(`item-${itemId}`).emit('newBid', { itemId, bidAmount, userId });

            res.status(201).send({ message: 'Bid placed successfully', bidId });
        } catch (error) {
            next(error);
        }
    },
    async getHighestBid(req, res, next) {
        try {
            const { itemId } = req.params;
            const highestBid = await Bid.getHighestBid(itemId);
            res.send(highestBid || { message: 'No bids yet' });
        } catch (error) {
            next(error);
        }
    },
};

module.exports = bidController;
