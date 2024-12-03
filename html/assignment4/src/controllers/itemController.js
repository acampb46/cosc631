const Item = require('../models/Item');

const itemController = {
    async create(req, res, next) {
        try {
            console.log(req.body);
            const { title, description, category, price, startingBid, auctionEnd, quantity, imageUrl } = req.body;
            const sellerId = req.session.userId; // Get user ID from session

            // Conditionally format the data based on the category in the controller
            const itemData = {
                title,
                description,
                category,
                price: category === 'for sale' ? price : null,
                startingBid: category === 'auction' ? startingBid : null,
                auctionEnd: category === 'auction' ? auctionEnd : null,
                quantity,
                imageUrl,
                sellerId
            };

            const itemId = await Item.create(itemData); // Pass the item data directly to the model
            res.status(201).json({ message: 'Item created successfully', itemId });
        } catch (error) {
            next(error); // Pass the error to the error handler middleware
        }
    }, async list(req, res, next) {
        try {
            const items = await Item.getAll();
            res.send(items);
        } catch (error) {
            next(error);
        }
    }, async getById(req, res, next) {
        try {
            const {id} = req.params;
            const item = await Item.getById(id);
            if (!item) return res.status(404).send({message: 'Item not found'});

            // Render item details page with the fetched item data
            res.render('item-details', {item});
        } catch (error) {
            next(error);
        }
    }, async updateQuantity(req, res, next) {
        try {
            const {id, quantity} = req.body;
            await Item.updateQuantity(id, quantity);

            // Get io from the app object
            const io = req.app.get('io');

            // Notify clients in the item's room
            io.to(`item-${id}`).emit('quantityUpdated', {itemId: id, newQuantity: quantity});
            console.log(`Emitted 'quantityUpdated' to room: item-${id}`);

            res.status(200).send({message: 'Quantity updated'});
        } catch (error) {
            next(error);
        }
    }
};

module.exports = itemController;
