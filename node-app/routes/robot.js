const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { chromium } = require('playwright-extra');
const stealth = require("puppeteer-extra-plugin-stealth")();
require('dotenv').config();

// Environment Variables
const dbHost = process.env.DB_HOST;
const dbUser = process.env.DB_USER;
const dbPassword = process.env.DB_PASSWORD;
const dbName = process.env.DB_NAME;

let connection;
let browser;

(async () => {
    chromium.use(stealth);
    browser = await chromium.launch({ headless: true });
})();

// MySQL connection setup
async function initializeDatabase() {
    connection = await mysql.createConnection({
        host: dbHost, user: dbUser, password: dbPassword, database: dbName
    });

    console.log('Connected to searchEngine database with robot.js');
}

initializeDatabase().catch(err => {
    console.error('Failed to connect to the database:', err);
});

async function getBrowser() {
    if (!browser || browser.isConnected() === false) {
        browser = await chromium.launch(); // Restart browser if it was closed
    }
    return browser;
}

// Helper function to count occurrences of exact matches for phrases and keywords
function countOccurrences(content, searchTerms, exactMatch = false) {
    content = content.replace(/<!--.*?-->|<[^>]*>/g, ""); // Remove comments and HTML tags
    let rank = 0;

    searchTerms.forEach(term => {
        const regex = exactMatch
            ? new RegExp(`\\b${term}\\b`, "g") // Exact phrase match
            : new RegExp(`\\b${term}\\b`, "gi"); // Case-insensitive keyword match
        rank += (content.match(regex) || []).length;
    });

    return rank;
}

// Function to fetch HTML with Playwright (for JavaScript-heavy pages)
const fetchHtmlWithPlaywright = async (url) => {
    try {
        const page = await (await getBrowser()).newPage();
        await page.setExtraHTTPHeaders({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9'
        });

        await page.goto(url, { waitUntil: 'load', timeout: 60000 });
        await page.evaluate(() => window.scrollBy(0, window.innerHeight)); // Scroll to load more content if necessary
        const content = await page.content();
        await page.close();
        return content;
    } catch (error) {
        console.error(`Error navigating to URL with Playwright ${url}:`, error);
        return null;
    }
};

// Search route
router.get("/search", async (req, res) => {
    const { query, operator } = req.query;
    const isAndOperation = operator === "AND";

    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required.' });
    }

    // Extract keywords and phrases
    const searchTerms = query.match(/"[^"]+"|'[^']+'|\S+/g) || [];
    const keywords = searchTerms.map(term => term.replace(/['"]+/g, ''));

    // Check if any terms are phrases (contain quotes)
    const hasPhrases = searchTerms.some(term => /^['"].+['"]$/.test(term));

    // Initial search in urlKeyword table
    const placeholders = keywords.map(() => "keyword LIKE ?").join(isAndOperation ? " AND " : " OR ");
    const values = keywords.map(term => `%${term}%`);

    try {
        const [rows] = await connection.query(`SELECT urlKeyword.url, urlDescription.description
                                               FROM urlKeyword
                                               JOIN urlDescription ON urlDescription.url = urlKeyword.url
                                               WHERE ${placeholders}`, values);

        const results = await Promise.all(rows.map(async ({ url, description }) => {
            if (hasPhrases) {
                // Fetch URL content for phrases with exact match enabled
                const content = await fetchHtmlWithPlaywright(url);
                if (content) {
                    const rank = countOccurrences(content, keywords, true); // Exact match only
                    return { url, description, rank };
                }
                return null;
            } else {
                // Calculate rank from keywords found in database without fetching the page
                let rank = 0;
                if (isAndOperation) {
                    if (keywords.every(term => description.includes(term))) {
                        rank = countOccurrences(description, keywords);
                    }
                } else {
                    rank = countOccurrences(description, keywords);
                }
                return { url, description, rank };
            }
        }));

        // Sort by rank in descending order and filter out null results
        const sortedResults = results.filter(Boolean).sort((a, b) => b.rank - a.rank);

        res.json({
            query, urls: sortedResults
        });
    } catch (error) {
        console.error('Error executing query:', error);
        res.status(500).json({ error: 'Database query failed.' });
    }

    process.on('exit', async () => {
        if (browser) await browser.close();
    });
});

module.exports = router;
