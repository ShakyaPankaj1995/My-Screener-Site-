const axios = require('axios');
const { getNSECookie } = require('./_utils');

export default async function handler(req, res) {
    const symbols = (req.query.symbols || '').split(',').filter(Boolean);
    if (!symbols.length) return res.status(400).json({ error: 'No symbols' });

    const results = [];
    const cookie = await getNSECookie();

    for (const symbol of symbols) {
        try {
            const response = await axios.get(`https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}`, {
                headers: {
                    'Cookie': cookie,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://www.nseindia.com/get-quote/equity'
                },
                timeout: 5000
            });
            const d = response.data.priceInfo;
            results.push({
                symbol,
                price: d.lastPrice,
                prevClose: d.prevClose,
                changePercent: d.pChange,
                pe: response.data.metadata.pe || 0,
                pb: response.data.metadata.pb || 0
            });
            await new Promise(r => setTimeout(r, 100)); // Small gap
        } catch (err) {
            results.push({ symbol, error: true });
        }
    }
    res.status(200).json(results);
}
