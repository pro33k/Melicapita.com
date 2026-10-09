// =================================================================
// MILEcapita USER SCRIPT — v13.1 (Updated Realtime Sync & Skeleton Reveal)
// =================================================================

import { 
    db, auth,
    doc, setDoc, getDoc, updateDoc, onSnapshot, 
    collection, query, where, getDocs, serverTimestamp, deleteDoc,
    increment, arrayUnion,
    createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from './firebase-config.js';

// =================================================================
// DEFAULT SETTINGS
// =================================================================
const DEFAULT_SETTINGS = {
    welcomeBonus: 3000,
    referralBonus: 500,
    dailyReturnRate: 0.20,
    withdrawalFeeRate: 0.10,
    level1Commission: 0.15,
    minWithdrawal: 7000,
    providers: [
        { number: "0765050916", name: "Kakandefrank", network: "MTN" },
        { number: "0747473704", name: "Mesigwa Amos", network: "Airtel" }
    ]
};

const laptops = [
    { series: 'Classic', price: 15000,  duration: '60 Days',  image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=600&q=80' },
    { series: 'Classic', price: 20000,  duration: '60 Days',  image: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=600&q=80' },
    { series: 'Classic', price: 25000,  duration: '60 Days',  image: 'https://images.unsplash.com/photo-1531297484001-80022131f5a1?auto=format&fit=crop&w=600&q=80' },
    { series: 'Classic', price: 30000,  duration: '60 Days',  image: 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?auto=format&fit=crop&w=600&q=80' },
    { series: 'Power',   price: 35000,  duration: '90 Days',  image: 'https://images.unsplash.com/photo-1593642702821-c8da6771f33a?auto=format&fit=crop&w=600&q=80' },
    { series: 'Power',   price: 40000,  duration: '90 Days',  image: 'https://images.unsplash.com/photo-1603302576837-37561b2e2302?auto=format&fit=crop&w=600&q=80' },
    { series: 'Power',   price: 50000,  duration: '90 Days',  image: 'https://images.unsplash.com/photo-1611078489935-0cb964de46d6?auto=format&fit=crop&w=600&q=80' },
    { series: 'Power',   price: 80000,  duration: '90 Days',  image: 'https://images.unsplash.com/photo-1542393545-10f5cde2c810?auto=format&fit=crop&w=600&q=80' },
    { series: 'Smart',   price: 130000, duration: '120 Days', image: 'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?auto=format&fit=crop&w=600&q=80' },
    { series: 'Smart',   price: 150000, duration: '120 Days', image: 'https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?auto=format&fit=crop&w=600&q=80' },
    { series: 'Smart',   price: 200000, duration: '120 Days', image: 'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?auto=format&fit=crop&w=600&q=80' },
    { series: 'Smart',   price: 250000, duration: '120 Days', image: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=600&q=80' },
    { series: 'Elite',   price: 300000, duration: '180 Days', image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=600&q=80' },
    { series: 'Elite',   price: 500000, duration: '180 Days', image: 'https://images.unsplash.com/photo-1531297484001-80022131f5a1?auto=format&fit=crop&w=600&q=80' },
    { series: 'Elite',   price: 1000000,duration: '180 Days', image: 'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?auto=format&fit=crop&w=600&q=80' }
];

// =================================================================
// STATE
// =================================================================
let CURRENT_USER = {
    uid: null, username: null, email: null, phone: null,
    balance: 0, referralBalance: 0, totalDeposited: 0,
    activeLaptops: [], transactions: [], teamMembers: [],
    createdAt: null, lastEarningPaid: null
};
let SETTINGS = DEFAULT_SETTINGS;
let USER_READY = false;
let CURRENT_NOTIFICATIONS = [];

// =================================================================
// HELPERS
// =================================================================
function formatCurrency(amount) {
    return parseFloat(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function toDate(val) {
    if (!val) return null;
    if (typeof val === 'string') return new Date(val);
    if (typeof val.toDate === 'function') return val.toDate();
    return new Date(val);
}

function formatTxDate(dateVal) {
    const d = toDate(dateVal);
    if (!d || isNaN(d.getTime())) return "—";
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getProviders() { return SETTINGS.providers || DEFAULT_SETTINGS.providers; }
function DAILY_RETURN_RATE()   { return SETTINGS.dailyReturnRate; }
function WITHDRAWAL_FEE_RATE() { return SETTINGS.withdrawalFeeRate; }
function LEVEL_1_COMMISSION()  { return SETTINGS.level1Commission; }
function MIN_WITHDRAWAL()      { return SETTINGS.minWithdrawal; }

// Spent on laptops = only the main balance (referral money is excluded)
function getAvailableBalance() {
    return Math.max(0, CURRENT_USER.balance || 0);
}

// Withdrawable = main balance + referral balance (but only after first deposit)
function getAvailableForWithdrawal() {
    if ((CURRENT_USER.totalDeposited || 0) <= 0) return 0;
    return Math.max(0, (CURRENT_USER.balance || 0) + (CURRENT_USER.referralBalance || 0));
}

function getNetworkBadge(network) {
    if (network === "MTN")    return `<span class="bg-yellow-400 text-yellow-900 text-[10px] font-extrabold px-2 py-0.5 rounded shadow-sm tracking-wide">MTN</span>`;
    if (network === "Airtel") return `<span class="bg-red-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded shadow-sm tracking-wide">Airtel</span>`;
    return `<span class="bg-gray-200 text-gray-700 text-[10px] font-extrabold px-2 py-0.5 rounded shadow-sm tracking-wide">${network || "Unknown"}</span>`;
}

// =================================================================
// FIREBASE SYNC & REVEAL
// =================================================================
function hideSkeletonsAndRevealUI() {
    // Hide skeleton loading elements
    document.querySelectorAll(".skeleton-loader, .skeleton, [data-skeleton]").forEach(el => {
        el.classList.add("hidden");
    });
    // Show hidden loaded elements
    document.querySelectorAll(".dashboard-content, .content-loaded, [data-content]").forEach(el => {
        el.classList.remove("hidden");
    });
    // Trigger window dashboard reveal if configured
    if (typeof window.revealDashboard === 'function') {
        window.revealDashboard();
    }
}

async function loadUserFromFirebase(uid) {
    try {
        const snap = await getDoc(doc(db, "users", uid));
        if (!snap.exists()) return false;
        const data = snap.data();
        CURRENT_USER = {
            uid: uid,
            username: data.username || "User",
            email: data.email || "",
            phone: data.phone || "",
            balance: parseFloat(data.balance) || 0,
            referralBalance: parseFloat(data.referralBalance) || 0,
            totalDeposited: parseFloat(data.totalDeposited) || 0,
            activeLaptops: Array.isArray(data.activeLaptops) ? data.activeLaptops : [],
            transactions: Array.isArray(data.transactions) ? data.transactions : [],
            teamMembers: Array.isArray(data.teamMembers) ? data.teamMembers : [],
            createdAt: data.createdAt || null,
            lastEarningPaid: data.lastEarningPaid || null
        };
        USER_READY = true;
        refreshVisibleBalance();
        hideSkeletonsAndRevealUI();
        return true;
    } catch (error) {
        console.error("Load user error:", error);
        return false;
    }
}

async function saveUserToFirebase() {
    if (!CURRENT_USER.uid) return false;
    try {
        await updateDoc(doc(db, "users", CURRENT_USER.uid), {
            username: CURRENT_USER.username,
            email: CURRENT_USER.email,
            phone: CURRENT_USER.phone,
            balance: CURRENT_USER.balance,
            referralBalance: CURRENT_USER.referralBalance,
            activeLaptops: CURRENT_USER.activeLaptops,
            transactions: CURRENT_USER.transactions,
            teamMembers: CURRENT_USER.teamMembers,
            lastUpdated: serverTimestamp()
        });
        return true;
    } catch (error) {
        console.error("Save user error:", error);
        return false;
    }
}

function startRealtimeSync(uid) {
    onSnapshot(doc(db, "users", uid), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        CURRENT_USER.uid = uid;
        CURRENT_USER.username = data.username || CURRENT_USER.username || "User";
        CURRENT_USER.email = data.email || CURRENT_USER.email || "";
        CURRENT_USER.phone = data.phone || CURRENT_USER.phone || "";
        CURRENT_USER.balance = parseFloat(data.balance) || 0;
        CURRENT_USER.referralBalance = parseFloat(data.referralBalance) || 0;
        CURRENT_USER.totalDeposited = parseFloat(data.totalDeposited) || 0;
        CURRENT_USER.activeLaptops = Array.isArray(data.activeLaptops) ? data.activeLaptops : [];
        CURRENT_USER.transactions = Array.isArray(data.transactions) ? data.transactions : [];
        CURRENT_USER.teamMembers = Array.isArray(data.teamMembers) ? data.teamMembers : [];
        CURRENT_USER.createdAt = data.createdAt || CURRENT_USER.createdAt || null;
        CURRENT_USER.lastEarningPaid = data.lastEarningPaid || null;
        
        USER_READY = true;
        refreshVisibleBalance();

        if (document.getElementById("userFullName")) {
            renderAccountPage();
        }

        if (document.getElementById("teamListContainer") && typeof window.renderTeam === 'function') {
            window.renderTeam();
        }

        hideSkeletonsAndRevealUI();
    }, (error) => {
        console.error("Realtime sync error:", error);
    });
}

// Wallet shows main balance only (referral is separate)
function refreshVisibleBalance() {
    const main = CURRENT_USER.balance || 0;
    document.querySelectorAll("#walletBalance, .dynamic-balance").forEach(el => {
        el.innerText = `UGX ${formatCurrency(main)}`;
    });
    const refEl = document.getElementById("referralBalance");
    if (refEl) refEl.innerText = `UGX ${formatCurrency(CURRENT_USER.referralBalance || 0)}`;
}

// =================================================================
// CATCH-UP DAILY EARNINGS
// =================================================================
async function processCatchUpEarnings() {
    if (!CURRENT_USER.uid) return;
    if (!CURRENT_USER.activeLaptops || CURRENT_USER.activeLaptops.length === 0) {
        if (!CURRENT_USER.lastEarningPaid) {
            try {
                await updateDoc(doc(db, "users", CURRENT_USER.uid), {
                    lastEarningPaid: new Date().toISOString()
                });
            } catch(e) {}
        }
        return;
    }

    const now = new Date();
    const lastPaid = toDate(CURRENT_USER.lastEarningPaid) 
        || toDate(CURRENT_USER.createdAt) 
        || new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const daysSinceLastPay = (now.getTime() - lastPaid.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceLastPay < 0.9) return;

    const dailyRate = DAILY_RETURN_RATE();
    let totalEarnings = 0;
    const newTransactions = [];
    const updatedLaptops = [];

    for (const laptop of CURRENT_USER.activeLaptops) {
        const purchasedAt = toDate(laptop.purchasedAt);
        if (!purchasedAt) continue;
        
        const durationDays = parseInt(laptop.duration) || 60;
        const expiresAt = new Date(purchasedAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

        const effectiveStart = lastPaid > purchasedAt ? lastPaid : purchasedAt;
        const effectiveEnd = now < expiresAt ? now : expiresAt;

        let earnings = 0;
        if (effectiveEnd > effectiveStart) {
            const daysPaid = (effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24);
            earnings = (parseFloat(laptop.price) || 0) * dailyRate * daysPaid;
        }

        if (earnings > 0.01) {
            totalEarnings += earnings;
            newTransactions.push({
                id: "DAILY-" + Date.now() + "-" + Math.floor(Math.random() * 10000),
                type: "Daily Yield",
                amount: earnings,
                date: now.toISOString(),
                status: "Completed",
                note: `From ${laptop.name || "Laptop"}`
            });
        }

        if (now < expiresAt) {
            updatedLaptops.push(laptop);
        }
    }

    const updatePayload = {
        lastEarningPaid: now.toISOString(),
        activeLaptops: updatedLaptops
    };

    if (totalEarnings > 0) {
        updatePayload.balance = increment(totalEarnings);
        updatePayload.transactions = arrayUnion(...newTransactions);
    }

    try {
        await updateDoc(doc(db, "users", CURRENT_USER.uid), updatePayload);
    } catch (e) {
        console.error("Catch-up earnings error:", e);
    }
}

// =================================================================
// NOTIFICATIONS SYSTEM
// =================================================================
async function loadNotifications() {
    if (!CURRENT_USER.uid) return;
    try {
        const snap = await getDocs(collection(db, "notifications"));
        const notifs = [];
        snap.forEach(d => {
            const data = d.data();
            if (data.target === "all" || 
                data.target === CURRENT_USER.username || 
                data.target === CURRENT_USER.uid) {
                notifs.push({ id: d.id, ...data });
            }
        });
        notifs.sort((a, b) => new Date(b.sentAt || 0) - new Date(a.sentAt || 0));
        CURRENT_NOTIFICATIONS = notifs;
        updateNotificationBadge();
    } catch (e) {
        console.error("Failed to load notifications:", e);
    }
}

function getSeenNotifIds() {
    try { return JSON.parse(localStorage.getItem("seenNotifs") || "[]"); }
    catch { return []; }
}

function updateNotificationBadge() {
    const seen = getSeenNotifIds();
    const unread = CURRENT_NOTIFICATIONS.filter(n => !seen.includes(n.id)).length;
    const badge = document.getElementById("notifBadge");
    if (!badge) return;
    if (unread > 0) {
        badge.classList.remove("hidden");
        badge.classList.add("flex");
        badge.innerText = unread > 9 ? "9+" : unread;
    } else {
        badge.classList.add("hidden");
        badge.classList.remove("flex");
    }
}

window.openNotifications = function() {
    const seen = getSeenNotifIds();
    let html = "";
    
    if (CURRENT_NOTIFICATIONS.length === 0) {
        html = `<p class="text-center text-gray-400 text-sm py-6">No notifications yet.</p>`;
    } else {
        CURRENT_NOTIFICATIONS.forEach(n => {
            const isNew = !seen.includes(n.id);
            const typeColors = { info: "border-sky-200 bg-sky-50", success: "border-emerald-200 bg-emerald-50", warning: "border-rose-200 bg-rose-50" };
            const typeDots = { info: "bg-sky-500", success: "bg-emerald-500", warning: "bg-rose-500" };
            const colorClass = typeColors[n.type] || "border-gray-200 bg-gray-50";
            const dotClass = typeDots[n.type] || "bg-gray-400";
            html += `
                <div class="rounded-2xl border ${colorClass} p-3 mb-2 ${isNew ? 'ring-2 ring-tomato/30' : ''}">
                    <div class="flex items-start gap-2">
                        <div class="w-2 h-2 rounded-full ${dotClass} mt-1.5 flex-shrink-0"></div>
                        <div class="flex-1 min-w-0">
                            <div class="flex justify-between items-start gap-2">
                                <p class="text-xs font-bold text-gray-800">${n.title || "Notification"}</p>
                                ${isNew ? `<span class="text-[8px] font-bold text-white bg-tomato px-1.5 py-0.5 rounded-full flex-shrink-0">NEW</span>` : ''}
                            </div>
                            <p class="text-[11px] text-gray-600 mt-1 leading-relaxed">${n.message || ""}</p>
                            <p class="text-[9px] text-gray-400 mt-1.5">${formatTxDate(n.sentAt)}</p>
                        </div>
                    </div>
                </div>
            `;
        });
    }

    window.openModal("Notifications", `<div class="max-h-80 overflow-y-auto no-scrollbar -m-1 p-1">${html}</div>`);
    const allIds = CURRENT_NOTIFICATIONS.map(n => n.id);
    localStorage.setItem("seenNotifs", JSON.stringify(allIds));
    updateNotificationBadge();
};

// =================================================================
// MODAL SYSTEM
// =================================================================
const modalHTML = `
    <div id="actionModal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex items-center justify-center hidden opacity-0 transition-opacity duration-300">
        <div class="bg-white rounded-[2rem] p-6 w-11/12 max-w-sm shadow-2xl transform scale-95 transition-transform duration-300 relative overflow-hidden border border-gray-100" id="modalContainer">
            <div class="flex justify-between items-center mb-5 relative z-10">
                <h3 id="modalTitle" class="text-xl font-bold text-gray-800 tracking-tight"></h3>
                <button id="closeModal" class="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:text-gray-800 hover:bg-gray-200 transition-colors">&times;</button>
            </div>
            <div id="modalBody" class="text-sm text-gray-600 max-h-[75vh] overflow-y-auto no-scrollbar relative z-10"></div>
        </div>
    </div>
`;

function initModalSystem() {
    if (document.getElementById("actionModal")) return;
    document.body.insertAdjacentHTML("beforeend", modalHTML);

    const modal = document.getElementById("actionModal");
    const container = document.getElementById("modalContainer");
    const closeBtn = document.getElementById("closeModal");

    window.openModal = function(title, content) {
        document.getElementById("modalTitle").innerText = title;
        document.getElementById("modalBody").innerHTML = content;
        modal.classList.remove("hidden");
        setTimeout(() => {
            modal.classList.remove("opacity-0");
            container.classList.remove("scale-95");
            container.classList.add("scale-100");
        }, 10);
    };

    window.closeModal = function() {
        modal.classList.add("opacity-0");
        container.classList.remove("scale-100");
        container.classList.add("scale-95");
        setTimeout(() => modal.classList.add("hidden"), 300);
    };

    closeBtn.addEventListener("click", window.closeModal);
    modal.addEventListener("click", (e) => { if (e.target === modal) window.closeModal(); });
}

window.showAlertModal = function(title, message) {
    window.openModal(title || "Alert", `
        <div class="flex flex-col items-center text-center space-y-4 pt-2">
            <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-2 shadow-inner">
                <svg class="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            </div>
            <h3 class="text-lg font-bold text-gray-800">${title || ""}</h3>
            <p class="text-sm text-gray-500 leading-relaxed">${message || ""}</p>
            <button onclick="closeModal()" class="w-full bg-gray-900 text-white font-bold py-3 rounded-2xl text-sm mt-4">OK</button>
        </div>
    `);
};

window.showLoadingModal = function(title = "Please Wait", message = "Loading your account...") {
    window.openModal(title, `
        <div class="flex flex-col items-center justify-center py-10 space-y-5">
            <div class="relative flex items-center justify-center">
                <div class="w-16 h-16 border-4 border-gray-100 rounded-full"></div>
                <div class="absolute w-16 h-16 border-4 border-tomato border-t-transparent rounded-full animate-spin"></div>
            </div>
            <div class="text-center space-y-1">
                <h3 class="text-lg font-bold text-gray-800">${title}</h3>
                <p class="text-xs text-gray-500">${message}</p>
            </div>
        </div>
    `);
};

function showSuccessModal(title, message, amount, txId) {
    window.openModal("Success", `
        <div class="flex flex-col items-center text-center space-y-4 pt-2">
            <div class="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-2 shadow-inner">
                <svg class="w-10 h-10 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
            </div>
            <h3 class="text-xl font-bold text-gray-800">${title || "Success"}</h3>
            <p class="text-sm text-gray-500 leading-relaxed">${message || ""}</p>
            <div class="bg-gray-50 rounded-2xl p-4 w-full space-y-3 border border-gray-100 mt-4 text-left">
                <div class="flex justify-between items-center">
                    <span class="text-xs text-gray-400 font-medium">Amount</span>
                    <span class="font-bold text-gray-800 text-sm">UGX ${formatCurrency(amount)}</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-xs text-gray-400 font-medium">Transaction ID</span>
                    <span class="font-bold text-gray-800 text-sm font-mono bg-gray-200 px-2 py-0.5 rounded">${txId || "—"}</span>
                </div>
            </div>
            <button onclick="closeModal()" class="w-full bg-gray-900 text-white font-bold py-4 rounded-2xl text-sm mt-4">Done</button>
        </div>
    `);
}

// =================================================================
// MAIN INIT
// =================================================================
document.addEventListener("DOMContentLoaded", () => {
    initModalSystem();

    getDoc(doc(db, "settings", "global")).then(snap => {
        if (snap.exists()) SETTINGS = { ...DEFAULT_SETTINGS, ...snap.data() };
    }).catch(() => {});

    const currentPath = window.location.pathname.split("/").pop() || "dashboard.html";
    document.querySelectorAll("nav a").forEach(item => {
        const href = item.getAttribute("href");
        if (href === currentPath) {
            item.classList.remove("text-gray-400");
            item.classList.add("text-tomato", "font-bold");
        } else {
            item.classList.remove("text-tomato");
            item.classList.add("text-gray-400");
        }
        item.addEventListener("click", () => {
            const icon = item.querySelector("svg");
            if (icon) {
                icon.classList.add("animate-bounce-short");
                setTimeout(() => icon.classList.remove("animate-bounce-short"), 400);
            }
        });
    });

    const isAuthPage = () => !!(document.getElementById("loginBtn") || document.getElementById("signupBtn") || document.getElementById("loginForm"));

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const loaded = await loadUserFromFirebase(user.uid);
            startRealtimeSync(user.uid);
            if (loaded || USER_READY) {
                processCatchUpEarnings();
                loadNotifications();
            }
            if (isAuthPage()) window.location.replace("dashboard.html");
        } else {
            USER_READY = false;
            if (!isAuthPage()) window.location.replace("index.html");
        }
    });

    const checkUserLoaded = setInterval(() => {
        if (USER_READY) {
            clearInterval(checkUserLoaded);
            if (document.getElementById("userFullName")) renderAccountPage();
            if (document.getElementById("teamListContainer") && typeof window.renderTeam === 'function') {
                window.renderTeam();
            }
            hideSkeletonsAndRevealUI();
        }
    }, 200);

    // =================================================================
    // DEPOSIT
    // =================================================================
    window.handleDeposit = function() {
        if (!USER_READY || !CURRENT_USER.uid) return showLoadingModal();

        window.openModal("Deposit Funds", `
            <div class="space-y-5">
                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Enter Amount (Min 15,000 UGX)</label>
                    <div class="relative">
                        <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <span class="text-gray-400 font-bold text-sm">UGX</span>
                        </div>
                        <input type="number" id="depositAmount" placeholder="0" min="15000" class="w-full bg-gray-50 text-gray-800 text-lg font-bold rounded-2xl pl-14 pr-4 py-4 border border-gray-200 focus:outline-none focus:border-tomato">
                    </div>
                    <p id="depositError" class="text-red-500 text-[10px] mt-2 hidden font-medium">Minimum deposit is UGX 15,000.</p>
                    <div class="grid grid-cols-2 gap-2 mt-3">
                        <button onclick="setDepositAmount(15000)" class="bg-gray-50 text-gray-600 text-[11px] font-bold py-3 rounded-xl border border-gray-200">UGX 15,000</button>
                        <button onclick="setDepositAmount(20000)" class="bg-gray-50 text-gray-600 text-[11px] font-bold py-3 rounded-xl border border-gray-200">UGX 20,000</button>
                        <button onclick="setDepositAmount(50000)" class="bg-gray-50 text-gray-600 text-[11px] font-bold py-3 rounded-xl border border-gray-200">UGX 50,000</button>
                        <button onclick="setDepositAmount(100000)" class="bg-gray-50 text-gray-600 text-[11px] font-bold py-3 rounded-xl border border-gray-200">UGX 100,000</button>
                    </div>
                </div>
                <button id="proceedDepositBtn" class="w-full bg-gradient-to-r from-[#FF6347] to-[#FF8C6B] text-white font-bold py-4 rounded-2xl shadow-lg text-sm">Proceed to Payment</button>
            </div>
        `);

        document.getElementById("proceedDepositBtn").addEventListener("click", () => {
            const amount = parseFloat(document.getElementById("depositAmount").value);
            const errorEl = document.getElementById("depositError");
            if (!amount || amount < 15000) { errorEl.classList.remove("hidden"); return; }
            errorEl.classList.add("hidden");
            showTransactionStep(amount, 'Deposit');
        });
    };

    window.setDepositAmount = function(amount) {
        document.getElementById("depositAmount").value = amount;
        document.getElementById("depositError").classList.add("hidden");
    };

    // =================================================================
    // WITHDRAW — With Deposit Gate + Dual Pool Deduction
    // =================================================================
    window.handleWithdraw = function() {
        if (!USER_READY || !CURRENT_USER.uid) return showLoadingModal();
        const minW = MIN_WITHDRAWAL();

        // GATE: Require at least one approved deposit
        if ((CURRENT_USER.totalDeposited || 0) <= 0) {
            return window.openModal("Deposit Required", `
                <div class="flex flex-col items-center text-center space-y-4 pt-2">
                    <div class="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mb-2 shadow-inner">
                        <svg class="w-10 h-10 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                    </div>
                    <h3 class="text-lg font-bold text-gray-800">Deposit Required</h3>
                    <p class="text-sm text-gray-500 leading-relaxed px-2">
                        You must make at least one deposit before you can withdraw.
                    </p>
                    <div class="flex space-x-3 w-full mt-4">
                        <button onclick="closeModal()" class="flex-1 bg-gray-100 text-gray-700 font-bold py-3.5 rounded-2xl text-sm hover:bg-gray-200 transition-colors">
                            Cancel
                        </button>
                        <button onclick="closeModal(); setTimeout(handleDeposit, 350);" class="flex-1 bg-gradient-to-r from-[#FF6347] to-[#FF8C6B] text-white font-bold py-3.5 rounded-2xl text-sm shadow-lg shadow-tomato/30">
                            Deposit Now
                        </button>
                    </div>
                </div>
            `);
        }

        const availableForWithdrawal = getAvailableForWithdrawal();

        window.openModal("Withdraw Earnings", `
            <div class="space-y-5">
                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Enter Amount (Min ${formatCurrency(minW)} UGX)</label>
                    <div class="relative">
                        <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <span class="text-gray-400 font-bold text-sm">UGX</span>
                        </div>
                        <input type="number" id="withdrawAmount" placeholder="0" class="w-full bg-gray-50 text-gray-800 text-lg font-bold rounded-2xl pl-14 pr-4 py-4 border border-gray-200">
                    </div>
                    <p class="text-[10px] text-gray-400 mt-2 font-medium">A standard ${(WITHDRAWAL_FEE_RATE()*100)}% fee applies.</p>
                    <div class="bg-blue-50 border border-blue-100 rounded-xl p-3 mt-3 space-y-1">
                        <div class="flex justify-between items-center">
                            <span class="text-[10px] text-blue-700 font-bold">Main Balance</span>
                            <span class="text-xs font-bold text-blue-900">UGX ${formatCurrency(CURRENT_USER.balance || 0)}</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-[10px] text-blue-700 font-bold">Referral Bonus</span>
                            <span class="text-xs font-bold text-blue-900">UGX ${formatCurrency(CURRENT_USER.referralBalance || 0)}</span>
                        </div>
                        <div class="border-t border-blue-200 pt-1 flex justify-between items-center">
                            <span class="text-[10px] text-blue-700 font-extrabold uppercase">Total Withdrawable</span>
                            <span class="text-sm font-extrabold text-blue-900">UGX ${formatCurrency(availableForWithdrawal)}</span>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-2 mt-3">
                        <button onclick="setWithdrawAmount(${minW})" class="bg-gray-50 text-gray-600 text-[11px] font-bold py-3 rounded-xl border border-gray-200">UGX ${formatCurrency(minW)}</button>
                        <button onclick="setWithdrawAmount(15000)" class="bg-gray-50 text-gray-600 text-[11px] font-bold py-3 rounded-xl border border-gray-200">UGX 15,000</button>
                        <button onclick="setWithdrawAmount(50000)" class="bg-gray-50 text-gray-600 text-[11px] font-bold py-3 rounded-xl border border-gray-200">UGX 50,000</button>
                        <button onclick="setWithdrawAmount(100000)" class="bg-gray-50 text-gray-600 text-[11px] font-bold py-3 rounded-xl border border-gray-200">UGX 100,000</button>
                    </div>
                </div>
                <button id="proceedWithdrawBtn" class="w-full bg-gradient-to-r from-[#FF6347] to-[#FF8C6B] text-white font-bold py-4 rounded-2xl shadow-lg text-sm">Proceed to Withdraw</button>
            </div>
        `);

        document.getElementById("proceedWithdrawBtn").addEventListener("click", () => {
            const amount = parseFloat(document.getElementById("withdrawAmount").value);
            if (!amount || amount < minW) return showAlertModal("Minimum Withdrawal", `Minimum is UGX ${formatCurrency(minW)}.`);
            const available = getAvailableForWithdrawal();
            if (amount > available) return showAlertModal("Insufficient Balance", `You have UGX ${formatCurrency(available)} available to withdraw.`);
            showWithdrawDetails(amount);
        });
    };

    window.setWithdrawAmount = function(amount) {
        document.getElementById("withdrawAmount").value = amount;
    };

    function showWithdrawDetails(amount) {
        const fee = amount * WITHDRAWAL_FEE_RATE();
        const receive = amount - fee;
        let selectedNetwork = null;

        window.openModal("Withdrawal Details", `
            <div class="space-y-5">
                <div class="bg-gray-50 rounded-2xl p-5 border border-gray-200">
                    <div class="flex justify-between mb-2"><span class="text-xs text-gray-500">Amount</span><span class="font-bold">UGX ${formatCurrency(amount)}</span></div>
                    <div class="flex justify-between mb-2"><span class="text-xs text-gray-500">Fee (${(WITHDRAWAL_FEE_RATE()*100)}%)</span><span class="font-bold text-red-500">- UGX ${formatCurrency(fee)}</span></div>
                    <div class="border-t pt-2 flex justify-between"><span class="text-xs font-bold uppercase">You Receive</span><span class="font-extrabold text-emerald-600 text-lg">UGX ${formatCurrency(receive)}</span></div>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-3">Select Network</label>
                    <div class="grid grid-cols-2 gap-3">
                        <button onclick="selectNet('MTN')" id="net-MTN" class="net-btn bg-gray-50 border-2 border-gray-200 rounded-2xl p-4 flex flex-col items-center gap-2">
                            <span class="bg-yellow-400 text-yellow-900 text-[12px] font-extrabold px-3 py-1 rounded">MTN</span>
                            <span class="text-[10px] text-gray-500">Mobile Money</span>
                        </button>
                        <button onclick="selectNet('Airtel')" id="net-Airtel" class="net-btn bg-gray-50 border-2 border-gray-200 rounded-2xl p-4 flex flex-col items-center gap-2">
                            <span class="bg-red-500 text-white text-[12px] font-extrabold px-3 py-1 rounded">Airtel</span>
                            <span class="text-[10px] text-gray-500">Mobile Money</span>
                        </button>
                    </div>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Receiving Number</label>
                    <input type="tel" id="wPhone" placeholder="e.g. 0765 050 916" class="w-full bg-gray-50 rounded-2xl p-4 border border-gray-200 text-sm font-mono" />
                </div>
                <button id="confirmWBtn" class="w-full bg-gradient-to-r from-[#FF6347] to-[#FF8C6B] text-white font-bold py-4 rounded-2xl shadow-lg text-sm opacity-50 cursor-not-allowed" disabled>Confirm Withdrawal</button>
            </div>
        `);

        window.selectNet = function(n) {
            selectedNetwork = n;
            document.querySelectorAll('.net-btn').forEach(b => {
                b.classList.remove('border-yellow-400', 'border-red-500', 'bg-yellow-50', 'bg-red-50');
                b.classList.add('border-gray-200', 'bg-gray-50');
            });
            const btn = document.getElementById(`net-${n}`);
            btn.classList.remove('border-gray-200', 'bg-gray-50');
            btn.classList.add(n === 'MTN' ? 'border-yellow-400' : 'border-red-500');
            btn.classList.add(n === 'MTN' ? 'bg-yellow-50' : 'bg-red-50');
            checkForm();
        };

        function checkForm() {
            const p = document.getElementById('wPhone').value.trim();
            const btn = document.getElementById('confirmWBtn');
            if (selectedNetwork && p.length > 9) {
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
            } else {
                btn.disabled = true;
                btn.classList.add('opacity-50', 'cursor-not-allowed');
            }
        }
        document.getElementById('wPhone').addEventListener('input', checkForm);

        document.getElementById('confirmWBtn').addEventListener('click', async function() {
            const phone = document.getElementById('wPhone').value.trim();
            if (!selectedNetwork || phone.length < 10) return;
            this.disabled = true;
            this.innerText = "Submitting...";

            const txId = "WTH-" + Math.random().toString(36).substring(2, 8).toUpperCase();
            
            // Backup for rollback
            const previousBalance = CURRENT_USER.balance;
            const previousRefBalance = CURRENT_USER.referralBalance;
            const previousTransactions = [...CURRENT_USER.transactions];

            // Deduct from balance first, then from referralBalance
            let remaining = amount;
            let newBalance = CURRENT_USER.balance || 0;
            let newRefBalance = CURRENT_USER.referralBalance || 0;

            if (newBalance >= remaining) {
                newBalance -= remaining;
                remaining = 0;
            } else {
                remaining -= newBalance;
                newBalance = 0;
                newRefBalance -= remaining;
            }

            CURRENT_USER.balance = newBalance;
            CURRENT_USER.referralBalance = newRefBalance;
            CURRENT_USER.transactions.unshift({
                id: txId, type: "Withdrawal", amount,
                date: new Date().toISOString(),
                status: "Pending", phone, network: selectedNetwork
            });

            const saved = await saveUserToFirebase();
            if (saved) {
                refreshVisibleBalance();
                showSuccessModal("Withdrawal Submitted", `Withdrawal to ${selectedNetwork} pending approval.`, formatCurrency(amount), txId);
            } else {
                CURRENT_USER.balance = previousBalance;
                CURRENT_USER.referralBalance = previousRefBalance;
                CURRENT_USER.transactions = previousTransactions;
                showAlertModal("Error", "Could not save withdrawal.");
            }
        });
    }

    // =================================================================
    // SHARED TRANSACTION STEP (Deposit)
    // =================================================================
    function showTransactionStep(amount, actionType) {
        const formatted = formatCurrency(amount);
        const providers = getProviders();

        window.openModal(`${actionType} Details`, `
            <div class="space-y-5">
                <div class="bg-gray-50 rounded-2xl p-5 text-center border border-gray-200">
                    <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">Amount</p>
                    <p class="text-3xl font-extrabold text-tomato">UGX ${formatted}</p>
                </div>
                <div class="space-y-3">
                    <p class="text-xs text-gray-500 font-medium">Send to:</p>
                    ${providers.map(p => `
                        <div class="flex items-center justify-between bg-gray-50 p-4 rounded-2xl border border-gray-200">
                            <div>
                                <div class="flex items-center gap-2">
                                    ${getNetworkBadge(p.network)}
                                    <p class="text-gray-800 font-mono font-bold text-lg">${p.number}</p>
                                </div>
                                <p class="text-[11px] text-gray-500 mt-0.5">${p.name}</p>
                            </div>
                            <button class="copy-btn bg-tomato text-white text-xs font-bold px-4 py-2.5 rounded-xl" data-copy="${p.number}">Copy</button>
                        </div>
                    `).join('')}
                </div>
                <div>
                    <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">Transaction ID</p>
                    <input type="text" id="txIdInput" placeholder="Paste Transaction ID" class="w-full bg-gray-50 rounded-2xl p-4 border border-gray-200 text-sm font-mono" />
                </div>
                <button id="submitTxBtn" class="w-full bg-gradient-to-r from-[#FF6347] to-[#FF8C6B] text-white font-bold py-4 rounded-2xl shadow-lg text-sm">Confirm ${actionType}</button>
            </div>
        `);

        document.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                navigator.clipboard.writeText(e.target.getAttribute('data-copy'));
                const t = e.target.innerText;
                e.target.innerText = "Copied!";
                setTimeout(() => e.target.innerText = t, 1500);
            });
        });

        document.getElementById('submitTxBtn').addEventListener('click', async function() {
            const txId = document.getElementById('txIdInput').value.trim();
            if (!txId) return showAlertModal("Missing Information", "Please enter the Transaction ID.");
            this.disabled = true;
            this.innerText = "Submitting...";

            const previousTransactions = [...CURRENT_USER.transactions];
            CURRENT_USER.transactions.unshift({
                id: txId, type: "Deposit", amount,
                date: new Date().toISOString(),
                status: "Pending"
            });

            const saved = await saveUserToFirebase();
            if (saved) {
                showSuccessModal("Deposit Submitted", "Pending admin approval.", formatted, txId);
            } else {
                CURRENT_USER.transactions = previousTransactions;
                showAlertModal("Error", "Could not save deposit.");
            }
        });
    }

    // =================================================================
    // EARNINGS / SUPPORT / INVITE / HISTORY / VIP
    // =================================================================
    window.handleEarnings = function() {
        let daily = 0;
        (CURRENT_USER.activeLaptops || []).forEach(l => { daily += (parseFloat(l.price) || 0) * DAILY_RETURN_RATE(); });
        window.openModal("Earnings Overview", `
            <div class="space-y-3">
                <div class="flex justify-between bg-gray-50 p-4 rounded-xl border border-gray-200"><span class="text-gray-500 text-xs font-medium">Daily Return:</span><span class="text-emerald-600 font-bold text-lg">UGX ${formatCurrency(daily)}</span></div>
                <div class="flex justify-between bg-gray-50 p-4 rounded-xl border border-gray-200"><span class="text-gray-500 text-xs font-medium">Active Laptops:</span><span class="text-gray-800 font-bold text-lg">${(CURRENT_USER.activeLaptops || []).length}</span></div>
                <div class="flex justify-between bg-gray-50 p-4 rounded-xl border border-gray-200"><span class="text-gray-500 text-xs font-medium">Referral Bonus:</span><span class="text-purple-600 font-bold text-lg">UGX ${formatCurrency(CURRENT_USER.referralBalance || 0)}</span></div>
            </div>
        `);
    };

    window.handleSupport = function() {
        window.openModal("Customer Support", `
            <div class="space-y-4 text-center">
                <p class="text-xs text-gray-500 mb-4">Need help? Connect with our team.</p>
                <button onclick="window.open('https://wa.me/256765050916', '_blank')" class="w-full bg-emerald-600 text-white font-bold py-4 rounded-xl text-sm">Message Frank pro on WhatsApp</button>
            </div>
        `);
    };

    window.handleInvite = function() {
        const refLink = window.location.origin + "/index.html?ref=" + (CURRENT_USER.username || "user");
        navigator.clipboard.writeText(refLink);
        window.openModal("Invite Friends", `
            <div class="space-y-4 text-center">
                <p class="text-xs text-gray-500">Earn ${(LEVEL_1_COMMISSION()*100)}% Level 1 commission!</p>
                <div class="bg-gray-50 p-4 rounded-xl text-sm text-tomato font-mono break-all border border-gray-200">${refLink}</div>
                <p class="text-[10px] text-emerald-600 font-bold">✓ Link copied!</p>
            </div>
        `);
    };

    window.handleHistory = function() {
        const txs = CURRENT_USER.transactions || [];
        let html = '';
        if (txs.length === 0) html = `<p class="text-center text-gray-400 text-sm py-4">No transactions yet.</p>`;
        else txs.forEach(tx => {
            const isDebit = tx.type === 'Withdrawal' || tx.type === 'Purchase';
            const amountColor = isDebit ? 'text-tomato' : 'text-emerald-600';
            const sign = isDebit ? '-' : '+';
            const typeColor = tx.type === 'Deposit' ? 'bg-emerald-100 text-emerald-700' :
                              tx.type === 'Withdrawal' ? 'bg-red-100 text-red-700' :
                              tx.type === 'Purchase' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700';
            html += `
                <div class="flex justify-between items-center bg-gray-50 p-3.5 rounded-xl text-xs border border-gray-200 mb-2">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="text-gray-800 font-bold text-sm">${tx.type}</span>
                            <span class="${typeColor} text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">${tx.status}</span>
                        </div>
                        <p class="text-[10px] text-gray-400 mt-1">${formatTxDate(tx.date)} • ${tx.id}</p>
                    </div>
                    <span class="${amountColor} font-bold text-sm">${sign}UGX ${formatCurrency(tx.amount)}</span>
                </div>
            `;
        });
        window.openModal("Transaction History", `<div class="space-y-2 max-h-72 overflow-y-auto pr-1 no-scrollbar">${html}</div>`);
    };

    window.handleVIP = function() {
        window.openModal("VIP Status", `
            <div class="space-y-4 text-center py-6">
                <h3 class="text-xl font-bold text-gray-800">VIP Program</h3>
                <p class="text-sm text-gray-500 font-bold text-tomato bg-tomato-light inline-block px-4 py-1.5 rounded-full mt-2">Coming Soon</p>
            </div>
        `);
    };

    // =================================================================
    // LAPTOP STORE
    // =================================================================
    const gridContainer = document.getElementById("laptopGrid");
    if (gridContainer) {
        window.renderLaptops = function(seriesFilter) {
            gridContainer.innerHTML = "";
            laptops.filter(l => l.series === seriesFilter).forEach((laptop, index) => {
                const formattedPrice = formatCurrency(laptop.price);
                const dailyReturn = laptop.price * DAILY_RETURN_RATE();
                const formattedDaily = formatCurrency(dailyReturn);
                const durationDays = parseInt(laptop.duration.split(' ')[0]);
                const totalReturn = dailyReturn * durationDays;
                const netProfit = totalReturn - laptop.price;
                const roiPercent = Math.round((netProfit / laptop.price) * 100);

                let badgeHTML = '', badgeStyle = '';
                if (index === 0) { badgeStyle = 'from-[#FF6347] to-[#FF8C6B]'; badgeHTML = `🔥 HOT`; }
                else if (index === 1) { badgeStyle = 'from-purple-500 to-purple-400'; badgeHTML = `⭐ POPULAR`; }
                else if (index === 2) { badgeStyle = 'from-emerald-500 to-emerald-400'; badgeHTML = `💎 BEST`; }

                gridContainer.insertAdjacentHTML("beforeend", `
                    <div class="bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-gray-100 overflow-hidden relative flex flex-col mb-4 transform transition-transform hover:scale-[1.01]">
                        <div class="w-full h-52 bg-slate-50 relative overflow-hidden">
                            <img src="${laptop.image}" class="w-full h-full object-cover">
                            <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                            <div class="absolute top-4 right-4 bg-white/95 backdrop-blur-sm border border-emerald-100 text-emerald-600 text-[10px] font-extrabold px-3 py-1.5 rounded-full shadow-sm z-20">
                                +${roiPercent}% ROI
                            </div>
                            <div class="absolute bottom-4 left-4 flex items-center gap-2 z-20">
                                <span class="bg-white/90 backdrop-blur-sm text-gray-800 text-[10px] font-extrabold px-3 py-1 rounded-full shadow-sm">
                                    ${laptop.series} Series
                                </span>
                                ${badgeHTML ? `<span class="bg-gradient-to-r ${badgeStyle} text-white text-[9px] font-extrabold px-2.5 py-1 rounded-full shadow-sm">${badgeHTML}</span>` : ''}
                            </div>
                        </div>
                        <div class="p-5">
                            <div class="grid grid-cols-2 gap-3 mb-5">
                                <div class="bg-[#e6f4ea] rounded-2xl p-3 text-center border border-emerald-100/50">
                                    <p class="text-[9px] text-emerald-700 font-extrabold uppercase tracking-wider mb-1">Price</p>
                                    <p class="text-[13px] font-extrabold text-gray-800">UGX ${formattedPrice}</p>
                                </div>
                                <div class="bg-[#e6f4ea] rounded-2xl p-3 text-center border border-emerald-100/50">
                                    <p class="text-[9px] text-emerald-700 font-extrabold uppercase tracking-wider mb-1">Days</p>
                                    <p class="text-[13px] font-extrabold text-gray-800">${durationDays}</p>
                                </div>
                                <div class="bg-[#e6f4ea] rounded-2xl p-3 text-center border border-emerald-100/50">
                                    <p class="text-[9px] text-emerald-700 font-extrabold uppercase tracking-wider mb-1">Daily</p>
                                    <p class="text-[13px] font-extrabold text-gray-800">UGX ${formattedDaily}</p>
                                </div>
                                <div class="bg-[#fce8e6] rounded-2xl p-3 text-center border border-orange-100/50">
                                    <p class="text-[9px] text-orange-600 font-extrabold uppercase tracking-wider mb-1">Total</p>
                                    <p class="text-[13px] font-extrabold text-gray-800">UGX ${formatCurrency(totalReturn)}</p>
                                </div>
                            </div>
                            <button onclick="handlePurchase('${laptop.series} Series', ${laptop.price}, ${durationDays})" class="w-full bg-gradient-to-r from-[#FF416C] to-[#FF4B2B] text-white text-sm font-extrabold py-4 rounded-2xl shadow-lg shadow-red-500/20 transform active:scale-95 transition-transform">
                                Buy Now
                            </button>
                        </div>
                    </div>
                `);
            });
        };
        window.switchTab = function(series) {
            ['Classic', 'Power', 'Smart', 'Elite'].forEach(s => {
                const tab = document.getElementById(`tab-${s}`);
                if (!tab) return;
                if (s === series) { tab.classList.add("bg-tomato", "text-white"); tab.classList.remove("text-gray-700"); }
                else { tab.classList.remove("bg-tomato", "text-white"); tab.classList.add("text-gray-700"); }
            });
            renderLaptops(series);
        };
        renderLaptops('Classic');
        hideSkeletonsAndRevealUI();
    }

    // =================================================================
    // INSTANT PURCHASE — Uses only main balance (referral excluded)
    // =================================================================
    window.handlePurchase = async function(productName, price, durationDays = 60) {
        if (!USER_READY || !CURRENT_USER.uid) {
            return showLoadingModal();
        }
        if (!productName || !price || isNaN(price)) {
            return showAlertModal("Error", "Invalid product. Please try again.");
        }

        await loadUserFromFirebase(CURRENT_USER.uid);
        const userBalance = parseFloat(CURRENT_USER.balance) || 0;

        if (userBalance < price) {
            const shortfall = price - userBalance;
            const referralHint = (CURRENT_USER.referralBalance || 0) > 0
                ? `<p class="text-[10px] text-amber-600 font-bold mt-2 text-center">Note: Your referral bonus (UGX ${formatCurrency(CURRENT_USER.referralBalance)}) cannot be used for purchases.</p>`
                : '';
            return window.openModal("Insufficient Balance", `
                <div class="flex flex-col items-center text-center space-y-4 pt-2">
                    <div class="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mb-2 shadow-inner">
                        <svg class="w-10 h-10 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                        </svg>
                    </div>
                    <h3 class="text-lg font-bold text-gray-800">Insufficient Balance</h3>
                    <p class="text-sm text-gray-500 leading-relaxed px-2">
                        You need <b class="text-tomato">UGX ${formatCurrency(price)}</b> to purchase this laptop,
                        but your main balance is only
                        <b class="text-gray-800">UGX ${formatCurrency(userBalance)}</b>.
                    </p>
                    <div class="bg-yellow-50 border border-yellow-100 rounded-2xl p-3 w-full mt-2">
                        <p class="text-[10px] text-yellow-700 font-bold uppercase tracking-wider mb-1">Shortfall</p>
                        <p class="text-base font-extrabold text-yellow-800">UGX ${formatCurrency(shortfall)}</p>
                    </div>
                    ${referralHint}
                    <div class="flex space-x-3 w-full mt-4">
                        <button onclick="closeModal()" class="flex-1 bg-gray-100 text-gray-700 font-bold py-3.5 rounded-2xl text-sm hover:bg-gray-200 transition-colors">
                            Later
                        </button>
                        <button onclick="closeModal(); setTimeout(handleDeposit, 350);" class="flex-1 bg-gradient-to-r from-[#FF6347] to-[#FF8C6B] text-white font-bold py-3.5 rounded-2xl text-sm shadow-lg shadow-tomato/30">
                            Deposit Now
                        </button>
                    </div>
                </div>
            `);
        }

        window.openModal("Confirm Purchase", `
            <div class="flex flex-col items-center text-center space-y-4 pt-2">
                <div class="w-20 h-20 bg-tomato/10 rounded-full flex items-center justify-center mb-2">
                    <svg class="w-10 h-10 text-tomato" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                    </svg>
                </div>
                <h3 class="text-lg font-bold text-gray-800">Confirm Purchase</h3>
                <p class="text-sm text-gray-500 leading-relaxed px-3">
                    You are about to purchase the
                    <b class="text-gray-800">${productName}</b> for
                    <b class="text-tomato">UGX ${formatCurrency(price)}</b>.
                </p>
                <div class="bg-gray-50 rounded-2xl p-4 w-full border border-gray-200 mt-3 space-y-2.5 text-left">
                    <div class="flex justify-between items-center">
                        <span class="text-[11px] text-gray-400 font-medium">Current Balance</span>
                        <span class="font-bold text-gray-800 text-xs">UGX ${formatCurrency(userBalance)}</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-[11px] text-gray-400 font-medium">Purchase Price</span>
                        <span class="font-bold text-tomato text-xs">- UGX ${formatCurrency(price)}</span>
                    </div>
                    <div class="border-t border-dashed border-gray-200"></div>
                    <div class="flex justify-between items-center">
                        <span class="text-[11px] text-gray-400 font-bold uppercase">New Balance</span>
                        <span class="font-extrabold text-emerald-600 text-sm">UGX ${formatCurrency(userBalance - price)}</span>
                    </div>
                </div>
                <p class="text-[10px] text-gray-400 mt-1 leading-relaxed">
                    Payment will be deducted instantly from your main balance.
                </p>
                <div class="flex space-x-3 w-full mt-4">
                    <button onclick="closeModal()" class="flex-1 bg-gray-100 text-gray-700 font-bold py-3.5 rounded-2xl text-sm hover:bg-gray-200 transition-colors">
                        Cancel
                    </button>
                    <button id="confirmPurchaseBtn" class="flex-1 bg-gradient-to-r from-[#FF6347] to-[#FF8C6B] text-white font-bold py-3.5 rounded-2xl text-sm shadow-lg shadow-tomato/30 flex justify-center items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>
                        Buy Now
                    </button>
                </div>
            </div>
        `);

        document.getElementById('confirmPurchaseBtn').addEventListener('click', async function() {
            this.disabled = true;
            this.classList.add("opacity-80", "cursor-not-allowed");
            this.innerHTML = `
                <svg class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
            `;

            const latestBalance = parseFloat(CURRENT_USER.balance) || 0;
            if (latestBalance < price) {
                this.disabled = false;
                this.innerText = "Buy Now";
                return showAlertModal("Insufficient Balance", "Your balance has changed. Please refresh and try again.");
            }

            const txId = "BUY-" + Math.random().toString(36).substring(2, 8).toUpperCase();
            const previousBalance = CURRENT_USER.balance;
            const previousLaptops = [...CURRENT_USER.activeLaptops];
            const previousTransactions = [...CURRENT_USER.transactions];

            CURRENT_USER.balance = latestBalance - price;
            CURRENT_USER.activeLaptops.push({
                name: productName,
                price: price,
                duration: durationDays,
                purchasedAt: new Date().toISOString(),
                status: "Active"
            });
            CURRENT_USER.transactions.unshift({
                id: txId,
                type: "Purchase",
                amount: price,
                date: new Date().toISOString(),
                status: "Completed",
                product: productName
            });

            const saved = await saveUserToFirebase();

            if (saved) {
                refreshVisibleBalance();
                showThankYouModal(productName, price, txId);
            } else {
                CURRENT_USER.balance = previousBalance;
                CURRENT_USER.activeLaptops = previousLaptops;
                CURRENT_USER.transactions = previousTransactions;
                showAlertModal("Error", "Could not complete your purchase. Please try again.");
            }
        });
    };

    // =================================================================
    // THANK YOU MODAL
    // =================================================================
    function showThankYouModal(productName, price, txId) {
        window.openModal("Success", `
            <div class="flex flex-col items-center text-center space-y-4 pt-2">
                <div class="relative">
                    <div class="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center shadow-inner">
                        <svg class="w-12 h-12 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
                        </svg>
                    </div>
                    <span class="absolute -top-1 -left-1 text-xl">✨</span>
                    <span class="absolute -top-2 right-0 text-lg">🎉</span>
                    <span class="absolute -bottom-1 -right-2 text-xl">✨</span>
                </div>
                <h3 class="text-xl font-extrabold text-gray-800 mt-2">Thank You!</h3>
                <p class="text-sm text-gray-500 leading-relaxed px-3">
                    You've successfully purchased the
                    <b class="text-tomato">${productName}</b>.
                </p>
                <div class="bg-gray-50 rounded-2xl p-4 w-full border border-gray-100 text-left mt-3 space-y-2.5">
                    <div class="flex justify-between items-center">
                        <span class="text-[11px] text-gray-400 font-medium">Product</span>
                        <span class="font-bold text-gray-800 text-xs text-right">${productName}</span>
                    </div>
                    <div class="border-t border-dashed border-gray-200"></div>
                    <div class="flex justify-between items-center">
                        <span class="text-[11px] text-gray-400 font-medium">Amount Paid</span>
                        <span class="font-bold text-tomato text-sm">UGX ${formatCurrency(price)}</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-[11px] text-gray-400 font-medium">Transaction ID</span>
                        <span class="font-bold text-gray-800 text-[11px] font-mono bg-gray-200 px-2 py-0.5 rounded">${txId}</span>
                    </div>
                    <div class="border-t border-dashed border-gray-200"></div>
                    <div class="flex justify-between items-center">
                        <span class="text-[11px] text-gray-400 font-medium">Status</span>
                        <span class="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Activated</span>
                    </div>
                </div>
                <p class="text-[10px] text-gray-400 mt-1 leading-relaxed">
                    Your laptop is now active and will start earning daily returns.
                </p>
                <button onclick="closeModal()" class="w-full bg-gradient-to-r from-[#FF6347] to-[#FF8C6B] text-white font-bold py-4 rounded-2xl text-sm mt-3 shadow-lg shadow-tomato/30 transform active:scale-95">
                    Continue
                </button>
            </div>
        `);
    }

    // =================================================================
    // TEAM PAGE
    // =================================================================
    const teamListContainer = document.getElementById("teamListContainer");
    if (teamListContainer) {
        window.renderTeam = function() {
            const members = CURRENT_USER.teamMembers || [];
            let totalIncome = 0, totalCommission = 0;
            members.forEach(m => {
                totalIncome += (parseFloat(m.earned) || 0);
                if (m.level === 1) totalCommission += (parseFloat(m.earned) || 0) * LEVEL_1_COMMISSION();
            });
            document.getElementById("totalTeamSize").innerText = `${members.length} Members`;
            document.getElementById("teamIncome").innerText = `UGX ${formatCurrency(totalIncome)}`;
            document.getElementById("totalCommission").innerText = `UGX ${formatCurrency(totalCommission)}`;
            teamListContainer.innerHTML = "";
            if (members.length === 0) {
                teamListContainer.innerHTML = `
                    <div class="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center">
                        <h4 class="font-bold text-gray-800 mb-1">No Team Members Yet</h4>
                        <p class="text-xs text-gray-500 mb-4">Invite friends to start earning!</p>
                        <button onclick="handleInvite()" class="bg-tomato text-white text-xs font-bold px-6 py-2.5 rounded-xl">Invite Now</button>
                    </div>`;
            } else {
                members.forEach(m => {
                    const name = m.name || "Unknown";
                    const initials = name.split(" ").map(n => n[0]).join("").toUpperCase();
                    teamListContainer.insertAdjacentHTML("beforeend", `
                        <div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
                            <div class="flex items-center space-x-3">
                                <div class="w-10 h-10 bg-tomato-light rounded-full flex items-center justify-center">
                                    <span class="text-tomato font-bold text-sm">${initials}</span>
                                </div>
                                <div>
                                    <h4 class="font-bold text-sm text-gray-800">${name}</h4>
                                    <p class="text-[10px] text-gray-500">Level ${m.level || 1} • Joined ${formatTxDate(m.joined)}</p>
                                </div>
                            </div>
                            <div class="text-right">
                                <p class="text-[10px] text-gray-400">Earned</p>
                                <p class="text-xs font-bold text-emerald-600">+UGX ${formatCurrency(m.earned || 0)}</p>
                            </div>
                        </div>
                    `);
                });
            }
        };
        renderTeam();
        hideSkeletonsAndRevealUI();
    }
});

// =================================================================
// ACCOUNT PAGE RENDER
// =================================================================
function renderAccountPage() {
    const accountPageName = document.getElementById("userFullName");
    if (!accountPageName) return;

    accountPageName.innerText = CURRENT_USER.username || "User";
    const emailEl = document.getElementById("userEmail");
    if (emailEl) emailEl.innerText = CURRENT_USER.email || "—";
    refreshVisibleBalance();

    const earningsEl = document.getElementById("totalEarnings");
    if (earningsEl) {
        let earnings = 0;
        (CURRENT_USER.activeLaptops || []).forEach(l => earnings += (parseFloat(l.price) || 0) * DAILY_RETURN_RATE());
        earningsEl.innerText = `UGX ${formatCurrency(earnings)}`;
    }

    window.showPersonalInfo = function() {
        window.openModal("Personal Information", `
            <div class="space-y-4">
                <div class="bg-gray-50 rounded-2xl p-4 border border-gray-200">
                    <p class="text-[10px] text-gray-400 font-bold uppercase mb-1">Username</p>
                    <p class="text-sm font-bold text-gray-800">${CURRENT_USER.username || "—"}</p>
                </div>
                <div class="bg-gray-50 rounded-2xl p-4 border border-gray-200">
                    <p class="text-[10px] text-gray-400 font-bold uppercase mb-1">Email</p>
                    <p class="text-sm font-bold text-gray-800">${CURRENT_USER.email || "—"}</p>
                </div>
                <div class="bg-gray-50 rounded-2xl p-4 border border-gray-200">
                    <p class="text-[10px] text-gray-400 font-bold uppercase mb-1">Phone</p>
                    <p class="text-sm font-bold text-gray-800">${CURRENT_USER.phone || "—"}</p>
                </div>
            </div>
        `);
    };
    window.showSecurity = function() {
        window.openModal("Security", `<div class="text-center"><button onclick="handleSupport()" class="w-full bg-emerald-600 text-white font-bold py-3 rounded-xl text-sm">Contact Support</button></div>`);
    };
    window.showPaymentMethods = function() {
        const providers = getProviders();
        window.openModal("Payment Methods", `
            <div class="space-y-4">
                ${providers.map(p => `
                    <div class="flex items-center justify-between bg-gray-50 p-4 rounded-2xl border border-gray-200">
                        <div>
                            <div class="flex items-center gap-2">${getNetworkBadge(p.network)}<p class="text-gray-800 font-mono font-bold text-lg">${p.number}</p></div>
                            <p class="text-[11px] text-gray-500 mt-0.5">${p.name}</p>
                        </div>
                        <button class="copy-btn bg-tomato text-white text-xs font-bold px-4 py-2.5 rounded-xl" data-copy="${p.number}">Copy</button>
                    </div>
                `).join('')}
            </div>
        `);
        document.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                navigator.clipboard.writeText(e.target.getAttribute('data-copy'));
                e.target.innerText = "Copied!";
                setTimeout(() => e.target.innerText = "Copy", 1500);
            });
        });
    };
    window.showNotifications = function() { window.openNotifications(); };
    window.showTerms = function() { window.openModal("Terms", "<p class='text-xs text-gray-500'>Standard terms apply.</p>"); };
    window.showPrivacy = function() { window.openModal("Privacy", "<p class='text-xs text-gray-500'>Your data is secure.</p>"); };
    window.handleLogout = function() {
        window.openModal("Confirm Logout", `
            <div class="flex flex-col items-center text-center space-y-4 pt-2">
                <div class="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-2 shadow-inner">
                    <svg class="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                </div>
                <h3 class="text-xl font-bold text-gray-800">Log Out?</h3>
                <p class="text-sm text-gray-500 leading-relaxed">Are you sure you want to log out of your Milecapita account?</p>
                <div class="flex space-x-3 w-full mt-6">
                    <button onclick="closeModal()" class="flex-1 bg-gray-100 text-gray-700 font-bold py-3.5 rounded-2xl text-sm">Cancel</button>
                    <button onclick="confirmLogout()" class="flex-1 bg-gradient-to-r from-red-500 to-red-600 text-white font-bold py-3.5 rounded-2xl text-sm shadow-lg">Log Out</button>
                </div>
            </div>
        `);
    };
    window.confirmLogout = async function() {
        try { await signOut(auth); } catch(e) { console.error(e); }
        window.location.replace("index.html");
    };
}
