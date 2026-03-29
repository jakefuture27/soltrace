const form = document.getElementById('scan-form');
const addressInput = document.getElementById('address-input');
const submitBtn = document.getElementById('submit-btn');
const btnText = document.querySelector('.btn-text');
const loader = document.querySelector('.loader');

window.latestDashData = { data: null, balances: null, livePrice: 150 };

const splash = document.getElementById('splash');
const resultsContainer = document.getElementById('results-container');
const errorMessage = document.getElementById('error-message');
const whaleAlert = document.getElementById('whale-alert');
const washAlert = document.getElementById('wash-alert');
const recentDropdown = document.getElementById('recent-dropdown');

const btnExport = document.getElementById('btn-export');
const btnShare = document.getElementById('btn-share');
const btnWatchlist = document.getElementById('btn-watchlist');
const btnX = document.getElementById('btn-x');

const KNOWN_ENTITIES = {
  "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pTEXc7": "Binance 1",
  "2o52sB84rM2h4cFTtZhy3xJq8wH6K9F8K5h16LhXvBxx": "Kraken 1"
};

let localTags = JSON.parse(localStorage.getItem('soltrace_tags') || '{}');
function resolveTag(addr) {
    if (localTags[addr]) return localTags[addr];
    if (KNOWN_ENTITIES[addr]) return KNOWN_ENTITIES[addr];
    return null;
}
function tAddr(addr, len=5) {
    let t = resolveTag(addr);
    if (t) return t;
    return truncate(addr, len);
}

// Custom Modal Variables
const nameModal = document.getElementById('name-modal');
const modalInput = document.getElementById('modal-name-input');
const modalSave = document.getElementById('modal-save');
const modalCancel = document.getElementById('modal-cancel');
let pendingEditItem = null;

// Phase 12: Omnipresent Tagging
const tagModal = document.getElementById('tag-modal');
const tagInput = document.getElementById('tag-input');
const btnSaveTag = document.getElementById('btn-save-tag');
const btnCancelTag = document.getElementById('btn-cancel-tag');
const tagTargetHash = document.getElementById('tag-target-hash');
let currentTagAddress = null;

window.promptTagModal = (addr = null) => {
    currentTagAddress = addr || window.scannedAddress;
    if(tagTargetHash) tagTargetHash.innerText = currentTagAddress;
    if(tagInput) tagInput.value = localTags[currentTagAddress] || '';
    if (tagModal) tagModal.classList.remove('hidden');
};

if (btnCancelTag) btnCancelTag.onclick = () => { tagModal.classList.add('hidden'); };
if (btnSaveTag) btnSaveTag.onclick = () => {
    let newTag = tagInput.value.trim();
    if (newTag) localTags[currentTagAddress] = newTag;
    else delete localTags[currentTagAddress];
    localStorage.setItem('soltrace_tags', JSON.stringify(localTags));
    tagModal.classList.add('hidden');
    if (window.latestDashData.data) renderDashboard(window.latestDashData.data, window.latestDashData.balances, window.latestDashData.livePrice);
};

// Deep Inspector Modal Variables
const txModal = document.getElementById('tx-modal');
const txMClo = document.getElementById('tx-m-close');
const txMSig = document.getElementById('tx-m-sig');
const txMTime = document.getElementById('tx-m-time');
const txMType = document.getElementById('tx-m-type');
const txMFlow = document.getElementById('tx-m-flow');
const txMFee = document.getElementById('tx-m-fee');
const txMCounter = document.getElementById('tx-m-counter');

if (txMClo) {
    txMClo.onclick = () => { txModal.classList.add('hidden'); };
}

// Phase 14: Genesis Fetcher
const btnGenesisTrace = document.getElementById('btn-genesis-trace');
const genesisResults = document.getElementById('genesis-results');

if (btnGenesisTrace) {
    btnGenesisTrace.onclick = async () => {
        if (!activeToken || !currentData) return;
        
        btnGenesisTrace.innerText = "Tracing Genesis Block (May take 20s)...";
        btnGenesisTrace.disabled = true;
        if(genesisResults) genesisResults.classList.add('hidden');
        
        try {
            const res = await fetch(`/api/genesis/${currentData.address}`, {
                headers: { 'Authorization': `Bearer ${activeToken}` }
            });
            const d = await res.json();
            
            if (res.ok && d.signature) {
                document.getElementById('gen-source').innerText = resolveTag(d.source) || truncate(d.source, 16);
                document.getElementById('gen-amount').innerText = formatVal(d.amount, 'SOL');
                document.getElementById('gen-date').innerText = new Date(d.timestamp * 1000).toLocaleString();
                document.getElementById('gen-sig').innerText = truncate(d.signature, 12);
                document.getElementById('gen-sig').href = `https://solscan.io/tx/${d.signature}`;
                if(genesisResults) genesisResults.classList.remove('hidden');
            } else {
                alert("Genesis trace failed: " + (d.error || 'Unknown error'));
            }
        } catch(e) {
            console.error(e);
            alert("Trace failed.");
        }
        
        btnGenesisTrace.innerText = "Initiate Genesis Trace";
        btnGenesisTrace.disabled = false;
    };
}

const nodeModal = document.getElementById('node-modal');
const nodeMClo = document.getElementById('node-m-close');
if (nodeMClo) {
    nodeMClo.onclick = () => { nodeModal.classList.add('hidden'); };
}

