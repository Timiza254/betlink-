import { firebaseApp, ADMIN_PASSCODE } from "./firebase-config.js";
import { fetchUpcomingFixtures } from "./sports.js";
import { clubColor } from "./club-colors.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
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

const nameForm = document.getElementById("nameForm");
const nameInput = document.getElementById("nameInput");
const nameError = document.getElementById("nameError");

const balanceValue = document.getElementById("balanceValue");
const logoutBtn = document.getElementById("logoutBtn");
const adminTabBtn = document.getElementById("adminTabBtn");
const adminUnlockBtn = document.getElementById("adminUnlockBtn");

const tabBtns = document.querySelectorAll(".tab-btn");
const views = document.querySelectorAll(".view");

const openBetsList = document.getElementById("openBetsList");
const openBetsEmpty = document.getElementById("openBetsEmpty");
const sportFilterBtns = document.querySelectorAll(".sport-filter:not(.soon)");
let currentSportFilter = "all";
let latestOpenBets = []; // [{id, data}]
const myBetsList = document.getElementById("myBetsList");
const myBetsEmpty = document.getElementById("myBetsEmpty");
const adminBetsList = document.getElementById("adminBetsList");
const adminBetsEmpty = document.getElementById("adminBetsEmpty");

const createBetForm = document.getElementById("createBetForm");
const matchBetForm = document.getElementById("matchBetForm");
const betModeTabs = document.querySelectorAll(".bet-mode-tab");
const matchSelect = document.getElementById("matchSelect");
const matchLoadError = document.getElementById("matchLoadError");
const matchPickWrap = document.getElementById("matchPickWrap");
const pickOptions = document.getElementById("pickOptions");
const matchStakeInput = document.getElementById("matchStake");
const matchBetError = document.getElementById("matchBetError");

let fixtures = [];
let selectedPick = null; // { label, side: 'home'|'draw'|'away' }

// ---------- Bet mode toggle (live match vs custom) ----------
betModeTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    betModeTabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const isMatch = tab.dataset.mode === "match";
    matchBetForm.classList.toggle("hidden", !isMatch);
    createBetForm.classList.toggle("hidden", isMatch);
  });
});

// ---------- Load fixtures ----------
async function loadFixtures() {
  matchLoadError.textContent = "";
  try {
    fixtures = await fetchUpcomingFixtures();
    if (fixtures.length === 0) {
      matchSelect.innerHTML = `<option value="">No upcoming fixtures found</option>`;
      return;
    }
    matchSelect.innerHTML = `<option value="">Choose a fixture…</option>` +
      fixtures.map((f, i) => {
        const d = new Date(f.kickoff);
        const when = d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
          ", " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
        return `<option value="${i}">${when} — ${f.homeTeam} vs ${f.awayTeam}</option>`;
      }).join("");
  } catch (err) {
    if (err.message === "no-api-key") {
      matchLoadError.textContent = "Live fixtures aren't set up yet — add a free football-data.org API key to sports-config.js, or use the Custom tab for now.";
    } else {
      matchLoadError.textContent = "Couldn't load fixtures: " + err.message + ". Try the Custom tab for now.";
    }
    matchSelect.innerHTML = `<option value="">Unavailable</option>`;
  }
}
loadFixtures();

matchSelect.addEventListener("change", () => {
  const f = fixtures[matchSelect.value];
  matchPickWrap.classList.toggle("hidden", !f);
  selectedPick = null;
  if (!f) return;
  pickOptions.innerHTML = "";
  const options = [
    { side: "home", label: `${f.homeTeam} to win`, color: clubColor(f.homeTeam), crest: f.homeCrest },
    { side: "draw", label: "Draw", color: "#6B7674", crest: "" },
    { side: "away", label: `${f.awayTeam} to win`, color: clubColor(f.awayTeam), crest: f.awayCrest }
  ];
  options.forEach(opt => {
    const lbl = document.createElement("label");
    lbl.className = "pick-option";
    lbl.style.setProperty("--pick-color", opt.color);
    const crestHtml = opt.crest ? `<img src="${opt.crest}" alt="" class="pick-crest">` : "";
    lbl.innerHTML = `<input type="radio" name="matchPick" value="${opt.side}">${crestHtml}<span>${opt.label}</span>`;
    lbl.querySelector("input").addEventListener("change", () => {
      document.querySelectorAll(".pick-option").forEach(el => el.classList.remove("selected"));
      lbl.classList.add("selected");
      selectedPick = opt;
    });
    pickOptions.appendChild(lbl);
  });
});

// ---------- Create bet: live match mode ----------
matchBetForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  matchBetError.textContent = "";
  const f = fixtures[matchSelect.value];
  const stake = parseInt(matchStakeInput.value, 10);

  if (!f || !selectedPick) {
    matchBetError.textContent = "Pick a fixture and a side first.";
    return;
  }
  if (!currentProfile || stake > currentProfile.balance) {
    matchBetError.textContent = "You don't have enough coins for that stake.";
    return;
  }

  const terms = `${f.homeTeam} vs ${f.awayTeam} — backing: ${selectedPick.label}`;
  const deadline = new Date(f.kickoff).toISOString().slice(0, 10);

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
        betType: "match",
        sport: "football",
        homeTeam: f.homeTeam,
        awayTeam: f.awayTeam,
        homeCrest: f.homeCrest || "",
        awayCrest: f.awayCrest || "",
        kickoff: f.kickoff,
        pickLabel: selectedPick.label,
        pickSide: selectedPick.side,
        status: "open",
        creatorId: currentUser.uid,
        creatorName: currentProfile.name,
        matcherId: null,
        matcherName: null,
        winnerId: null,
        createdAt: serverTimestamp()
      });
    });
    matchBetForm.reset();
    matchPickWrap.classList.add("hidden");
    setView("mine");
  } catch (err) {
    matchBetError.textContent = "Couldn't post the slip. Try again.";
  }
});

