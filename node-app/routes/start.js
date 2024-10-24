const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const cloudscraper = require('cloudscraper'); // Use cloudscraper for HTTP requests
const puppeteer = require('puppeteer'); // Import puppeteer for handling JavaScript
const { parse } = require('node-html-parser');

// Constants
const k = 10; // Number of keywords to extract
const n = 500; // Minimum number of entries in urlDescription

// MySQL connection pool
const connection = mysql.createPool({
    host: '3.19.85.118',
    user: 'COSC631',
    password: 'COSC631',
    database: 'searchEngine',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function testConnection() {
    try {
        const conn = await connection.getConnection();
        console.log('Connected to searchEngine database with start.js');
        conn.release();
    } catch (err) {
        console.error('Error connecting to the database:', err);
    }
}

testConnection();

// Function to extract keywords and description from the HTML content
const extractKeywordsAndDescription = (root) => {
    let keywords = new Set();
    let description = '';

    const addKeywordsFromString = (str) => {
        str.split(/\s+/)
            .filter(word => word.length >= 3)
            .forEach(word => keywords.add(word));
    };

    // Extract meta keywords if available
    const metaKeywords = root.querySelector('meta[name="keywords"]');
    if (metaKeywords) {
        addKeywordsFromString(metaKeywords.getAttribute('content'));
    }

    // Try to extract meta description first
    const metaDescription = root.querySelector('meta[name="description"]');
    if (metaDescription) {
        description = metaDescription.getAttribute('content').slice(0, 200);
    }

    // Fallback to title if meta description is not found
    if (!description) {
        const titleTag = root.querySelector('title');
        if (titleTag) {
            addKeywordsFromString(titleTag.text);
            description = titleTag.text.slice(0, 200);
        }
    }

    // Further fallback to headings (h1-h6)
    if (!description) {
        const headings = root.querySelectorAll('h1, h2, h3, h4, h5, h6');
        for (let heading of headings) {
            addKeywordsFromString(heading.text);
            if (!description) {
                description = heading.text.slice(0, 200);
            }
        }
    }

    // Finally, use the body text as a last resort
    if (!description) {
        const bodyText = root.querySelector('body')?.text || '';
        addKeywordsFromString(bodyText);
        description = bodyText.slice(0, 200);
    }

    return { keywords: Array.from(keywords).slice(0, k), description };
};

// Function to fetch HTML with cloudscraper, fallback to puppeteer if necessary
const fetchHtml = async (url) => {
    try {
        const html = await cloudscraper.get({
            uri: url,
            gzip: true, // Enable Gzip compression
            followRedirect: true,  // Follow redirects
            jar: true,               // Enable cookies
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        console.log('Fetched HTML with cloudscraper');
        return html;
    } catch (error) {
        console.error('Cloudscraper failed, switching to Puppeteer:', error.message);
        return await fetchHtmlWithPuppeteer(url);
    }
};

// Function to fetch HTML using puppeteer
const fetchHtmlWithPuppeteer = async (url) => {
    const browser = await puppeteer.launch({
        headless: true, // Set to false if you want to see the browser; set to true for headless mode
        args: [
            '--no-sandbox', // Recommended for server environments
            '--disable-setuid-sandbox', // Recommended for server environments
            '--disable-web-security', // Disable web security for all pages
            '--disable-infobars', // Disables infobars
            '--disable-dev-shm-usage', // Overcome limited resource problems
        ],
    });

    const page = await browser.newPage();

    // Set necessary headers to mimic a real browser
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
    });

    try {
        await page.goto(url, {
            waitUntil: 'domcontentloaded', // Wait for DOM to be loaded
            timeout: 30000, // Set a timeout for navigation
        });
        const html = await page.content(); // Get the HTML content
        console.log('Fetched HTML with Puppeteer');
        return html;
    } catch (error) {
        console.error('Error fetching HTML with Puppeteer:', error);
        throw error; // Rethrow error for handling in crawlUrls
    } finally {
        await page.close();
        await browser.close();
    }
};

const crawlUrls = async () => {
    try {
        const [results] = await connection.query('SELECT * FROM robotUrl ORDER BY pos');
        console.log(`Fetched ${results.length} URLs from robotUrl`);

        for (let row of results) {
            let nextUrl = row.url;
            if (!nextUrl.startsWith('http://') && !nextUrl.startsWith('https://')) {
                nextUrl = 'https://' + nextUrl;
            }

            console.log(`Preparing to crawl URL: ${nextUrl}`);

            try {
                console.log(`Crawling URL: ${nextUrl}`);
                const html = await fetchHtml(nextUrl); // Use the new fetchHtml function
                console.log(`Successfully crawled URL: ${nextUrl}`);

                const root = parse(html);
                const { keywords, description } = extractKeywordsAndDescription(root);

                // Insert description into the database
                await connection.query('INSERT INTO urlDescription (url, description) VALUES (?, ?) ON DUPLICATE KEY UPDATE description = ?', [nextUrl, description, description]);
                console.log(`Inserted description for URL: ${nextUrl}`);

                // Insert keywords into the database
                for (const keyword of keywords) {
                    const rank = (html.match(new RegExp(keyword, 'gi')) || []).length;
                    await connection.query('INSERT INTO urlKeyword (url, keyword, `rank`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `rank` = ?', [nextUrl, keyword, rank, rank]);
                    console.log(`Inserted keyword: ${keyword}, Rank: ${rank}`);
                }

                // Extract and insert new links into robotUrl
                const links = root.querySelectorAll('a').map(link => link.getAttribute('href')).filter(href => href);
                for (const link of links) {
                    const absoluteUrl = new URL(link, nextUrl).href;
                    const host = new URL(absoluteUrl).host;

                    const [countResults] = await connection.query('SELECT COUNT(*) AS count FROM robotUrl WHERE url = ?', [host]);
                    if (countResults[0].count === 0) {
                        await connection.query('INSERT INTO robotUrl (url) VALUES (?)', [host]);
                        console.log(`Inserted new URL to crawl: ${host}`);
                    }
                }

                // Check if the number of entries in urlDescription is below the minimum threshold
                const [count] = await connection.query('SELECT COUNT(*) AS count FROM urlDescription');
                if (count[0].count >= n) {
                    console.log('Crawling process completed.');
                    break;
                }
            } catch (err) {
                console.error(`Error navigating to URL: ${nextUrl}`, err);
            }
        }
    } catch (error) {
        console.error('Error fetching URLs:', error);
    }
};

router.get('/start', async (req, res) => {
    try {
        await crawlUrls();
        res.json({ message: 'Crawling process completed.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error starting crawling process' });
    }
});

module.exports = router;
