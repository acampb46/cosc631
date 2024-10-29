const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { chromium } = require('playwright-extra');
const stealth = require("puppeteer-extra-plugin-stealth")();
require('dotenv').config();

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

async function getBrowser() {
    if (!browser || browser.isConnected() === false) {
        browser = await chromium.launch({ headless: true });
    }
    return browser;
}

async function initializeDatabase() {
    connection = await mysql.createConnection({
        host: dbHost, user: dbUser, password: dbPassword, database: dbName
    });
    console.log('Connected to the database');
}

initializeDatabase().catch(err => {
    console.error('Failed to connect to the database:', err);
});

// Function to fetch HTML with Playwright for phrase-based matching
const fetchHtmlWithPlaywright = async (url) => {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    try {
        const browser = await getBrowser();
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'load', timeout: 60000 });
        await sleep(Math.floor(Math.random() * 4000 + 1000)); // Random wait time
        const content = await page.content();
        await page.close();
        return content;
    } catch (error) {
        console.error(`Error navigating to URL with Playwright ${url}:`, error);
    }
};

// Function to calculate occurrences of exact phrases
function countExactPhrase(content, phrase) {
    const regex = new RegExp(`\\b${phrase}\\b`, 'gi');
    return (content.match(regex) || []).length;
}

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

    // Create SQL placeholders for the keywords
    const placeholders = keywords.map(() => "keyword LIKE ?").join(isAndOperation ? " AND " : " OR ");
    const values = keywords.map(term => `%${term}%`);

    try {
        const [rows] = await connection.query(
            `SELECT urlKeyword.url, urlKeyword.keyword, urlKeyword.rank, urlDescription.description
             FROM urlKeyword
             JOIN urlDescription ON urlDescription.url = urlKeyword.url
             WHERE ${placeholders}
             GROUP BY urlKeyword.url
             HAVING COUNT(DISTINCT keyword) = ?`,
            [...values, keywords.length]
        );

        const results = await Promise.all(
            rows.map(async ({ url, keyword, rank, description }) => {
                let totalRank = rank;
                let matchedExactPhrase = false;

                // Check for exact phrases
                for (const exactPhraseMatch of searchTerms.filter(term => term.startsWith('"') || term.startsWith("'"))) {
                    const cleanPhrase = exactPhraseMatch.replace(/['"]+/g, '');

                    // Ensure the phrase is found in either `keyword` or `description`
                    if (description.includes(cleanPhrase) || keyword.includes(cleanPhrase)) {
                        matchedExactPhrase = true;

                        // Fetch the content from the URL
                        const pageContent = await fetchHtmlWithPlaywright(url);
                        if (pageContent) {
                            totalRank += countExactPhrase(pageContent, cleanPhrase);
                        }
                    }
                }

                // If no exact phrase is matched but keywords match, still calculate the total rank based on keywords
                if (!matchedExactPhrase) {
                    keywords.forEach(term => {
                        if (description.includes(term) || keyword.includes(term)) {
                            totalRank += rank;
                        }
                    });
                }

                return { url, description, rank: totalRank };
            })
        );

        // Filter unique URLs and sort by rank
        const uniqueResults = Array.from(new Set(results.map(r => r.url)))
            .map(url => results.find(r => r.url === url));

        const sortedResults = uniqueResults.filter(Boolean).sort((a, b) => b.rank - a.rank);

        res.json({ query, urls: sortedResults });
    } catch (error) {
        console.error('Error executing query:', error);
        res.status(500).json({ error: 'Database query failed.' });
    }

    process.on('exit', async () => {
        if (browser) await browser.close();
    });
});


module.exports = router;
