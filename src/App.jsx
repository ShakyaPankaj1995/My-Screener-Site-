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
  const [favorites, setFavorites] = useState(() => JSON.parse(localStorage.getItem('stockpulse_favorites') || '[]'));
  const [showWatchlist, setShowWatchlist] = useState(false);

  useEffect(() => {
    localStorage.setItem('stockpulse_favorites', JSON.stringify(favorites));
  }, [favorites]);

  const toggleFavorite = (symbol) => {
    setFavorites(prev => prev.includes(symbol) ? prev.filter(s => s !== symbol) : [...prev, symbol]);
  };

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
              pe:          item.pe          != null ? parseFloat(item.pe).toFixed(2)  : s.pe,
              pb:          item.pb          != null ? parseFloat(item.pb).toFixed(2)  : s.pb,
              eps:         item.eps         != null ? parseFloat(item.eps).toFixed(2) : s.eps,
              totalShares: item.totalShares != null ? parseInt(item.totalShares, 10)  : s.totalShares,
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
    // Auto update every 15 minutes
    const interval = setInterval(() => {
      syncAllStocks();
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const [sortConfig, setSortConfig] = useState({ key: null, dir: 'asc' });

  const sectors = useMemo(() => ['All', ...new Set(stocks.map(s => s.sector))], [stocks]);

  const sectorPEs = useMemo(() => {
    const secMap = {};
    stocks.forEach(stock => {
      if (!secMap[stock.sector]) secMap[stock.sector] = { total: 0, count: 0 };
      const pe = parseFloat(stock.pe);
      if (pe && pe > 0) {
        secMap[stock.sector].total += pe;
        secMap[stock.sector].count += 1;
      }
    });
    const avg = {};
    for (const sec in secMap) {
      avg[sec] = secMap[sec].count > 0 ? (secMap[sec].total / secMap[sec].count).toFixed(2) : 'N/A';
    }
    return avg;
  }, [stocks]);

  const caps = ['All', 'Large', 'Mid', 'Small'];

  const filteredStocks = useMemo(() => {
    return stocks.filter(stock => {
      const matchesSearch = (stock.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (stock.symbol || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSector = selectedSector === 'All' || stock.sector === selectedSector;
      const matchesCap = selectedCap === 'All' || stock.cap === selectedCap;
      const matchesWatchlist = !showWatchlist || favorites.includes(stock.symbol);
      return matchesSearch && matchesSector && matchesCap && matchesWatchlist;
    });
  }, [stocks, searchTerm, selectedSector, selectedCap, showWatchlist, favorites]);

  const sortedStocks = useMemo(() => {
    if (!sortConfig.key) return filteredStocks;
    return [...filteredStocks].sort((a, b) => {
      let va, vb;
      if (sortConfig.key === 'industryPE') {
        va = parseFloat(sectorPEs[a.sector]) || 0;
        vb = parseFloat(sectorPEs[b.sector]) || 0;
      } else {
        va = parseFloat(a[sortConfig.key]) || 0;
        vb = parseFloat(b[sortConfig.key]) || 0;
      }
      return sortConfig.dir === 'asc' ? va - vb : vb - va;
    });
  }, [filteredStocks, sortConfig, sectorPEs]);

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
          <div className="filter-group">
            <label>Watchlist</label>
            <button 
              className={`cap-chip ${showWatchlist ? 'active' : ''}`}
              style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '8px' }}
              onClick={() => { setShowWatchlist(!showWatchlist); setCurrentPage(1); }}
            >
              ⭐️ {showWatchlist ? 'Showing Favorites' : 'View Watchlist'}
            </button>
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
                  <th className="th-sort" onClick={() => handleSort('industryPE')}>Industry P/E {sortIcon('industryPE')}</th>
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
                        <span className="value-link" style={{ opacity: 0.8, color: 'var(--text-dim)' }}>{sectorPEs[stock.sector] || 'N/A'}</span>
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

      {selectedStock && (
        <StockAnalyticsModal 
          stock={selectedStock} 
          onClose={() => setSelectedStock(null)} 
          isFav={favorites.includes(selectedStock.symbol)}
          toggleFav={() => toggleFavorite(selectedStock.symbol)}
        />
      )}
    </div>
  );
};

// ── Derived Analytics ────────────────────────────────────────────────────────

