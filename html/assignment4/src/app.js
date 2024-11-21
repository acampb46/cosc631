const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const https = require('https');
const { notFound, errorHandler } = require('./middlewares/errorHandler');
const fs = require("fs");
require('dotenv').config({ path: '../.env' });

const options = {
    key: fs.readFileSync('/var/www/key/gerardcosc631_com.key'),
    cert: fs.readFileSync('/etc/ssl/certs/gerardcosc631_chained.pem'),
};

const app = express();
const server = https.createServer(options, app);

app.set('trust proxy', true);

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({ secret: 'your-secret-key', resave: false, saveUninitialized: true }));

// Static Files
app.use(express.static(path.join(__dirname, 'assignment4/public')));

// Set the views directory and EJS as the view engine
app.set('views', path.join(__dirname, 'views'));  // Path to your views folder
app.set('view engine', 'ejs');  // Set EJS as the template engine

// Log requests to the console
app.use((req, res, next) => {
    console.log(`Request URL: ${req.url}`);
    next();
});

app._router.stack.forEach((middleware) => {
    if (middleware.route) {
        console.log(middleware.route.path);
    }
});


// Default route to redirect to the index page
app.get('/assignment4', (req, res) => {
    console.log("Routing to index.js");
    const items = [
        { name: 'Antique Vase', price: '100' },
        { name: 'Vintage Watch', price: '250' },
        { name: 'Signed Football', price: '75' }
    ];

    res.render('index', {
        pageTitle: 'Auction Site Home',
        headerText: 'Welcome to the Auction Site',
        featuredHeading: 'Featured Items',
        items
    });
});

// Routes
app.use('/assignment4/auth', require('./routes/auth'));
app.use('/assignment4/items', require('./routes/items'));
app.use('/assignment4/bids', require('./routes/bids'));
app.use('/assignment4/dashboard', require('./routes/dashboard'));
app.use('/assignment4/search', require('./routes/search'));
app.use('/assignment4/transaction', require('./routes/transaction'));
app.use('/assignment4/api', require('./routes/payment'));


// Error Handling Middleware
app.use(notFound);
app.use(errorHandler);

// Start Server
const PORT = process.env.PORT || 12348;
server.listen(PORT, () => console.log(`Server running on https://www.gerardcosc631:${PORT}`));
