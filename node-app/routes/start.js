const express = require('express');
const router = express.Router(); // For using routes with node.js
const mysql = require('mysql2/promise'); // MySQL for connection to the database
const puppeteer = require('puppeteer'); // Use Puppeteer for web crawling
const { parse } = require('node-html-parser'); // node-html-parser for HTML parsing

// Constants
const k = 10; // Number of keywords to extract
const n = 500; // Minimum number of entries in urlDescription

const connection = mysql.createPool({
    host: '3.19.85.118',
    user: 'COSC631',
    password: 'COSC631',
    database: 'searchEngine',
    waitForConnections: true,
    connectionLimit: 10,  // Limit the number of connections
    queueLimit: 0
});

// Test connection by acquiring a connection from the pool
async function testConnection() {
    try {
        const conn = await connection.getConnection();
        console.log('Connected to searchEngine database with start.js');
        conn.release(); // Release the connection back to the pool
    } catch (err) {
        console.error('Error connecting to the database:', err);
    }
}

// Call the test connection function
testConnection();

// Function to extract keywords and description from the HTML content
const extractKeywordsAndDescription = (root) => {
    let keywords = new Set();
    let description = '';

    // Helper function to add keywords from a string
    const addKeywordsFromString = (str) => {
        str.split(/\s+/)
            .filter(word => word.length >= 3) // Filter out words less than 3 characters
            .forEach(word => keywords.add(word));
    };

    // (a) Extract meta keywords
    const metaKeywords = root.querySelector('meta[name="keywords"]');
    if (metaKeywords) {
        addKeywordsFromString(metaKeywords.getAttribute('content'));
    }

    // (b) Extract title
    const titleTag = root.querySelector('title');
    if (titleTag) {
        addKeywordsFromString(titleTag.text);
        description = titleTag.text.slice(0, 200);
    }

    // (c) Extract headings
    const headings = root.querySelectorAll('h1, h2, h3, h4, h5, h6');
    for (let heading of headings) {
        addKeywordsFromString(heading.text);
        if (!description) {
            description = heading.text.slice(0, 200);
        }
    }

    // (d) Extract body text
    const bodyText = root.querySelector('body')?.text || '';
    addKeywordsFromString(bodyText);
    if (!description) {
        description = bodyText.slice(0, 200);
    }

    // Return the first k keywords and the description
    return { keywords: Array.from(keywords).slice(0, k), description };
};

// Use an IIFE to enable dynamic import of p-limit
(async () => {
    const pLimit = (await import('p-limit')).default;
    console.log('p-limit imported successfully');

    const limit = pLimit(10); // Adjust concurrency limit based on needs

    // Function to start the crawling process
    const crawlUrls = async () => {
        let browser;

        try {
            // Launch a single browser instance
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            console.log('Puppeteer browser launched successfully');

            const [results] = await connection.query('SELECT * FROM robotUrl ORDER BY pos');
            if (results.length === 0) {
                console.log('No URLs found in the robotUrl table.');
            } else {
                console.log('Fetched URLs from robotUrl:', results);
            }

            const crawlingPromises = results.map(row => limit(async () => {
                let nextUrl = row.url;
                if (!nextUrl.startsWith('http://') && !nextUrl.startsWith('https://')) {
                    nextUrl = 'https://' + nextUrl; // Default to https
                }

                console.log(`Preparing to crawl URL: ${nextUrl}`);

                try {
                    const page = await browser.newPage();
                    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
                    await page.setUserAgent(userAgent);


                    console.log(`Crawling URL: ${nextUrl}`);
                    let html;
                    try {
                        const response = await page.goto(nextUrl, { waitUntil: 'domcontentloaded'});
                        if (response && response.status() === 404) {
                            console.error(`404 Not Found: ${nextUrl}`);
                            return; // Exit early if the page is not found
                        }
                        html = await page.content();
                        console.log(`Successfully crawled URL: ${nextUrl}`);
                    } catch (err) {
                        console.error(`Error navigating to URL: ${nextUrl}`, err);
                    } finally {
                        await page.close(); // Ensure the page is always closed
                    }

                    if(html) {
                        const root = parse(html);
                        const {keywords, description} = extractKeywordsAndDescription(root);

                        // Insert description
                        try {
                            await connection.query(
                                'INSERT INTO urlDescription (url, description) VALUES (?, ?) ON DUPLICATE KEY UPDATE description = ?',
                                [nextUrl, description, description]
                            );
                            console.log(`Inserted description for URL: ${nextUrl}`);
                        } catch (dbError) {
                            console.error(`Error inserting description for URL: ${nextUrl}`, dbError);
                        }

                        // Insert keywords
                        for (const keyword of keywords) {
                            const rank = (html.match(new RegExp(keyword, 'gi')) || []).length;
                            await connection.query(
                                'INSERT INTO urlKeyword (url, keyword, `rank`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `rank` = ?',
                                [nextUrl, keyword, rank, rank]
                            );
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

                        // Check if the number of entries in urlDescription is below n
                        const [count] = await connection.query('SELECT COUNT(*) AS count FROM urlDescription');
                        if (count[0].count < n) {
                            console.log('Continuing to crawl due to insufficient entries in urlDescription');
                        }
                    }
                } catch (error) {
                    console.error(`Error crawling URL: ${nextUrl}`, error);
                }
            }));

            await Promise.all(crawlingPromises);
            console.log('Crawling complete.');

        } catch (error) {
            console.error('Error fetching URLs:', error);
            throw new Error('Error starting the crawling process');
        } finally {
            if (browser) {
                await browser.close(); // Ensure the browser is closed once all URLs are crawled
            }
        }
    };

    // Start the crawling process when the endpoint is hit
    router.get('/start', async (req, res) => {
        console.log('Crawl start endpoint hit.');
        try {
            await crawlUrls();
            res.json({ message: 'Crawling process started.' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error starting crawling process' });
        }
    });
})();

module.exports = router;
