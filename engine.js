import { TrickTower } from './game.js';

class DecisionEngine {
    constructor() {
        this.tower = new TrickTower();
        this.currentFloor = null;
        this.flagged = new Set();
        this.heatmapHistory = [];

        this._initDOM();
        this._renderTower();
        this._updateStats();
        this._log('SYSTEM INITIALIZED. 100 prisoners loaded across 15 floors.', 'info');
        this._log('SELECT A FLOOR TO BEGIN OBSERVATION.', 'success');
    }

    _initDOM() {
        this.towerGrid = document.getElementById('tower-grid');
        this.prisonerList = document.getElementById('prisoner-list');
        this.suggestionOutput = document.getElementById('suggestion-output');
        this.eventLog = document.getElementById('event-log');
        this.flaggedList = document.getElementById('flagged-prisoners');
        this.turnVal = document.querySelector('#turn-counter .val');
        this.attentionVal = document.querySelector('#attention-meter .val');
        this.stabilityVal = document.querySelector('#stability-index .val');
        this.heatmapCanvas = document.getElementById('heatmap-canvas');
        this.ctx = this.heatmapCanvas.getContext('2d');
        this.currentFloorLabel = document.getElementById('current-floor-id');

        document.getElementById('suggest-obs-btn').addEventListener('click', () => this._suggestObservation());
        document.getElementById('suggest-swap-btn').addEventListener('click', () => this._suggestSwap());
        document.getElementById('modal-close').addEventListener('click', () => location.reload());

        // Pending swap state
        this._swapPending = null;
    }

    // ─── RENDERING ────────────────────────────────────────────────────────────

    _renderTower() {
        this.towerGrid.innerHTML = '';
        const density = this.tower.getThreatDensityPerFloor();

        for (let f = 14; f >= 0; f--) {
            const floorEl = document.createElement('div');
            floorEl.className = 'floor';
            floorEl.id = `floor-${f}`;

            const isLastObserved = this.tower.lastObservedFloor === f;
            const isCurrent = this.currentFloor === f;

            if (isLastObserved) floorEl.classList.add('observed-last');
            if (isCurrent) floorEl.classList.add('active');

            // Threat bar width based on density
            const threatPct = Math.round(density[f] * 100);
            const barColor = `hsl(${(1 - density[f]) * 120}, 90%, 50%)`;

            floorEl.innerHTML = `
                <div class="floor-label">F${f.toString().padStart(2, '0')}</div>
                <div class="cells-mini">
                    ${this.tower.cells[f].map((p, ci) => {
                        if (!p) return `<div class="cell-dot empty"></div>`;
                        let cls = 'unknown';
                        // Only reveal true color for currently observed floor
                        if (isCurrent) {
                            cls = p.trueTag === 'violent' ? 'violent' : 'non-violent';
                        } else if (this.heatmapHistory.some(h => h.floor === f)) {
                            cls = p.recordedTag === 'violent' ? 'violent-rec' : 'non-violent-rec';
                        }
                        return `<div class="cell-dot ${cls}" title="${p ? p.id : ''}"></div>`;
                    }).join('')}
                </div>
                <div class="floor-threat-bar">
                    <div class="floor-threat-fill" style="width:${threatPct}%;background:${barColor}"></div>
                </div>
                ${isLastObserved ? '<span class="floor-badge locked">LOCKED</span>' : ''}
            `;

            if (!isLastObserved) {
                floorEl.addEventListener('click', () => this._observeFloor(f));
                floorEl.style.cursor = 'pointer';
            } else {
                floorEl.style.cursor = 'not-allowed';
                floorEl.title = 'Guard rotation — cannot observe same floor twice';
            }

            this.towerGrid.appendChild(floorEl);
        }
    }

