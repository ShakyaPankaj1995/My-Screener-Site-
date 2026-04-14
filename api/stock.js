const axios = require('axios');
const { getNSECookie } = require('./_utils');

export default async function handler(req, res) {
    const { symbol } = req.query;
    if (!symbol) return res.status(400).json({ error: 'Missing symbol' });

    try {
        const cookie = await getNSECookie();
        const response = await axios.get(`https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}`, {
            headers: {
                'Cookie': cookie,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Referer': 'https://www.nseindia.com/get-quote/equity'
            },
            timeout: 8000
        });

        const d = response.data.priceInfo;
        const metadata = response.data.metadata;
        res.status(200).json({
            symbol,
            price: d.lastPrice,
            prevClose: d.prevClose,
            changePercent: d.pChange,
            pe: metadata.pdSymbolCustodian ? null : response.data.metadata.pe || 0,
            pb: response.data.metadata.pb || 0
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch from NSE' });
    }
}
