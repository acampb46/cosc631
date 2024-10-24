// server.js

const express = require('express');
const https = require('https');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2');
const parserRouter = require('./routes/parser'); // Import the router
const robotRoutes = require('./routes/robot'); //Import the search engine robot
const startRoute = require('./routes/start'); // For /start

const app = express();
const port = 12348;

app.set('trust proxy', true);

const options = {
    key: fs.readFileSync('/var/www/key/gerardcosc631_com.key'),
    cert: fs.readFileSync('/etc/ssl/certs/gerardcosc631_chained.pem'),
};

require('dotenv').config();
// Environment Variables
const dbHost = process.env.DB_HOST;
const dbUser = process.env.DB_USER;
const dbPassword = process.env.DB_PASSWORD;

// MySQL connection setup for parser db
const db = mysql.createConnection({
    host: dbHost,
    user: dbUser,
    password: dbPassword,
    database: 'htmlTags'
});

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json()); // To parse JSON bodies
app.use(express.static(path.join(__dirname, '../..'))); // Serve static files

// Use the parser router
// Pass the MySQL connection to the parser router
app.use('/parser', (req, res, next) => {
    req.db = db; // Attach the db connection to the request object
    next();
}, parserRouter); // Use the parser router

app.use('/', startRoute); //Use the start route for web crawler
app.use('/', robotRoutes); // Use the search engine router

// Function to automatically start the web crawler
const startCrawler = async () => {
    try {
        const response = await axios.get('https://gerardcosc631.com:12348/start');
        console.log(response.data.message); // Log the response from the crawler
    } catch (error) {
        console.error('Error starting the crawler:', error.message);
    }
};

const server = https.createServer(options, app);

server.listen(port, () => {
    console.log(`Server is running on https://gerardcosc631.com:${port}`);
	startCrawler(); //Start crawler when the server starts
});