window.openTxModal = (actRaw) => {
    const act = JSON.parse(decodeURIComponent(actRaw));
    txMSig.innerText = truncate(act.sig, 24);
    txMSig.href = `https://solscan.io/tx/${act.sig}`;
    txMTime.innerText = new Date(act.time * 1000).toLocaleString();
    txMType.innerText = act.type;
    const sign = act.isSent ? '-' : '+';
    txMFlow.innerText = `${sign}${formatVal(act.flow, act.cur)}`;
    txMFlow.style.color = act.isSent ? '#fca5a5' : '#14F195';
    txMFee.innerText = formatVal(act.fee, 'SOL');
    txMCounter.innerText = act.counter ? truncate(act.counter, 16) : 'N/A';
    txMCounter.href = act.counter ? `https://solscan.io/account/${act.counter}` : '#';
    txModal.classList.remove('hidden');
};

// Phase 10: Auth Variables
const authModal = document.getElementById('auth-modal');
const authUser = document.getElementById('auth-user');
const authPass = document.getElementById('auth-pass');
const authError = document.getElementById('auth-error');
const btnLogin = document.getElementById('btn-login');
const btnRegister = document.getElementById('btn-register');
const navTierBadge = document.getElementById('nav-tier-badge');
const navBtnUpgrade = document.getElementById('nav-btn-upgrade');
const upgradeModal = document.getElementById('upgrade-modal');

let activeToken = localStorage.getItem('soltrace_jwt') || null;
let activeTier = 'FREE';

const checkAuth = async () => {
    if (!activeToken) {
        authModal.classList.remove('hidden');
        document.body.classList.add('auth-locked');
        return;
    }
    try {
        const res = await fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${activeToken}` }});
        const d = await res.json();
        if (d.success) {
            activeTier = d.tier;
            authModal.classList.add('hidden');
            navTierBadge.innerText = `[ ${activeTier} ]`;
            navTierBadge.classList.remove('hidden');
            const btnLogout = document.getElementById('nav-btn-logout');
            if (btnLogout) btnLogout.classList.remove('hidden');
            if (activeTier !== 'PLAT') navBtnUpgrade.classList.remove('hidden');
            else navBtnUpgrade.classList.add('hidden');
            document.body.classList.remove('auth-locked');
        } else {
            activeToken = null;
            localStorage.removeItem('soltrace_jwt');
            authModal.classList.remove('hidden');
            document.body.classList.add('auth-locked');
        }
    } catch(e) {
        activeToken = null;
        localStorage.removeItem('soltrace_jwt');
        authModal.classList.remove('hidden');
        document.body.classList.add('auth-locked');
    }
};

const handleAuth = async (isLogin) => {
    const u = authUser.value.trim();
    const p = authPass.value.trim();
    if (!u || !p) { authError.innerText = "Target identifiers required."; authError.classList.remove('hidden'); return; }
    
    authError.classList.add('hidden');
    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, password: p })
        });
        const d = await res.json();
        if (d.success) {
            activeToken = d.token;
            localStorage.setItem('soltrace_jwt', d.token);
            checkAuth();
        } else {
            authError.innerText = d.error || "Authentication failed.";
            authError.classList.remove('hidden');
        }
    } catch(e) {
        authError.innerText = "Network bridge failed.";
        authError.classList.remove('hidden');
    }
};

if (btnLogin) btnLogin.onclick = () => handleAuth(true);
if (btnRegister) btnRegister.onclick = () => handleAuth(false);

const btnLogout = document.getElementById('nav-btn-logout');
if (btnLogout) {
    btnLogout.onclick = () => {
        activeToken = null;
        localStorage.removeItem('soltrace_jwt');
        navTierBadge.classList.add('hidden');
        navBtnUpgrade.classList.add('hidden');
        btnLogout.classList.add('hidden');
        authModal.classList.remove('hidden');
        document.body.classList.add('auth-locked');
    };
}

if (navBtnUpgrade) navBtnUpgrade.onclick = () => upgradeModal.classList.remove('hidden');

window.upgradeTier = async (newTier) => {
    try {
        const res = await fetch('/api/auth/upgrade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${activeToken}` },
            body: JSON.stringify({ tier: newTier })
        });
        const d = await res.json();
        if (d.success) {
            activeToken = d.token;
            localStorage.setItem('soltrace_jwt', d.token);
            upgradeModal.classList.add('hidden');
            checkAuth();
        }
    } catch(e) { console.error("Upgrade failed", e); }
};

document.addEventListener('DOMContentLoaded', checkAuth);

const btnSol = document.getElementById('btn-sol');
const btnUsdc = document.getElementById('btn-usdc');

// Intersection Modal Variables
const btnCompare = document.getElementById('btn-compare');
const intModal = document.getElementById('int-modal');
const intA = document.getElementById('int-a');
const intB = document.getElementById('int-b');
const intRun = document.getElementById('int-run');
const intCancel = document.getElementById('int-cancel');
const intResults = document.getElementById('int-results');
const intStatus = document.getElementById('int-status');
const intList = document.getElementById('int-list');

const liveSol = document.getElementById('live-sol');
const liveUsdc = document.getElementById('live-usdc');
const liveWorth = document.getElementById('live-worth');
const swapCountUI = document.getElementById('swap-count');

let currentData = null;
let currentCurrency = 'SOL';
let myChart = null;
let myRadarChart = null;

// Phase 6: URL Hook & Watchlist DB
let watchlist = [];
try { 
  const st = localStorage.getItem('solpulse_watchlist'); 
  if (st) {
    const parsed = JSON.parse(st);
    watchlist = parsed.map(item => {
      if (typeof item === 'string') return { address: item, name: '' };
      return item;
    });
  }
} catch(e){}

let recentSearches = [];
try { const stored = localStorage.getItem('solpulse_recents'); if (stored) recentSearches = JSON.parse(stored); } catch (e) {}

