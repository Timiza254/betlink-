import { firebaseApp, ADMIN_PASSCODE } from "./firebase-config.js";
import { fetchUpcomingFixtures } from "./sports.js";
import { clubColor } from "./club-colors.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  EmailAuthProvider, linkWithCredential, signOut
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, collection,
  addDoc, onSnapshot, query, where, orderBy, serverTimestamp, runTransaction,
  increment, limit
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const STARTING_BALANCE = 1000;

// ============================================================
// DATA LAYER
// This app is a static-hosting demo prototype (GitHub Pages + Firebase
// client SDK) — there is no application server. Every "transaction" below
// runs as a Firestore client-side transaction, which prevents lost-update
// races but does NOT prevent a technically-savvy user from tampering with
// their own browser's requests. In a production system, all balance
// changes, bet settlement, and admin actions MUST be re-validated by a
// trusted backend (e.g. Cloud Functions or a real API server) that the
// client cannot bypass — Firestore security rules alone are the minimum
// bar, and this demo currently runs in permissive "test mode" rules.
// None of this is a concern for a virtual-coin prototype; it matters a
// lot before any real value is ever attached to these balances.
// ============================================================

// Records a coin movement so it shows up in the Wallet's transaction
// history. Called from inside the same Firestore transaction as the
// balance change it describes, so the two can never drift apart.
function logTransaction(tx, uid, type, amount, description, betId = null) {
  const txRef = doc(collection(db, "transactions"));
  tx.set(txRef, {
    uid, type, amount, description,
    betId, createdAt: serverTimestamp()
  });
}

// Simple toast notification system (Section 14).
function showToast(message, kind = "info") {
  const host = document.getElementById("toastHost");
  if (!host) return;
  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

let currentUser = null;   // Firebase auth user
let currentProfile = null; // Firestore user doc { name, balance, isAdmin }
let unsubOpen, unsubMine, unsubAdmin;

// ---------- DOM refs ----------
const authScreen = document.getElementById("authScreen");
const appShell = document.getElementById("appShell");

const nameForm = document.getElementById("nameForm");
const nameInput = document.getElementById("nameInput");
const nameError = document.getElementById("nameError");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const registerName = document.getElementById("registerName");
const registerEmail = document.getElementById("registerEmail");
const registerPassword = document.getElementById("registerPassword");
const registerPassword2 = document.getElementById("registerPassword2");
const loginError = document.getElementById("loginError");
const registerError = document.getElementById("registerError");
const authModal = document.getElementById("authModal");
const authCloseBtn = document.getElementById("authCloseBtn");
const authLoginTab = document.getElementById("authLoginTab");
const authRegisterTab = document.getElementById("authRegisterTab");
const authModalTitle = document.getElementById("authModalTitle");
const authModalSubtitle = document.getElementById("authModalSubtitle");
const publicFixturesList = document.getElementById("publicFixturesList");
const publicFixturesEmpty = document.getElementById("publicFixturesEmpty");
const publicFixturesError = document.getElementById("publicFixturesError");
const publicLoginBanner = document.getElementById("publicLoginBanner");
const privateDashboardContent = document.getElementById("privateDashboardContent");


const balanceValue = document.getElementById("balanceValue");
const balanceUnit = document.getElementById("balanceUnit");
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
const myBetsTabs = document.querySelectorAll(".my-bets-tab");
let currentMyBetsFilter = "all";
let latestMyBets = []; // [{id, data}]

const betSearchInput = document.getElementById("betSearch");
const betSortSelect = document.getElementById("betSort");
let searchQuery = "";
let sortMode = "newest";

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
      renderPublicFixtures();
      return;
    }
    matchSelect.innerHTML = `<option value="">Choose a fixture…</option>` +
      fixtures.map((f, i) => {
        const d = new Date(f.kickoff);
        const when = d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
          ", " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
        return `<option value="${i}">${when} — ${f.homeTeam} vs ${f.awayTeam}</option>`;
      }).join("");
    renderPublicFixtures();
  } catch (err) {
    if (err.message === "no-api-key") {
      matchLoadError.textContent = "Live fixtures aren't set up yet — add a free football-data.org API key to sports-config.js, or use the Custom tab for now.";
    } else {
      matchLoadError.textContent = "Couldn't load fixtures: " + err.message + ". Try the Custom tab for now.";
    }
    matchSelect.innerHTML = `<option value="">Unavailable</option>`;
    renderPublicFixtures();
  }
}

