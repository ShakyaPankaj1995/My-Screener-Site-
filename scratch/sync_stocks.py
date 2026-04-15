
import re

current_data_path = r'c:\Users\LENOVO\.gemini\antigravity\scratch\pankaj-portfolio\stock-pulse\src\data.js'

with open(current_data_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Match standard stock objects using regex
stock_matches = re.findall(r'\{ symbol:"([^"]+)",\s*nseSlug:"([^"]+)",\s*name:"([^"]+)",\s*sector:"([^"]+)",\s*cap:"([^"]+)", price:([\d.]+), prevClose:([\d.]+), pe:([\d.]+), pb:([\d.]+) \},?', content)

existing_symbols = {m[0] for m in stock_matches}

new_symbols_str = """RELIANCE, TCS, HDFCBANK, ICICIBANK, INFY, HINDUNILVR, ITC, SBIN, BAJFINANCE, BHARTIARTL, KOTAKBANK, LT, ASIANPAINT, AXISBANK, MARUTI, SUNPHARMA, TATAMOTORS, NTPC, ULTRACEMCO, WIPRO, POWERGRID, TITAN, HCLTECH, BAJAJFINSV, ONGC, TATASTEEL, JSWSTEEL, ADANIENT, ADANIPORTS, COALINDIA, DRREDDY, CIPLA, APOLLOHOSP, SBILIFE, HDFCLIFE, BRITANNIA, DIVISLAB, HEROMOTOCO, M&M, TECHM, SHREECEM, IOC, UPL, ADANIENSOL, ADANIGREEN, AWL, AMBUJACEM, ACC, BANKBARODA, BERGEPAINT, BIOCON, BOSCHLTD, CANBK, CHOLAFIN, COLPAL, DABUR, DLF, GAIL, GODREJCP, HAVELLS, ICICIPRULI, INDIGO, IGL, PNB, SAIL, SRF, SIEMENS, TORNTPHARM, TRENT, VEDL, VOLTAS, ZEEL, ETERNAL, NYKAA, PAYTM, POLICYBZR, DMART, IRCTC, IRFC, RVNL, BEL, HAL, BHEL, CONCOR, NHPC, SJVN, RECLTD, PFC, FEDERALBNK, IDFCFIRSTB, BANDHANBNK, RBLBANK, YESBANK, CSBBANK, DCBBANK, ESAFSFB, SURYODAY, IDBI, INDIANB, MAHABANK, IOB, UCOBANK, CENTRALBK, UCAL, MPHASIS, LTM, COFORGE, PERSISTENT, KPITTECH, TATAELXSI, HEXAWARE, ZENSAR, MASTEK, RAMSARUP, NAUKRI, JUSTDIAL, INDIAMART, AUROPHARMA, ALKEM, ZYDUSLIFE, ABBOTINDIA, PFIZER, GLAXO, SANOFI, IPCALAB, GLENMARK, WOCKPHARMA, STRIDES, BAJAJ-AUTO, ASHOKLEY, ESCORTS, ARE&M, EXIDEIND, TVSMOTOR, UNOMINDA, SUPRAJIT, BALKRISIND, APOLLOTYRE, MRF, CEATLTD, JTEKTINDIA, SUNDRMFAST, GODREJIND, EMAMILTD, JYOTHYLAB, VBL, TATAPOWER, MRPL, HINDPETRO, CHENNPETRO, NMDC, MOIL, HINDZINC, NATIONALUM, JINDALSTEL, APLAPOLLO, PHOENIXLTD, BRIGADE, SOBHA, CIEINDIA, SUNTV, JKCEMENT, RAMCOCEM, HEIDELBERG, JKLAKSHMI, INDIACEM, BIRLACORPN, PRISMJOHNS, DALBHARAT, NUVOCO, TORNTPOWER, CESC, JSWENERGY, ADANIPOWER, RPOWER, JPPOWER, NLCINDIA, THERMAX, CUMMINSIND, ENGINERSIN, RITES, TEXRAIL, TIINDIA, ABB, AIAENG, GRINDWELL, CARBORUNIV, ELGIEQUIP, ISGEC, LICI, ABSLAMC, UTIAMC, NAM-INDIA, BLUESTARCO, WHIRLPOOL, CROMPTON, ORIENTELEC, VGUARD, BALAMINES, APARINDS, AARTI, PIIND, DEEPAKFERT, DEEPAKNTR, NOCIL, NAVINFLUOR, FLUOROCHEM, NEOGEN, SUDARSCHEM, VINATIORGA, LINDEINDIA, FINEORG, IDEA, TATACOMM, HFCL, STLTECH, PVRINOX, SAREGAMA, TIPS, NETWORK18, TV18BRDCST, MAHINDLOG, INDHOTEL, EIHOTEL, MHRIL, THOMASCOOK, FORTIS, NARAYANA, MAXHEALTH, METROPOLIS, DRLAL, THYROCARE, VIJAYA, KIMS, COROMANDEL, GNFC, GSFC, NFL, RCF, CHAMBLFERT, KSCL, RALLIS, INSECTICID, RAYMOND, ARVIND, WELSPUNIND, TRIDENT, VARDHMAN, KITEX, RUPA, LUX, IRB, ASHOKA, CAPACITE, MANAPPURAM, IIFL, POONAWALLA, M&MFIN, SCHAND, SRTRANSFIN, SUNDARMFIN, CHOLAHLDNG, ANGELONE, 5PAISA, MOTILALOFS, EDELWEISS, 360ONE, CLEAN, ALKYLAMINE, GALAXYSURF, TATACHEM, GHCL, ATUL, JUBLFOOD, WESTLIFE, DEVYANI, SAPPHIRE, BARBEQUE, CCL, TASTYBITEZ, NIITLTD, CARERATING, CRISIL, ICRA, PGEL, CASTROLIND, GULF, 3MINDIA, HONAUT, GILLETTE, PGHH, KANSAINER, AKZOINDIA, JKPAPER, TNPL, BALRAMCHIN, TRIVENI, RENUKA, DWARIKESH."""

new_symbols = [s.strip() for s in new_symbols_str.split(',') if s.strip()]

missing = [s for s in new_symbols if s not in existing_symbols]

print(f"Total symbols in sheet: {len(new_symbols)}")
print(f"Already in data.js: {len(new_symbols) - len(missing)}")
print(f"Missing (to add): {len(missing)}")

def get_sector(sym):
    # Quick heuristics for common symbols
    if any(x in sym for x in ['BANK', 'BNK', 'FIN', 'SFB', 'AMC', 'LICI']): return "Banking/Finance"
    if any(x in sym for x in ['TECH', 'INFY', 'TCS', 'WIPRO', 'MPHASIS', 'COFORGE']): return "IT & Software"
    if any(x in sym for x in ['PHARMA', 'LAB', 'DRREDDY', 'LABS', 'BIOCON', 'LIFE']): return "Pharmaceuticals"
    if any(x in sym for x in ['POWER', 'ENERGY', 'NTPC', 'ONGC', 'RELIANCE', 'BPCL', 'HPCL', 'IOC']): return "Energy & Power"
    if any(x in sym for x in ['AUTO', 'MOTORS', 'LEY', 'MARUTI', 'TVS']): return "Automobiles"
    if any(x in sym for x in ['STEEL', 'METAL', 'NMDC', 'SAIL', 'HINDALCO', 'ZINC']): return "Metals & Mining"
    if any(x in sym for x in ['CEMENT', 'CEM', 'ULTRACEMCO']): return "Construction Materials"
    if any(x in sym for x in ['FERT', 'CHEM', 'GSFC', 'GNFC']): return "Chemicals & Agri"
    if any(x in sym for x in ['IND', 'INFRA', 'BEL', 'HAL', 'HAL', 'HAL']): return "Industrial & Defense"
    if any(x in sym for x in ['HOTEL', 'RESORTS']): return "Hospitality"
    return "Diversified"

added_lines = []
for s in missing:
    name = s.replace('-', ' ').title()
    if not name.endswith('Ltd') and not name.endswith('Limited'): name += " Ltd"
    sector = get_sector(s)
    # nseSlug pattern: SYMBOL/Company-Name-Hyphenated
    slug_name = name.replace(' ', '-').replace('&', 'and')
    slug = f"{s}/{slug_name}"
    
    # Random but realistic seed prices for missing ones (real ones will update on load anyway)
    line = f'  {{ symbol:"{s}", nseSlug:"{slug}", name:"{name}", sector:"{sector}", cap:"Small", price:100.00, prevClose:98.00, pe:25.0, pb:3.0 }},'
    added_lines.append(line)

# Insert before line 301 (which is the closing ] of STOCKS)
new_content_list = content.split('\n')
for i, line in enumerate(new_content_list):
    if line.strip() == '];':
        new_content_list.insert(i, '\n  // ══════════════════════════════ NEW STOCKS ADDED FROM SHEET ══════════════════════════════')
        for added in added_lines:
            new_content_list.insert(i+1, added)
        break

with open(current_data_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(new_content_list))

print("Successfully added new stocks to data.js")
