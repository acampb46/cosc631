const Item = require('../models/Item');

const itemController = {
    async create(req, res, next) {
        try {
            const { title, description, price, quantity, imageUrl, category, startingBid, auctionEnd } = req.body;
            const sellerId = req.session.userId; // Get user ID from session

            const itemId = await Item.create({ title, description, price, quantity, sellerId, imageUrl, category, startingBid, auctionEnd });
            res.status(201).send({ message: 'Item created successfully', itemId });
        } catch (error) {
            next(error);
        }
    },
    async list(req, res, next) {
        try {
            const items = await Item.getAll();
            res.send(items);
        } catch (error) {
            next(error);
        }
    },
    async getById(req, res, next) {
        try {
            const { id } = req.params;
            const item = await Item.getById(id);
            if (!item) return res.status(404).send({ message: 'Item not found' });

            // Render item details page with the fetched item data
            res.render('item-details', { item });
        } catch (error) {
            next(error);
        }
    },
    async updateQuantity(req, res, next) {
        try {
            const { id, quantity } = req.body;
            await Item.updateQuantity(id, quantity);

            // Notify clients in the item's room
            io.to(`item-${id}`).emit('quantityUpdated', { itemId: id, newQuantity: quantity });

            res.send({ message: 'Quantity updated' });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = itemController;