function renderPublicFixtures() {
  if (!publicFixturesList) return;
  publicFixturesList.innerHTML = "";

  if (!fixtures.length) {
    publicFixturesEmpty.classList.remove("hidden");
    return;
  }

  publicFixturesEmpty.classList.add("hidden");

  fixtures.slice(0, 10).forEach(f => {
    const card = document.createElement("div");
    card.className = "public-fixture";
    const kickoff = new Date(f.kickoff);
    const dateText = kickoff.toLocaleDateString(undefined, {
      weekday: "short", month: "short", day: "numeric"
    });
    const timeText = kickoff.toLocaleTimeString(undefined, {
      hour: "2-digit", minute: "2-digit"
    });

    card.innerHTML = `
      <div class="public-fixture-time">${dateText} · ${timeText}</div>
      <div class="public-fixture-teams">
        <div><span class="fixture-dot home"></span>${escapeHtml(f.homeTeam)}</div>
        <span class="fixture-vs">VS</span>
        <div><span class="fixture-dot away"></span>${escapeHtml(f.awayTeam)}</div>
      </div>
      <button class="slip-btn primary public-pick-btn" type="button">Pick a side</button>
    `;

    card.querySelector(".public-pick-btn").addEventListener("click", () => {
      if (!isRealUser()) {
        openAuth("login");
        showToast("Login first to use BL Coins.", "info");
        return;
      }
      setView("create");
      matchSelect.value = String(fixtures.indexOf(f));
      matchSelect.dispatchEvent(new Event("change"));
    });

    publicFixturesList.appendChild(card);
  });
}

document.getElementById("publicRefreshFixtures")?.addEventListener("click", async () => {
  await loadFixtures();
  renderPublicFixtures();
});

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
matchBetForm.addEventListener("submit", (e) => {
  e.preventDefault();
  matchBetError.textContent = "";
  const f = fixtures[matchSelect.value];
  const stake = parseInt(matchStakeInput.value, 10);

  if (!f || !selectedPick) { matchBetError.textContent = "Pick a fixture and a side first."; return; }
  if (!Number.isFinite(stake) || stake <= 0) { matchBetError.textContent = "Stake must be a positive number."; return; }
  if (!currentProfile || stake > currentProfile.balance) { matchBetError.textContent = "You don't have enough coins for that stake."; return; }

  showReview({
    lines: [
      ["Sport", "Football"],
      ["Match", `${f.homeTeam} vs ${f.awayTeam}`],
      ["Prediction", selectedPick.label],
      ["Stake", `${stake} coins`],
      ["Potential return", `${stake * 2} coins`],
      ["Closes", new Date(f.kickoff).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })]
    ],
    onConfirm: () => postMatchBet(f, stake)
  });
});

async function postMatchBet(f, stake) {
  const terms = `${f.homeTeam} vs ${f.awayTeam} — backing: ${selectedPick.label}`;
  const deadline = new Date(f.kickoff).toISOString().slice(0, 10);
  try {
    await runTransaction(db, async (tx) => {
      const userRef = doc(db, "users", currentUser.uid);
      const userSnap = await tx.get(userRef);
      const bal = userSnap.data().balance;
      if (stake > bal) throw new Error("insufficient");
      tx.update(userRef, { balance: bal - stake, betsCreated: increment(1) });
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
      logTransaction(tx, currentUser.uid, "bet_created", -stake, `Stake locked: ${terms.slice(0, 60)}`, betRef.id);
    });
    matchBetForm.reset();
    matchPickWrap.classList.add("hidden");
    closeReview();
    showToast("Slip posted — waiting for someone to match it.", "success");
    setView("mine");
  } catch (err) {
    matchBetError.textContent = "Couldn't post the slip. Try again.";
    closeReview();
  }
}

