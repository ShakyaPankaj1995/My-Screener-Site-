const express = require('express');
const axios   = require('axios');
const cors    = require('cors');

const app = express();
app.use(cors());

const NSE_HOME = 'https://www.nseindia.com';
const NSE_API  = 'https://www.nseindia.com/api/quote-equity?symbol=';

let nseCookies = '';
let cookieTs   = 0;

// Refresh cookies every 8 minutes
async function getCookies() {
    const now = Date.now();
    if (nseCookies && now - cookieTs < 8 * 60 * 1000) return;
    try {
        const res = await axios.get(NSE_HOME, {
            headers: {
                'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            timeout: 10000
        });
        if (res.headers['set-cookie']) {
            nseCookies = res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
            cookieTs   = now;
            console.log('[NSE] Cookies refreshed');
        }
    } catch (err) {
        console.error('[NSE] Cookie error:', err.message);
    }
}

// Fetch single stock from NSE API
async function fetchStock(symbol) {
    await getCookies();
    const res = await axios.get(`${NSE_API}${symbol}`, {
        headers: {
            'Cookie':          nseCookies,
            'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer':         `${NSE_HOME}/get-quote/equity?symbol=${symbol}`,
            'Accept':          'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'X-Requested-With':'XMLHttpRequest',
        },
        timeout: 10000
    });
    const d = res.data;
    return {
        symbol:        d.info?.symbol,
        name:          d.info?.companyName,
        price:         d.priceInfo?.lastPrice,
        prevClose:     d.priceInfo?.previousClose,
        changePercent: d.priceInfo?.pChange,
        open:          d.priceInfo?.open,
        high:          d.priceInfo?.intraDayHighLow?.max,
        low:           d.priceInfo?.intraDayHighLow?.min,
        pe:            d.metadata?.pdSymbolPe  || null,
        pb:            d.metadata?.pdPriceToBV || null,
        eps:           d.metadata?.pdEps       || null,
        marketCap:     d.industryInfo?.macro   || null,
    };
}

// ── Single stock endpoint ────────────────────────────────────────────────────
app.get('/api/stock/:symbol', async (req, res) => {
    try {
        const data = await fetchStock(req.params.symbol.toUpperCase());
        res.json(data);
    } catch (err) {
        console.error(`[NSE] Error for ${req.params.symbol}:`, err.message);
        // Retry once with fresh cookies
        nseCookies = '';
        try {
            const data = await fetchStock(req.params.symbol.toUpperCase());
            res.json(data);
        } catch (e) {
            res.status(500).json({ error: 'NSE fetch failed', message: e.message });
        }
    }
});

// ── Batch endpoint: /api/batch?symbols=TCS,RELIANCE,INFY ────────────────────
app.get('/api/batch', async (req, res) => {
    const symbols = (req.query.symbols || '').split(',').filter(Boolean);
    if (!symbols.length) return res.json([]);

    const results = [];
    for (const sym of symbols) {
        try {
            const data = await fetchStock(sym.trim().toUpperCase());
            results.push(data);
        } catch (err) {
            console.error(`[Batch] Failed: ${sym} — ${err.message}`);
            results.push({ symbol: sym, error: true });
        }
        // Rate limit: 500ms between each call to avoid NSE blocking
        await new Promise(r => setTimeout(r, 500));
    }
    res.json(results);
});

// ── News endpoint: /api/news/:symbol ────────────────────────────────────────
function parseRSS(xml) {
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRegex.exec(xml)) !== null) {
        const chunk  = m[1];
        const getTag = (tag) => {
            const r = new RegExp(`<${tag}(?:[^>]*)>([\\s\\S]*?)<\\/${tag}>`);
            const found = r.exec(chunk);
            return found ? found[1].replace(/<!\_CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').trim() : '';
        };
        const linkMatch = /<link>([\s\S]*?)<\/link>/i.exec(chunk);
        const srcMatch  = /source url="([^"]+)"[^>]*>([^<]+)<\/source>/i.exec(chunk);
        const rawDate   = getTag('pubDate');
        items.push({
            title:   getTag('title'),
            link:    linkMatch ? linkMatch[1].trim() : '',
            pubDate: rawDate ? new Date(rawDate).toLocaleDateString('en-IN', { day:'numeric',month:'short',year:'numeric' }) : '',
            source:  srcMatch ? srcMatch[2].trim() : 'Google News',
        });
    }
    return items;
}

app.get('/api/news/:symbol', async (req, res) => {
    const sym   = req.params.symbol.replace(/[^A-Z0-9&]/gi, '');
    const query = encodeURIComponent(`${sym} stock NSE India`);
    const rss   = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;
    try {
        const resp  = await axios.get(rss, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
        const items = parseRSS(resp.data).slice(0, 5);
        res.json(items);
    } catch (err) {
        console.error('[News]', err.message);
        res.status(500).json([]);
    }
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', cookieAge: Date.now() - cookieTs }));

const PORT = 3001;
app.listen(PORT, async () => {
    console.log(`\n🚀 NSE Proxy running: http://localhost:${PORT}`);
    console.log(`   Single:  http://localhost:${PORT}/api/stock/TCS`);
    console.log(`   Batch:   http://localhost:${PORT}/api/batch?symbols=TCS,RELIANCE,INFY\n`);
    await getCookies(); // Pre-warm cookies
});
