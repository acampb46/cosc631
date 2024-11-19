const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const socketIo = require('socket.io');
const http = require('http');
const { notFound, errorHandler } = require('./middlewares/errorHandler');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = require('./socket')(server); // Socket.io setup

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({ secret: 'your-secret-key', resave: false, saveUninitialized: true }));

// Static Files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/items', require('./routes/items'));
app.use('/bids', require('./routes/bids'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/search', require('./routes/search'));
app.use('/transaction', require('./routes/transaction'));
app.use('/api', require('./routes/payment'));

// Error Handling Middleware
app.use(notFound);
app.use(errorHandler);

// Start Server
const PORT = process.env.PORT || 12348;
server.listen(PORT, () => console.log(`Server running on https://www.gerardcosc631:${PORT}`));