// ---------- Public-first authentication ----------
async function startPublicSession() {
  try {
    // Anonymous auth lets public users browse Firestore-backed demo data
    // without granting them access to a coin balance.
    if (!auth.currentUser) await signInAnonymously(auth);
  } catch (err) {
    console.error(err);
    showPublicMode();
    publicFixturesError.textContent = "Public mode is available, but live bet data may be unavailable.";
  }
}

function openAuth(mode = "login") {
  authModal.classList.remove("hidden");
  setAuthMode(mode);
}

function closeAuth() {
  authModal.classList.add("hidden");
  loginError.textContent = "";
  registerError.textContent = "";
}

function setAuthMode(mode) {
  const login = mode === "login";
  authLoginTab.classList.toggle("active", login);
  authRegisterTab.classList.toggle("active", !login);
  loginForm.classList.toggle("hidden", !login);
  registerForm.classList.toggle("hidden", login);
  authModalTitle.textContent = login ? "Login to Betlink" : "Create your Betlink account";
  authModalSubtitle.textContent = login
    ? "Browse matches publicly. Login to access your BL Coins."
    : "Register to receive 1,000 demo BL Coins.";
}

document.getElementById("publicLoginCta").addEventListener("click", () => openAuth("login"));
authCloseBtn.addEventListener("click", closeAuth);
authLoginTab.addEventListener("click", () => setAuthMode("login"));
authRegisterTab.addEventListener("click", () => setAuthMode("register"));

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  try {
    const email = loginEmail.value.trim();
    const password = loginPassword.value;
    await signInWithEmailAndPassword(auth, email, password);
    closeAuth();
    showToast("Logged in successfully.", "success");
  } catch (err) {
    console.error(err);
    loginError.textContent =
      err.code === "auth/invalid-credential" || err.code === "auth/user-not-found" || err.code === "auth/wrong-password"
        ? "Email or password is incorrect."
        : "Couldn't log in. Check your details and try again.";
  }
});

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  registerError.textContent = "";

  const name = registerName.value.trim();
  const email = registerEmail.value.trim();
  const password = registerPassword.value;
  const password2 = registerPassword2.value;

  if (password !== password2) {
    registerError.textContent = "Passwords do not match.";
    return;
  }
  if (password.length < 6) {
    registerError.textContent = "Password must be at least 6 characters.";
    return;
  }

  try {
    let userCredential;

    // If the public visitor currently has an anonymous Firebase identity,
    // upgrade that same identity so an existing demo balance/bets are kept.
    if (auth.currentUser?.isAnonymous) {
      const credential = EmailAuthProvider.credential(email, password);
      userCredential = await linkWithCredential(auth.currentUser, credential);
    } else {
      userCredential = await createUserWithEmailAndPassword(auth, email, password);
    }

    const user = userCredential.user;
    const userRef = doc(db, "users", user.uid);

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists()) {
        tx.set(userRef, {
          name,
          email,
          balance: STARTING_BALANCE,
          startingBalanceGranted: true,
          betsCreated: 0,
          betsAccepted: 0,
          wins: 0,
          losses: 0,
          createdAt: serverTimestamp()
        });
        logTransaction(tx, user.uid, "starting_balance", STARTING_BALANCE, "Welcome bonus — demo virtual coins");
      } else {
        tx.update(userRef, { name, email });
      }
    });

    currentUser = user;
    currentProfile = (await getDoc(userRef)).data();
    closeAuth();
    enterApp();
    showToast("Account created. 1,000 BL Coins added.", "success");
  } catch (err) {
    console.error(err);
    if (err.code === "auth/email-already-in-use") {
      registerError.textContent = "That email is already registered. Please login.";
    } else if (err.code === "auth/credential-already-in-use") {
      registerError.textContent = "That email is already linked to another account. Please login.";
    } else {
      registerError.textContent = "Couldn't create the account. Check your details and try again.";
    }
  }
});