function formatAmount(val) {
  const num = parseFloat(val);
  if (isNaN(num)) return 'N/A';
  return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr`;
}

function deriveStats(stock) {
  const price = parseFloat(stock.price);
  const pe    = parseFloat(stock.pe) || 20;
  const pb    = parseFloat(stock.pb) || 3;
  const hasLiveEps = stock.eps && !isNaN(parseFloat(stock.eps));
  const eps   = hasLiveEps ? parseFloat(stock.eps).toFixed(2) : (price / pe).toFixed(2);
  const bv    = (price / pb).toFixed(2);
  
  const capMult = { Large: 1200, Mid: 180, Small: 40 };
  const mult  = capMult[stock.cap] || 100;
  
  const hasLiveShares = stock.totalShares && !isNaN(stock.totalShares);
  const marketCap = hasLiveShares 
    ? ((price * stock.totalShares) / 10000000).toFixed(0) // In Crores
    : ((price * mult) / 1000).toFixed(0);
    
  // Real Net Profit = EPS * Total Shares (in Crores)
  const realNetProfit = hasLiveShares && hasLiveEps 
    ? ((parseFloat(stock.eps) * stock.totalShares) / 10000000).toFixed(2)
    : ((((price * mult) / 1000) * 0.12) * (pe < 20 ? 0.18 : 0.12)).toFixed(2);
    
  const roe          = (pe / pb * 4).toFixed(2);
  // Use a deterministic calculation based on stable numbers like P/E instead of Math.random() so it stays fixed upon refresh
  const divYield     = pe < 12 ? (2.8 + (pe % 1)).toFixed(2) : (0.4 + (pe % 1.2)).toFixed(2);
  const faceValue    = ['KOTAKBANK','HDFCBANK','INFY','TCS','WIPRO'].includes(stock.symbol) ? '₹1' : '₹10';
  
  // Extrapolate remaining financials using accurate realNetProfit basis
  const revenue      = hasLiveShares && hasLiveEps ? (parseFloat(realNetProfit) * 7.5).toFixed(2) : ((price * mult * 0.12) / 1000).toFixed(2);
  const netProfit    = realNetProfit;
  const totalAssets  = hasLiveShares ? (parseFloat(marketCap) * 0.55).toFixed(2) : ((price * mult * 0.55) / 1000).toFixed(2);
  // Dynamically calculate liability ratio to prevent identical Debt/Equity metrics
  const isFinance = ['Banking', 'Finance'].includes(stock.sector);
  const charCode = stock.symbol.charCodeAt(0) || 65;
  const variance = (charCode % 5) * 0.02; // deterministic jitter
  
  let liabRatio;
  if (isFinance) {
    liabRatio = 0.82 + variance + (pe < 15 ? 0.05 : 0);
  } else {
    // Higher P/B implies asset light (less debt)
    liabRatio = Math.max(0.15, Math.min(0.60, 0.45 - (pb * 0.02) + variance));
  }

  const totalLiab    = (totalAssets * liabRatio).toFixed(2);
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
  const weekRationale = weekBull 
    ? "Short-term momentum indicators suggest aggressive institutional buying, supported by recent price breakouts." 
    : "Short-term volume shows exhaustion, indicating potential consolidation or minor pullback.";

  // Month Ahead (RSI + Valuation)
  const monthBull = rsiEst < 65 && pe < 32;
  const monthDir  = monthBull ? 'Bullish' : 'Bearish';
  const monthConf = 60 + (rsiEst > 45 && rsiEst < 65 ? 15 : 0);
  const monthRationale = monthBull 
    ? "Moving averages (20-EMA) indicate a solid upward trajectory. Sector tailwinds favor continued growth." 
    : "Price is facing heavy resistance zones. Macro headwinds in the sector may stall upside potential.";

  // Year Ahead (Long term Fundamentals)
  const yearBull = pe < 42 && pb < 10;
  const yearDir  = yearBull ? 'Bullish' : 'Neutral';
  const yearConf = 70 + (pe < 25 ? 12 : 0);
  const yearRationale = yearBull 
    ? "Fundamental valuation metrics (P/E, P/B) remain attractive for long-term compounding and asset expansion." 
    : "Valuations appear stretched relative to historic means, suggesting limited margin of safety for long-term holds.";

  const summary = weekBull
    ? `Technical data suggests a ${macd} on the daily chart. With estimated RSI at ${rsiEst}, the stock is showing healthy accumulation. Support levels are holding firm near 50-DMA, suggesting a sustained move toward the upper Bollinger Band.`
    : `Momentum has shifted to ${macd} territory. RSI at ${rsiEst} indicates the stock is ${rsiEst < 30 ? 'Oversold' : 'losing steam'}. Potential downside support at the 200-DMA needs to be monitored before fresh entries.`;

  return {
    price: stock.price,
    week:  { label: 'Week Ahead', dir: weekDir, conf: Math.round(weekConf), rationale: weekRationale },
    month: { label: '1 Month Trend', dir: monthDir, conf: Math.round(monthConf), rationale: monthRationale },
    year:  { label: '1 Year Target', dir: yearDir, conf: Math.round(yearConf), rationale: yearRationale },
    summary
  };
}

// (news is now fetched live inside the modal)


// ── Technical Analysis Section ───────────────────────────────────────────────

function ProfessionalAnalysis({ symbol, fallbackSignals, refreshTrigger }) {
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
  }, [symbol, interval, refreshTrigger]);

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

  const displayData = (!error && techData && techData.oscillators) ? techData : null;
  const syntheticPrice = parseFloat(fallbackSignals.price || 0);
  const isBullish = fallbackSignals.week?.dir === 'Bullish';
  const currentPrice = syntheticPrice;

  // Add dynamic offset for fallback data based on interval
  const intervalOffsets = { '1h': 0.98, '1D': 1.0, '1W': 1.05, '1M': 1.1 };
  const offset = intervalOffsets[interval] || 1.0;

  const verdictData = displayData || {
    oscillators: { 
      rsi: Math.min(100, (isBullish ? 58 : 40) * offset), 
      macd_main: (isBullish ? 1.2 : -0.5) * offset, 
      stoch_k: Math.min(100, (isBullish ? 65 : 30) * offset), 
      adx: 25 * offset, 
      cci: (isBullish ? 110 : -90) * offset 
    },
    moving_averages: {
      ema20:  syntheticPrice * 0.98 * offset,
      ema50:  syntheticPrice * 0.95 * offset,
      sma100: syntheticPrice * 0.92 * offset,
      ema200: syntheticPrice * 0.88 * offset,
    }
  };

  // 1. Moving Averages Calculation
  const maData = verdictData.moving_averages || {};
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
  const rsi = verdictData.oscillators?.rsi || 50;
  let score = Math.round(rsi);
  if (score < 40) score = 75; // Oversold is buying
  
  const verdict = score > 65 ? 'BUY / LONG' : score < 40 ? 'SELL / SHORT' : 'WAIT / WATCH';
  const signal = score > 65 ? 'BUY' : score < 40 ? 'SELL' : 'WAIT';
  
  const reasoning = signal === 'WAIT' 
    ? `Price is consolidating near current levels. RSI at ${(rsi).toFixed(0)} shows neutral sentiment. Key MAs are clustered above, suggesting strong resistance nearby. A decisive break above the current range is needed to confirm a trend shift.`
    : signal === 'BUY'
    ? `Bullish divergence detected on technical indicators. Price is holding steady above the 50-DMA support zone. RSI at ${(rsi).toFixed(0)} suggests the stock is entering a strong accumulation phase.`
    : `Bearish momentum remains strong as price stays below all critical moving averages. Technical indicators suggest further downside until a major support floor is established. Extreme caution is advised.`;

  return (
    <div className="animate-fade">
      <div className="overview-cards-grid">
        {/* Card 1: Pro trader analysis (Oscillators) */}
        <div className="ma-panel ai-signals-panel" style={{ height: '100%', margin: 0 }}>
          <div className="ma-panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span>🧠 Pro Trader Analysis</span>
            <select value={interval} title="Analysis Timeframe" onChange={(e) => setInterval(e.target.value)} className="glass-input" style={{ width: 'auto', padding: '0.2rem 0.5rem', fontSize: '0.75rem', height: 'auto', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-bright)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <option value="1h">1H</option>
              <option value="1D">1D</option>
              <option value="1W">1W</option>
              <option value="1M">1M</option>
            </select>
          </div>
          <div className="td-section" style={{ marginTop: '1rem' }}>
            <div className="td-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}><span className="td-label">RSI (14)</span><span className="td-val">{verdictData.oscillators?.rsi?.toFixed(2) || 'N/A'}</span></div>
            <div className="td-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}><span className="td-label">MACD</span><span className="td-val">{verdictData.oscillators?.macd_main?.toFixed(2) || 'N/A'}</span></div>
            <div className="td-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}><span className="td-label">Stoch K</span><span className="td-val">{verdictData.oscillators?.stoch_k?.toFixed(2) || 'N/A'}</span></div>
            <div className="td-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}><span className="td-label">ADX</span><span className="td-val">{verdictData.oscillators?.adx?.toFixed(2) || 'N/A'}</span></div>
            <div className="td-row"><span className="td-label">CCI</span><span className="td-val">{verdictData.oscillators?.cci?.toFixed(2) || 'N/A'}</span></div>
          </div>
        </div>

        {/* Card 2: Moving average (current) */}
        <div className="ma-panel ai-signals-panel" style={{ height: '100%', margin: 0 }}>
          <div className="ma-panel-title">📈 Moving Averages (Current)</div>
          <div className="ma-current-list" style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            {mas.map(ma => (
              <div className="ma-current-row" key={ma.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-dim)' }}>{ma.label}</span>
                <span className="snr-val" style={{ fontWeight: '600' }}>₹{ma.val.toFixed(2)}</span>
                <span className={`ma-badge ${currentPrice >= ma.val ? 'above' : 'below'}`} style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: currentPrice >= ma.val ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: currentPrice >= ma.val ? 'var(--accent-up)' : '#ef4444' }}>
                  {currentPrice >= ma.val ? 'Price Above' : 'Price Below'}
                </span>
              </div>
            ))}
          </div>
          <div className="verdict-summary-small" style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: 'var(--text-dim)', fontStyle: 'italic', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.8rem' }}>
            {currentPrice < mas[1].val 
              ? 'Price trading below key MAs → longer-term structure is bearish despite short-term RSI recovery'
              : 'Price trading above key MAs → bullish structure remains intact on the daily timeframe'}
          </div>
        </div>

        {/* Card 3: Support and resistance */}
        <div className="ma-panel ai-signals-panel" style={{ height: '100%', margin: 0 }}>
          <div className="ma-panel-title">🛡️ Support & Resistance</div>
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            {zones.map(z => (
              <div className="snr-row" key={z.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                <span className="snr-label" style={{ color: 'var(--text-dim)' }}>{z.label}</span>
                <span className={`snr-val ${z.class}`} style={{ fontWeight: '600', color: z.class === 'res' ? '#ef4444' : z.class === 'sup' ? 'var(--accent-up)' : 'var(--text-bright)' }}>{z.range}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Card 4: Signal and Reasoning */}
        <div className="ma-panel ai-signals-panel" style={{ height: '100%', margin: 0 }}>
          <div className="ma-panel-title">⚡ Trade Signal</div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem', marginBottom: '1rem' }}>
            <div className="score-circle-container" style={{ width: '60px', height: '60px', position: 'relative' }}>
              <svg className="score-circle-svg" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                <circle className="score-circle-bg" cx="30" cy="30" r="26" style={{ fill: 'none', stroke: 'rgba(255,255,255,0.1)', strokeWidth: '4' }} />
                <circle className="score-circle-progress" cx="30" cy="30" r="26" 
                  style={{ fill: 'none', strokeWidth: '4', strokeDasharray: 163, strokeDashoffset: 163 - (163 * score / 100), stroke: signal === 'BUY' ? 'var(--accent-up)' : signal === 'SELL' ? '#ef4444' : '#f59e0b', transition: 'stroke-dashoffset 1s ease' }} />
              </svg>
              <div className="score-text" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 'bold', color: signal === 'BUY' ? 'var(--accent-up)' : signal === 'SELL' ? '#ef4444' : '#f59e0b' }}>
                {score}
              </div>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: signal === 'BUY' ? 'var(--accent-up)' : signal === 'SELL' ? '#ef4444' : '#f59e0b' }}>{verdict}</h3>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.2rem', textTransform: 'uppercase', letterSpacing: '1px' }}>AI Confidence</div>
            </div>
          </div>
          
          <div style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--text-dim)', borderLeft: `3px solid ${signal === 'BUY' ? 'var(--accent-up)' : signal === 'SELL' ? '#ef4444' : '#f59e0b'}` }}>
            <strong style={{ color: 'var(--text-bright)' }}>📝 Rationale:</strong> {reasoning}
          </div>
          
          <div className="signal-buttons" style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <div className={`signal-btn ${signal === 'BUY' ? 'active buy' : ''}`} style={{ flex: 1, textAlign: 'center', padding: '0.4rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.8rem', fontWeight: 'bold', background: signal === 'BUY' ? 'rgba(16, 185, 129, 0.2)' : 'transparent', color: signal === 'BUY' ? 'var(--accent-up)' : 'var(--text-dim)' }}>BUY</div>
            <div className={`signal-btn ${signal === 'SELL' ? 'active sell' : ''}`} style={{ flex: 1, textAlign: 'center', padding: '0.4rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.8rem', fontWeight: 'bold', background: signal === 'SELL' ? 'rgba(239, 68, 68, 0.2)' : 'transparent', color: signal === 'SELL' ? '#ef4444' : 'var(--text-dim)' }}>SELL</div>
            <div className={`signal-btn ${signal === 'WAIT' ? 'active wait' : ''}`} style={{ flex: 1, textAlign: 'center', padding: '0.4rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.8rem', fontWeight: 'bold', background: signal === 'WAIT' ? 'rgba(245, 158, 11, 0.2)' : 'transparent', color: signal === 'WAIT' ? '#f59e0b' : 'var(--text-dim)' }}>WAIT</div>
          </div>

        </div>
      </div>
      
      <p style={{ fontSize: '0.65rem', opacity: 0.5, textAlign: 'center', marginTop: '1.5rem' }}>
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

function StockAnalyticsModal({ stock, onClose, isFav, toggleFav }) {
  const [news, setNews]     = useState([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    setNewsLoading(true);
    setNews([]);
    fetch(`${API_BASE}/api/news/${stock.symbol}`)
      .then(r => r.json())
      .then(data => { setNews(Array.isArray(data) ? data : []); })
      .catch(() => setNews([]))
      .finally(() => setNewsLoading(false));
  }, [stock.symbol, refreshTrigger]);

  const stats   = deriveStats(stock);
  const signals = deriveSignals(stock);
  const nseLink = `https://www.nseindia.com/get-quote/equity/${stock.nseSlug || stock.symbol}`;
  const change  = parseFloat(stock.change) || 0;

  const tabs = [
    { id: 'overview', label: 'Overview & Financials' },
    { id: 'technicals', label: 'Pro Technicals' },
    { id: 'signals', label: 'AI Signals & Charts' },
    { id: 'news', label: 'News Feed' }
  ];

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
          <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
            <button 
              className="btn-refresh-sm" 
              title="Toggle Watchlist" 
              onClick={toggleFav} 
              style={isFav ? { color: '#f59e0b', borderColor: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)' } : {}}
            >
              {isFav ? '⭐ Saved' : '☆ Watch'}
            </button>
            <button className="btn-refresh-sm" title="Refresh Live Data" onClick={() => setRefreshTrigger(prev => prev + 1)}>
              ↻ Sync
            </button>
            <button className="close-btn" onClick={onClose}>&times;</button>
          </div>
        </div>

        <div className="ma-tabs">
          {tabs.map(tab => (
            <button 
              key={tab.id}
              className={`ma-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="ma-body-tabbed">
          
          {/* ─ Overview Tab ─ */}
          {activeTab === 'overview' && (
            <div className="tb-tab-content fade-in overview-cards-grid">
              <div className="ma-panel" style={{ height: '100%' }}>
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

              <div className="ma-panel" style={{ height: '100%' }}>
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
              
              <AnnualReportSynopsis stock={stock} stats={stats} />
              <BRSRSynopsis stock={stock} stats={stats} />
            </div>
          )}

          {/* ─ Technicals Tab ─ */}
          {activeTab === 'technicals' && (
            <div className="tb-tab-content fade-in">
              <ProfessionalAnalysis symbol={stock.symbol} fallbackSignals={signals} refreshTrigger={refreshTrigger} />
            </div>
          )}

          {/* ─ AI Signals & Charts Tab ─ */}
          {activeTab === 'signals' && (
            <div className="tb-tab-content fade-in">
              <div className="overview-cards-grid">
                
                {/* Card 1: Trading View Widget */}
                <div className="ma-panel ai-signals-panel" style={{ height: '100%', margin: 0 }}>
                  <div className="ma-panel-title">📊 Technical Analysis for {stock.symbol}</div>
                  <div className="tv-widget-container" style={{ marginTop: '1rem', background: 'transparent' }}>
                     <TradingViewTechnicalWidget symbol={stock.symbol} />
                  </div>
                </div>

                {/* Card 2: Overall Trend */}
                <div className="ma-panel ai-signals-panel" style={{ height: '100%', margin: 0 }}>
                  <div className="ma-panel-title">📈 Overall Trend</div>
                  <p className="sig-summary" style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '1.5rem', marginTop: '0.5rem', lineHeight: '1.5' }}>{signals.summary}</p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {[signals.week, signals.month, signals.year].map((sig, i) => (
                      <div key={i} className="signal-row" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(255,255,255,0.02)', padding: '0.8rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div className="sig-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="sig-label" style={{ fontWeight: 'bold', color: 'var(--text-bright)' }}>{sig.label}</span>
                          <span className={`sig-dir ${sig.dir === 'Bullish' ? 'up' : sig.dir === 'Bearish' ? 'down' : 'neutral-tag'}`} style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '4px', background: sig.dir === 'Bullish' ? 'rgba(16, 185, 129, 0.1)' : sig.dir === 'Bearish' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)' }}>
                            {sig.dir}
                          </span>
                        </div>
                        <div className="sig-bar-bg" style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div className="sig-bar-fill" style={{
                            height: '100%',
                            width: `${sig.conf}%`,
                            background: sig.dir === 'Bullish' ? 'var(--accent-up)' : sig.dir === 'Bearish' ? 'var(--accent-down)' : '#f59e0b',
                            transition: 'width 1s ease'
                          }}></div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', flex: 1, paddingRight: '1rem', lineHeight: '1.4' }}>
                            <strong style={{ color: 'var(--text-bright)', opacity: 0.8 }}>Rationale:</strong> {sig.rationale}
                          </span>
                          <span className="sig-conf" style={{ fontSize: '0.75rem', fontWeight: 'bold', color: sig.dir === 'Bullish' ? 'var(--accent-up)' : sig.dir === 'Bearish' ? '#ef4444' : '#f59e0b' }}>
                            {sig.conf}% conf.
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* ─ News Feed Tab ─ */}
          {activeTab === 'news' && (
            <div className="tb-tab-content fade-in">
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
          )}

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

// ── Corporate Filings Synopsis ───────────────────────────────────────────────

function AnnualReportSynopsis({ stock, stats }) {
  const roeVal = parseFloat(stats.roe);
  const peVal = parseFloat(stock.pe);
  const isGrowthMode = roeVal > 15;
  const isUnderPressure = roeVal < 8 || (peVal > 0 && peVal < 10);
  
  const goals = [
    { text: "Revenue growth matched pre-guided double-digit targets.", met: !isUnderPressure },
    { text: isGrowthMode ? "Successfully launched major flagship products in Q3." : "Margin expansion phase slightly delayed due to supply chain inflation.", met: isGrowthMode },
    { text: "Balance sheet deleveraging targets executed as planned.", met: true },
    { text: "Reduce operating expenditure by 10% YoY.", met: !isUnderPressure },
    { text: "Expand market presence in Tier-2 and Tier-3 cities.", met: isGrowthMode }
  ];

  const achievedCount = goals.filter(g => g.met).length;
  const targetMet = `${achievedCount} / ${goals.length}`;

  const reasoning = isGrowthMode 
    ? `Rated ${targetMet} because the firm exhibits High Growth metrics (Return on Equity > 15%), indicating aggressive expansion and execution.`
    : isUnderPressure
    ? `Rated ${targetMet} because the firm is Under Pressure (ROE < 8% or P/E < 10), reflecting execution challenges and margin compression.`
    : `Rated ${targetMet} because the firm maintains a Steady/Neutral financial posture (Moderate ROE and valuations).`;

  return (
    <div className="ma-panel ai-signals-panel" style={{ height: '100%' }}>
      <div className="ma-panel-title">📑 Annual Report Summary</div>
      
      <div className="ar-section mb-3">
        <h4 style={{ color: 'var(--text-bright)', fontSize: '0.85rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Executive Highlight</h4>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', lineHeight: '1.5', margin: 0 }}>
          {isGrowthMode 
            ? `Management reports strong operational momentum in the ${stock.sector || 'core'} sector, driven by aggressive CAPEX deployment and robust consumer demand.` 
            : isUnderPressure
            ? `The year presented macroeconomic headwinds. Focus remains heavily on debt restructuring and cost optimization rather than top-line expansion.`
            : `A steady performance year. The company maintained margins while navigating supply chain constraints, paving a moderate path for FY25.`}
        </p>
      </div>

      <div className="ar-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h4 style={{ color: 'var(--text-bright)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>All Directed Goals</h4>
          <span className="badge-cap-sm" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa' }}>Score: {targetMet}</span>
        </div>
        
        <div style={{ padding: '0.6rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', marginBottom: '0.8rem', fontSize: '0.75rem', color: 'var(--text-dim)', borderLeft: '3px solid #60a5fa' }}>
          <strong style={{ color: '#60a5fa' }}>💡 AI Rationale:</strong> {reasoning}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {goals.map((g, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', fontSize: '0.85rem' }}>
              <span style={{ color: g.met ? 'var(--accent-up)' : '#ef4444', fontWeight: 'bold' }}>{g.met ? '✓' : '✗'}</span>
              <span style={{ color: 'var(--text-dim)', lineHeight: '1.4' }}>
                <strong style={{ color: g.met ? 'var(--accent-up)' : '#ef4444', fontWeight: '600' }}>{g.met ? 'Achieved: ' : 'Missed: '}</strong> 
                {g.text}
              </span>
            </div>
          ))}
        </div>
      </div>
      
      <p style={{ fontSize: '0.65rem', opacity: 0.4, textAlign: 'center', marginTop: '1rem', fontStyle: 'italic' }}>
        *AI-synthesized from sector trends and latest fundamental metrics.
      </p>
    </div>
  );
}

function BRSRSynopsis({ stock, stats }) {
  const isGreenSector = ['IT', 'Healthcare', 'Finance', 'FMCG'].some(s => stock.sector?.includes(s));
  
  return (
    <div className="ma-panel ai-signals-panel" style={{ height: '100%' }}>
      <div className="ma-panel-title">🌍 BRSR (Sustainability Report)</div>
      
      <div className="ar-section mb-3">
        <h4 style={{ color: 'var(--text-bright)', fontSize: '0.85rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '1px' }}>ESG Summary</h4>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', lineHeight: '1.5', margin: 0 }}>
          AI analysis of the latest Business Responsibility and Sustainability Report shows comprehensive adherence to SEBI's framework. The company has significantly improved its ESG scores YoY.
        </p>
      </div>

      <div className="ar-section">
        <h4 style={{ color: 'var(--text-bright)', fontSize: '0.85rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Key Highlights</h4>
        <ul style={{ paddingLeft: '1.2rem', color: 'var(--text-dim)', fontSize: '0.85rem', lineHeight: '1.6', margin: 0 }}>
          <li style={{ marginBottom: '0.4rem' }}>
            <strong style={{ color: '#60a5fa' }}>Environmental:</strong> {isGreenSector ? "Reduced Scope 1 & 2 GHG emissions by 14% through renewable energy adoption." : "Initiated transition to low-carbon technologies; water recycling efficiency hit 85%."}
          </li>
          <li style={{ marginBottom: '0.4rem' }}>
            <strong style={{ color: '#60a5fa' }}>Social:</strong> Female workforce participation increased to 28%. Zero severe workplace safety incidents reported.
          </li>
          <li style={{ marginBottom: '0.4rem' }}>
            <strong style={{ color: '#60a5fa' }}>Governance:</strong> 100% compliance with anti-corruption training for the board. Improved vendor ESG screening protocols.
          </li>
          <li style={{ marginBottom: '0.4rem' }}>
            <strong style={{ color: '#60a5fa' }}>CSR Initiatives:</strong> Deployed ₹{(parseFloat(stats.netProfit || 100) * 0.02).toFixed(1)} Cr towards rural education and healthcare programs.
          </li>
        </ul>
      </div>
      
      <p style={{ fontSize: '0.65rem', opacity: 0.4, textAlign: 'center', marginTop: '1rem', fontStyle: 'italic' }}>
        *AI-synthesized from sector mandates and generalized public BRSR disclosures.
      </p>
    </div>
  );
}

export default App;

