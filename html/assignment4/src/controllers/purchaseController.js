const db = require('../config/db');
const io = require('../socket');
const nodemailer = require('nodemailer');

const purchaseController = {
    async buyNow(req, res, next) {
        const { itemId, quantity } = req.body;
        const userId = req.session.userId;

        try {
            // Check item availability
            const [item] = await db.execute('SELECT * FROM items WHERE id = ?', [itemId]);
            if (!item) return res.status(404).send({ message: 'Item not found' });
            if (item.quantity < quantity) {
                return res.status(400).send({ message: 'Insufficient quantity available' });
            }

            // Calculate total price
            const totalPrice = item.price * quantity;

            const commission = totalPrice * 0.05;

            // Insert commission record
            await db.execute('INSERT INTO commissions (purchase_id, commission_amount) VALUES (?, ?)', [
                purchase.insertId,
                commission,
            ]);

            // Deduct quantity and create purchase record
            await db.execute('UPDATE items SET quantity = quantity - ? WHERE id = ?', [quantity, itemId]);
            const [purchase] = await db.execute(
                'INSERT INTO purchases (user_id, item_id, quantity, total_price) VALUES (?, ?, ?, ?)',
                [userId, itemId, quantity, totalPrice]
            );

            // Emit real-time update for quantity
            io.to(`item-${itemId}`).emit('quantityUpdated', {
                itemId,
                newQuantity: item.quantity - quantity,
            });

            // Send email notification
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: process.env.EMAIL, pass: process.env.EMAIL_PASSWORD },
            });
            await transporter.sendMail({
                from: process.env.EMAIL,
                to: req.session.userEmail,
                subject: 'Purchase Confirmation',
                text: `You have successfully purchased ${quantity} of ${item.title}. Total price: $${totalPrice}.`,
            });

            res.send({ message: 'Purchase successful', purchaseId: purchase.insertId });
        } catch (error) {
            next(error);
        }
    },
};

module.exports = purchaseController;