    _renderPrisonerList(f) {
        this.currentFloorLabel.textContent = `FLOOR ${f.toString().padStart(2, '0')}`;
        const prisoners = this.tower.cells[f].filter(Boolean);

        if (!prisoners.length) {
            this.prisonerList.innerHTML = '<div class="empty-state">Floor is empty</div>';
            return;
        }

        this.prisonerList.innerHTML = prisoners.map(p => {
            const isFlagged = this.flagged.has(p.id);
            const isInstigator = p.isInstigator && isFlagged;
            const cardClass = p.recordedTag === 'violent' ? 'violent-tag' : 'non-violent-tag';
            const instigatorBadge = isInstigator ? `<span class="badge instigator-badge">⚠ INSTIGATOR</span>` : '';
            const flaggedBadge = isFlagged && !isInstigator ? `<span class="badge flagged-badge">🚩 FLAGGED</span>` : '';
            const swapTargetBadge = this._swapPending === p.id ? `<span class="badge swap-badge">SELECTED</span>` : '';

            return `
            <div class="prisoner-card ${cardClass}" id="pcard-${p.id}">
                <div class="prisoner-info">
                    <div class="prisoner-id">${p.id} ${instigatorBadge}${flaggedBadge}${swapTargetBadge}</div>
                    <div class="prisoner-tags">
                        <span class="tag-chip ${p.recordedTag}">${p.recordedTag.toUpperCase()}</span>
                        <span class="tag-chip level">LVL ${p.recordedThreat}</span>
                        <span class="tag-chip cell">CELL ${p.currentCell + 1}</span>
                    </div>
                </div>
                <div class="prisoner-actions">
                    <button class="btn-action swap-btn" onclick="window.engine._handleSwapClick('${p.id}')">⇄ SWAP</button>
                    <button class="btn-action flag-btn ${isFlagged ? 'unflag' : ''}" onclick="window.engine._flagPrisoner('${p.id}')">
                        ${isFlagged ? '✓ UNFLAG' : '🚩 FLAG'}
                    </button>
                </div>
            </div>`;
        }).join('');
    }

    _renderFlagged() {
        if (this.flagged.size === 0) {
            this.flaggedList.innerHTML = '<li class="no-flags">No flagged prisoners</li>';
            return;
        }
        this.flaggedList.innerHTML = Array.from(this.flagged).map(id => {
            const p = this.tower.prisoners.find(x => x.id === id);
            const instigatorMark = p && p.isInstigator ? ' ⚠ INSTIGATOR' : '';
            return `<li class="flagged-item">${id}${instigatorMark} — Suspicious</li>`;
        }).join('');
    }

    // ─── GAME ACTIONS ─────────────────────────────────────────────────────────

    _observeFloor(f) {
        if (this.tower.turn >= this.tower.maxTurns) return;

        this.currentFloor = f;
        this.tower.lastObservedFloor = f;
        this.tower.turn++;

        // Record heatmap snapshot
        const density = this.tower.getThreatDensityPerFloor();
        this.heatmapHistory.push({ floor: f, turn: this.tower.turn, density: [...density] });

        // Move other prisoners
        this.tower.movePrisoners(f);

        // Increment observation count for prisoners on this floor
        this.tower.cells[f].filter(Boolean).forEach(p => p.observedCount++);

        this._log(`[T${this.tower.turn}] Observing FLOOR ${f} — ${this.tower.cells[f].filter(Boolean).length} prisoners detected.`);
        this._analyzeBehavior(f);
        this._renderTower();
        this._renderPrisonerList(f);
        this._updateStats();
        this._drawHeatmap();

        if (this.tower.turn >= this.tower.maxTurns) {
            setTimeout(() => this._endGame(), 500);
        }
    }

    _handleSwapClick(pId) {
        if (!this._swapPending) {
            // First selection
            this._swapPending = pId;
            this._log(`Swap initiated: ${pId} selected. Click another prisoner to complete swap.`, 'warning');
            this._renderPrisonerList(this.currentFloor);
        } else if (this._swapPending === pId) {
            // Deselect
            this._swapPending = null;
            this._renderPrisonerList(this.currentFloor);
        } else {
            // Execute swap
            const target = this._swapPending;
            this._swapPending = null;
            if (this.tower.swap(target, pId)) {
                this._log(`SWAP COMPLETE: ${target} ⇄ ${pId}`, 'success');
                this._renderTower();
                this._renderPrisonerList(this.currentFloor);
                this._updateStats();
                this._drawHeatmap();
            } else {
                this._log('Swap failed — invalid prisoners.', 'error');
            }
        }
    }

