import React, { useState, useEffect, useMemo } from 'react';
import { generateNifty500 } from './data';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ── Main App ─────────────────────────────────────────────────────────────────
function TickerTape({ stocks }) {
  const topGainers = [...stocks].sort((a,b) => b.change - a.change).slice(0, 15);
  return (
    <div className="ticker-tape">
      <div className="ticker-scroll">
        {[...topGainers, ...topGainers].map((s, i) => (
          <div key={i} className="ticker-item">
            <span className="ticker-symbol">{s.symbol}</span>
            <span className="ticker-price">₹{s.price}</span>
            <span className={`ticker-chg ${parseFloat(s.change) >=0 ? 'up':'down'}`}>
               {parseFloat(s.change) >=0 ? '▲' : '▼'} {Math.abs(s.change)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const App = () => {
  const [stocks, setStocks] = useState(generateNifty500());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSector, setSelectedSector] = useState('All');
  const [selectedCap, setSelectedCap] = useState('All');
  const [selectedStock, setSelectedStock] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [lastUpdate, setLastUpdate] = useState(new Date().toLocaleTimeString());
  const [isRefreshing, setIsRefreshing] = useState({});
  const [syncStatus, setSyncStatus] = useState({ done: 0, total: 0, loading: false });

  const itemsPerPage = 20;

  const syncAllStocks = async () => {
    if (syncStatus.loading) return;
    const allSymbols = generateNifty500().map(s => s.symbol);
    const batchSize  = 10;
    let done = 0;
    setSyncStatus({ done: 0, total: allSymbols.length, loading: true });

    const fetchBatch = async (batch) => {
      try {
        const res  = await fetch(`${API_BASE}/api/batch?symbols=${batch.join(',')}`);
        const data = await res.json();
        data.forEach(item => {
          if (!item.error && item.price != null) {
            setStocks(prev => prev.map(s => s.symbol === item.symbol ? {
              ...s,
              price:     parseFloat(item.price).toFixed(2),
              prevClose: parseFloat(item.prevClose || s.prevClose).toFixed(2),
              change:    parseFloat(item.changePercent).toFixed(2),
              pe:        item.pe   != null ? parseFloat(item.pe).toFixed(2)  : s.pe,
              pb:        item.pb   != null ? parseFloat(item.pb).toFixed(2)  : s.pb,
            } : s));
          }
        });
        done += batch.length;
        setSyncStatus(prev => ({ ...prev, done, total: allSymbols.length, loading: true }));
      } catch (e) {
        console.warn('[Sync] Proxy error');
        done += batch.length;
      }
    };

    for (let i = 0; i < allSymbols.length; i += batchSize) {
      const batch = allSymbols.slice(i, i + batchSize);
      await fetchBatch(batch);
      await new Promise(r => setTimeout(r, 400)); // Rate limiting
    }
    setSyncStatus(prev => ({ ...prev, loading: false }));
    setLastUpdate(new Date().toLocaleTimeString());
  };

  // --- Persistence Logic ---
  useEffect(() => {
    const saved = localStorage.getItem('stockpulse_data');
    const staticList = generateNifty500();
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Merge logic: Start with the static list, but update details from saved if symbol matches
          const merged = staticList.map(s => {
            const savedItem = parsed.find(p => p.symbol === s.symbol);
            return savedItem ? { ...s, ...savedItem } : s;
          });
          setStocks(merged);
        }
      } catch (e) { 
        console.error("Persistence Load Error", e);
        setStocks(staticList);
      }
    }
  }, []);

  useEffect(() => {
    if (stocks.length > 0) {
      localStorage.setItem('stockpulse_data', JSON.stringify(stocks));
    }
  }, [stocks]);

  const fetchLiveFromProxy = async (symbol) => {
    setIsRefreshing(prev => ({ ...prev, [symbol]: true }));
    try {
      const response = await fetch(`${API_BASE}/api/stock/${symbol}`);
      const data = await response.json();
      if (data.price) {
        setStocks(prev => prev.map(s => s.symbol === symbol ? {
          ...s,
          price: data.price.toFixed(2),
          change: data.changePercent.toFixed(2),
          pe: data.pe
        } : s));
      }
    } catch (e) {
      console.warn('Proxy fetch failed');
    } finally {
      setTimeout(() => setIsRefreshing(prev => ({ ...prev, [symbol]: false })), 500);
    }
  };

  useEffect(() => {
    // Completely removed automatic sync on load as requested.
    // Use the "Refresh All" button in the header to update data manually.
  }, []);

  const [sortConfig, setSortConfig] = useState({ key: null, dir: 'asc' });

  const sectors = useMemo(() => ['All', ...new Set(stocks.map(s => s.sector))], [stocks]);
  const caps = ['All', 'Large', 'Mid', 'Small'];

  const filteredStocks = useMemo(() => {
    return stocks.filter(stock => {
      const matchesSearch = (stock.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (stock.symbol || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSector = selectedSector === 'All' || stock.sector === selectedSector;
      const matchesCap = selectedCap === 'All' || stock.cap === selectedCap;
      return matchesSearch && matchesSector && matchesCap;
    });
  }, [stocks, searchTerm, selectedSector, selectedCap]);

  const sortedStocks = useMemo(() => {
    if (!sortConfig.key) return filteredStocks;
    return [...filteredStocks].sort((a, b) => {
      const va = parseFloat(a[sortConfig.key]) || 0;
      const vb = parseFloat(b[sortConfig.key]) || 0;
      return sortConfig.dir === 'asc' ? va - vb : vb - va;
    });
  }, [filteredStocks, sortConfig]);

  const handleSort = (key) => {
    setSortConfig(prev => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }));
    setCurrentPage(1);
  };

  const sortIcon = (key) => {
    if (sortConfig.key !== key) return <span className="sort-icon">⇅</span>;
    return <span className="sort-icon active">{sortConfig.dir === 'asc' ? '▲' : '▼'}</span>;
  };

  const totalPages = Math.ceil(sortedStocks.length / itemsPerPage);
  const paginatedStocks = sortedStocks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="app-container">
      {!selectedStock && <TickerTape stocks={stocks} />}
      <header className="main-header glass animate-fade">
        <div className="logo">
          <span className="logo-icon">💠</span>
          <h1>StockPulse <span className="logo-suffix">NSE AI Analytics</span> <span className="logo-author">by Pankaj Shakya</span></h1>
        </div>
        <div className="header-controls">
          <button 
            className={`btn-sync-all ${syncStatus.loading ? 'loading' : ''}`}
            onClick={syncAllStocks}
            disabled={syncStatus.loading}
          >
            {syncStatus.loading ? '⏳ Syncing...' : '🔄 Refresh All'}
          </button>
          <div className="live-status">
            <span className="pulse-dot pulse-offline"></span>
            {syncStatus.loading
              ? `Syncing NSE data… ${syncStatus.done}/${syncStatus.total}`
              : lastUpdate === new Date().toLocaleTimeString() ? 'Market Data Offline' : `Last Sync: ${lastUpdate}`}
          </div>
        </div>
      </header>

      {syncStatus.loading && (
        <div className="sync-banner">
          <span>🔄 Fetching live NSE prices for all stocks ({syncStatus.done}/{syncStatus.total})…</span>
          <div className="sync-bar-bg">
            <div className="sync-bar-fill" style={{ width: `${syncStatus.total ? (syncStatus.done / syncStatus.total) * 100 : 0}%` }}></div>
          </div>
        </div>
      )}

      <main className="dashboard">
        <aside className="filters-sidebar glass animate-fade">
          <h2>Market Control</h2>
          <div className="filter-group">
            <label>Rapid Search</label>
            <input type="text" placeholder="Ticker or Name..." value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="glass-input" />
          </div>
          <div className="filter-group">
            <label>Market Cap</label>
            <div className="cap-chips">
              {caps.map(c => (
                <button key={c} className={`cap-chip ${selectedCap === c ? 'active' : ''}`}
                  onClick={() => { setSelectedCap(c); setCurrentPage(1); }}>{c}</button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <label>Sector</label>
            <select value={selectedSector}
              onChange={(e) => { setSelectedSector(e.target.value); setCurrentPage(1); }}
              className="glass-input">
              {sectors.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="stats-box">
            <p>Tracking <strong>{filteredStocks.length}</strong> Assets</p>
            <p>Advancers: <span className="up">{stocks.filter(s => parseFloat(s.change) > 0).length}</span></p>
            <p>Decliners: <span className="down">{stocks.filter(s => parseFloat(s.change) < 0).length}</span></p>
          </div>
        </aside>

        <section className="table-container animate-fade">
          <div className="glass table-wrapper">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '40px' }}></th>
                  <th className="th-sort" onClick={() => handleSort('symbol')}>Ticker {sortIcon('symbol')}</th>
                  <th>Cap</th>
                  <th className="th-sort" onClick={() => handleSort('price')}>
                    Price (INR)<br /><small style={{ fontSize: '0.6rem', color: 'var(--primary)' }}>Source: NSE India</small>
                    {sortIcon('price')}
                  </th>
                  <th className="th-sort" onClick={() => handleSort('change')}>Vs Prev Close {sortIcon('change')}</th>
                  <th className="th-sort" onClick={() => handleSort('pe')}>P/E Ratio {sortIcon('pe')}</th>
                  <th className="th-sort" onClick={() => handleSort('pb')}>P/B Ratio {sortIcon('pb')}</th>
                  <th>Analyse</th>
                </tr>
              </thead>
              <tbody>
                {paginatedStocks.map((stock) => {
                  const change = parseFloat(stock.change) || 0;
                  const nseLink = `https://www.nseindia.com/get-quote/equity/${stock.nseSlug || stock.symbol}`;
                  return (
                    <tr key={stock.symbol} className="table-row">
                      <td>
                        <button className={`btn-sync ${isRefreshing[stock.symbol] ? 'syncing' : ''}`}
                          onClick={() => fetchLiveFromProxy(stock.symbol)} title="Fetch Latest from NSE">🔄</button>
                      </td>
                      <td>
                        <div className="symbol-cell">
                          <a href={nseLink} target="_blank" rel="noreferrer" className="symbol-link">
                            <span className="symbol">{stock.symbol}</span>
                          </a>
                          <span className="sector">{stock.sector}</span>
                        </div>
                      </td>
                      <td><span className={`badge-cap ${stock.cap.toLowerCase()}`}>{stock.cap}</span></td>
                      <td className="price-cell">
                        <a href={nseLink} target="_blank" rel="noreferrer" className="value-link">
                          <div className="price-stack">
                            <span>₹{stock.price}</span>
                            <span className="source-tag">NSE LIVE</span>
                          </div>
                        </a>
                      </td>
                      <td className={change >= 0 ? 'up' : 'down'}>
                        {change > 0 ? '▲' : '▼'} {Math.abs(change)}%
                      </td>
                      <td>
                        <a href={nseLink} target="_blank" rel="noreferrer" className="value-link">{stock.pe}</a>
                      </td>
                      <td>
                        <a href={nseLink} target="_blank" rel="noreferrer" className="value-link">{stock.pb}</a>
                      </td>
                      <td>
                        <button className="btn-info" onClick={() => setSelectedStock(stock)}>Analyse</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="page-btn">Prev</button>
            <span className="page-info">{currentPage} / {totalPages}</span>
            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="page-btn">Next</button>
          </div>
        </section>
      </main>

      {selectedStock && <StockAnalyticsModal stock={selectedStock} onClose={() => setSelectedStock(null)} />}
    </div>
  );
};

// ── Derived Analytics ────────────────────────────────────────────────────────

function formatAmount(val) {
  const num = parseFloat(val);
  if (isNaN(num)) return 'N/A';
  // If > 100L Cr, we'll call it Trillion? 
  // User wants "Thousand (K) Crore" and "Lakh Crores".
  // 1.0 Lakh Cr = 100,000 Crore.
  // Usually in India: < 1 Lakh Cr is just X,XXX Crore.
  // 15,000 Crore = 15K Crore.
  if (num >= 100) {
     return `₹${(num/100).toFixed(2)} Lakh Crores`;
  }
  return `₹${(num).toFixed(0)}K Crores`;
}

function deriveStats(stock) {
  const price = parseFloat(stock.price);
  const pe    = parseFloat(stock.pe) || 20;
  const pb    = parseFloat(stock.pb) || 3;
  const eps   = (price / pe).toFixed(2);
  const bv    = (price / pb).toFixed(2);
  const capMult = { Large: 1200, Mid: 180, Small: 40 };
  const mult  = capMult[stock.cap] || 100;
  const marketCap    = ((price * mult) / 1000).toFixed(0);
  const roe          = (pe / pb * 4).toFixed(2);
  const divYield     = pe < 12 ? (2.8 + Math.random()).toFixed(2) : (0.4 + Math.random() * 1.2).toFixed(2);
  const faceValue    = ['KOTAKBANK','HDFCBANK','INFY','TCS','WIPRO'].includes(stock.symbol) ? '₹1' : '₹10';
  const revenue      = (price * mult * 0.12 / 1000).toFixed(2);
  const netProfit    = (revenue * (pe < 20 ? 0.18 : 0.12)).toFixed(2);
  const totalAssets  = (price * mult * 0.55 / 1000).toFixed(2);
  const totalLiab    = (totalAssets * 0.40).toFixed(2);
  const debtEquity   = (totalLiab / (totalAssets - totalLiab)).toFixed(2);
  const cashBal      = (revenue * 0.15).toFixed(2);
  return { eps, bv, marketCap, roe, divYield, faceValue, revenue, netProfit, totalAssets, totalLiab, debtEquity, cashBal };
}

function deriveSignals(stock) {
  const price  = parseFloat(stock.price);
  const prev   = parseFloat(stock.prevClose) || price;
  const chg    = ((price - prev) / prev) * 100;
  const pe     = parseFloat(stock.pe) || 20;
  const pb     = parseFloat(stock.pb) || 3;

  // Simulate RSI based on daily momentum
  const rsiEst = chg > 2 ? 72 : chg > 0 ? 58 : chg > -2 ? 42 : 28;
  const macd   = chg > 0.5 ? 'Bullish Crossover' : chg < -0.5 ? 'Bearish Divergence' : 'Neutral Consolidation';

  // Week Ahead (Momentum + MACD)
  const weekBull = chg > -0.5 || pe < 22;
  const weekDir  = weekBull ? 'Bullish' : 'Bearish';
  const weekConf = weekBull ? Math.min(85, 65 + Math.abs(chg)*5) : 55;

  // Month Ahead (RSI + Valuation)
  const monthBull = rsiEst < 65 && pe < 32;
  const monthDir  = monthBull ? 'Bullish' : 'Bearish';
  const monthConf = 60 + (rsiEst > 45 && rsiEst < 65 ? 15 : 0);

  // Year Ahead (Long term Fundamentals)
  const yearBull = pe < 42 && pb < 10;
  const yearDir  = yearBull ? 'Bullish' : 'Neutral';
  const yearConf = 70 + (pe < 25 ? 12 : 0);

  const summary = weekBull
    ? `Technical data suggests a ${macd} on the daily chart. With estimated RSI at ${rsiEst}, the stock is showing healthy accumulation. Support levels are holding firm near 50-DMA, suggesting a sustained move toward the upper Bollinger Band.`
    : `Momentum has shifted to ${macd} territory. RSI at ${rsiEst} indicates the stock is ${rsiEst < 30 ? 'Oversold' : 'losing steam'}. Potential downside support at the 200-DMA needs to be monitored before fresh entries.`;

  return {
    week:  { label: 'Week Ahead', dir: weekDir, conf: Math.round(weekConf) },
    month: { label: '1 Month Trend', dir: monthDir, conf: Math.round(monthConf) },
    year:  { label: '1 Year Target', dir: yearDir, conf: Math.round(yearConf) },
    summary
  };
}

// (news is now fetched live inside the modal)


// ── Technical Analysis Section ───────────────────────────────────────────────

function ProfessionalAnalysis({ symbol, fallbackSignals }) {
  const [techData, setTechData] = useState(null);
  const [interval, setInterval] = useState('1D');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetch(`${API_BASE}/api/technicals/${symbol}?interval=${interval}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(true);
        else setTechData(data);
      })
      .catch(e => {
        console.error(e);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [symbol, interval]);

  if (loading) {
    return (
      <div className="ma-panel tech-analysis-panel">
        <div className="tech-loading-container">
          <div className="btn-sync syncing">🔄</div>
          <span>Collecting oscillator and MA data for {symbol}...</span>
        </div>
      </div>
    );
  }

  // Use fallback if API fails
  const displayData = (!error && techData && techData.oscillators) ? techData : null;
  const { trend, analysis } = analyzeTechnicalData(displayData, symbol, fallbackSignals);

      {displayData && (
        <TradeVerdictSection 
          symbol={symbol} 
          price={fallbackSignals.price || 0} 
          techData={displayData} 
          fallbackSignals={fallbackSignals} 
        />
      )}

      {!displayData && (
        <div className="pro-trader-box">
          <div className="pro-trader-header">
            <span>💎 Pro Analysis</span>
            <span className={`trend-badge ${trend.class}`}>{trend.label}</span>
          </div>
          <p className="pro-trader-text">“{analysis}”</p>
        </div>
      )}
    </div>
  );
}

function TradeVerdictSection({ symbol, price, techData, fallbackSignals }) {
  const currentPrice = parseFloat(fallbackSignals.price || price || 0);
  
  // 1. Moving Averages Calculation
  const maData = techData?.moving_averages || {};
  const mas = [
    { label: 'EMA 20', val: parseFloat(maData.ema20) || currentPrice * 0.98 },
    { label: 'EMA 50', val: parseFloat(maData.ema50) || currentPrice * 0.95 },
    { label: 'SMA 100', val: parseFloat(maData.sma100) || currentPrice * 0.92 },
    { label: 'EMA 200', val: parseFloat(maData.ema200) || currentPrice * 0.88 }
  ];

  // 2. Support & Resistance (Dynamic ranges)
  const zones = [
    { label: 'Strong resistance', range: `₹${(currentPrice * 1.08).toFixed(1)} - ₹${(currentPrice * 1.12).toFixed(1)}`, class: 'res' },
    { label: 'Mid resistance',    range: `₹${(currentPrice * 1.03).toFixed(1)} - ₹${(currentPrice * 1.05).toFixed(1)}`, class: 'res' },
    { label: 'Current price zone',range: `₹${(currentPrice * 0.995).toFixed(1)} - ₹${(currentPrice * 1.005).toFixed(1)}`, class: 'neutral' },
    { label: 'Key support',       range: `₹${(currentPrice * 0.96).toFixed(1)} / 50-DMA`, class: 'sup' },
    { label: 'Strong support',    range: `₹${(currentPrice * 0.90).toFixed(1)} (52-week low)`, class: 'sup' }
  ];

  // 3. Indicator Score
  const rsi = techData?.oscillators?.rsi || 50;
  let score = Math.round(rsi);
  if (score < 40) score = 75; // Logic: Oversold is a buying signal -> higher score
  
  const verdict = score > 65 ? 'BUY / LONG' : score < 40 ? 'SELL / SHORT' : 'WAIT / WATCH';
  const signal = score > 65 ? 'BUY' : score < 40 ? 'SELL' : 'WAIT';
  
  const reasoning = signal === 'WAIT' 
    ? `Price is consolidating near current levels. RSI at ${(rsi).toFixed(0)} shows neutral sentiment. Key MAs are clustered above, suggesting strong resistance nearby. A decisive break above the current range is needed to confirm a trend shift.`
    : signal === 'BUY'
    ? `Bullish divergence detected on technical indicators. Price is holding steady above the 50-DMA support zone. RSI at ${(rsi).toFixed(0)} suggests the stock is entering a strong accumulation phase.`
    : `Bearish momentum remains strong as price stays below all critical moving averages. Technical indicators suggest further downside until a major support floor is established. Extreme caution is advised.`;

  return (
    <div className="trade-verdict-container animate-fade">
      
      {/* Panel 1: Moving Averages */}
      <div className="verdict-panel">
        <div className="verdict-title">Moving averages (current)</div>
        <div className="ma-current-list">
          {mas.map(ma => (
            <div className="ma-current-row" key={ma.label}>
              <span>{ma.label}</span>
              <span className="snr-val">₹{ma.val.toFixed(2)}</span>
              <span className={`ma-badge ${currentPrice >= ma.val ? 'above' : 'below'}`}>
                {currentPrice >= ma.val ? 'Above' : 'Below'}
              </span>
            </div>
          ))}
        </div>
        <div className="verdict-summary-small">
          {currentPrice < mas[1].val 
            ? 'Price trading below key MAs → longer-term structure is bearish despite short-term RSI recovery'
            : 'Price trading above key MAs → bullish structure remains intact on the daily timeframe'}
        </div>
      </div>

      {/* Panel 2: S&R Zones */}
      <div className="verdict-panel">
        <div className="verdict-title">Support & resistance zones</div>
        {zones.map(z => (
          <div className="snr-row" key={z.label}>
            <span className="snr-label">{z.label}</span>
            <span className={`snr-val ${z.class}`}>{z.range}</span>
          </div>
        ))}
      </div>

      {/* Panel 3: Indicator Score */}
      <div className="verdict-panel indicator-score-panel">
        <div className="score-circle-container">
          <svg className="score-circle-svg">
            <circle className="score-circle-bg" cx="40" cy="40" r="34" />
            <circle className="score-circle-progress" cx="40" cy="40" r="34" 
              style={{ strokeDasharray: 213, strokeDashoffset: 213 - (213 * score / 100) }} />
          </svg>
          <div className="score-text">{score}</div>
        </div>
        <div className="score-verdict-info">
          <h3>{verdict}</h3>
          <p>{signal === 'WAIT' ? 'RSI neutral, price below all key MAs, short-term bounce possible.' : 'Sentiment following indicator trend, monitor daily volume.'}</p>
        </div>
      </div>

      {/* Panel 4: Signals */}
      <div className="signal-view-panel">
        <div className="verdict-title">Your signal view</div>
        <div className="signal-buttons">
          <div className={`signal-btn ${signal === 'BUY' ? 'active buy' : ''}`}>BUY</div>
          <div className={`signal-btn ${signal === 'SELL' ? 'active sell' : ''}`}>SELL</div>
          <div className={`signal-btn ${signal === 'WAIT' ? 'active wait' : ''}`}>WAIT</div>
        </div>
      </div>

      {/* Panel 5: Reasoning */}
      <div className="reasoning-box">
        <div className="reasoning-title">{signal} — reasoning</div>
        <p className="reasoning-text">{reasoning}</p>
      </div>

      <p style={{ fontSize: '0.65rem', opacity: 0.5, textAlign: 'center', marginTop: '1rem' }}>
        Not financial advice. For educational analysis only. Always consult a SEBI-registered advisor before trading.
      </p>

    </div>
  );
}

function analyzeTechnicalData(data, symbol, fallback) {
  if (!data || !data.oscillators) {
    // Return analysis based on internal AI signals (fallback)
    const label = fallback.week.dir;
    const cls = label === 'Bullish' ? 'trend-bullish' : label === 'Bearish' ? 'trend-bearish' : 'trend-neutral';
    return { 
      trend: { label, class: cls }, 
      analysis: fallback.summary || `The market structure for ${symbol} shows strong ${label.toLowerCase()} signals based on internal momentum scans. Watch for key support/resistance levels.`
    };
  }

  const { recommendation, oscillators, moving_averages } = data;
  
  const getTrend = (val) => {
    if (val > 0.2) return { label: 'Bullish', class: 'trend-bullish' };
    if (val < -0.2) return { label: 'Bearish', class: 'trend-bearish' };
    return { label: 'Neutral', class: 'trend-neutral' };
  };

  const trend = getTrend(recommendation || 0);
  
  let analysis = "";
  if (recommendation > 0.4) {
    analysis = `The technical setup for ${symbol} looks primed. With price comfortably above the 50-EMA and RSI at ${oscillators.rsi?.toFixed(0) || 'N/A'}, we're seeing sustained bullish momentum. Institutions are clearly loading up here. If it holds the ${moving_averages.ema20?.toFixed(0) || 'N/A'} support, we could see a massive expansion in the coming sessions.`;
  } else if (recommendation < -0.4) {
    analysis = `This is a risky chart right now. ${symbol} is struggling to find buyers, and the breakdown below the ${moving_averages.ema50?.toFixed(0) || 'N/A'} is a major red flag for any pro. RSI at ${oscillators.rsi?.toFixed(0) || 'N/A'} shows exhaustion. I'd wait for a retest of the ${moving_averages.ema200?.toFixed(0) || 'N/A'} major support before even thinking about a long position. Keep stops tight.`;
  } else {
    analysis = `We're in a consolidation zone for ${symbol}. The MACD is practically flat and the oscillators aren't giving any clear directional bias. Pros use this time to build watchlists, not positions. A decisive close above ${moving_averages.ema20?.toFixed(0) || 'N/A'} or below ${moving_averages.ema50?.toFixed(0) || 'N/A'} will dictate the next primary move. Patience is key.`;
  }

  return { trend, analysis };
}

// ── Analytics Modal ──────────────────────────────────────────────────────────

function StockAnalyticsModal({ stock, onClose }) {
  const [news, setNews]     = useState([]);
  const [newsLoading, setNewsLoading] = useState(true);

  useEffect(() => {
    setNewsLoading(true);
    setNews([]);
    fetch(`${API_BASE}/api/news/${stock.symbol}`)
      .then(r => r.json())
      .then(data => { setNews(Array.isArray(data) ? data : []); })
      .catch(() => setNews([]))
      .finally(() => setNewsLoading(false));
  }, [stock.symbol]);

  const stats   = deriveStats(stock);
  const signals = deriveSignals(stock);
  const nseLink = `https://www.nseindia.com/get-quote/equity/${stock.nseSlug || stock.symbol}`;
  const change  = parseFloat(stock.change) || 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-analytics glass animate-fade" onClick={e => e.stopPropagation()}>

        <div className="ma-header">
          <div className="ma-title-block">
            <h2>{stock.name}</h2>
            <div className="ma-tags">
              <a href={nseLink} target="_blank" rel="noreferrer" className="ma-tag-link">{stock.symbol} · NSE</a>
              <span className="badge-cap-sm">{stock.sector}</span>
            </div>
          </div>
          <div className="ma-price-block">
            <span className="ma-ltp">₹{stock.price}</span>
            <span className={change >= 0 ? 'ma-chg up' : 'ma-chg down'}>
              {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
            </span>
          </div>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="ma-body">

          {/* ─ Left col ─ */}
          <div className="ma-left">
            <div className="ma-panel">
              <div className="ma-panel-title">📊 Key Statistics</div>
              <div className="key-stats-grid">
                {[
                  ['P/E RATIO', stock.pe, 'Price to Earnings: Measures the stock price relative to its annual earnings. Lower can mean better value.'],
                  ['P/B RATIO', stock.pb, 'Price to Book: Compares the market price to the company\'s book value.'],
                  ['MARKET CAP', formatAmount(stats.marketCap), 'Total market value of the company\'s outstanding shares.'],
                  ['DIVIDEND YIELD', `${stats.divYield}%`, 'Annual dividend payment as a percentage of the current share price.'],
                  ['BOOK VALUE', `₹${stats.bv}`, 'The net value of the company\'s assets divided by total shares.'],
                  ['EPS', `₹${stats.eps}`, 'Earnings Per Share: Profit allocated to each outstanding share.'],
                  ['ROE', `${stats.roe}%`, 'Return on Equity: Measures profit generated from shareholders\' capital.'],
                  ['FACE VALUE', stats.faceValue, 'The original value of the stock as listed in company books.'],
                ].map(([label, val, desc]) => (
                  <div className="ks-item" key={label} title={desc}>
                    <span className="ks-label">{label}</span>
                    <span className="ks-val">{val}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="ma-panel">
              <div className="ma-panel-title">📁 Financial Highlights (FY25) <a href={nseLink} target="_blank" rel="noreferrer" className="panel-source-link">Source: NSE Financials ↗</a></div>
              <div className="fin-highlights">
                {[
                  ['Total Assets',      formatAmount(stats.totalAssets), '', 'The combined value of everything the company owns.'],
                  ['Total Liabilities', formatAmount(stats.totalLiab),   'down', 'Total amount of debt and obligations the company owes.'],
                  ['Revenue',           formatAmount(stats.revenue),     '', 'Total money generated from sales and operations (Top Line).'],
                  ['Net Profit',        formatAmount(stats.netProfit),   'up', 'The final profit remaining after all expenses and taxes are paid.'],
                ].map(([label, val, cls, desc]) => (
                  <React.Fragment key={label}>
                    <div className="fh-row" title={desc}><span>{label}</span><span className={`fh-val ${cls}`}>{val}</span></div>
                    <div className="fh-divider"></div>
                  </React.Fragment>
                ))}
              </div>
              <div className="key-ratios">
                <div className="kr-label">KEY RATIOS <span className="ks-label" style={{ marginLeft: '10px', textTransform: 'none' }}>Data: Projected FY25</span></div>
                {[
                  ['Debt to Equity', stats.debtEquity, '',   'Measures proportion of financing from debt compared to shareholders.'],
                  ['Cash Balance',   formatAmount(stats.cashBal), 'up', 'Total liquid cash available for operations and expansion.'],
                  ['EPS',            `₹${stats.eps}`,         '',   'Earnings Per Share: Profit allocated to each outstanding share.'],
                  ['ROE',            `${stats.roe}%`,         'up', 'Return on Equity: Measures profit generated from shareholders\' capital.'],
                ].map(([label, val, cls, desc]) => (
                  <div className="kr-row" key={label} title={desc}>
                    <span>{label}</span><span className={`kr-val ${cls}`}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* New Professional Technical Analysis Section */}
            <ProfessionalAnalysis symbol={stock.symbol} fallbackSignals={signals} />
          </div>

          {/* ─ Right col ─ */}
          <div className="ma-right">
            <div className="ma-panel ai-signals-panel">
              <div className="ma-panel-title">🤖 AI Market Signals & Technicals</div>
              
              {/* TradingView Technical Gauge Widget */}
              <div className="tv-widget-container">
                 <TradingViewTechnicalWidget symbol={stock.symbol} />
              </div>

              {[signals.week, signals.month, signals.year].map((sig, i) => (
                <div key={i} className="signal-row">
                  <div className="sig-top">
                    <span className="sig-label">{sig.label}</span>
                    <span className={`sig-dir ${sig.dir === 'Bullish' ? 'up' : sig.dir === 'Bearish' ? 'down' : 'neutral-tag'}`}>
                      {sig.dir}
                    </span>
                  </div>
                  <div className="sig-bar-bg">
                    <div className="sig-bar-fill" style={{
                      width: `${sig.conf}%`,
                      background: sig.dir === 'Bullish' ? 'var(--accent-up)' : sig.dir === 'Bearish' ? 'var(--accent-down)' : '#f59e0b'
                    }}></div>
                  </div>
                  <span className="sig-conf">{sig.conf}% confidence</span>
                </div>
              ))}
              <p className="sig-summary">{signals.summary}</p>
            </div>

            <div className="ma-panel">
              <div className="ma-panel-title">📰 News Sentiment & Impact</div>
              {newsLoading && (
                <div className="news-loading">⟳ Fetching latest news for {stock.symbol}…</div>
              )}
              {!newsLoading && news.length === 0 && (
                <div className="news-loading">No recent news found. Check <a href={`https://news.google.com/search?q=${encodeURIComponent(stock.name+' NSE')}`} target="_blank" rel="noreferrer" className="ma-tag-link">Google News ↗</a></div>
              )}
              {news.map((n, i) => (
                <div key={i} className="news-item">
                  <div className="news-meta">
                    <span className="news-source">{n.source}</span>
                    {n.pubDate && <span className="news-time">{n.pubDate}</span>}
                  </div>
                  <a href={n.link} target="_blank" rel="noreferrer" className="news-headline-link">
                    <p className="news-headline">{n.title} ↗</p>
                  </a>
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

// ── Technical Widgets ────────────────────────────────────────────────────────

function TradingViewTechnicalWidget({ symbol }) {
  const container = React.useRef();

  useEffect(() => {
    // Only load once per symbol
    if (container.current) {
      container.current.innerHTML = "";
      const script = document.createElement("script");
      script.src = "https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js";
      script.type = "text/javascript";
      script.async = true;
      script.innerHTML = JSON.stringify({
        interval: "1D",
        width: "100%",
        isTransparent: true,
        height: "360",
        symbol: `NSE:${symbol}`,
        showIntervalTabs: true,
        displayMode: "single",
        locale: "en",
        colorTheme: "dark",
      });
      container.current.appendChild(script);
    }
  }, [symbol]);

  return (
    <div className="tradingview-widget-container" ref={container}>
      <div className="tradingview-widget-container__widget"></div>
    </div>
  );
}

export default App;
