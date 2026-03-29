require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// Phase 12: Jupiter Token Metadata Oracle
let jupTokens = new Map();
jupTokens.set(USDC_MINT, { symbol: 'USDC', name: 'USD Coin', logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png' });

async function loadJupiterTokens() {
    try {
        const res = await fetch('https://raw.githubusercontent.com/solana-labs/token-list/main/src/tokens/solana.tokenlist.json');
        const data = await res.json();
        if (data && data.tokens) {
            data.tokens.forEach(t => { jupTokens.set(t.address, { symbol: t.symbol, name: t.name, logo: t.logoURI }); });
        }
        console.log(`[ORACLE] Loaded ${jupTokens.size} verified SPL tokens.`);
    } catch(e) { console.error("[ORACLE] Failed to load metadata."); }
}
loadJupiterTokens();

// Phase 10: Auth Architecture
const JWT_SECRET = process.env.JWT_SECRET || 'soltrace_super_secret_key_123';
const USERS_FILE = path.join(__dirname, 'users.json');

if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([]));
const getUsers = () => JSON.parse(fs.readFileSync(USERS_FILE));
const saveUsers = (users) => fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, error: "Unauthorized. Please Login/Register." });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, error: "Invalid or expired token." });
        req.user = user;
        next();
    });
};

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: "Missing fields" });
        const users = getUsers();
        if (users.find(u => u.username === username)) return res.status(400).json({ error: "Username already exists" });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = { id: Date.now().toString(), username, password: hashedPassword, tier: 'FREE' };
        users.push(newUser);
        saveUsers(users);
        
        const token = jwt.sign({ id: newUser.id, username: newUser.username, tier: newUser.tier }, JWT_SECRET);
        res.json({ success: true, token, tier: newUser.tier, username });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const users = getUsers();
        const user = users.find(u => u.username === username);
        if (!user) return res.status(400).json({ error: "Invalid credentials" });
        
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(400).json({ error: "Invalid credentials" });
        
        const token = jwt.sign({ id: user.id, username: user.username, tier: user.tier }, JWT_SECRET);
        res.json({ success: true, token, tier: user.tier, username });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/upgrade', authenticateToken, (req, res) => {
    try {
        const { tier } = req.body;
        const users = getUsers();
        const userIndex = users.findIndex(u => u.username === req.user.username);
        if (userIndex === -1) return res.status(404).json({ error: "User not found" });
        
        users[userIndex].tier = tier;
        saveUsers(users);
        
        const token = jwt.sign({ id: users[userIndex].id, username: users[userIndex].username, tier: users[userIndex].tier }, JWT_SECRET);
        res.json({ success: true, token, tier, username: users[userIndex].username });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
    res.json({ success: true, username: req.user.username, tier: req.user.tier });
});

// Phase 5 API: Live Hardware Balances Endpoint
app.get('/api/balances/:address', authenticateToken, async (req, res) => {
  const address = req.params.address;
  if (!HELIUS_API_KEY) return res.status(500).json({ success: false, error: "Missing HELIUS API KEY." });
  try {
     const url = `https://api.helius.xyz/v0/addresses/${address}/balances?api-key=${HELIUS_API_KEY}`;
     const bRes = await fetch(url);
     const bData = await bRes.json();
     res.json({ success: true, data: bData });
  } catch (err) {
     res.status(500).json({ success: false, error: err.message });
  }
});