// Keep the existing name form only as a fallback for legacy deployments.
nameForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  nameError.textContent = "Please use Register or Login to access Betlink.";
  openAuth("register");
});

async function signOutUser() {
  try {
    await signOut(auth);
  } catch (err) {
    console.error(err);
  }
  location.reload();
}

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
  signOutUser();
});

function isRealUser() {
  return !!currentUser && !currentUser.isAnonymous && !!currentProfile;
}

function showPublicMode() {
  authScreen.classList.add("hidden");
  appShell.classList.remove("hidden");

  balanceValue.textContent = "Login";
  if (balanceUnit) balanceUnit.textContent = "to view coins";
  logoutBtn.classList.add("hidden");
  adminUnlockBtn.classList.add("hidden");

  privateDashboardContent.classList.add("hidden");
  publicLoginBanner.classList.remove("hidden");

  // Hide private tabs but keep public Home/Open bets available.
  tabBtns.forEach(btn => {
    if (["create","mine","wallet","profile","admin"].includes(btn.dataset.view)) {
      btn.classList.add("locked-tab");
    }
  });

  renderPublicFixtures();
}

function enterApp() {
  authScreen.classList.add("hidden");
  appShell.classList.remove("hidden");

  balanceValue.textContent = currentProfile ? currentProfile.balance : "—";
  if (balanceUnit) balanceUnit.textContent = "coins";
  logoutBtn.classList.remove("hidden");
  adminUnlockBtn.classList.toggle("hidden", !isAdminUnlocked());

  privateDashboardContent.classList.remove("hidden");
  publicLoginBanner.classList.add("hidden");

  tabBtns.forEach(btn => btn.classList.remove("locked-tab"));
  subscribeAll();
}