    _flagPrisoner(id) {
        if (this.flagged.has(id)) {
            this.flagged.delete(id);
            this._log(`${id} — removed from watchlist.`, 'warning');
        } else {
            this.flagged.add(id);
            const p = this.tower.prisoners.find(x => x.id === id);
            if (p && p.isInstigator) {
                this._log(`🚨 INSTIGATOR IDENTIFIED: ${id} — RIOT ORGANIZER FOUND!`, 'success');
            } else {
                this._log(`${id} flagged for falsified records.`, 'warning');
            }
        }
        this._renderFlagged();
        this._renderPrisonerList(this.currentFloor);
    }

    // ─── AI / STRATEGY ────────────────────────────────────────────────────────

    _analyzeBehavior(f) {
        const floor = this.tower.cells[f].filter(Boolean);
        const violentRec = floor.filter(p => p.recordedTag === 'violent').length;
        const nonViolentRec = floor.filter(p => p.recordedTag === 'non-violent').length;

        // Flag suspicious prisoners: recorded non-violent but floor is violent-heavy
        floor.forEach(p => {
            if (p.recordedTag === 'non-violent' && violentRec >= 4 && !this.flagged.has(p.id)) {
                if (Math.random() < 0.35) {
                    this._log(`⚠ ANOMALY: ${p.id} (non-violent record) found in high-threat cluster on F${f}.`, 'warning');
                    this.suggestionOutput.innerHTML = `
                        <strong>⚠ ALGORITHM ALERT</strong><br>
                        ${p.id} — Non-violent record but moves within violent clusters.<br>
                        Possible instigator profile. Consider flagging.
                    `;
                }
            }
        });
    }

    _suggestObservation() {
        const density = this.tower.getThreatDensityPerFloor();
        let bestFloor = -1;
        let bestScore = -1;

        for (let f = 0; f < 15; f++) {
            if (f === this.tower.lastObservedFloor) continue;
            const observedBonus = this.heatmapHistory.filter(h => h.floor === f).length;
            const score = density[f] + (Math.random() * 0.3) - (observedBonus * 0.05);
            if (score > bestScore) {
                bestScore = score;
                bestFloor = f;
            }
        }

        this.suggestionOutput.innerHTML = `
            <strong>📡 OBSERVATION STRATEGY</strong><br>
            Recommend: <strong>Floor ${bestFloor}</strong><br>
            High threat density detected. Prioritize surveillance.
        `;
        this._log(`Strategy engine recommends Floor ${bestFloor}.`, 'info');

        // Visually highlight the recommended floor
        document.querySelectorAll('.floor').forEach(el => el.classList.remove('recommended'));
        const recEl = document.getElementById(`floor-${bestFloor}`);
        if (recEl) recEl.classList.add('recommended');
    }

    _suggestSwap() {
        if (this.currentFloor === null) {
            this.suggestionOutput.innerHTML = '<strong>⚠</strong> Observe a floor first to get swap suggestions.';
            return;
        }

        const floor = this.tower.cells[this.currentFloor].filter(Boolean);
        const violent = floor.filter(p => p.recordedTag === 'violent');

        if (!violent.length) {
            this.suggestionOutput.innerHTML = `
                <strong>✓ FLOOR CLEAR</strong><br>
                No recorded violent prisoners on this floor.<br>
                Consider observing a different floor.
            `;
            return;
        }

        // Find a non-violent prisoner on a lower floor to swap with
        const lowerFloor = this.currentFloor > 0
            ? this.tower.cells[Math.max(0, this.currentFloor - 3)].filter(p => p && p.recordedTag === 'non-violent')
            : [];

        const target = violent[0];
        const swapTarget = lowerFloor[0];

        if (swapTarget) {
            this.suggestionOutput.innerHTML = `
                <strong>⇄ SWAP STRATEGY</strong><br>
                Move <strong>${target.id}</strong> (violent, F${this.currentFloor})<br>
                → Swap with <strong>${swapTarget.id}</strong> (non-violent, F${swapTarget.currentFloor})<br>
                <em>Click SWAP on each prisoner card to execute.</em>
            `;
        } else {
            this.suggestionOutput.innerHTML = `
                <strong>⇄ SWAP STRATEGY</strong><br>
                Move <strong>${target.id}</strong> to a non-violent floor.<br>
                Observe lower floors first to find candidates.
            `;
        }
    }