window.addEventListener('load', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const target = urlParams.get('target');
  if (target) {
     document.getElementById('address-input').value = target;
     document.getElementById('scan-form').dispatchEvent(new Event('submit'));
  }
});

// Phase 7 Command Center Executions
function openNameModal(item) {
   pendingEditItem = item;
   modalInput.value = item.name || '';
   nameModal.classList.remove('hidden');
   modalInput.focus();
}

function closeNameModal() {
   nameModal.classList.add('hidden');
   pendingEditItem = null;
}

if(modalCancel) modalCancel.onclick = closeNameModal;
if(modalSave) {
   modalSave.onclick = () => {
      if(pendingEditItem) {
         pendingEditItem.name = modalInput.value.trim();
         localStorage.setItem('solpulse_watchlist', JSON.stringify(watchlist));
         renderWatchlist();
      }
      closeNameModal();
   };
}
if(modalInput) {
   modalInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') modalSave.click();
   });
}

function renderWatchlist() {
   const container = document.getElementById('watchlist-container');
   if(!container) return;
   container.innerHTML = "";
   if(watchlist.length === 0) {
      container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; padding: 1rem 0;">No active targets saved. Use the dashboard to pin addresses here.</div>';
      return;
   }
   watchlist.forEach(item => {
      const el = document.createElement('div');
      el.className = 'wl-badge';
      
      const labelBlock = document.createElement('div');
      labelBlock.style.display = 'flex';
      labelBlock.style.flexDirection = 'column';
      labelBlock.style.gap = '2px';
      
      const a = document.createElement('span');
      a.innerText = item.name ? item.name : truncate(item.address, 5);
      a.title = item.address;
      a.style.cursor = "pointer";
      a.style.fontWeight = item.name ? "700" : "normal";
      a.onclick = () => { document.getElementById('address-input').value = item.address; document.getElementById('scan-form').dispatchEvent(new Event('submit', {cancelable: true, bubbles: true})); };
      
      const controls = document.createElement('div');
      controls.style.display = 'flex';
      controls.style.gap = '8px';
      
      const editBtn = document.createElement('span');
      editBtn.innerHTML = '✎';
      editBtn.style.cursor = 'pointer';
      editBtn.style.color = 'var(--text-muted)';
      editBtn.onclick = (e) => {
         e.stopPropagation();
         openNameModal(item);
      };

      const k = document.createElement('span');
      k.className = 'wl-kill';
      k.innerHTML = '×';
      k.onclick = (e) => {
         e.stopPropagation();
         watchlist = watchlist.filter(x => x.address !== item.address);
         localStorage.setItem('solpulse_watchlist', JSON.stringify(watchlist));
         renderWatchlist();
         if(currentData && currentData.address === item.address) {
            const labelWatchlist = document.getElementById('label-watchlist');
            if(labelWatchlist) labelWatchlist.innerHTML = "Pin Target";
         }
      };
      
      controls.appendChild(editBtn);
      controls.appendChild(k);
      
      labelBlock.appendChild(a);
      if(item.name) {
         const sub = document.createElement('span');
         sub.innerText = truncate(item.address, 5);
         sub.style.fontSize = '0.65rem';
         sub.style.color = 'var(--text-muted)';
         labelBlock.appendChild(sub);
      }

      el.appendChild(labelBlock);
      el.appendChild(controls);
      container.appendChild(el);
   });
}
renderWatchlist();

// Binance Live WS Market Oracles
const ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@ticker/ethusdt@ticker/solusdt@ticker');
ws.onmessage = (event) => {
   const payload = JSON.parse(event.data);
   let targetId = '';
   if(payload.s === 'BTCUSDT') targetId = 'btc';
   if(payload.s === 'ETHUSDT') targetId = 'eth';
   if(payload.s === 'SOLUSDT') targetId = 'sol';
   
   if(targetId) {
      const pDom = document.getElementById(`price-${targetId}`);
      const cDom = document.getElementById(`pct-${targetId}`);
      if(pDom && cDom) {
         const px = parseFloat(payload.c).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
         const chg = parseFloat(payload.P);
         pDom.innerText = `$${px}`;
         cDom.innerText = `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`;
         cDom.className = `t-pct ${chg >= 0 ? 'txt-pos' : 'txt-neg'}`;
      }
   }
};

const saveRecentSearch = (addr) => {
  if (!recentSearches.includes(addr)) {
    recentSearches.unshift(addr);
    if (recentSearches.length > 5) recentSearches.pop();
    localStorage.setItem('solpulse_recents', JSON.stringify(recentSearches));
  }
};

const renderRecentSearches = () => {
  recentDropdown.innerHTML = '';
  // Combine Watchlist + Recent for the dropdown
  const combo = [...new Set([...watchlist, ...recentSearches])].slice(0, 8);
  if (combo.length === 0) {
    recentDropdown.classList.add('hidden');
    return;
  }
  combo.forEach(addr => {
    const btn = document.createElement('button');
    btn.className = 'recent-item';
    btn.innerHTML = watchlist.some(x => x.address === addr) ? `⭐ ${truncate(addr, 20)}` : truncate(addr, 20);
    btn.type = 'button';
    btn.onclick = () => {
      addressInput.value = addr;
      recentDropdown.classList.add('hidden');
      form.dispatchEvent(new Event('submit'));
    };
    recentDropdown.appendChild(btn);
  });
  recentDropdown.classList.remove('hidden');
};

addressInput.addEventListener('focus', renderRecentSearches);
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-container')) {
    recentDropdown.classList.add('hidden');
  }
});

