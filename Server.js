const express = require('express');
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
const bcrypt = require('bcryptjs'); // npm install bcryptjs

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if(req.method==='OPTIONS') return res.status(200).end();
  next();
});

// ==========================================
// 🔐 ADMIN CREDENTIALS - Keep in server.js (secure) + Database fallback
// ==========================================
// Generate hash: node -e "console.log(require('bcryptjs').hashSync('YourStrongPass123!',10))"

// Option 1: Hardcoded in server.js - most secure, never sent to browser
const SERVER_ADMINS = [
  { username: "frank_admin", hash: "$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi" }, // password: password
  // Add more: { username: "amos_admin", hash: "...." }
];

// Verify Firebase token
async function verifyAdminToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader ||!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing token' });
  }
  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, error: 'Invalid token: ' + e.message });
  }
}

app.get('/', (req,res)=>{
  res.json({ status: '✅ Milecapita Backend LIVE - 15% Referral Enabled', version: 'milecapita-15pct-secure', admins: SERVER_ADMINS.length });
});

// ==========================================
// 🔐 SECURE ADMIN LOGIN - server.js + DB
// ==========================================
app.post('/api/admin/login', async (req,res)=>{
  try{
    const { username, password } = req.body;
    if(!username||!password) return res.status(400).json({success:false, error:'Missing username/password'});

    let valid = false;

    // 1. Check server.js hardcoded admins (most secure)
    for(const adm of SERVER_ADMINS){
      if(adm.username===username && await bcrypt.compare(password, adm.hash)){
        valid=true; break;
      }
    }

    // 2. Check Database settings/adminCreds (flexible - you can change without redeploy)
    if(!valid){
      try{
        const snap = await db.collection('settings').doc('adminCreds').get();
        if(snap.exists){
          const data=snap.data();
          if(data.passwordHash){
            if(data.username===username && await bcrypt.compare(password, data.passwordHash)) valid=true;
          }else if(data.password){
            // Plain text fallback (old) - then auto-upgrade to hash
            if(data.username===username && data.password===password){
              valid=true;
              // Auto-upgrade to hash
              const newHash = await bcrypt.hash(password, 10);
              await db.collection('settings').doc('adminCreds').update({ passwordHash: newHash, password: admin.firestore.FieldValue.delete() });
            }
          }
        }
      }catch(e){ console.log("DB admin check failed",e.message); }
    }

    if(valid){
      // Generate simple session token (for your admin.html)
      const sessionToken = Buffer.from(`${username}:${Date.now()}:${Math.random()}`).toString('base64');
      // Store session in Firestore for verification
      await db.collection('adminSessions').doc(sessionToken).set({ username, createdAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt: Date.now()+ 30*60*1000 });
      return res.json({success:true, token:sessionToken, username, message:'Admin login OK'});
    }else{
      return res.status(401).json({success:false, error:'Invalid admin credentials'});
    }
  }catch(e){ console.error(e); res.status(500).json({success:false, error:e.message}); }
});

// ==========================================
// MILECAPITA APPROVE - with 15%
// ==========================================
app.post('/api/admin/approve-deposit', verifyAdminToken, async (req,res)=>{
  try{
    const { uid, txId } = req.body;
    if(!uid||!txId) return res.status(400).json({success:false, error:'uid and txId required'});
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    if(!userDoc.exists) return res.status(404).json({success:false, error:'User not found'});
    const userData = userDoc.data();
    const txs = userData.transactions || [];
    const txIndex = txs.findIndex(t=>t.id===txId);
    if(txIndex===-1) return res.status(404).json({success:false, error:'Tx not found'});
    if(txs[txIndex].status==='Completed') return res.status(400).json({success:false, error:'Already approved'});

    txs[txIndex].status='Completed';
    let newBal = (userData.balance||0) + (txs[txIndex].amount||0);
    const batch = db.batch();
    batch.update(userRef, { balance: newBal, transactions: txs });

    // ✅ 15% REFERRAL BONUS
    if(userData.referredBy &&!userData.referralPaid){
      const refQuery = await db.collection('users').where('username','==', userData.referredBy).get();
      if(!refQuery.empty){
        const refDoc = refQuery.docs[0];
        const bonus = Math.floor(txs[txIndex].amount * 0.15);
        if(bonus>0){
          batch.update(refDoc.ref, {
            balance: admin.firestore.FieldValue.increment(bonus),
            referralBalance: admin.firestore.FieldValue.increment(bonus)
          });
          batch.set(db.collection('notifications').doc(), {
            target: refDoc.data().username,
            type: 'success',
            title: 'Referral Bonus 15% Earned!',
            message: `You earned UGX ${bonus.toLocaleString()} from ${userData.username}'s deposit of UGX ${txs[txIndex].amount.toLocaleString()}`,
            sentAt: new Date().toISOString()
          });
          batch.update(userRef, { referralPaid: true });
        }
      }
    }
    batch.set(db.collection('notifications').doc(), {
      target: userData.username,
      type: 'success',
      title: 'Deposit Approved',
      message: `Your deposit of UGX ${txs[txIndex].amount.toLocaleString()} approved!`,
      sentAt: new Date().toISOString()
    });
    await batch.commit();
    return res.json({success:true, message:`Deposit UGX ${txs[txIndex].amount} approved + 15% referral`});
  }catch(e){ console.error(e); res.status(500).json({success:false, error:e.message}); }
});

app.post('/api/admin/reject-withdrawal', verifyAdminToken, async (req,res)=>{
  try{
    const { uid, txId } = req.body;
    if(!uid||!txId) return res.status(400).json({success:false, error:'uid and txId required'});
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    const userData = userDoc.data();
    const txs = userData.transactions||[];
    const tx = txs.find(t=>t.id===txId);
    if(!tx) return res.status(404).json({success:false, error:'Tx not found'});
    tx.status='Rejected';
    const batch = db.batch();
    batch.update(userRef, { transactions: txs, balance: (userData.balance||0) + (tx.amount||0) });
    batch.set(db.collection('notifications').doc(), {
      target: userData.username, type: 'warning', title: 'Withdrawal Rejected',
      message: `Your withdrawal of UGX ${tx.amount.toLocaleString()} rejected and refunded`,
      sentAt: new Date().toISOString()
    });
    await batch.commit();
    res.json({success:true, message:'Withdrawal rejected and refunded'});
  }catch(e){ res.status(500).json({success:false, error:e.message}); }
});

app.post('/api/admin/reject-deposit', verifyAdminToken, async (req,res)=>{
  try{
    const { uid, txId } = req.body;
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    const userData = userDoc.data();
    const txs = userData.transactions||[];
    const tx = txs.find(t=>t.id===txId);
    tx.status='Rejected';
    await userRef.update({ transactions: txs });
    res.json({success:true, message:'Deposit rejected'});
  }catch(e){ res.status(500).json({success:false, error:e.message}); }
});

app.listen(port, ()=>{
  console.log(`🚀 Milecapita 15% Server LIVE on port ${port}`);
  console.log(`🔐 Secure admin login enabled - ${SERVER_ADMINS.length} server admins`);
});