const axios = require('axios');

let cachedCookie = null;
let cookieTs = 0;

async function getNSECookie() {
    if (cachedCookie && (Date.now() - cookieTs < 300000)) return cachedCookie; // 5 min cache
    try {
        const response = await axios.get('https://www.nseindia.com', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,xml;q=0.9,image/avif,webp,bit/any'
            },
            timeout: 5000
        });
        const cookies = response.headers['set-cookie'];
        if (cookies) {
            cachedCookie = cookies.map(c => c.split(';')[0]).join('; ');
            cookieTs = Date.now();
            return cachedCookie;
        }
    } catch (err) {
        console.error('NSE Cookie Error:', err.message);
    }
    return null;
}

module.exports = { getNSECookie };