btnWatchlist.addEventListener('click', () => {
   if (!currentData) return;
   const addr = currentData.address;
   const labelWatchlist = document.getElementById('label-watchlist');
   const existingIdx = watchlist.findIndex(x => x.address === addr);
   
   if (existingIdx !== -1) {
      watchlist.splice(existingIdx, 1);
      if(labelWatchlist) labelWatchlist.innerHTML = "Pin Target";
   } else {
      watchlist.push({ address: addr, name: '' });
      if(labelWatchlist) labelWatchlist.innerHTML = "Pinned!";
   }
   localStorage.setItem('solpulse_watchlist', JSON.stringify(watchlist));
   if (typeof renderWatchlist === 'function') renderWatchlist();
});

btnShare.addEventListener('click', () => {
   if (!currentData) return;
   const url = window.location.origin + "?target=" + currentData.address;
   navigator.clipboard.writeText(url).then(() => {
      const span = btnShare.querySelector('span');
      if (!span) return;
      const og = span.innerHTML;
      span.innerHTML = "Copied!";
      setTimeout(() => span.innerHTML = og, 2000);
   });
});

// Intersection DOM logic
if (btnCompare) {
   btnCompare.onclick = () => {
      intModal.classList.remove('hidden');
      if (currentData) intA.value = currentData.address;
   };
}
if (intCancel) {
   intCancel.onclick = () => {
      intModal.classList.add('hidden');
      intResults.classList.add('hidden');
      intA.value = ''; intB.value = '';
   };
}
if (intRun) {
   intRun.onclick = async () => {
      const a = intA.value.trim();
      const b = intB.value.trim();
      if(!a || !b) return;

      intRun.disabled = true;
      intRun.innerText = "Scanning...";
      intResults.classList.remove('hidden');
      intStatus.innerText = "Pumping mathematical sets through absolute correlation matrices...";
      intList.innerHTML = "";

      try {
         const response = await fetch(`/api/intersect/${a}/${b}`, {
             headers: { 'Authorization': `Bearer ${activeToken}` }
         });
         const d = await response.json();
         if(d.success) {
            intStatus.innerText = `Analyzed ${d.analyzedA + d.analyzedB} Total Transfers. Found ${d.overlap.length} Co-Signer overlaps.`;
            if (d.overlap.length === 0) {
               intList.innerHTML = `<li style="color:var(--text-muted);font-size:0.8rem;text-align:center;padding:1rem;list-style:none;">No direct correlation isolated. Target identities are mathematically distinct.</li>`;
            } else {
               d.overlap.forEach(hash => {
                  let tag = KNOWN_ENTITIES[hash] ? `<span class="badge" style="background: rgba(243, 186, 47, 0.2); color:#f3ba2f; margin-left:8px; border-color: rgba(243,186,47,0.5);">${KNOWN_ENTITIES[hash]}</span>` : '';
                  const li = document.createElement('li');
                  li.className = 'cp-item';
                  li.innerHTML = `<a href="?target=${hash}" class="cp-address">${truncate(hash,16)} ${tag}</a>`;
                  intList.appendChild(li);
               });
            }
         } else {
            intStatus.innerText = "Correlation mathematically failed: " + (d.error || "Unknown API error");
         }
      } catch(e) {
         intStatus.innerText = "Absolute connection failure to backend logic nodes.";
      } finally {
         intRun.disabled = false;
         intRun.innerText = "Execute Scan";
      }
   };
}

// Helper formatting Functions
function formatVal(amount, suffix) {
  return Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 }) + (suffix ? ' ' + suffix : '');
}

function formatUsd(amount) { 
   return "$" + Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); 
}

function animateValue(obj, endCode, suffix) {
  const end = parseFloat(endCode);
  if (isNaN(end)) { obj.textContent = endCode; return; }
  
  const duration = 1200; 
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    
    const easeOutQuart = 1 - Math.pow(1 - progress, 4);
    const currentVal = end * easeOutQuart;
    
    if (suffix === '$') obj.textContent = formatUsd(currentVal);
    else obj.textContent = formatVal(currentVal, suffix);
    
    if (progress < 1) window.requestAnimationFrame(step);
    else obj.textContent = suffix === '$' ? formatUsd(end) : formatVal(end, suffix);
  };
  window.requestAnimationFrame(step);
}

function truncate(str, max = 16) {
  if (!str) return 'N/A';
  if (str.length <= max) return str;
  return str.slice(0, 8) + '...' + str.slice(-8);
}

function assignCard(periodId, statsObj, cur) {
  const net = statsObj.netFlow;
  
  const vRec = document.getElementById(`${periodId}-received`);
  const vSent = document.getElementById(`${periodId}-sent`);
  const vNet = document.getElementById(`${periodId}-net`);
  
  animateValue(vRec, statsObj.totalReceived, cur);
  animateValue(vSent, statsObj.totalSent, cur);
  animateValue(vNet, net, cur);
  
  vNet.className = 'value tally-num ' + (net > 0 ? 'txt-pos' : net < 0 ? 'txt-neg' : '');

  const hRec = document.getElementById(`${periodId}-high-rec`);
  hRec.textContent = formatVal(statsObj.highestReceived, cur);
  if (statsObj.highestReceivedTx) {
    hRec.href = `https://solscan.io/tx/${statsObj.highestReceivedTx}`;
    hRec.classList.add('active-link');
  } else {
    hRec.removeAttribute('href');
    hRec.classList.remove('active-link');
  }

  const hSent = document.getElementById(`${periodId}-high-sent`);
  hSent.textContent = formatVal(statsObj.highestSent, cur);
  if (statsObj.highestSentTx) {
    hSent.href = `https://solscan.io/tx/${statsObj.highestSentTx}`;
    hSent.classList.add('active-link');
  } else {
    hSent.removeAttribute('href');
    hSent.classList.remove('active-link');
  }
}