// ---------- Auth state ----------
onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (!user) {
    currentProfile = null;
    showPublicMode();
    startPublicSession();
    return;
  }

  // Anonymous visitors can browse without seeing a balance.
  if (user.isAnonymous) {
    currentProfile = null;
    showPublicMode();
    return;
  }

  try {
    const profile = await ensureUserProfile(user);
    if (profile) {
      currentProfile = profile;
      enterApp();
    } else {
      // An authenticated account without a profile should be completed.
      currentProfile = null;
      openAuth("register");
    }
  } catch (err) {
    console.error("Betlink profile load failed:", err);
    showToast("Couldn't load your account. Try again.", "error");
    showPublicMode();
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

betSearchInput.addEventListener("input", () => {
  searchQuery = betSearchInput.value.trim().toLowerCase();
  renderOpenBets();
});
betSortSelect.addEventListener("change", () => {
  sortMode = betSortSelect.value;
  renderOpenBets();
});

function renderOpenBets() {
  let filtered = currentSportFilter === "all"
    ? latestOpenBets
    : latestOpenBets.filter(({ data }) => data.sport === currentSportFilter);

  if (searchQuery) {
    filtered = filtered.filter(({ data }) => {
      const haystack = [data.terms, data.homeTeam, data.awayTeam, data.creatorName].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(searchQuery);
    });
  }

  filtered = [...filtered].sort((a, b) => {
    if (sortMode === "lowest") return a.data.stake - b.data.stake;
    if (sortMode === "highest") return b.data.stake - a.data.stake;
    if (sortMode === "closing") {
      const da = a.data.kickoff || a.data.deadline || "";
      const db_ = b.data.kickoff || b.data.deadline || "";
      return String(da).localeCompare(String(db_));
    }
    return 0; // "newest" — latestOpenBets already arrives ordered by createdAt desc
  });

  openBetsList.innerHTML = "";
  openBetsEmpty.classList.toggle("hidden", filtered.length !== 0);
  filtered.forEach(({ id, data }) => openBetsList.appendChild(slipCard(data, id, { mode: "open" })));
}

// ---------- Tab navigation ----------
function setView(name) {
  tabBtns.forEach(b => b.classList.toggle("active", b.dataset.view === name));
  views.forEach(v => v.classList.toggle("active", v.id === `view-${name}`));
}
tabBtns.forEach(btn => btn.addEventListener("click", () => {
  const view = btn.dataset.view;
  if (["create","mine","wallet","profile","admin"].includes(view) && !isRealUser()) {
    openAuth("login");
    showToast("Login or register to access BL Coins and betting tools.", "info");
    return;
  }
  setView(view);
}));
document.querySelectorAll("[data-view].link-btn").forEach(btn => {
  btn.addEventListener("click", () => setView(btn.dataset.view));
});

matchStakeInput.addEventListener("input", () => {
  const s = parseInt(matchStakeInput.value, 10);
  const el = document.getElementById("matchPotentialReturn");
  el.textContent = Number.isFinite(s) && s > 0 ? `Potential return: ${s * 2} coins` : "";
});
document.getElementById("betStake").addEventListener("input", () => {
  const s = parseInt(document.getElementById("betStake").value, 10);
  const el = document.getElementById("customPotentialReturn");
  el.textContent = Number.isFinite(s) && s > 0 ? `Potential return: ${s * 2} coins` : "";
});

// ---------- Create bet ----------
createBetForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const errEl = document.getElementById("createBetError");
  errEl.textContent = "";
  const terms = document.getElementById("betTerms").value.trim();
  const stake = parseInt(document.getElementById("betStake").value, 10);
  const deadline = document.getElementById("betDeadline").value;

  if (!terms) { errEl.textContent = "Describe the bet first."; return; }
  if (!Number.isFinite(stake) || stake <= 0) { errEl.textContent = "Stake must be a positive number."; return; }
  if (!deadline) { errEl.textContent = "Pick a resolve-by date."; return; }
  if (!currentProfile || stake > currentProfile.balance) { errEl.textContent = "You don't have enough coins for that stake."; return; }

  showReview({
    lines: [
      ["Terms", terms],
      ["Stake", `${stake} coins`],
      ["Potential return", `${stake * 2} coins`],
      ["Resolves by", deadline]
    ],
    onConfirm: () => postCustomBet(terms, stake, deadline)
  });
});

async function postCustomBet(terms, stake, deadline) {
  const errEl = document.getElementById("createBetError");
  try {
    await runTransaction(db, async (tx) => {
      const userRef = doc(db, "users", currentUser.uid);
      const userSnap = await tx.get(userRef);
      const bal = userSnap.data().balance;
      if (stake > bal) throw new Error("insufficient");
      tx.update(userRef, { balance: bal - stake, betsCreated: increment(1) });
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
      logTransaction(tx, currentUser.uid, "bet_created", -stake, `Stake locked: ${terms.slice(0, 60)}`, betRef.id);
    });
    createBetForm.reset();
    closeReview();
    showToast("Slip posted — waiting for someone to match it.", "success");
    setView("mine");
  } catch (err) {
    errEl.textContent = "Couldn't post the slip. Try again.";
    closeReview();
  }
}

