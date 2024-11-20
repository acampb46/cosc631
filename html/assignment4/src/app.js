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
const server = https.createServer(app);

app.set('trust proxy', true);

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({ secret: 'your-secret-key', resave: false, saveUninitialized: true }));

// Static Files
app.use(express.static(path.join(__dirname, 'public')));

// Set the views directory and EJS as the view engine
app.set('views', path.join(__dirname, 'src', 'views'));  // Path to your views folder
app.set('view engine', 'ejs');  // Set EJS as the template engine


// Default route to redirect to the index page
app.get('/assignment4', (req, res) => {
    console.log("Routing to index.js");
    const items = [
        { name: 'Antique Vase', price: '$100' },
        { name: 'Vintage Watch', price: '$250' },
        { name: 'Signed Football', price: '$75' }
    ];

    res.render('index', {
        pageTitle: 'Auction Site Home',
        headerText: 'Welcome to the Auction Site',
        featuredHeading: 'Featured Items',
        items
    });
});

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
