// Search route
router.get("/search", async (req, res) => {
    const { query, operator } = req.query;
    const isAndOperation = operator === "AND";

    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required.' });
    }

    // Extract keywords and exact phrases
    const searchTerms = query.match(/"[^"]+"|'[^']+'|\S+/g) || [];
    const phrases = searchTerms.filter(term => term.startsWith('"') || term.startsWith("'")).map(term => term.replace(/['"]+/g, ''));
    const keywords = searchTerms.filter(term => !(term.startsWith('"') || term.startsWith("'"))).map(term => term.replace(/['"]+/g, ''));

    try {
        let sqlQuery;
        let values = [];
        
        if (isAndOperation) {
            // AND Logic: URLs must contain all keywords
            const keywordConditions = keywords.map(() => "keyword LIKE ?").join(" OR ");
            values = keywords.map(term => `%${term}%`);
            sqlQuery = `
                SELECT url, COUNT(DISTINCT keyword) AS keywordCount, SUM(\`rank\`) AS totalRank
                FROM urlKeyword
                WHERE ${keywordConditions}
                GROUP BY url
                HAVING keywordCount = ?
            `;
            values.push(keywords.length);  // Ensure all keywords are present
            console.log("Executing AND query:", sqlQuery, values);
        } else {
            // OR Logic: URLs may contain any keyword
            const keywordConditions = keywords.map(() => "keyword LIKE ?").join(" OR ");
            values = keywords.map(term => `%${term}%`);
            sqlQuery = `
                SELECT url, SUM(\`rank\`) AS totalRank
                FROM urlKeyword
                WHERE ${keywordConditions}
                GROUP BY url
            `;
            console.log("Executing OR query:", sqlQuery, values);
        }

        const [keywordResults] = await connection.query(sqlQuery, values);

        if (keywordResults.length === 0) {
            // No results found
            console.log("No results found for query:", query);
            return res.json({ message: "no results" });
        }

        // Process results, handling any exact phrase matching
        const results = await Promise.all(
            keywordResults.map(async ({ url, totalRank }) => {
                let totalRankWithPhrases = totalRank;

                // If there are phrases, ensure they appear in content
                for (const phrase of phrases) {
                    const pageContent = await fetchHtmlWithPlaywright(url);
                    if (pageContent) {
                        totalRankWithPhrases += countExactPhrase(pageContent, phrase);
                    }
                }

                // Fetch the description for display only, not for keyword matching
                const [descriptionRow] = await connection.query(
                    `SELECT description FROM urlDescription WHERE url = ? LIMIT 1`,
                    [url]
                );
                const description = descriptionRow.length ? descriptionRow[0].description : '';

                return { url, description, rank: totalRankWithPhrases };
            })
        );

        const sortedResults = results.filter(Boolean).sort((a, b) => b.rank - a.rank);
        console.log("Final results:", sortedResults);

        res.json({ query, urls: sortedResults });
    } catch (error) {
        console.error('Error executing query:', error);
        res.status(500).json({ error: 'Database query failed.', details: error.message });
    }

    process.on('exit', async () => {
        if (browser) await browser.close();
    });
});

module.exports = router;
