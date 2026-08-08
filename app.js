import { firebaseApp, ADMIN_EMAILS } from "./firebase-config.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, collection,
  addDoc, onSnapshot, query, where, orderBy, serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const STARTING_BALANCE = 1000;

let currentUser = null;   // Firebase auth user
let currentProfile = null; // Firestore user doc { name, balance, isAdmin }
let unsubOpen, unsubMine, unsubAdmin;

// ---------- DOM refs ----------
const authScreen = document.getElementById("authScreen");
const appShell = document.getElementById("appShell");

const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const authTabs = document.querySelectorAll(".auth-tab");

const balanceValue = document.getElementById("balanceValue");
const logoutBtn = document.getElementById("logoutBtn");
const adminTabBtn = document.getElementById("adminTabBtn");

const tabBtns = document.querySelectorAll(".tab-btn");
const views = document.querySelectorAll(".view");

const openBetsList = document.getElementById("openBetsList");
const openBetsEmpty = document.getElementById("openBetsEmpty");
const myBetsList = document.getElementById("myBetsList");
const myBetsEmpty = document.getElementById("myBetsEmpty");
const adminBetsList = document.getElementById("adminBetsList");
const adminBetsEmpty = document.getElementById("adminBetsEmpty");

const createBetForm = document.getElementById("createBetForm");

// ---------- Auth tab switching ----------
authTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    authTabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const isLogin = tab.dataset.tab === "login";
    loginForm.classList.toggle("hidden", !isLogin);
    signupForm.classList.toggle("hidden", isLogin);
  });
});

// ---------- Sign up ----------
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("signupError");
  errEl.textContent = "";
  const name = document.getElementById("signupName").value.trim();
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "users", cred.user.uid), {
      name,
      email,
      balance: STARTING_BALANCE,
      createdAt: serverTimestamp()
    });
  } catch (err) {
    errEl.textContent = friendlyError(err);
  }
});

// ---------- Log in ----------
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("loginError");
  errEl.textContent = "";
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    errEl.textContent = friendlyError(err);
  }
});

logoutBtn.addEventListener("click", () => signOut(auth));

function friendlyError(err) {
  const code = err.code || "";
  if (code.includes("email-already-in-use")) return "That email's already registered — try logging in instead.";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "Email or password doesn't match.";
  if (code.includes("weak-password")) return "Password needs at least 6 characters.";
  return "Something went wrong. Try again.";
}

// ---------- Auth state ----------
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    const snap = await getDoc(doc(db, "users", user.uid));
    currentProfile = snap.exists() ? snap.data() : null;
    authScreen.classList.add("hidden");
    appShell.classList.remove("hidden");
    balanceValue.textContent = currentProfile ? currentProfile.balance : "—";
    adminTabBtn.classList.toggle("hidden", !ADMIN_EMAILS.includes(user.email));
    subscribeAll();
  } else {
    currentProfile = null;
    appShell.classList.add("hidden");
    authScreen.classList.remove("hidden");
    if (unsubOpen) unsubOpen();
    if (unsubMine) unsubMine();
    if (unsubAdmin) unsubAdmin();
  }
});

// ---------- Tab navigation ----------
function setView(name) {
  tabBtns.forEach(b => b.classList.toggle("active", b.dataset.view === name));
  views.forEach(v => v.classList.toggle("active", v.id === `view-${name}`));
}
tabBtns.forEach(btn => btn.addEventListener("click", () => setView(btn.dataset.view)));
document.querySelectorAll("[data-view].link-btn").forEach(btn => {
  btn.addEventListener("click", () => setView(btn.dataset.view));
});

// ---------- Create bet ----------
createBetForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("createBetError");
  errEl.textContent = "";
  const terms = document.getElementById("betTerms").value.trim();
  const stake = parseInt(document.getElementById("betStake").value, 10);
  const deadline = document.getElementById("betDeadline").value;

  if (!currentProfile || stake > currentProfile.balance) {
    errEl.textContent = "You don't have enough coins for that stake.";
    return;
  }

  try {
    await runTransaction(db, async (tx) => {
      const userRef = doc(db, "users", currentUser.uid);
      const userSnap = await tx.get(userRef);
      const bal = userSnap.data().balance;
      if (stake > bal) throw new Error("insufficient");
      tx.update(userRef, { balance: bal - stake });
      const betRef = doc(collection(db, "bets"));
      tx.set(betRef, {
        terms, stake, deadline,
        status: "open",
        creatorId: currentUser.uid,
        creatorName: currentProfile.name,
        matcherId: null,
        matcherName: null,
        winnerId: null,
        createdAt: serverTimestamp()
      });
    });
    createBetForm.reset();
    setView("mine");
  } catch (err) {
    errEl.textContent = "Couldn't post the slip. Try again.";
  }
});

// ---------- Match (accept) a bet ----------
async function acceptBet(betId, stake) {
  try {
    await runTransaction(db, async (tx) => {
      const betRef = doc(db, "bets", betId);
      const userRef = doc(db, "users", currentUser.uid);
      const betSnap = await tx.get(betRef);
      const userSnap = await tx.get(userRef);
      const bet = betSnap.data();
      const bal = userSnap.data().balance;
      if (bet.status !== "open") throw new Error("already matched");
      if (bet.creatorId === currentUser.uid) throw new Error("own bet");
      if (stake > bal) throw new Error("insufficient");
      tx.update(userRef, { balance: bal - stake });
      tx.update(betRef, {
        status: "matched",
        matcherId: currentUser.uid,
        matcherName: currentProfile.name
      });
    });
  } catch (err) {
    alert("Couldn't match that slip — it may already be taken, or you don't have enough coins.");
  }
}