async function scanAddress(addressStr, maxTxs = 10000) {
  if (!HELIUS_API_KEY) throw new Error("HELIUS_API_KEY is not defined in the environment.");

  const now = Math.floor(Date.now() / 1000);
  const DAY_SEC = 24 * 60 * 60;
  const WEEK_SEC = 7 * DAY_SEC;
  const MONTH_SEC = 30 * DAY_SEC;

  // Track max TX hashes and raw values
  const createStats = () => ({
    sentRaw: 0n, receivedRaw: 0n,
    highestSentRaw: 0n, highestSentTx: null,
    highestReceivedRaw: 0n, highestReceivedTx: null,
    txCount: 0
  });

  const statsSOL = { allTime: createStats(), daily: createStats(), weekly: createStats(), monthly: createStats() };
  const statsUSDC = { allTime: createStats(), daily: createStats(), weekly: createStats(), monthly: createStats() };

  const counterparties = new Map();
  const tokenMatrix = new Map();
  const chartMap = {};
  
  // Phase 5: Behavioral Heatmap Arrays
  const chartHourlyMap = new Array(24).fill(0);
  let swapCount = 0;

  // Phase 13: Advanced Analytics
  const typeProfile = {};
  let hasWashLoop = false;
  const slidingFlowWindow = [];

  const recentActivity = [];

  let totalAnalyzed = 0;
  let before = null;
  let hasMore = true;
  let hasWhaleTransfer = false;

  const WHALE_SOL = BigInt(1000 * 1e9);      // > 1,000 SOL
  const WHALE_USDC = BigInt(100000 * 1e6);   // > 100,000 USDC

  const updateStats = (tracker, amount, isSent, isDaily, isWeekly, isMonthly, sig) => {
    tracker.allTime.txCount++;
    if(isDaily) tracker.daily.txCount++;
    if(isWeekly) tracker.weekly.txCount++;
    if(isMonthly) tracker.monthly.txCount++;

    if (isSent) {
      tracker.allTime.sentRaw += amount;
      if (amount > tracker.allTime.highestSentRaw) { tracker.allTime.highestSentRaw = amount; tracker.allTime.highestSentTx = sig; }
      if (isDaily) { tracker.daily.sentRaw += amount; if (amount > tracker.daily.highestSentRaw) { tracker.daily.highestSentRaw = amount; tracker.daily.highestSentTx = sig; } }
      if (isWeekly) { tracker.weekly.sentRaw += amount; if (amount > tracker.weekly.highestSentRaw) { tracker.weekly.highestSentRaw = amount; tracker.weekly.highestSentTx = sig; } }
      if (isMonthly) { tracker.monthly.sentRaw += amount; if (amount > tracker.monthly.highestSentRaw) { tracker.monthly.highestSentRaw = amount; tracker.monthly.highestSentTx = sig; } }
    } else {
      tracker.allTime.receivedRaw += amount;
      if (amount > tracker.allTime.highestReceivedRaw) { tracker.allTime.highestReceivedRaw = amount; tracker.allTime.highestReceivedTx = sig; }
      if (isDaily) { tracker.daily.receivedRaw += amount; if (amount > tracker.daily.highestReceivedRaw) { tracker.daily.highestReceivedRaw = amount; tracker.daily.highestReceivedTx = sig; } }
      if (isWeekly) { tracker.weekly.receivedRaw += amount; if (amount > tracker.weekly.highestReceivedRaw) { tracker.weekly.highestReceivedRaw = amount; tracker.weekly.highestReceivedTx = sig; } }
      if (isMonthly) { tracker.monthly.receivedRaw += amount; if (amount > tracker.monthly.highestReceivedRaw) { tracker.monthly.highestReceivedRaw = amount; tracker.monthly.highestReceivedTx = sig; } }
    }
  };

  const recordCounterparty = (cpAddress, isSol, amount, isSent) => {
     if (!cpAddress || cpAddress === addressStr || cpAddress.length < 32 || cpAddress.length > 44) return;
     if (!counterparties.has(cpAddress)) counterparties.set(cpAddress, { interactions: 0, solVolume: 0n, netFlow: 0n });
     const cp = counterparties.get(cpAddress);
     cp.interactions++;
     if (isSol) {
        cp.solVolume += amount;
        cp.netFlow += isSent ? -amount : amount;
     }
  };

  const delay = ms => new Promise(res => setTimeout(res, ms));

  while (hasMore && totalAnalyzed < maxTxs) {
    let url = `https://api.helius.xyz/v0/addresses/${addressStr}/transactions?api-key=${HELIUS_API_KEY}`;
    if (before) url += `&before=${before}`;
    
    let response = await fetch(url);
    if (response.status === 429) {
       console.log("429 Rate Limit - applying 2s mathematical backoff");
       await delay(2000);
       response = await fetch(url);
    }
    if (!response.ok) throw new Error(`Helius API Error: ${response.status}`);
    
    const txs = await response.json();
    if (!txs || txs.length === 0) { hasMore = false; break; }

    totalAnalyzed += txs.length;
    before = txs[txs.length - 1].signature;

    for (const tx of txs) {
       const txTime = tx.timestamp;
       const sig = tx.signature;
       const isDaily = (now - txTime) <= DAY_SEC;
       const isWeekly = (now - txTime) <= WEEK_SEC;
       const isMonthly = (now - txTime) <= MONTH_SEC;
       
       if (recentActivity.length < 20) {
           let type = tx.type === 'SWAP' ? 'SWAP' : 'TRANSFER';
           let flow = 0; let cur = 'SOL'; let counter = 'Unknown'; let isSent = false;
           if (tx.nativeTransfers && tx.nativeTransfers.length > 0) {
              const myT = tx.nativeTransfers.find(t => t.fromUserAccount === addressStr || t.toUserAccount === addressStr);
              if (myT) {
                 flow = Number(myT.amount)/1e9;
                 isSent = myT.fromUserAccount === addressStr;
                 counter = isSent ? myT.toUserAccount : myT.fromUserAccount;
              }
           } else if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
              const myT = tx.tokenTransfers.find(t => t.fromUserAccount === addressStr || t.toUserAccount === addressStr);
              if (myT) {
                 flow = myT.tokenAmount; cur = myT.mint === USDC_MINT ? 'USDC' : 'SPL';
                 isSent = myT.fromUserAccount === addressStr;
                 counter = isSent ? myT.toUserAccount : myT.fromUserAccount;
              }
           }
           if (flow > 0 || type === 'SWAP') {
               const feeRaw = tx.fee || 0;
               let meta = null;
               recentActivity.push({ sig, time: txTime, type, flow, cur, isSent, counter, fee: Number(feeRaw)/1e9 });
               
               // Phase 13: Wash Loop Detection (A -> B -> A)
               if (counter !== 'Unknown') {
                   slidingFlowWindow.push({ counter, isSent });
                   if (slidingFlowWindow.length > 8) slidingFlowWindow.shift();
                   // If we sent money to X and received from X within the last 8 hops
                   const received = slidingFlowWindow.find(f => f.counter === counter && !f.isSent);
                   const sent = slidingFlowWindow.find(f => f.counter === counter && f.isSent);
                   if (received && sent) hasWashLoop = true;
               }
           }
       }
       
       // Phase 13: Type Profile Tally
       typeProfile[tx.type] = (typeProfile[tx.type] || 0) + 1;
       
       // Phase 5: Timezone Tally
       const hourUTC = new Date(txTime * 1000).getUTCHours();
       chartHourlyMap[hourUTC]++;
       
       // Phase 5: Swap Analysis
       if (tx.type === 'SWAP') swapCount++;

       if (isMonthly) {
          const dateStr = new Date(txTime * 1000).toISOString().split('T')[0];
          if (!chartMap[dateStr]) chartMap[dateStr] = 0;
          chartMap[dateStr]++;
       }

       if (tx.nativeTransfers && tx.nativeTransfers.length > 0) {
          for (const transfer of tx.nativeTransfers) {
             const amount = BigInt(transfer.amount);
             if (amount === 0n) continue;
             if (amount >= WHALE_SOL) hasWhaleTransfer = true; // Whale Anomaly Trigger

             if (transfer.fromUserAccount === addressStr) {
                updateStats(statsSOL, amount, true, isDaily, isWeekly, isMonthly, sig);
                recordCounterparty(transfer.toUserAccount, true, amount, true);
             }
             if (transfer.toUserAccount === addressStr) {
                updateStats(statsSOL, amount, false, isDaily, isWeekly, isMonthly, sig);
                recordCounterparty(transfer.fromUserAccount, true, amount, false);
             }
          }
       }

       if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
          for (const transfer of tx.tokenTransfers) {
             // SPL Matrix Logging
             if (transfer.mint !== USDC_MINT) {
                if (!tokenMatrix.has(transfer.mint)) tokenMatrix.set(transfer.mint, { in: 0, out: 0, interacts: 0 });
                const mData = tokenMatrix.get(transfer.mint);
                mData.interacts++;
                if (transfer.toUserAccount === addressStr) mData.in += transfer.tokenAmount;
                if (transfer.fromUserAccount === addressStr) mData.out += transfer.tokenAmount;
             }

             if (transfer.mint === USDC_MINT) {
                const rawUsdc = BigInt(Math.floor(transfer.tokenAmount * 1e6));
                if (rawUsdc === 0n) continue;
                if (rawUsdc >= WHALE_USDC) hasWhaleTransfer = true; // Whale Anomaly Trigger

                if (transfer.fromUserAccount === addressStr) {
                   updateStats(statsUSDC, rawUsdc, true, isDaily, isWeekly, isMonthly, sig);
                   recordCounterparty(transfer.toUserAccount, false, 0n, true);
                }
                if (transfer.toUserAccount === addressStr) {
                   updateStats(statsUSDC, rawUsdc, false, isDaily, isWeekly, isMonthly, sig);
                   recordCounterparty(transfer.fromUserAccount, false, 0n, false);
                }
             }
          }
       }
    }
    await delay(300); // 300ms explicit pause resolving rate-ceilings natively
  }

  const toSOL = (raw) => Number(raw) / 1e9;
  const toUSDC = (raw) => Number(raw) / 1e6;

  const buildOutput = (tracker, formatter) => {
     const block = (b) => {
        const sent = formatter(b.sentRaw);
        const rec = formatter(b.receivedRaw);
        return {
           totalSent: sent, totalReceived: rec,
           netFlow: rec - sent,
           highestSent: formatter(b.highestSentRaw), highestSentTx: b.highestSentTx,
           highestReceived: formatter(b.highestReceivedRaw), highestReceivedTx: b.highestReceivedTx,
           txCount: b.txCount
        };
     };
     return { allTime: block(tracker.allTime), daily: block(tracker.daily), weekly: block(tracker.weekly), monthly: block(tracker.monthly) };
  };

  const topSplTokens = Array.from(tokenMatrix.entries())
     .sort((a, b) => b[1].interacts - a[1].interacts)
     .slice(0, 5)
     .map(([mint, data]) => {
         const meta = jupTokens.get(mint) || { symbol: 'UNKNOWN', name: 'Unknown SPL', logo: '' };
         return { mint, in: data.in, out: data.out, interacts: data.interacts, meta };
     });

  const topCounterparties = Array.from(counterparties.entries())
     .filter(([addr]) => addr !== '11111111111111111111111111111111')
     .sort((a, b) => b[1].interactions - a[1].interactions)
     .slice(0, 15) // Pushed to top 15 for a denser visual map
     .map(([address, data]) => ({ 
        address, 
        interactions: data.interactions, 
        solVolume: toSOL(data.solVolume),
        netFlow: toSOL(data.netFlow)
     }));

  const chartTimeline = [];
  for (let i = 29; i >= 0; i--) {
     const dStr = new Date(Date.now() - (i * DAY_SEC * 1000)).toISOString().split('T')[0];
     chartTimeline.push({ date: dStr, txCount: chartMap[dStr] || 0 });
  }

  return {
    address: addressStr,
    totalTransfersAnalyzed: totalAnalyzed,
    timeline: chartTimeline,
    chartHourlyMap,
    swapCount,
    topCounterparties,
    topSplTokens,
    hasWhaleTransfer,
    hasWashLoop,
    coreEntities: Array.from(counterparties.keys()),
    typeProfile,
    statsSOL: buildOutput(statsSOL, toSOL),
    statsUSDC: buildOutput(statsUSDC, toUSDC),
    recentActivity
  };
}