// ---------- Confirmation review panel (Section 3) ----------
function showReview({ lines, onConfirm }) {
  const panel = document.getElementById("reviewPanel");
  const body = document.getElementById("reviewBody");
  body.innerHTML = lines.map(([k, v]) => `<div class="review-row"><span>${escapeHtml(k)}</span><strong>${escapeHtml(String(v))}</strong></div>`).join("");
  panel.classList.remove("hidden");
  const confirmBtn = document.getElementById("reviewConfirmBtn");
  const newBtn = confirmBtn.cloneNode(true); // clear any previous handler
  confirmBtn.replaceWith(newBtn);
  newBtn.addEventListener("click", onConfirm);
}
function closeReview() {
  document.getElementById("reviewPanel").classList.add("hidden");
}
document.getElementById("reviewCancelBtn").addEventListener("click", closeReview);

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
      if (bet.creatorId === currentUser.uid) throw new Error("own bet"); // Section 3/12: can't accept your own slip
      if (stake > bal) throw new Error("insufficient");
      tx.update(userRef, { balance: bal - stake, betsAccepted: increment(1) });
      tx.update(betRef, {
        status: "matched",
        matcherId: currentUser.uid,
        matcherName: currentProfile.name
      });
      logTransaction(tx, currentUser.uid, "bet_accepted", -stake, `Matched: ${(bet.terms || "").slice(0, 60)}`, betId);
    });
    showToast("Bet matched! Moved to your Active bets.", "success");
  } catch (err) {
    showToast("Couldn't match that slip — it may already be taken, or you don't have enough coins.", "error");
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
      const loserId = winnerId === bet.creatorId ? bet.matcherId : bet.creatorId;
      const winnerRef = doc(db, "users", winnerId);
      const loserRef = doc(db, "users", loserId);
      const winnerSnap = await tx.get(winnerRef);
      const winnerBal = winnerSnap.data().balance;
      const payout = bet.stake * 2;
      tx.update(winnerRef, { balance: winnerBal + payout, wins: increment(1) });
      tx.update(loserRef, { losses: increment(1) });
      tx.update(betRef, { status: "resolved", winnerId, resolvedAt: serverTimestamp() });
      logTransaction(tx, winnerId, "bet_won", payout, `Won: ${(bet.terms || "").slice(0, 60)}`, betId);
      logTransaction(tx, loserId, "bet_lost", -bet.stake, `Lost: ${(bet.terms || "").slice(0, 60)}`, betId);
      logAdminAction(tx, "resolve", betId, `Settled — winner: ${winnerId === bet.creatorId ? bet.creatorName : bet.matcherName}`);
    });
    showToast("Bet resolved and paid out.", "success");
  } catch (err) {
    showToast("Couldn't resolve that bet. Try again.", "error");
  }
}

// ---------- Admin: cancel a bet (refunds any locked stakes) ----------
async function cancelBet(betId) {
  if (!confirm("Cancel this bet and refund stakes? This can't be undone.")) return;
  try {
    await runTransaction(db, async (tx) => {
      const betRef = doc(db, "bets", betId);
      const betSnap = await tx.get(betRef);
      const bet = betSnap.data();
      if (bet.status !== "open" && bet.status !== "matched") throw new Error("not cancellable");

      const creatorRef = doc(db, "users", bet.creatorId);
      const creatorSnap = await tx.get(creatorRef);
      tx.update(creatorRef, { balance: creatorSnap.data().balance + bet.stake });
      logTransaction(tx, bet.creatorId, "bet_cancelled", bet.stake, `Refund: ${(bet.terms || "").slice(0, 60)}`, betId);

      if (bet.status === "matched" && bet.matcherId) {
        const matcherRef = doc(db, "users", bet.matcherId);
        const matcherSnap = await tx.get(matcherRef);
        tx.update(matcherRef, { balance: matcherSnap.data().balance + bet.stake });
        logTransaction(tx, bet.matcherId, "bet_cancelled", bet.stake, `Refund: ${(bet.terms || "").slice(0, 60)}`, betId);
      }

      tx.update(betRef, { status: "cancelled", cancelledAt: serverTimestamp() });
      logAdminAction(tx, "cancel", betId, "Cancelled — stakes refunded");
    });
    showToast("Bet cancelled and stakes refunded.", "success");
  } catch (err) {
    showToast("Couldn't cancel that bet.", "error");
  }
}

