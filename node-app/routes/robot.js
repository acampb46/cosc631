const express = require('express');
const router = express.Router();
const mysql = require('mysql2');
const axios = require('axios');

require('dotenv').config();
// Environment Variables
const dbHost = process.env.DB_HOST;
const dbUser = process.env.DB_USER;
const dbPassword = process.env.DB_PASSWORD;
const dbName = process.env.DB_NAME;

// MySQL connection setup
const connection = mysql.createConnection({
    host: dbHost,
    user: dbUser,
    password: dbPassword,
    database: dbName
});

connection.connect((err) => {
    if (err) throw err;
    console.log('Connected to searchEngine database with robot.js');
});

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
    const { query, operator } = req.body;
    const isAndOperation = operator === "AND";

    // Extract keywords and phrases
    const searchTerms = query.match(/"[^"]+"|'[^']+'|\S+/g) || [];
    const keywords = searchTerms.map(term => term.replace(/['"]+/g, ''));

    // Initial search in urlKeyword table with case-insensitive LIKE using LOWER
    const placeholders = keywords.map(() => "LOWER(keyword) LIKE ?").join(isAndOperation ? " AND " : " OR ");
    const values = keywords.map(term => `%${term.toLowerCase()}%`);

    const [rows] = await connection.promise().query(
        `SELECT urlKeyword.url, urlDescription.description 
         FROM urlKeyword 
         JOIN urlDescription ON urlDescription.url = urlKeyword.url 
         WHERE ${placeholders}`,
        values
    );

    // Real-time rank calculation
    const results = await Promise.all(
        rows.map(async ({ url, description }) => {
            try {
                const response = await axios.get(url);
                const content = response.data; // HTML content as text

                let rank = 0;
                if (isAndOperation) {
                    if (keywords.every(term => content.toLowerCase().includes(term.toLowerCase()))) {
                        rank = countOccurrences(content, keywords);
                    }
                } else {
                    rank = countOccurrences(content, keywords);
                }

                return { url, description, rank };
            } catch (err) {
                console.error(`Error fetching ${url}:`, err);
                return null;
            }
        })
    );

    // Sort by rank in descending order and filter out null results
    const sortedResults = results.filter(Boolean).sort((a, b) => b.rank - a.rank);

    // Respond with formatted results
    res.json({
        query,
        results: sortedResults
    });
});

module.exports = router;