app.get('/api/intersect/:addrA/:addrB', authenticateToken, async (req, res) => {
   try {
      const a = req.params.addrA;
      const b = req.params.addrB;
      if (!a || !b || a.length < 32 || b.length > 44) return res.status(400).json({ success: false, error: "Invalid Solana addresses." });
      
      const maxLimit = req.user.tier === 'PLAT' ? 10000 : (req.user.tier === 'PRO' ? 5000 : 1000);
      const [dataA, dataB] = await Promise.all([scanAddress(a, maxLimit), scanAddress(b, maxLimit)]);
      
      const setA = new Set(dataA.coreEntities);
      const setB = new Set(dataB.coreEntities);
      
      const intersection = [];
      for (const hash of setB) {
         if (setA.has(hash)) intersection.push(hash);
      }
      
      res.json({ success: true, overlap: intersection, analyzedA: dataA.totalTransfersAnalyzed, analyzedB: dataB.totalTransfersAnalyzed });
   } catch (e) {
      console.error("Intersection Error:", e);
      res.status(500).json({ success: false, error: e.message || "Failed intersection scan." });
   }
});

app.get('/api/scan/:address', authenticateToken, async (req, res) => {
  const address = req.params.address;
  if (!address || address.length < 32 || address.length > 44) return res.status(400).json({ success: false, error: "Invalid Solana address." });
  try {
    const maxLimit = req.user.tier === 'PLAT' ? 10000 : (req.user.tier === 'PRO' ? 5000 : 1000);
    const results = await scanAddress(address, maxLimit);
    res.json({ success: true, data: results });
  } catch (error) {
    console.error("API Error caught:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to parse API data." });
  }
});

