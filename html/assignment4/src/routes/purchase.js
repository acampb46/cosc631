const express = require('express');
const router = express.Router();
const purchaseController = require('../controllers/purchaseController');

router.post('/buy', purchaseController.buyNow);

router.get('/:purchase_id', async (req, res, next) => {
    const purchaseId = req.params.purchase_id;

    try {
        const [purchase] = await db.execute('SELECT * FROM purchases WHERE id = ?', [purchaseId]);
        if (purchase.length === 0) {
            return res.status(404).send('Purchase not found');
        }
        res.render('purchase-item', { purchase: purchase[0] });
    } catch (error) {
        next(error);
    }
});


module.exports = router;