// ---------- Admin: resolve a bet ----------
async function resolveBet(betId, winnerId) {
  try {
    await runTransaction(db, async (tx) => {
      const betRef = doc(db, "bets", betId);
      const betSnap = await tx.get(betRef);
      const bet = betSnap.data();
      if (bet.status !== "matched") throw new Error("not matched");
      const winnerRef = doc(db, "users", winnerId);
      const winnerSnap = await tx.get(winnerRef);
      const winnerBal = winnerSnap.data().balance;
      const payout = bet.stake * 2;
      tx.update(winnerRef, { balance: winnerBal + payout });
      tx.update(betRef, { status: "resolved", winnerId });
    });
  } catch (err) {
    alert("Couldn't resolve that bet. Try again.");
  }
}

// ---------- Rendering ----------
function slipCard(bet, id, opts = {}) {
  const div = document.createElement("div");
  div.className = "slip";

  let stampHtml = "";
  if (bet.status === "matched") stampHtml = `<div class="stamp matched">Matched</div>`;
  if (bet.status === "resolved") {
    const won = bet.winnerId === currentUser?.uid;
    if (opts.showResultStamp) {
      stampHtml = `<div class="stamp ${won ? "won" : "lost"}">${won ? "Won" : "Settled"}</div>`;
    } else {
      stampHtml = `<div class="stamp won">Resolved</div>`;
    }
  }

  const partiesHtml = bet.status !== "open"
    ? `<div class="slip-parties">${bet.creatorName} vs ${bet.matcherName || "—"}${bet.status === "resolved" ? `<br>Winner: ${bet.winnerId === bet.creatorId ? bet.creatorName : bet.matcherName}` : ""}</div>`
    : `<div class="slip-parties">Posted by ${bet.creatorName}</div>`;

  div.innerHTML = `
    ${stampHtml}
    <p class="slip-terms">${escapeHtml(bet.terms)}</p>
    ${partiesHtml}
    <div class="slip-meta">
      <span>Resolves ${bet.deadline || "—"}</span>
      <span class="slip-stake">${bet.stake} coins</span>
    </div>
    <div class="slip-actions" data-actions></div>
  `;

  const actions = div.querySelector("[data-actions]");

  if (opts.mode === "open") {
    const isOwn = bet.creatorId === currentUser?.uid;
    const btn = document.createElement("button");
    btn.className = "slip-btn primary";
    btn.textContent = isOwn ? "Your slip" : "Match this bet";
    btn.disabled = isOwn;
    if (!isOwn) btn.addEventListener("click", () => acceptBet(id, bet.stake));
    actions.appendChild(btn);
  }

  if (opts.mode === "admin") {
    const wrap = document.createElement("div");
    wrap.className = "admin-choice";
    const btnA = document.createElement("button");
    btnA.className = "slip-btn primary";
    btnA.textContent = `${bet.creatorName} wins`;
    btnA.addEventListener("click", () => resolveBet(id, bet.creatorId));
    const btnB = document.createElement("button");
    btnB.className = "slip-btn primary";
    btnB.textContent = `${bet.matcherName} wins`;
    btnB.addEventListener("click", () => resolveBet(id, bet.matcherId));
    wrap.append(btnA, btnB);
    actions.appendChild(wrap);
  }

  return div;
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// ---------- Live subscriptions ----------
function subscribeAll() {
  const betsRef = collection(db, "bets");

  const qOpen = query(betsRef, where("status", "==", "open"), orderBy("createdAt", "desc"));
  unsubOpen = onSnapshot(qOpen, (snap) => {
    openBetsList.innerHTML = "";
    openBetsEmpty.classList.toggle("hidden", !snap.empty);
    snap.forEach(d => openBetsList.appendChild(slipCard(d.data(), d.id, { mode: "open" })));
  });

  const qMineA = query(betsRef, where("creatorId", "==", currentUser.uid));
  const qMineB = query(betsRef, where("matcherId", "==", currentUser.uid));
  const renderMine = async () => {
    const [snapA, snapB] = await Promise.all([getDocsSnapshot(qMineA), getDocsSnapshot(qMineB)]);
    const map = new Map();
    snapA.forEach(d => map.set(d.id, d.data()));
    snapB.forEach(d => map.set(d.id, d.data()));
    myBetsList.innerHTML = "";
    myBetsEmpty.classList.toggle("hidden", map.size !== 0);
    map.forEach((bet, id) => myBetsList.appendChild(slipCard(bet, id, { mode: "mine", showResultStamp: true })));
  };
  unsubMine = onSnapshot(qMineA, renderMine);
  onSnapshot(qMineB, renderMine);

  if (ADMIN_EMAILS.includes(currentUser.email)) {
    const qAdmin = query(betsRef, where("status", "==", "matched"));
    unsubAdmin = onSnapshot(qAdmin, (snap) => {
      adminBetsList.innerHTML = "";
      adminBetsEmpty.classList.toggle("hidden", !snap.empty);
      snap.forEach(d => adminBetsList.appendChild(slipCard(d.data(), d.id, { mode: "admin" })));
    });
  }

  // keep balance display live
  onSnapshot(doc(db, "users", currentUser.uid), (snap) => {
    if (snap.exists()) {
      currentProfile = snap.data();
      balanceValue.textContent = currentProfile.balance;
    }
  });
}

function getDocsSnapshot(q) {
  return new Promise((resolve) => {
    const unsub = onSnapshot(q, (snap) => { resolve(snap); unsub(); });
  });
}