// Phase 14: The Genesis Trace Algorithm
app.get('/api/genesis/:address', authenticateToken, async (req, res) => {
    const addressStr = req.params.address;
    try {
        let before = null;
        let lastTx = null;
        let hasMore = true;
        let pageCount = 0;
        
        // Loop backwards safely to prevent lambda exhaust
        while (hasMore && pageCount < 50) { 
            let url = `https://api.helius.xyz/v0/addresses/${addressStr}/transactions?api-key=${HELIUS_API_KEY}`;
            if (before) url += `&before=${before}`;
            
            const fetchRes = await fetch(url);
            if (!fetchRes.ok) break;
            
            const txs = await fetchRes.json();
            if (txs.length === 0) break;
            
            lastTx = txs[txs.length - 1]; // Oldest in current batch
            before = lastTx.signature;
            hasMore = txs.length === 100;
            pageCount++;
        }
        
        if (!lastTx) return res.status(404).json({ error: 'No history found' });

        let source = "Unknown Genesis";
        let amount = 0;
        if (lastTx.nativeTransfers) {
            const incoming = lastTx.nativeTransfers.find(t => t.toUserAccount === addressStr);
            if (incoming) {
                source = incoming.fromUserAccount;
                amount = incoming.amount / 1e9;
            }
        }
        res.json({
            signature: lastTx.signature,
            timestamp: lastTx.timestamp,
            type: lastTx.type,
            source,
            amount,
            pagesTraversed: pageCount
        });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
  console.log(`Scanner Web App listening at http://localhost:${PORT}`);
});
