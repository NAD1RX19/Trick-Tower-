class Prisoner {
    constructor(id, recordedThreat, recordedTag, trueThreat, trueTag, isInstigator = false, isFalsified = false) {
        this.id = id;
        this.recordedThreat = recordedThreat;
        this.recordedTag = recordedTag;
        this.trueThreat = trueThreat;
        this.trueTag = trueTag;
        this.isInstigator = isInstigator;
        this.isFalsified = isFalsified;
        this.currentFloor = null;
        this.currentCell = null;
        this.observedCount = 0;
    }
}

class TrickTower {
    constructor() {
        this.FLOORS = 15;
        this.CELLS_PER_FLOOR = 7;
        this.TOTAL_CELLS = this.FLOORS * this.CELLS_PER_FLOOR; // 105 cells for 100 prisoners
        this.turn = 0;
        this.maxTurns = 50;
        this.attention = 100;
        this.swapsPerformed = 0;
        this.lastObservedFloor = null;
        this.instigatorId = null;
        this.prisoners = [];
        this.cells = Array.from({ length: this.FLOORS }, () =>
            new Array(this.CELLS_PER_FLOOR).fill(null)
        );
        this._initPrisoners();
        this._placePrisoners();
    }

    _initPrisoners() {
        const instigatorIdx = Math.floor(Math.random() * 100);

        for (let i = 0; i < 100; i++) {
            const isInstigator = i === instigatorIdx;
            const trueTag = Math.random() > 0.45 ? 'violent' : 'non-violent';
            const trueThreat = isInstigator ? 10 : Math.ceil(Math.random() * 9);
            let recordedTag = trueTag;
            let recordedThreat = trueThreat;
            let isFalsified = false;

            if (isInstigator) {
                recordedTag = 'non-violent';
                recordedThreat = Math.floor(Math.random() * 3) + 1; // 1-3
                isFalsified = true;
                this.instigatorId = `P-${i.toString().padStart(3, '0')}`;
            } else if (Math.random() < 0.15) {
                recordedTag = trueTag === 'violent' ? 'non-violent' : 'violent';
                recordedThreat = Math.max(1, Math.min(10, trueThreat + (Math.random() > 0.5 ? 3 : -3) | 0));
                isFalsified = true;
            }

            const p = new Prisoner(
                `P-${i.toString().padStart(3, '0')}`,
                recordedThreat, recordedTag,
                trueThreat, trueTag,
                isInstigator, isFalsified
            );
            this.prisoners.push(p);
        }
    }

    _placePrisoners() {
        // Shuffle prisoners
        const pool = [...this.prisoners].sort(() => Math.random() - 0.5);
        let idx = 0;
        for (let f = 0; f < this.FLOORS; f++) {
            for (let c = 0; c < this.CELLS_PER_FLOOR; c++) {
                if (idx < pool.length) {
                    const p = pool[idx++];
                    p.currentFloor = f;
                    p.currentCell = c;
                    this.cells[f][c] = p;
                }
            }
        }
    }

    movePrisoners(observedFloor) {
        // Move prisoners on unobserved floors probabilistically
        for (let f = 0; f < this.FLOORS; f++) {
            if (f === observedFloor) continue;
            for (let c = 0; c < this.CELLS_PER_FLOOR; c++) {
                const p = this.cells[f][c];
                if (!p) continue;
                const moveChance = p.isInstigator ? 0.45 : 0.08 + (p.trueThreat / 40);
                if (Math.random() < moveChance) {
                    this._tryMove(p);
                }
            }
        }
    }

    _tryMove(p) {
        const f = p.currentFloor;
        const c = p.currentCell;
        const candidates = [];

        // Prefer floor with same-threat prisoners (clustering)
        for (let df = -1; df <= 1; df++) {
            const nf = f + df;
            if (nf < 0 || nf >= this.FLOORS) continue;
            for (let nc = 0; nc < this.CELLS_PER_FLOOR; nc++) {
                if (!this.cells[nf][nc]) {
                    // Score: how many same-true-tag neighbors
                    let score = Math.random();
                    for (let nc2 = 0; nc2 < this.CELLS_PER_FLOOR; nc2++) {
                        const nb = this.cells[nf][nc2];
                        if (nb && nb.trueTag === p.trueTag) score += 0.5;
                    }
                    candidates.push({ f: nf, c: nc, score });
                }
            }
        }

        if (candidates.length === 0) return;
        candidates.sort((a, b) => b.score - a.score);
        const dest = candidates[0];

        this.cells[f][c] = null;
        p.currentFloor = dest.f;
        p.currentCell = dest.c;
        this.cells[dest.f][dest.c] = p;
    }

    swap(id1, id2) {
        const p1 = this.prisoners.find(p => p.id === id1);
        const p2 = this.prisoners.find(p => p.id === id2);
        if (!p1 || !p2) return false;

        const [f1, c1, f2, c2] = [p1.currentFloor, p1.currentCell, p2.currentFloor, p2.currentCell];
        this.cells[f1][c1] = p2;
        this.cells[f2][c2] = p1;
        [p1.currentFloor, p1.currentCell, p2.currentFloor, p2.currentCell] = [f2, c2, f1, c1];

        this.swapsPerformed++;
        const extraCost = this.swapsPerformed > 10 ? Math.min(15, (this.swapsPerformed - 10) * 2) : 0;
        this.attention = Math.max(0, this.attention - 1 - extraCost);
        return true;
    }

    // Score: 0 (worst) to 100 (best separation)
    calculateSeparationScore() {
        let score = 100;
        for (let f = 0; f < this.FLOORS; f++) {
            const floor = this.cells[f].filter(Boolean);
            const vCount = floor.filter(p => p.trueTag === 'violent').length;
            const nCount = floor.filter(p => p.trueTag === 'non-violent').length;
            // Mixed floors lose points
            if (vCount > 0 && nCount > 0) {
                score -= Math.min(vCount, nCount) * 3;
            }
            // Too many violent in one floor is dangerous
            if (vCount >= 5) score -= (vCount - 4) * 5;
        }
        return Math.max(0, Math.min(100, score));
    }

    getThreatDensityPerFloor() {
        return this.cells.map(floor => {
            const prisoners = floor.filter(Boolean);
            if (!prisoners.length) return 0;
            return prisoners.filter(p => p.trueTag === 'violent').length / this.CELLS_PER_FLOOR;
        });
    }
}

export { TrickTower, Prisoner };
