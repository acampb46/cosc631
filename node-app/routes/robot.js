const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const axios = require('axios');

require('dotenv').config();
// Environment Variables
const dbHost = process.env.DB_HOST;
const dbUser = process.env.DB_USER;
const dbPassword = process.env.DB_PASSWORD;
const dbName = process.env.DB_NAME;

let connection;

// MySQL connection setup
async function initializeDatabase() {
    connection = await mysql.createConnection({
        host: dbHost, user: dbUser, password: dbPassword, database: dbName
    });

    console.log('Connected to searchEngine database with robot.js');
}

// Helper function to count keywords/phrases in content, ignoring tags, comments, and case
function countOccurrences(content, searchTerms) {
    content = content.replace(/<!--.*?-->|<[^>]*>/g, "").toLowerCase(); // Remove comments, tags, and convert to lowercase
    let rank = 0;
    searchTerms.forEach(term => {
        const regex = new RegExp(`\\b${term.toLowerCase()}\\b`, "gi"); // Convert each term to lowercase
        rank += (content.match(regex) || []).length;
    });
    return rank;
}

// Search route
router.get("/search", async (req, res) => {
    const {query, operator} = req.query; // Access query parameters
    const isAndOperation = operator === "AND";

    if (!query) {
        return res.status(400).json({error: 'Query parameter is required.'});
    }

    // Extract keywords and phrases
    const searchTerms = query.match(/"[^"]+"|'[^']+'|\S+/g) || [];
    const keywords = searchTerms.map(term => term.replace(/['"]+/g, ''));

    // Initial search in urlKeyword table
    const placeholders = keywords.map(() => "keyword LIKE ?").join(isAndOperation ? " AND " : " OR ");
    const values = keywords.map(term => `%${term}%`);

    const [rows] = await connection.query(`SELECT urlKeyword.url, urlDescription.description
                                           FROM urlKeyword
                                                    JOIN urlDescription ON urlDescription.url = urlKeyword.url
                                           WHERE ${placeholders}`, values);

    // Real-time rank calculation
    const results = await Promise.all(rows.map(async ({url, description}) => {
        try {
            const response = await axios.get(url);
            const content = response.data; // HTML content as text

            let rank = 0;
            if (isAndOperation) {
                if (keywords.every(term => content.includes(term))) {
                    rank = countOccurrences(content, keywords);
                }
            } else {
                rank = countOccurrences(content, keywords);
            }

            return {url, description, rank};
        } catch (err) {
            console.error(`Error fetching ${url}:`, err);
            return null;
        }
    }));

    // Sort by rank in descending order and filter out null results
    const sortedResults = results.filter(Boolean).sort((a, b) => b.rank - a.rank);

    // Respond with formatted results
    res.json({
        query, urls: sortedResults // Ensure this is the structure you expect in your client-side code
    });
});

module.exports = router;
