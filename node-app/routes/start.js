const express = require('express');
const router = express.Router(); // For using routes with node.js
const mysql = require('mysql2/promise'); // MySQL with promise support
const puppeteer = require('puppeteer'); // Use Puppeteer for web crawling
const { parse } = require('node-html-parser'); // node-html-parser for HTML parsing

// Constants
const k = 10; // Number of keywords to extract
const n = 500; // Minimum number of entries in urlDescription
const concurrencyLimit = 5; // Set a concurrency limit for Puppeteer tasks

// MySQL connection pooling setup
const pool = mysql.createPool({
    host: '3.19.85.118',
    user: 'COSC631',
    password: 'COSC631',
    database: 'searchEngine',
    waitForConnections: true,
    connectionLimit: 10, // Limit the number of concurrent MySQL connections
    queueLimit: 0
});

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
        const keywordContent = metaKeywords.getAttribute('content');
        if (keywordContent) {
            addKeywordsFromString(keywordContent);  // Only add keywords from <meta> tag
        }
    }

    // (b) Extract meta description
    const metaDescription = root.querySelector('meta[name="description"]');
    if (metaDescription) {
        description = metaDescription.getAttribute('content')?.slice(0, 200) || '';
    }

    // Return the first k keywords and the description
    return { keywords: Array.from(keywords).slice(0, k), description };
};

// Retry mechanism to handle errors and retries
const fetchPageWithRetry = async (page, url, retries = 3) => {
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        return await page.content();
    } catch (error) {
        if (retries > 0) {
            console.log(`Retrying ${url}, attempts left: ${retries}`);
            await new Promise(res => setTimeout(res, 2000));  // 2-second delay before retrying
            return fetchPageWithRetry(page, url, retries - 1);
        } else {
            throw new Error(`Failed to fetch ${url} after 3 attempts`);
        }
    }
};

// Function to crawl a single URL
const crawlSingleUrl = async (browser, row) => {
    const nextUrl = row.url.startsWith('http') ? row.url : 'https://' + row.url;

    try {
        const page = await browser.newPage();

        // Block unnecessary resources (images, stylesheets, etc.)
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const resourceType = request.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                request.abort();  // Block images, CSS, and other resources
            } else {
                request.continue();
            }
        });

        console.log(`Crawling URL: ${nextUrl}`);
        const html = await fetchPageWithRetry(page, nextUrl);

        const root = parse(html);
        const { keywords, description } = extractKeywordsAndDescription(root);

        // Insert URL and description into urlDescription table
        await pool.query(
            'INSERT INTO urlDescription (url, description) VALUES (?, ?) ON DUPLICATE KEY UPDATE description = ?',
            [nextUrl, description, description]
        );

        // Insert each keyword into urlKeyword table
        for (const keyword of keywords) {
            const rank = (html.match(new RegExp(keyword, 'gi')) || []).length;
            await pool.query(
                'INSERT INTO urlKeyword (url, keyword, `rank`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `rank` = ?',
                [nextUrl, keyword, rank, rank]
            );
        }

        // Extract all links from the current page and add them to robotUrl table (if needed)
        const links = root.querySelectorAll('a')
            .map(link => link.getAttribute('href'))
            .filter(href => href && !href.startsWith('#'));  // Filter out empty and anchor links

        for (const link of links) {
            const absoluteUrl = new URL(link, nextUrl).href;
            const host = new URL(absoluteUrl).host;

            // Insert host into robotUrl if not already present
            const [countResults] = await pool.query('SELECT COUNT(*) AS count FROM robotUrl WHERE url = ?', [host]);
            if (countResults[0].count === 0) {
                await pool.query('INSERT INTO robotUrl (url) VALUES (?)', [host]);
                console.log(`Inserted new URL to crawl: ${host}`);
            }
        }

        await page.close();  // Close the Puppeteer page
    } catch (error) {
        console.error(`Error crawling ${nextUrl}:`, error);
    }
};