function updateDashboard() {
  if (!currentData) return;
  const stats = currentCurrency === 'SOL' ? currentData.statsSOL : currentData.statsUSDC;
  
  assignCard('daily', stats.daily, currentCurrency);
  assignCard('weekly', stats.weekly, currentCurrency);
  assignCard('monthly', stats.monthly, currentCurrency);
  assignCard('all', stats.allTime, currentCurrency);
}

function renderDashboard(data, balances, livePrice = 150) {
  currentData = data;
  window.latestDashData = { data, balances, livePrice };
  currentCurrency = 'SOL';
  
  document.getElementById('res-address').textContent = tAddr(data.address, 24);
  animateValue(document.getElementById('res-transfers'), data.totalTransfersAnalyzed, '');

  const labelWatchlist = document.getElementById('label-watchlist');
  if (labelWatchlist) {
      if (watchlist.some(x => x.address === data.address)) labelWatchlist.innerHTML = "Pinned!";
      else labelWatchlist.innerHTML = "Pin Target";
  }

  if (data.hasWhaleTransfer) whaleAlert.classList.remove('hidden');
  else whaleAlert.classList.add('hidden');
  
  if (data.hasWashLoop) washAlert.classList.remove('hidden');
  else washAlert.classList.add('hidden');
  
  const genesisResults = document.getElementById('genesis-results');
  if (genesisResults) genesisResults.classList.add('hidden');

  btnSol.classList.add('active');
  btnUsdc.classList.remove('active');

  let solRaw = 0; let usdcRaw = 0;
  if (balances && balances.nativeBalance) solRaw = balances.nativeBalance / 1e9;
  if (balances && balances.tokens) {
     const tToken = balances.tokens.find(t => t.mint === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
     if (tToken) usdcRaw = tToken.amount / Math.pow(10, tToken.decimals);
  }
  
  animateValue(liveSol, solRaw, 'SOL');
  animateValue(liveUsdc, usdcRaw, 'USDC');
  
  const estimatedWorth = (solRaw * livePrice) + (usdcRaw * 1.0); 
  animateValue(liveWorth, estimatedWorth, '$');
  
  animateValue(swapCountUI, data.swapCount || 0, '');

  const behaviorTag = document.getElementById('behavior-tag');
  if (behaviorTag) {
     let profile = "STANDARD";
     let color = "#cbd5e1";
     let bg = "rgba(203, 213, 225, 0.15)";
     if (data.totalTransfersAnalyzed > 1000 && data.swapCount > 200) { profile = "HIGH-FREQ TRADER"; color = "#38bdf8"; bg = "rgba(56, 189, 248, 0.15)"; }
     else if (data.hasWhaleTransfer) { profile = "DEEP WHALE"; color = "#fca5a5"; bg = "rgba(252, 165, 165, 0.15)"; }
     else if (data.swapCount > 100) { profile = "DEX SNIPER"; color = "#14F195"; bg = "rgba(20, 241, 149, 0.15)"; }
     else if (data.totalTransfersAnalyzed < 50) { profile = "SLEEPING WALLET"; color = "#8b949e"; bg = "rgba(139, 148, 158, 0.15)"; }
     
     behaviorTag.innerText = profile;
     behaviorTag.style.color = color;
     behaviorTag.style.borderColor = color;
     behaviorTag.style.background = bg;
     behaviorTag.classList.remove('hidden');
  }

  const tokenList = document.getElementById('token-matrix-list');
  if (tokenList) {
     tokenList.innerHTML = '';
     if (!data.topSplTokens || data.topSplTokens.length === 0) {
        tokenList.innerHTML = '<li style="color: var(--text-muted); font-size: 0.8rem; text-align: center; padding: 2rem 0; list-style: none;">No SPL Trading History Detected.</li>';
     } else {
        data.topSplTokens.forEach(t => {
           const li = document.createElement('li');
           li.className = 'cp-item';
           
           let logoHtml = t.meta && t.meta.logo 
              ? `<img src="${t.meta.logo}" alt="${t.meta.symbol}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;">`
              : `<div style="width: 24px; height: 24px; border-radius: 50%; background: rgba(255,255,255,0.1); display:flex; justify-content:center; align-items:center; font-size:0.6rem; color:var(--text-muted); font-weight: bold;">?</div>`;
           
           let tickerHtml = t.meta && t.meta.symbol !== 'UNKNOWN' 
              ? `<span style="font-weight: 700; color: var(--text-main);">${t.meta.symbol}</span>`
              : `<span style="font-weight: 700; color: var(--text-muted);">UNKNOWN</span>`;
           
           li.innerHTML = `
             <div style="display:flex; align-items:center; gap: 12px;">
                ${logoHtml}
                <div style="display:flex; flex-direction:column;">
                   <a href="https://solscan.io/token/${t.mint}" target="_blank" class="cp-address" style="font-size: 0.95rem; text-decoration: none;">${tickerHtml}</a>
                   <span style="font-size: 0.65rem; color: var(--text-muted); font-family: 'JetBrains Mono';">${truncate(t.mint, 10)}</span>
                </div>
             </div>
             <div class="cp-stats" style="align-items: flex-end;">
               <span class="txt-teal">+${formatVal(t.in, '')} IN</span>
               <span class="txt-crimson">-${formatVal(t.out, '')} OUT</span>
             </div>
           `;
           tokenList.appendChild(li);
        });
     }
  }

  const cpList = document.getElementById('cp-list');
  cpList.innerHTML = '';
  data.topCounterparties.forEach(cp => {
    const li = document.createElement('li');
    li.className = 'cp-item';
    li.innerHTML = `
      <div class="cp-info">
        <span class="cp-name">${resolveTag(cp.address) || truncate(cp.address, 8)}</span>
        <a href="https://solscan.io/account/${cp.address}" target="_blank" class="cp-address">${truncate(cp.address, 6)}</a>
      </div>
      <div class="cp-stats">
        <span class="cp-vol">${formatVal(cp.solVolume, 'SOL')} Vol</span>
        <span class="cp-int">${cp.interactions} Transfers</span>
      </div>
    `;
    cpList.appendChild(li);
  });

  // Physical Flow Network Initialization
  const container = document.getElementById('flow-network');
  if (container) {
     const renderGraph = () => {
         const minVol = parseFloat(document.getElementById('flow-filter')?.value || 0);
         const nodesObj = [{ 
             id: data.address, 
             label: truncate(data.address, 5), 
             shape: 'circle', 
             color: { background: 'rgba(153, 69, 255, 0.9)', border: '#14F195' }, 
             font: { color: '#ffffff', face: 'JetBrains Mono', size: 14, bold: true }, 
             size: 30,
             shadow: { enabled: true, color: 'rgba(153, 69, 255, 0.5)', size: 20 }
         }];
         const edgesObj = [];

         data.topCounterparties.forEach(cp => {
            if (cp.solVolume < minVol) return; // Physics Slider Filter
            let isKnown = resolveTag(cp.address);
            let nodeLabel = isKnown ? isKnown : tAddr(cp.address, 5);
            let nodeColor = isKnown ? 'rgba(243, 186, 47, 0.9)' : 'rgba(30, 41, 59, 0.9)';
            let nodeBorder = isKnown ? '#f3ba2f' : '#cbd5e1';

            nodesObj.push({
               id: cp.address,
               label: nodeLabel,
               shape: isKnown ? 'box' : 'dot',
               size: isKnown ? 25 : 15,
               color: { background: nodeColor, border: nodeBorder },
               font: { color: '#ffffff', face: 'JetBrains Mono', size: 10 }
            });

            let flowVal = cp.netFlow || 0;
            let absFlow = Math.abs(flowVal);
            let mapScale = Math.max(1, Math.min(10, Math.log10(absFlow > 0 ? absFlow : 1) * 2)); 

            if (flowVal >= 0) {
                edgesObj.push({
                   from: cp.address,
                   to: data.address,
                   arrows: 'to',
                   color: { color: 'rgba(20, 241, 149, 0.6)', highlight: '#14F195' },
                   width: mapScale,
                   title: `${formatVal(absFlow, currentCurrency)} Received`
                });
            } else {
                edgesObj.push({
                   from: data.address,
                   to: cp.address,
                   arrows: 'to',
                   color: { color: 'rgba(252, 165, 165, 0.6)', highlight: '#fca5a5' },
                   width: mapScale,
                   title: `${formatVal(absFlow, currentCurrency)} Sent`
                });
            }
         });

         const graphData = { nodes: new vis.DataSet(nodesObj), edges: new vis.DataSet(edgesObj) };
         const options = {
            physics: {
               barnesHut: { gravitationalConstant: -3000, centralGravity: 0.3, springLength: 150, springConstant: 0.04 },
               maxVelocity: 50,
               minVelocity: 0.1,
               timestep: 0.5
            },
            interaction: { hover: true, tooltipDelay: 200 },
            edges: { smooth: { type: 'continuous' } }
         };

         if (window.flowNetwork) window.flowNetwork.destroy();
         window.flowNetwork = new vis.Network(container, graphData, options);

         window.flowNetwork.on("afterDrawing", function() {
            let cvs = container.querySelector('canvas');
            if(cvs) cvs.style.outline = "none";
         });

         window.flowNetwork.on("click", function(params) {
             if (params.nodes.length > 0) {
                 const nodeId = params.nodes[0];
                 if (nodeId === data.address) return;
                 const cpInfo = data.topCounterparties.find(c => c.address === nodeId);
                 if (cpInfo) {
                     document.getElementById('node-m-addr').innerText = tAddr(cpInfo.address, 16);
                     document.getElementById('node-m-addr').href = `https://solscan.io/account/${cpInfo.address}`;
                     document.getElementById('node-m-int').innerText = cpInfo.interactions;
                     document.getElementById('node-m-vol').innerText = formatVal(cpInfo.solVolume, 'SOL');
                     let sign = cpInfo.netFlow < 0 ? '-' : '+';
                     let col = cpInfo.netFlow < 0 ? '#fca5a5' : '#14F195';
                     document.getElementById('node-m-flow').innerText = `${sign}${formatVal(Math.abs(cpInfo.netFlow), 'SOL')}`;
                     document.getElementById('node-m-flow').style.color = col;
                     if(nodeModal) nodeModal.classList.remove('hidden');
                 }
             }
         });
         
         window.flowNetwork.on("hoverNode", function() {
             container.style.cursor = 'pointer';
         });
         window.flowNetwork.on("blurNode", function() {
             container.style.cursor = 'default';
         });
     };
     
     renderGraph();
     
     const flowFilter = document.getElementById('flow-filter');
     if (flowFilter) {
         flowFilter.oninput = (e) => {
             document.getElementById('flow-filter-val').innerText = e.target.value;
             renderGraph();
         };
     }
  }

  // Phase 9: Timezone Radar Mapping
  if (myRadarChart) myRadarChart.destroy();
  const rCtx = document.getElementById('radarChart').getContext('2d');
  
  const maxRadar = Math.max(...data.chartHourlyMap);
  const radarColors = data.chartHourlyMap.map(val => `rgba(153, 69, 255, ${Math.max(0.15, val / (maxRadar || 1))})`);

  myRadarChart = new Chart(rCtx, {
    type: 'polarArea',
    data: {
      labels: Array.from({length: 24}, (_, i) => `${i}:00 UTC`),
      datasets: [{
        label: 'Transactions',
        data: data.chartHourlyMap,
        backgroundColor: radarColors,
        borderColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { 
         legend: { display: false },
         tooltip: { backgroundColor: 'rgba(3,4,7,0.9)', titleFont: { family: 'Plus Jakarta Sans', size: 13 }, bodyFont: { family: 'JetBrains Mono', size: 14, weight: 'bold' } }
      },
      scales: {
         r: {
            ticks: { display: false },
            grid: { color: 'rgba(255,255,255,0.05)' },
            angleLines: { color: 'rgba(255,255,255,0.05)' }
         }
      }
    }
  });

  // Chart.js Default 
  if (myChart) myChart.destroy();
  const ctx = document.getElementById('activityChart').getContext('2d');
  
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, 'rgba(153, 69, 255, 0.5)');
  gradient.addColorStop(1, 'rgba(153, 69, 255, 0.0)');

  myChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.timeline.map(t => t.date.slice(5)),
      datasets: [{
        label: 'Transactions',
        data: data.timeline.map(t => t.txCount),
        borderColor: '#9945FF',
        backgroundColor: gradient,
        borderWidth: 2,
        tension: 0.4,
        fill: true,
        pointBackgroundColor: '#14F195',
        pointBorderColor: '#030407',
        pointBorderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(3,4,7,0.9)', titleFont: { family: 'Plus Jakarta Sans', size: 13 }, bodyFont: { family: 'JetBrains Mono', size: 14, weight: 'bold' }, padding: 12, borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 } },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false }, ticks: { color: '#8b949e', font: { family: 'JetBrains Mono' } } },
        x: { grid: { display: false }, ticks: { color: '#8b949e', maxTicksLimit: 10, font: { family: 'JetBrains Mono' } } }
      },
      interaction: { intersect: false, mode: 'index' }
    }
  });

  const feedList = document.getElementById('recent-feed-list');
  if (feedList) {
     feedList.innerHTML = '';
     if (!data.recentActivity || data.recentActivity.length === 0) {
        feedList.innerHTML = '<li style="color: var(--text-muted); font-size: 0.8rem; text-align: center; padding: 2rem 0; list-style: none;">No recent activity isolated.</li>';
     } else {
        data.recentActivity.forEach(act => {
           const li = document.createElement('li');
           li.className = 'cp-item';
           const timeAgo = Math.floor((Date.now()/1000) - act.time);
           let timeStr = timeAgo < 60 ? `${timeAgo}s ago` : (timeAgo < 3600 ? `${Math.floor(timeAgo/60)}m ago` : (timeAgo < 86400 ? `${Math.floor(timeAgo/3600)}h ago` : `${Math.floor(timeAgo/86400)}d ago`));
           let sign = act.isSent ? '-' : '+';
           let colorClass = act.isSent ? 'txt-crimson' : 'txt-teal';
           li.innerHTML = `
             <div style="display:flex; flex-direction:column; gap:4px;">
                <span onclick="window.openTxModal('${encodeURIComponent(JSON.stringify(act))}')" class="cp-address" style="cursor: pointer; text-decoration: underline;">${truncate(act.sig, 12)}</span>
                <span style="font-size: 0.7rem; color: var(--text-muted);">${timeStr} &bull; ${act.type}</span>
             </div>
             <div class="cp-stats" style="align-items: flex-end;">
               <span class="${colorClass}" style="font-family: 'JetBrains Mono'; font-weight: bold;">${sign}${formatVal(act.flow, act.cur)}</span>
               <a href="https://solscan.io/account/${act.counter}" target="_blank" class="cp-address" style="font-size: 0.7rem; color: var(--text-muted);">${truncate(act.counter, 8)}</a>
             </div>
           `;
           feedList.appendChild(li);
        });
     }
  }

  if (window.myAllocationChart) window.myAllocationChart.destroy();
  const aCtx = document.getElementById('allocationChart')?.getContext('2d');
  if (aCtx) {
     const otherVal = Math.max(0, (solRaw * livePrice * 0.15));
     window.myAllocationChart = new Chart(aCtx, {
        type: 'doughnut',
        data: {
           labels: ['Native SOL', 'USDC SPL', 'Other Assets'],
           datasets: [{
              data: [solRaw * livePrice, usdcRaw, otherVal],
              backgroundColor: ['#9945FF', '#14F195', '#38bdf8'],
              borderColor: '#030407',
              borderWidth: 2,
              hoverOffset: 4
           }]
        },
        options: {
           responsive: true,
           maintainAspectRatio: false,
           cutout: '75%',
           plugins: {
              legend: { position: 'bottom', labels: { color: '#c9d1d9', font: { family: 'Plus Jakarta Sans', size: 11 }, padding: 15 } },
              tooltip: { backgroundColor: 'rgba(3,4,7,0.9)', titleFont: { family: 'Plus Jakarta Sans', size: 13 }, bodyFont: { family: 'JetBrains Mono', size: 14, weight: 'bold' }, callbacks: { label: (ctx) => ' $' + formatVal(ctx.raw, '') } }
           }
        }
     });
  }

  // Contract Profiler Doughnut
  if (window.myProfileChart) window.myProfileChart.destroy();
  const pCtx = document.getElementById('profileChart')?.getContext('2d');
  if (pCtx && data.typeProfile) {
     const pLabels = Object.keys(data.typeProfile);
     const pData = Object.values(data.typeProfile);
     const pColors = ['#9945FF', '#14F195', '#38bdf8', '#fca5a5', '#f3ba2f', '#cbd5e1', '#c9d1d9'];
     window.myProfileChart = new Chart(pCtx, {
        type: 'doughnut',
        data: { labels: pLabels, datasets: [{ data: pData, backgroundColor: pColors, borderColor: '#030407', borderWidth: 2, hoverOffset: 4 }] },
        options: {
           responsive: true, maintainAspectRatio: false, cutout: '75%',
           plugins: {
              legend: { position: 'right', labels: { color: '#c9d1d9', font: { family: 'Plus Jakarta Sans', size: 10 } } },
              tooltip: { backgroundColor: 'rgba(3,4,7,0.9)', titleFont: { family: 'Plus Jakarta Sans', size: 13 }, bodyFont: { family: 'JetBrains Mono', size: 14, weight: 'bold' } }
           }
        }
     });
  }

  updateDashboard();
}

