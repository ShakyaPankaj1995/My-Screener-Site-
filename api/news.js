const axios = require('axios');

function parseRSS(xml) {
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRegex.exec(xml)) !== null) {
        const chunk = m[1];
        const getTag = (tag) => {
            const r = new RegExp(`<${tag}(?:[^>]*)>([\\s\\S]*?)<\\/${tag}>`);
            const found = r.exec(chunk);
            return found ? found[1].replace(/<!\_CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').trim() : '';
        };
        const linkMatch = /<link>([\s\S]*?)<\/link>/i.exec(chunk);
        const srcMatch = /source url="([^"]+)"[^>]*>([^<]+)<\/source>/i.exec(chunk);
        items.push({
            title: getTag('title'),
            link: linkMatch ? linkMatch[1].trim() : '',
            pubDate: getTag('pubDate'),
            source: srcMatch ? srcMatch[2].trim() : 'Google News'
        });
    }
    return items;
}

export default async function handler(req, res) {
    const { symbol } = req.query;
    if (!symbol) return res.status(400).json({ error: 'No symbol' });

    const query = encodeURIComponent(`${symbol} stock NSE India`);
    const rss = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;

    try {
        const resp = await axios.get(rss, { timeout: 8000 });
        const items = parseRSS(resp.data).slice(0, 5);
        res.status(200).json(items);
    } catch (err) {
        res.status(500).json([]);
    }
}