// ---------- Anonymous sign-in on load ----------
signInAnonymously(auth).catch(() => {
  nameError.textContent = "Couldn't connect. Check your connection and reload.";
});

// ---------- Name form (first-time setup) ----------
nameForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  nameError.textContent = "";
  const name = nameInput.value.trim();
  if (!name) return;
  try {
    await setDoc(doc(db, "users", currentUser.uid), {
      name,
      balance: STARTING_BALANCE,
      createdAt: serverTimestamp()
    });
    currentProfile = { name, balance: STARTING_BALANCE };
    enterApp();
  } catch (err) {
    nameError.textContent = "Something went wrong. Try again.";
  }
});

// ---------- Admin unlock (passcode) ----------
adminUnlockBtn.addEventListener("click", () => {
  const code = prompt("Enter admin passcode:");
  if (code === null) return;
  if (code === ADMIN_PASSCODE) {
    localStorage.setItem("betlink_admin", "1");
    adminTabBtn.classList.remove("hidden");
    alert("Admin unlocked on this device.");
  } else {
    alert("Wrong passcode.");
  }
});

function isAdminUnlocked() {
  return localStorage.getItem("betlink_admin") === "1";
}

// "Reset" only clears admin unlock on this device — there's no login to undo
// since accounts are tied to the browser (anonymous session).
logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("betlink_admin");
  location.reload();
});

function enterApp() {
  authScreen.classList.add("hidden");
  appShell.classList.remove("hidden");
  balanceValue.textContent = currentProfile ? currentProfile.balance : "—";
  adminTabBtn.classList.toggle("hidden", !isAdminUnlocked());
  subscribeAll();
}

// ---------- Auth state ----------
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) {
      currentProfile = snap.data();
      enterApp();
    } else {
      // First time on this device — show name entry, stay on authScreen
      currentProfile = null;
    }
  } else {
    currentProfile = null;
    appShell.classList.add("hidden");
    authScreen.classList.remove("hidden");
    if (unsubOpen) unsubOpen();
    if (unsubMine) unsubMine();
    if (unsubAdmin) unsubAdmin();
  }
});

// ---------- Sport filter ----------
sportFilterBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".sport-filter").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentSportFilter = btn.dataset.sport;
    renderOpenBets();
  });
});
document.querySelectorAll(".sport-filter.soon").forEach(btn => {
  btn.addEventListener("click", () => {
    const label = btn.querySelector("span:nth-child(2)")?.textContent || "This sport";
    alert(`${label} is coming soon.`);
  });
});

function renderOpenBets() {
  const filtered = currentSportFilter === "all"
    ? latestOpenBets
    : latestOpenBets.filter(({ data }) => data.sport === currentSportFilter);
  openBetsList.innerHTML = "";
  openBetsEmpty.classList.toggle("hidden", filtered.length !== 0);
  filtered.forEach(({ id, data }) => openBetsList.appendChild(slipCard(data, id, { mode: "open" })));
}

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
        betType: "custom",
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
  if (bet.betType === "match" && bet.pickSide) {
    const teamForColor = bet.pickSide === "home" ? bet.homeTeam : bet.pickSide === "away" ? bet.awayTeam : null;
    if (teamForColor) div.style.borderLeftColor = clubColor(teamForColor);
  }

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

  const fixtureMetaHtml = bet.betType === "match"
    ? `<div class="fixture-badge">
        ${bet.homeCrest ? `<img src="${bet.homeCrest}" alt="" class="team-crest">` : ""}
        <span class="fixture-vs">${escapeHtml(bet.homeTeam)} vs ${escapeHtml(bet.awayTeam)}</span>
        ${bet.awayCrest ? `<img src="${bet.awayCrest}" alt="" class="team-crest">` : ""}
      </div>
      <p class="fixture-meta">Kickoff ${new Date(bet.kickoff).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>`
    : "";

  div.innerHTML = `
    ${stampHtml}
    <p class="slip-terms">${escapeHtml(bet.terms)}</p>
    ${fixtureMetaHtml}
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

    if (bet.betType === "match") {
      const q = document.createElement("p");
      q.className = "resolve-question";
      q.textContent = `Did this happen: "${bet.pickLabel}"?`;
      div.querySelector("[data-actions]").before(q);

      const btnYes = document.createElement("button");
      btnYes.className = "slip-btn primary";
      btnYes.textContent = "Yes — creator wins";
      btnYes.addEventListener("click", () => resolveBet(id, bet.creatorId));

      const btnNo = document.createElement("button");
      btnNo.className = "slip-btn primary";
      btnNo.textContent = "No — matcher wins";
      btnNo.addEventListener("click", () => resolveBet(id, bet.matcherId));

      wrap.append(btnYes, btnNo);
    } else {
      const btnA = document.createElement("button");
      btnA.className = "slip-btn primary";
      btnA.textContent = `${bet.creatorName} wins`;
      btnA.addEventListener("click", () => resolveBet(id, bet.creatorId));
      const btnB = document.createElement("button");
      btnB.className = "slip-btn primary";
      btnB.textContent = `${bet.matcherName} wins`;
      btnB.addEventListener("click", () => resolveBet(id, bet.matcherId));
      wrap.append(btnA, btnB);
    }

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
    latestOpenBets = [];
    snap.forEach(d => latestOpenBets.push({ id: d.id, data: d.data() }));
    renderOpenBets();
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

  if (isAdminUnlocked()) {
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