btnX.addEventListener('click', () => {
  if (!currentData) return;
  const target = currentData.address;
  window.open(`https://x.com/search?q=${target}&src=typed_query`, '_blank');
});

btnSol.addEventListener('click', () => {
  if (currentCurrency === 'SOL') return;
  currentCurrency = 'SOL';
  btnSol.classList.add('active'); btnUsdc.classList.remove('active');
  updateDashboard();
});

btnUsdc.addEventListener('click', () => {
  if (currentCurrency === 'USDC') return;
  currentCurrency = 'USDC';
  btnUsdc.classList.add('active'); btnSol.classList.remove('active');
  updateDashboard();
});

btnExport.addEventListener('click', () => {
  if (!currentData) return;
  let csv = "SolTrace Intelligence Report\n";
  csv += `Address,${currentData.address}\n`;
  csv += `Analyzed Transfers,${currentData.totalTransfersAnalyzed}\n`;
  csv += `Whale Detected,${currentData.hasWhaleTransfer ? 'YES' : 'NO'}\n\n`;

  const frames = ['daily', 'weekly', 'monthly', 'allTime'];
  const curs = ['SOL', 'USDC'];

  csv += "--- METRICS ---\n";
  csv += "Currency,Timeframe,Volume In,Volume Out,Net Flow,Largest In TX,Largest Out TX\n";
  
  curs.forEach(cur => {
    const stats = cur === 'SOL' ? currentData.statsSOL : currentData.statsUSDC;
    frames.forEach(fr => {
      const obj = stats[fr];
      csv += `${cur},${fr},${obj.totalReceived},${obj.totalSent},${obj.netFlow},${obj.highestReceivedTx || 'N/A'},${obj.highestSentTx || 'N/A'}\n`;
    });
  });

  csv += "\n--- TOP COUNTERPARTIES (SOL) ---\n";
  csv += "Address,Interactions,SOL Volume\n";
  currentData.topCounterparties.forEach(cp => {
    csv += `${cp.address},${cp.interactions},${cp.solVolume}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `soltrace_report_${currentData.address.slice(0,6)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const address = addressInput.value.trim();
  if (!address) return;

  saveRecentSearch(address);
  recentDropdown.classList.add('hidden');

  btnText.classList.add('hidden');
  loader.classList.remove('hidden');
  submitBtn.disabled = true;
  errorMessage.classList.add('hidden');

  try {
    const priceP = fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd')
       .then(r => r.json())
       .then(d => {
           if (d.solana && d.solana.usd) window.SOL_USD_PRICE = d.solana.usd;
           return d.solana?.usd || 150;
       })
       .catch(() => 150);

    hasActiveSearch = true;

    const [resScan, resBal, livePrice] = await Promise.all([
       fetch(`/api/scan/${address}`, { headers: { 'Authorization': `Bearer ${activeToken}` } }),
       fetch(`/api/balances/${address}`, { headers: { 'Authorization': `Bearer ${activeToken}` } }),
       priceP
    ]);
    const rxScan = await resScan.json();
    const rxBal = await resBal.json();
    
    if (rxScan.success && rxBal.success) {
      splash.classList.add('hidden');
      resultsContainer.classList.remove('hidden');
      renderDashboard(rxScan.data, rxBal.data, window.SOL_USD_PRICE || livePrice);
    } else {
      throw new Error(rxScan.error || rxBal.error || "Unknown proxy error");
    }
  } catch (err) {
    errorMessage.textContent = err.message || "Failed to connect to scanner.";
    errorMessage.classList.remove('hidden');
  } finally {
    btnText.classList.remove('hidden');
    loader.classList.add('hidden');
    submitBtn.disabled = false;
  }
});

// Phase 15: Client Router (Tabs)
document.addEventListener('DOMContentLoaded', () => {
    const navTabs = document.querySelectorAll('.nav-tab');
    const moduleTabs = document.querySelectorAll('.module-tab');

    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.getAttribute('data-tab');
            
            navTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            moduleTabs.forEach(mod => {
                if (mod.id === target) {
                    mod.classList.remove('hidden');
                    mod.classList.add('active');
                } else {
                    mod.classList.add('hidden');
                    mod.classList.remove('active');
                }
            });
        });
    });
});