// Writes to a demo admin activity log (Section 9). In production this
// should also capture a verified admin identity, not just a local passcode.
function logAdminAction(tx, action, betId, note) {
  const ref = doc(collection(db, "adminLog"));
  tx.set(ref, { action, betId, note, actorUid: currentUser.uid, at: serverTimestamp() });
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
  if (bet.status === "cancelled") stampHtml = `<div class="stamp lost">Cancelled</div>`;
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

    if (bet.status === "matched" && bet.betType === "match") {
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
    } else if (bet.status === "matched") {
      const btnA = document.createElement("button");
      btnA.className = "slip-btn primary";
      btnA.textContent = `${bet.creatorName} wins`;
      btnA.addEventListener("click", () => resolveBet(id, bet.creatorId));
      const btnB = document.createElement("button");
      btnB.className = "slip-btn primary";
      btnB.textContent = `${bet.matcherName} wins`;
      btnB.addEventListener("click", () => resolveBet(id, bet.matcherId));
      wrap.append(btnA, btnB);
    } else {
      const note = document.createElement("p");
      note.className = "resolve-question";
      note.textContent = "Open — not yet matched.";
      div.querySelector("[data-actions]").before(note);
    }

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "slip-btn danger";
    cancelBtn.textContent = "Cancel & refund";
    cancelBtn.addEventListener("click", () => cancelBet(id));
    wrap.appendChild(cancelBtn);

    actions.appendChild(wrap);
  }

  return div;
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// ---------- My Bets tab filtering ----------
myBetsTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    myBetsTabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    currentMyBetsFilter = tab.dataset.status;
    renderMyBets();
  });
});

function displayStatusFor(bet) {
  if (bet.status === "open") return "open";
  if (bet.status === "matched") return "matched";
  if (bet.status === "cancelled") return "cancelled";
  if (bet.status === "resolved") return bet.winnerId === currentUser?.uid ? "won" : "lost";
  return "";
}

function renderMyBets() {
  const filtered = currentMyBetsFilter === "all"
    ? latestMyBets
    : latestMyBets.filter(({ data }) => displayStatusFor(data) === currentMyBetsFilter);
  myBetsList.innerHTML = "";
  myBetsEmpty.classList.toggle("hidden", filtered.length !== 0);
  filtered.forEach(({ id, data }) => myBetsList.appendChild(slipCard(data, id, { mode: "mine", showResultStamp: true })));
  updateDashboardStats();
}

function updateDashboardStats() {
  const counts = { open: 0, matched: 0, won: 0, lost: 0 };
  latestMyBets.forEach(({ data }) => {
    const s = displayStatusFor(data);
    if (s === "open") counts.open++;
    else if (s === "matched") counts.matched++;
    else if (s === "won") counts.won++;
    else if (s === "lost") counts.lost++;
  });
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText("statOpen", counts.open);
  setText("statActive", counts.matched);
  setText("statWon", counts.won);
  setText("statLost", counts.lost);
}

// ---------- Transactions (Wallet + Dashboard recent activity) ----------
const TX_LABELS = {
  starting_balance: "Welcome bonus",
  bet_created: "Bet created",
  bet_accepted: "Bet accepted",
  bet_won: "Bet won",
  bet_lost: "Bet lost",
  bet_cancelled: "Bet cancelled — refunded",
  admin_adjustment: "Admin adjustment"
};

function renderTransactions(txs) {
  // Dashboard: most recent 5
  const dashList = document.getElementById("dashActivityList");
  const dashEmpty = document.getElementById("dashActivityEmpty");
  if (dashList) {
    dashList.innerHTML = "";
    dashEmpty.classList.toggle("hidden", txs.length !== 0);
    txs.slice(0, 5).forEach(t => dashList.appendChild(activityRow(t)));
  }

  // Wallet: full list + totals
  const walletList = document.getElementById("walletTxList");
  const walletEmpty = document.getElementById("walletTxEmpty");
  if (walletList) {
    walletList.innerHTML = "";
    walletEmpty.classList.toggle("hidden", txs.length !== 0);
    txs.forEach(t => walletList.appendChild(activityRow(t)));
  }

  const totalWon = txs.filter(t => t.type === "bet_won").reduce((sum, t) => sum + t.amount, 0);
  const totalLost = txs.filter(t => t.type === "bet_lost").reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const totalStaked = txs.filter(t => t.type === "bet_created" || t.type === "bet_accepted").reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText("walletWon", totalWon);
  setText("walletLost", totalLost);
  setText("walletStaked", totalStaked);
}

