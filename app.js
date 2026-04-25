
import { generateContracts } from "./data/contracts.js";
import { createPlayerProfile } from "./data/playerProfile.js";
import { renderDashboard } from "./components/Dashboard.js";
import { renderContractBoard } from "./components/ContractBoard.js";
import { renderMapView } from "./components/MapView.js";
import { renderTimeline, appendTimelineEvent } from "./components/Timeline.js";
import { renderCharts } from "./components/Charts.js";
import { runSimulation } from "./engine/simulator.js";
import { travelCost } from "./engine/routePlanner.js";
import { meetsSkillRequirements } from "./engine/skillSystem.js";

const MAX_DAYS   = 200;
const MAX_ACTIVE = 5;

let state = null;
let simRunning = false;
let simHandle  = null;
let simSpeed   = 40;
let simEvents  = [];

function createFreshState() {
  return {
    player:    createPlayerProfile(),
    contracts: generateContracts(),
    events:    [],
    activeContracts: [],
    done: false,
  };
}

function init() {
  const saved = loadState();
  state = saved || createFreshState();
  renderAll();
  setupNav();
  setupControls();
  showSection("dashboard");
}

function renderAll() {
  const active = state.contracts.filter(c => c.status === "active");
  renderDashboard(state.player, active);
  renderContractBoard(state.contracts, state.player, handleManualAccept);
  renderMapView(state.player, state.contracts, active);
  renderTimeline(state.events);
  renderCharts(state.player, state.contracts);
}

function handleManualAccept(contract) {
  const active = state.contracts.filter(c => c.status === "active");
  if (active.length >= MAX_ACTIVE) {
    showToast("Maximum 5 active contracts reached!", "error");
    return;
  }
  if (!meetsSkillRequirements(state.player, contract)) {
    showToast("Insufficient skills for this contract!", "error");
    return;
  }
  const tCost = travelCost(state.player.currentCity, contract.city);
  const window = contract.deadline - state.player.currentDay;
  if (tCost + contract.executionDays > window) {
    showToast("Not enough time to complete this contract!", "error");
    return;
  }

  contract.status      = "active";
  contract.acceptedDay = state.player.currentDay;
  state.activeContracts.push(contract);

  const entry = { day: state.player.currentDay, msg: `► Manually accepted <span class="contract-name">#${contract.id} ${contract.targetName}</span>`, type: "accept" };
  state.events.push(entry);
  saveState();
  renderAll();
  showToast(`Contract #${contract.id} accepted!`, "success");
}

function startAutoSim() {
  if (simRunning || state.done) return;
  simRunning = true;
  document.getElementById("btn-run").textContent    = "⏸ Pause";
  document.getElementById("btn-run").classList.add("active");

  simEvents = [];
  const snap = {
    player:    JSON.parse(JSON.stringify(state.player)),
    contracts: JSON.parse(JSON.stringify(state.contracts)),
  };

  const { player, contracts, events } = runSimulation(
    snap.contracts,
    snap.player,
    (entry) => simEvents.push(entry),
    () => {}
  );

  state.player    = player;
  state.contracts = contracts;
  state.events    = events;
  state.done      = true;

  let idx = 0;
  function tick() {
    if (!simRunning) return;
    if (idx >= simEvents.length) {
      finishSim();
      return;
    }
    const batch = Math.max(1, Math.floor(simSpeed / 10));
    for (let b = 0; b < batch && idx < simEvents.length; b++) {
      appendTimelineEvent(simEvents[idx]);
      idx++;
    }
    updateDashboardLive();
    simHandle = setTimeout(tick, 1000 / simSpeed);
  }

  tick();
}

function updateDashboardLive() {
  const active = state.contracts.filter(c => c.status === "active");
  renderDashboard(state.player, active);
  renderMapView(state.player, state.contracts, active);
}

function pauseSim() {
  simRunning = false;
  clearTimeout(simHandle);
  document.getElementById("btn-run").textContent = "▶ Resume";
  document.getElementById("btn-run").classList.remove("active");
}

function resumeSim() {
  if (state.done) return;
  simRunning = true;
  document.getElementById("btn-run").textContent = "⏸ Pause";
  document.getElementById("btn-run").classList.add("active");
}

function finishSim() {
  simRunning = false;
  document.getElementById("btn-run").textContent = "✔ Done";
  document.getElementById("btn-run").disabled = true;
  renderAll();
  saveState();
  showFinalReport();
}