(async () => {
    const pLimit = (await import('p-limit')).default; // Import p-limit dynamically

    // Set the concurrency limit
    const limit = pLimit(5); // Adjust this number based on your needs

    // Function to start the crawling process
    const crawlUrls = async () => {
        return new Promise((resolve, reject) => {
            // 1. Get all available URLs from the robotUrl table ordered by pos
            connection.query('SELECT * FROM robotUrl ORDER BY pos', async (err, results) => {
                if (err) {
                    console.error('Error fetching URLs:', err);
                    return reject('Database query error');
                }

                // Array to hold the crawling promises
                const crawlingPromises = results.map(row => limit(async () => {
                    let nextUrl = row.url;

                    // Add protocol if missing
                    if (!nextUrl.startsWith('http://') && !nextUrl.startsWith('https://')) {
                        nextUrl = 'https://' + nextUrl; // Default to https if protocol is missing
                    }

                    try {
                        // 2. Fetch the page content using Puppeteer
                        const browser = await puppeteer.launch({
                            headless: true,
                            args: ['--no-sandbox', '--disable-setuid-sandbox']
                        });

                        const page = await browser.newPage();
                        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

                        console.log(`Crawling URL: ${nextUrl}`);
                        await page.goto(nextUrl, { waitUntil: 'networkidle0', timeout: 0 });
                        const html = await page.content();
                        await browser.close();

                        console.log('Page fetched successfully.');

                        // 3. Parse the HTML document using node-html-parser
                        const root = parse(html);

                        // 4. Extract keywords and description from <meta> tags
                        const { keywords, description } = extractKeywordsAndDescription(root);

                        // 5. Insert URL and description into urlDescription table
                        connection.query(
                            'INSERT INTO urlDescription (url, description) VALUES (?, ?) ON DUPLICATE KEY UPDATE description = ?',
                            [nextUrl, description, description],
                            (err) => {
                                if (err) throw err;
                                console.log(`Inserted description for URL: ${nextUrl}`);
                            }
                        );

                        // 6. Insert each keyword and its rank into urlKeyword table
                        for (const keyword of keywords) {
                            const rank = (html.match(new RegExp(keyword, 'gi')) || []).length;
                            connection.query(
                                'INSERT INTO urlKeyword (url, keyword, `rank`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `rank` = ?',
                                [nextUrl, keyword, rank, rank],
                                (err) => {
                                    if (err) throw err;
                                    console.log(`Inserted keyword: ${keyword}, Rank: ${rank}`);
                                }
                            );
                        }

                        // 7. Extract all links and insert them into robotUrl table (if needed)
                        const links = root.querySelectorAll('a').map(link => link.getAttribute('href')).filter(href => href);
                        for (const link of links) {
                            const absoluteUrl = new URL(link, nextUrl).href; // Make sure to convert relative links to absolute
                            const host = new URL(absoluteUrl).host; // Extract the host from the absolute URL

                            // Insert the host into robotUrl table
                            connection.query('SELECT COUNT(*) AS count FROM robotUrl WHERE url = ?', [host], (err, results) => {
                                if (err) throw err;
                                if (results[0].count === 0) { // Only insert if the count is 0
                                    connection.query(
                                        'INSERT INTO robotUrl (url) VALUES (?)',
                                        [host],
                                        (err) => {
                                            if (err) throw err;
                                            console.log(`Inserted new URL to crawl: ${host}`);
                                        }
                                    );
                                }
                            });
                        }

                        // 8. Check the number of entries in urlDescription table
                        connection.query('SELECT COUNT(*) AS count FROM urlDescription', (err, countResults) => {
                            if (err) {
                                console.error('Error counting entries in urlDescription:', err);
                                reject('Error counting entries');
                            } else if (countResults[0].count < n) {
                                console.log('Continuing to crawl due to insufficient entries in urlDescription');
                            }
                        });

                    } catch (error) {
                        console.error('Error fetching URL:', error);
                    }
                }));

                // Wait for all crawling promises to resolve
                await Promise.all(crawlingPromises);
                resolve(); // Resolve when done with all URLs
            });
        });
    };

    // Start the crawling process when the endpoint is hit
    router.get('/start', async (req, res) => {
        try {
            await crawlUrls(); // Start crawling
            res.json({ message: 'Crawling process started.' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error starting crawling process' });
        }
    });
})();

module.exports = router;