function activityRow(t) {
  const row = document.createElement("div");
  row.className = "activity-row";
  const sign = t.amount > 0 ? "+" : t.amount < 0 ? "" : "";
  const amountClass = t.amount > 0 ? "positive" : t.amount < 0 ? "negative" : "";
  const when = t.createdAt?.toDate ? t.createdAt.toDate().toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  row.innerHTML = `
    <div>
      <p class="activity-label">${escapeHtml(TX_LABELS[t.type] || t.type)}</p>
      <p class="activity-desc">${escapeHtml(t.description || "")}</p>
      <p class="activity-when">${when}</p>
    </div>
    <span class="activity-amount ${amountClass}">${sign}${t.amount} coins</span>
  `;
  return row;
}

// ---------- Profile ----------
function renderProfile() {
  if (!currentProfile) return;
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText("profileName", currentProfile.name || "—");
  setText("profileAvatar", (currentProfile.name || "?").charAt(0).toUpperCase());
  const joined = currentProfile.createdAt?.toDate ? currentProfile.createdAt.toDate().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "—";
  setText("profileJoined", `Joined ${joined}`);
  setText("profileCreated", currentProfile.betsCreated || 0);
  setText("profileAccepted", currentProfile.betsAccepted || 0);
  setText("profileWins", currentProfile.wins || 0);
  setText("profileLosses", currentProfile.losses || 0);
  const totalDecided = (currentProfile.wins || 0) + (currentProfile.losses || 0);
  setText("profileWinRate", totalDecided > 0 ? Math.round((currentProfile.wins / totalDecided) * 100) + "%" : "No decided bets yet");
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
    latestMyBets = Array.from(map, ([id, data]) => ({ id, data }));
    renderMyBets();
  };
  unsubMine = onSnapshot(qMineA, renderMine);
  onSnapshot(qMineB, renderMine);

  const qTx = query(collection(db, "transactions"), where("uid", "==", currentUser.uid), orderBy("createdAt", "desc"), limit(100));
  onSnapshot(qTx, (snap) => {
    const txs = [];
    snap.forEach(d => txs.push(d.data()));
    renderTransactions(txs);
  });

  if (isAdminUnlocked()) {
    // Sorted client-side (not in the query) to avoid requiring a Firestore
    // composite index for an 'in' filter + orderBy combo — that index can
    // only be created via a link buried in the browser console, which is
    // painful to discover on mobile.
    const qAdmin = query(betsRef, where("status", "in", ["open", "matched"]));
    unsubAdmin = onSnapshot(qAdmin, (snap) => {
      const rows = [];
      snap.forEach(d => rows.push({ id: d.id, data: d.data() }));
      rows.sort((a, b) => (b.data.createdAt?.seconds || 0) - (a.data.createdAt?.seconds || 0));
      adminBetsList.innerHTML = "";
      adminBetsEmpty.classList.toggle("hidden", rows.length !== 0);
      rows.forEach(({ id, data }) => adminBetsList.appendChild(slipCard(data, id, { mode: "admin" })));
    });
  }

  // keep balance display + profile live
  onSnapshot(doc(db, "users", currentUser.uid), (snap) => {
    if (snap.exists()) {
      currentProfile = snap.data();
      balanceValue.textContent = currentProfile.balance;
      const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setText("dashBalance", currentProfile.balance);
      setText("walletBalance", currentProfile.balance);
      renderProfile();
    }
  });
}

function getDocsSnapshot(q) {
  return new Promise((resolve) => {
    const unsub = onSnapshot(q, (snap) => { resolve(snap); unsub(); });
  });
}