function showFinalReport() {
  const p = state.player;
  const completed = state.contracts.filter(c => c.status === "completed").length;
  const failed    = state.contracts.filter(c => c.status === "failed").length;
  const totalSkill = Object.values(p.skills).reduce((s, v) => s + v, 0);
  const efficiency = Math.round((p.gold / (MAX_DAYS * 500)) * 100);

  const el = document.getElementById("final-report");
  if (!el) return;
  el.style.display = "flex";
  el.innerHTML = `
    <div class="report-box">
      <div class="report-title">⚔ SIMULATION COMPLETE ⚔</div>
      <div class="report-grid">
        <div class="report-stat"><span class="rs-label">Total Gold</span><span class="rs-val gold">${p.gold.toLocaleString()}g</span></div>
        <div class="report-stat"><span class="rs-label">Final Reputation</span><span class="rs-val">${p.reputation}/100</span></div>
        <div class="report-stat"><span class="rs-label">Completed</span><span class="rs-val success">${completed}</span></div>
        <div class="report-stat"><span class="rs-label">Failed</span><span class="rs-val danger">${failed}</span></div>
        <div class="report-stat"><span class="rs-label">Total Skill</span><span class="rs-val">${totalSkill}</span></div>
        <div class="report-stat"><span class="rs-label">Efficiency</span><span class="rs-val gold">${efficiency}%</span></div>
      </div>
      <div class="report-skills">
        ${Object.entries(p.skills).map(([k,v]) => `<span class="rsk">${k} <strong>${v}</strong></span>`).join("")}
      </div>
      <div class="report-actions">
        <button class="btn btn-gold" id="report-export">📄 Export Report</button>
        <button class="btn btn-outline" id="report-close">✕ Close</button>
      </div>
    </div>`;

  document.getElementById("report-close").addEventListener("click", () => {
    el.style.display = "none";
  });
  document.getElementById("report-export").addEventListener("click", exportReport);
}

function exportReport() {
  const p = state.player;
  const completed = state.contracts.filter(c => c.status === "completed");
  const failed    = state.contracts.filter(c => c.status === "failed");

  let txt = `=================================================\n`;
  txt += `  ZOLDYCK ESTATE — MISSION DEBRIEFING REPORT\n`;
  txt += `=================================================\n\n`;
  txt += `FINAL STATS\n`;
  txt += `  Gold Earned   : ${p.gold.toLocaleString()}g\n`;
  txt += `  Reputation    : ${p.reputation}/100\n`;
  txt += `  Completed     : ${completed.length}\n`;
  txt += `  Failed        : ${failed.length}\n`;
  txt += `  Final Skills  : ${Object.entries(p.skills).map(([k,v])=>`${k}:${v}`).join(", ")}\n\n`;
  txt += `COMPLETED CONTRACTS\n`;
  completed.forEach(c => {
    txt += `  #${c.id} ${c.targetName} @ ${c.city} — ${c.reward.toLocaleString()}g (D${c.completedDay})\n`;
  });
  txt += `\nFAILED CONTRACTS\n`;
  failed.forEach(c => {
    txt += `  #${c.id} ${c.targetName} @ ${c.city} — Failed D${c.failedDay}\n`;
  });
  txt += `\nEVENT LOG\n`;
  state.events.forEach(e => {
    txt += `  D${e.day}: ${e.msg.replace(/<[^>]*>/g,"")}\n`;
  });
  txt += `\n=================================================\n`;

  const blob = new Blob([txt], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "zoldyck_report.txt";
  a.click();
}

function resetGame() {
  if (simRunning) pauseSim();
  clearTimeout(simHandle);
  state = createFreshState();
  simEvents = [];
  document.getElementById("btn-run").textContent = "▶ Run Simulation";
  document.getElementById("btn-run").disabled = false;
  const el = document.getElementById("final-report");
  if (el) el.style.display = "none";
  localStorage.removeItem("zoldyckState");
  renderAll();
  showToast("New game started!", "success");
}

function saveState() {
  try {
    localStorage.setItem("zoldyckState", JSON.stringify({
      player: state.player,
      contracts: state.contracts,
      events: state.events,
      done: state.done,
    }));
  } catch(e) { console.warn("Save failed:", e); }
}

function loadState() {
  try {
    const raw = localStorage.getItem("zoldyckState");
    if (!raw) return null;
    const saved = JSON.parse(raw);
    return { ...saved, activeContracts: saved.contracts.filter(c => c.status === "active") };
  } catch(e) { return null; }
}

function setupNav() {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      showSection(btn.dataset.section);
    });
  });
}

function showSection(name) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  const el = document.getElementById(`section-${name}`);
  if (el) el.classList.add("active");
  const btn = document.querySelector(`[data-section="${name}"]`);
  if (btn) btn.classList.add("active");
  if (name === "analytics") { setTimeout(() => renderCharts(state.player, state.contracts), 50); }
  if (name === "map")       { renderMapView(state.player, state.contracts, state.contracts.filter(c => c.status === "active")); }
}

function setupControls() {
  const runBtn = document.getElementById("btn-run");
  runBtn.addEventListener("click", () => {
    if (simRunning) pauseSim();
    else if (state.done) showToast("Simulation complete. Reset to run again.", "info");
    else startAutoSim();
  });

  document.getElementById("btn-reset").addEventListener("click", resetGame);

  document.getElementById("speed-control").addEventListener("input", e => {
    simSpeed = +e.target.value;
    document.getElementById("speed-val").textContent = `${simSpeed}x`;
  });

  document.getElementById("btn-save").addEventListener("click", () => {
    saveState();
    showToast("Progress saved!", "success");
  });
}

function showToast(msg, type = "info") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add("show"), 10);
  setTimeout(() => { toast.classList.remove("show"); setTimeout(() => toast.remove(), 400); }, 3000);
}

window.addEventListener("DOMContentLoaded", init);