    // ─── STATS & HEATMAP ──────────────────────────────────────────────────────

    _updateStats() {
        this.turnVal.textContent = `${this.tower.turn}/50`;
        this.attentionVal.textContent = `${Math.floor(this.tower.attention)}%`;
        const score = this.tower.calculateSeparationScore();
        this.stabilityVal.textContent = `${Math.floor(score)}%`;

        // Color-code stability
        const scoreColor = score > 70 ? '#00e5ff' : score > 40 ? '#ffb300' : '#ff3e3e';
        this.stabilityVal.style.color = scoreColor;

        // Attention warning
        if (this.tower.attention < 30) {
            this.attentionVal.style.color = '#ff3e3e';
        }
    }

    _drawHeatmap() {
        const canvas = this.heatmapCanvas;
        const ctx = this.ctx;
        canvas.width = canvas.offsetWidth || 800;
        canvas.height = canvas.offsetHeight || 60;
        const W = canvas.width;
        const H = canvas.height;

        ctx.clearRect(0, 0, W, H);

        const density = this.tower.getThreatDensityPerFloor();
        const fw = W / 15;

        for (let f = 0; f < 15; f++) {
            const d = density[f];
            // Color: green→yellow→red based on density
            const r = Math.round(d * 255);
            const g = Math.round((1 - d) * 200);
            ctx.fillStyle = `rgba(${r}, ${g}, 30, ${0.3 + d * 0.7})`;
            ctx.fillRect(f * fw, 0, fw - 1, H);

            // Observation marker
            if (f === this.currentFloor) {
                ctx.strokeStyle = '#00e5ff';
                ctx.lineWidth = 2;
                ctx.strokeRect(f * fw + 1, 1, fw - 3, H - 2);
            }

            // Floor label
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.font = '9px monospace';
            ctx.fillText(`F${f}`, f * fw + 3, H - 4);
        }
    }

    // ─── UTILS ────────────────────────────────────────────────────────────────

    _log(msg, type = 'info') {
        const el = document.createElement('p');
        el.className = `system-msg ${type}`;
        el.textContent = `> ${msg}`;
        this.eventLog.prepend(el);
        // Keep log trimmed
        const children = this.eventLog.querySelectorAll('p');
        if (children.length > 50) children[children.length - 1].remove();
    }

    _endGame() {
        const score = this.tower.calculateSeparationScore();
        const foundInstigator = Array.from(this.flagged).some(id => id === this.tower.instigatorId);
        const correctFlags = Array.from(this.flagged).filter(id => {
            const p = this.tower.prisoners.find(x => x.id === id);
            return p && p.isFalsified;
        }).length;
        const totalFalsified = this.tower.prisoners.filter(p => p.isFalsified).length;
        const success = score > 60 && foundInstigator;

        document.getElementById('modal-title').textContent = success ? '🏆 MISSION SUCCESS' : '💀 MISSION FAILURE';
        document.getElementById('modal-content').innerHTML = `
            <div class="result-grid">
                <div class="result-row">
                    <span>Separation Score</span>
                    <strong style="color:${score>60?'#00e5ff':'#ff3e3e'}">${score.toFixed(1)}%</strong>
                </div>
                <div class="result-row">
                    <span>Instigator Found</span>
                    <strong style="color:${foundInstigator?'#00e5ff':'#ff3e3e'}">${foundInstigator?'✓ YES':'✗ NO'}</strong>
                </div>
                <div class="result-row">
                    <span>Falsified Records</span>
                    <strong>${correctFlags} / ${totalFalsified}</strong>
                </div>
                <div class="result-row">
                    <span>Swaps Used</span>
                    <strong>${this.tower.swapsPerformed}</strong>
                </div>
                <div class="result-row">
                    <span>Attention Remaining</span>
                    <strong>${Math.floor(this.tower.attention)}%</strong>
                </div>
            </div>
            <p style="margin-top:20px;font-size:0.85rem;color:var(--text-dim)">
                ${success
                    ? 'The tower is secure. The instigator is in custody. The riot has been contained.'
                    : 'The tower is compromised. Some violent prisoners remain clustered. Regroup and try again.'}
            </p>
        `;

        document.getElementById('overlay').classList.remove('hidden');
    }
}

window.engine = new DecisionEngine();
