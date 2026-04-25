import tkinter as tk
from tkinter import ttk, messagebox
import random, math

# ── DATA MODEL ────────────────────────────────────────────────────────────────

class Prisoner:
    def __init__(self, pid, r_threat, r_tag, t_threat, t_tag, instigator=False, falsified=False):
        self.id = pid
        self.r_threat, self.r_tag = r_threat, r_tag
        self.t_threat, self.t_tag = t_threat, t_tag
        self.instigator = instigator
        self.falsified  = falsified
        self.floor = 0
        self.cell  = 0

class Tower:
    FLOORS = 15
    CELLS  = 7

    def __init__(self):
        self.turn = 0
        self.attention = 100
        self.swaps = 0
        self.last_obs = None
        self.instigator_id = None
        self.prisoners: list[Prisoner] = []
        self.grid = [[None]*self.CELLS for _ in range(self.FLOORS)]
        self._init()

    def _init(self):
        ins = random.randint(0, 99)
        for i in range(100):
            is_ins = i == ins
            t_tag = random.choice(['violent','non-violent'])
            t_thr = 10 if is_ins else random.randint(1,9)
            r_tag, r_thr, fals = t_tag, t_thr, False
            if is_ins:
                r_tag, r_thr, fals = 'non-violent', random.randint(1,3), True
                self.instigator_id = f'P{i:03d}'
            elif random.random() < 0.15:
                r_tag = 'non-violent' if t_tag=='violent' else 'violent'
                r_thr = max(1, min(10, t_thr + random.choice([-3,3])))
                fals  = True
            p = Prisoner(f'P{i:03d}', r_thr, r_tag, t_thr, t_tag, is_ins, fals)
            self.prisoners.append(p)

        pool = self.prisoners[:]
        random.shuffle(pool)
        idx = 0
        for f in range(self.FLOORS):
            for c in range(self.CELLS):
                if idx < len(pool):
                    p = pool[idx]; idx += 1
                    p.floor, p.cell = f, c
                    self.grid[f][c] = p

    def move_others(self, obs_floor):
        for f in range(self.FLOORS):
            if f == obs_floor: continue
            for c in range(self.CELLS):
                p = self.grid[f][c]
                if not p: continue
                prob = 0.4 if p.instigator else 0.08 + p.t_threat/40
                if random.random() < prob:
                    self._try_move(p)

    def _try_move(self, p):
        cands = []
        for df in (-1,0,1):
            nf = p.floor + df
            if not (0 <= nf < self.FLOORS): continue
            for nc in range(self.CELLS):
                if self.grid[nf][nc] is None:
                    score = sum(1 for x in self.grid[nf] if x and x.t_tag==p.t_tag)
                    cands.append((score + random.random(), nf, nc))
        if not cands: return
        cands.sort(reverse=True)
        _, nf, nc = cands[0]
        self.grid[p.floor][p.cell] = None
        p.floor, p.cell = nf, nc
        self.grid[nf][nc] = p

    def do_swap(self, id1, id2):
        p1 = next((x for x in self.prisoners if x.id==id1), None)
        p2 = next((x for x in self.prisoners if x.id==id2), None)
        if not p1 or not p2: return False
        f1,c1,f2,c2 = p1.floor,p1.cell,p2.floor,p2.cell
        self.grid[f1][c1],self.grid[f2][c2] = p2,p1
        p1.floor,p1.cell,p2.floor,p2.cell = f2,c2,f1,c1
        self.swaps += 1
        cost = 1 + max(0,(self.swaps-10)*2)
        self.attention = max(0, self.attention - cost)
        return True

    def separation_score(self):
        score = 100
        for f in range(self.FLOORS):
            fl = [p for p in self.grid[f] if p]
            v = sum(1 for p in fl if p.t_tag=='violent')
            n = sum(1 for p in fl if p.t_tag=='non-violent')
            if v and n: score -= min(v,n)*3
            if v >= 5:  score -= (v-4)*5
        return max(0, min(100, score))

    def density(self):
        return [
            sum(1 for p in self.grid[f] if p and p.t_tag=='violent')/self.CELLS
            for f in range(self.FLOORS)
        ]

# ── GUI ───────────────────────────────────────────────────────────────────────

BG     = '#08090f'
PANEL  = '#111320'
BORDER = '#1e2235'
RED    = '#ff3e3e'
BLUE   = '#00e5ff'
AMBER  = '#ffb300'
GREEN  = '#00ff88'
DIM    = '#6e758f'
WHITE  = '#dde1f0'

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title('TRICK TOWER — Prisoner Swap Strategy')
        self.configure(bg=BG)
        self.geometry('1280x720')
        self.resizable(True, True)

        self.tower = Tower()
        self.flagged: set[str] = set()
        self.swap_pending: str | None = None
        self.current_floor: int | None = None
        self.logs: list[str] = []

        self._build_ui()
        self._render_tower()
        self._update_stats()
        self._log('SYSTEM INITIALIZED. 100 prisoners loaded.', GREEN)
        self._log('SELECT A FLOOR TO BEGIN OBSERVATION.', BLUE)

    # ── BUILD UI ──────────────────────────────────────────────────────────────

    def _build_ui(self):
        # Header
        hdr = tk.Frame(self, bg=BG)
        hdr.pack(fill='x', padx=14, pady=(10,0))
        tk.Label(hdr, text='TRICK TOWER', bg=BG, fg=RED,
                 font=('Courier',22,'bold')).pack(side='left')
        tk.Label(hdr, text=' — PRISONER MANAGEMENT SYSTEM v2.0', bg=BG, fg=DIM,
                 font=('Courier',10)).pack(side='left', padx=6)

        self.lbl_turn  = tk.Label(hdr, text='TURN 0/50', bg=BG, fg=AMBER, font=('Courier',10,'bold'))
        self.lbl_attn  = tk.Label(hdr, text='ATTENTION 100%', bg=BG, fg=AMBER, font=('Courier',10,'bold'))
        self.lbl_sep   = tk.Label(hdr, text='SEPARATION —', bg=BG, fg=BLUE, font=('Courier',10,'bold'))
        for w in (self.lbl_sep, self.lbl_attn, self.lbl_turn):
            w.pack(side='right', padx=12)

        ttk.Separator(self, orient='horizontal').pack(fill='x', padx=14, pady=6)

        # Main area
        main = tk.Frame(self, bg=BG)
        main.pack(fill='both', expand=True, padx=14)

        # Left — tower
        left = tk.Frame(main, bg=PANEL, bd=0, highlightbackground=BORDER,
                        highlightthickness=1)
        left.pack(side='left', fill='both', expand=True, padx=(0,8))

        tk.Label(left, text='TOWER MONITOR — 15 FLOORS / 100 PRISONERS',
                 bg=PANEL, fg=DIM, font=('Courier',8)).pack(anchor='w', padx=10, pady=(8,4))

        self.tower_frame = tk.Frame(left, bg=PANEL)
        self.tower_frame.pack(fill='both', expand=True, padx=6, pady=4)
        self.floor_btns: list[tk.Frame] = []

        # Right — controls
        right = tk.Frame(main, bg=BG, width=380)
        right.pack(side='right', fill='y')
        right.pack_propagate(False)

        # Prisoner list panel
        pnl1 = tk.Frame(right, bg=PANEL, highlightbackground=BORDER, highlightthickness=1)
        pnl1.pack(fill='both', expand=True, pady=(0,8))
        self.floor_lbl = tk.Label(pnl1, text='FLOOR DATA — SELECT A FLOOR',
                                  bg=PANEL, fg=AMBER, font=('Courier',8,'bold'))
        self.floor_lbl.pack(anchor='w', padx=10, pady=(8,4))

        self.p_scroll = tk.Frame(pnl1, bg=PANEL)
        self.p_scroll.pack(fill='both', expand=True, padx=6, pady=4)

        # Strategy panel
        pnl2 = tk.Frame(right, bg=PANEL, highlightbackground=BORDER, highlightthickness=1)
        pnl2.pack(fill='both', expand=True)
        tk.Label(pnl2, text='STRATEGY ENGINE', bg=PANEL, fg=AMBER,
                 font=('Courier',8,'bold')).pack(anchor='w', padx=10, pady=(8,4))

        btn_row = tk.Frame(pnl2, bg=PANEL)
        btn_row.pack(fill='x', padx=8, pady=4)
        tk.Button(btn_row, text='📡 SUGGEST OBS.', bg=RED, fg='white',
                  font=('Courier',8,'bold'), bd=0, padx=8, pady=5,
                  command=self._suggest_obs).pack(side='left', fill='x', expand=True, padx=(0,4))
        tk.Button(btn_row, text='⇄ SUGGEST SWAP', bg=BLUE, fg='black',
                  font=('Courier',8,'bold'), bd=0, padx=8, pady=5,
                  command=self._suggest_swap).pack(side='right', fill='x', expand=True)

        self.suggestion = tk.Text(pnl2, bg='#000', fg=AMBER, font=('Courier',8),
                                  height=4, bd=0, state='disabled', wrap='word')
        self.suggestion.pack(fill='x', padx=8, pady=4)

        tk.Label(pnl2, text='🚩 FLAGGED RECORDS', bg=PANEL, fg=DIM,
                 font=('Courier',8)).pack(anchor='w', padx=10, pady=(6,2))
        self.flag_box = tk.Listbox(pnl2, bg=PANEL, fg=RED, font=('Courier',8),
                                   bd=0, height=5, selectbackground=BORDER)
        self.flag_box.pack(fill='both', expand=True, padx=8, pady=4)

        # Heatmap
        hm_frame = tk.Frame(self, bg=PANEL, highlightbackground=BORDER, highlightthickness=1)
        hm_frame.pack(fill='x', padx=14, pady=6)
        tk.Label(hm_frame, text='THREAT DENSITY HEATMAP', bg=PANEL, fg=DIM,
                 font=('Courier',7)).pack(anchor='w', padx=8, pady=(4,0))
        self.hm_canvas = tk.Canvas(hm_frame, bg='black', height=40, bd=0, highlightthickness=0)
        self.hm_canvas.pack(fill='x', padx=6, pady=4)

        # Log
        log_frame = tk.Frame(self, bg='black', highlightbackground=BORDER, highlightthickness=1)
        log_frame.pack(fill='x', padx=14, pady=(0,10))
        self.log_box = tk.Text(log_frame, bg='black', fg=GREEN, font=('Courier',8),
                               height=4, bd=0, state='disabled')
        self.log_box.pack(fill='x', padx=6, pady=4)

    # ── RENDER TOWER ──────────────────────────────────────────────────────────

    def _render_tower(self):
        for w in self.tower_frame.winfo_children():
            w.destroy()
        self.floor_btns.clear()
        density = self.tower.density()

        for f in range(14, -1, -1):
            locked = self.tower.last_obs == f
            active = self.current_floor == f

            row = tk.Frame(self.tower_frame, bg=PANEL, cursor='arrow' if locked else 'hand2')
            row.pack(fill='x', pady=1)

            # Floor label
            c = BLUE if active else (DIM if locked else WHITE)
            tk.Label(row, text=f'F{f:02d}', bg=PANEL, fg=c,
                     font=('Courier',8,'bold'), width=4).pack(side='left')

            # Cells
            for ci in range(self.tower.CELLS):
                p = self.tower.grid[f][ci]
                if p is None:
                    clr = '#1a1b2e'
                elif active:
                    clr = RED if p.t_tag=='violent' else BLUE
                elif f in (h for h in []):
                    clr = '#444'
                else:
                    clr = '#333'
                cell = tk.Label(row, bg=clr, width=2, height=1)
                cell.pack(side='left', padx=1)

            # Threat bar
            pct = density[f]
            bar_bg = tk.Frame(row, bg='#1a1b2e', width=60, height=8)
            bar_bg.pack(side='left', padx=6)
            bar_bg.pack_propagate(False)
            r = int(pct*255); g = int((1-pct)*180)
            bar_fill = tk.Frame(bar_bg, bg=f'#{r:02x}{g:02x}1e', height=8,
                                width=int(pct*60))
            bar_fill.place(x=0, y=0)

            if locked:
                tk.Label(row, text='LOCKED', bg=PANEL, fg='#333',
                         font=('Courier',7)).pack(side='right', padx=4)
            else:
                row.bind('<Button-1>', lambda e, fl=f: self._observe(fl))
                for child in row.winfo_children():
                    child.bind('<Button-1>', lambda e, fl=f: self._observe(fl))

            self.floor_btns.append(row)

        self._draw_heatmap()

    # ── OBSERVE ───────────────────────────────────────────────────────────────

    def _observe(self, f):
        if self.tower.turn >= 50:
            return
        self.current_floor = f
        self.tower.last_obs = f
        self.tower.turn += 1
        self.tower.move_others(f)
        fl = [p for p in self.tower.grid[f] if p]
        self._log(f'[T{self.tower.turn}] Floor {f} observed — {len(fl)} prisoners.', GREEN)
        self._analyze(f)
        self._render_tower()
        self._render_prisoners(f)
        self._update_stats()
        if self.tower.turn >= 50:
            self.after(400, self._end_game)

    # ── PRISONER LIST ─────────────────────────────────────────────────────────

    def _render_prisoners(self, f):
        for w in self.p_scroll.winfo_children():
            w.destroy()
        self.floor_lbl.config(text=f'FLOOR DATA — FLOOR {f:02d}')
        prisoners = [p for p in self.tower.grid[f] if p]
        if not prisoners:
            tk.Label(self.p_scroll, text='Floor is empty', bg=PANEL, fg=DIM,
                     font=('Courier',9,'italic')).pack(pady=20)
            return

        canvas = tk.Canvas(self.p_scroll, bg=PANEL, bd=0, highlightthickness=0)
        scroll = ttk.Scrollbar(self.p_scroll, orient='vertical', command=canvas.yview)
        canvas.configure(yscrollcommand=scroll.set)
        scroll.pack(side='right', fill='y')
        canvas.pack(side='left', fill='both', expand=True)
        inner = tk.Frame(canvas, bg=PANEL)
        canvas.create_window((0,0), window=inner, anchor='nw')
        inner.bind('<Configure>', lambda e: canvas.configure(scrollregion=canvas.bbox('all')))

        for p in prisoners:
            is_flagged   = p.id in self.flagged
            is_instigator= p.instigator and is_flagged
            border       = RED if p.r_tag=='violent' else BLUE
            card = tk.Frame(inner, bg='#15172a', highlightbackground=border,
                            highlightthickness=2)
            card.pack(fill='x', padx=4, pady=3)

            info = tk.Frame(card, bg='#15172a')
            info.pack(side='left', fill='both', expand=True, padx=6, pady=4)

            id_txt = p.id
            if is_instigator: id_txt += ' ⚠ INSTIGATOR'
            elif is_flagged:  id_txt += ' 🚩'
            if self.swap_pending == p.id: id_txt += ' [SELECTED]'

            tk.Label(info, text=id_txt, bg='#15172a', fg=WHITE,
                     font=('Courier',9,'bold')).pack(anchor='w')
            tag_color = RED if p.r_tag=='violent' else BLUE
            tk.Label(info, text=f'{p.r_tag.upper()}  LVL {p.r_threat}  CELL {p.cell+1}',
                     bg='#15172a', fg=tag_color, font=('Courier',8)).pack(anchor='w')

            acts = tk.Frame(card, bg='#15172a')
            acts.pack(side='right', padx=6, pady=4)

            tk.Button(acts, text='⇄ SWAP', bg='#001f2e', fg=BLUE,
                      font=('Courier',8,'bold'), bd=0, padx=6, pady=3,
                      command=lambda pid=p.id: self._handle_swap(pid)).pack(pady=2)
            fg2 = AMBER if is_flagged else RED
            tk.Button(acts, text='✓ UNFLAG' if is_flagged else '🚩 FLAG',
                      bg='#1a0000', fg=fg2,
                      font=('Courier',8,'bold'), bd=0, padx=6, pady=3,
                      command=lambda pid=p.id: self._flag(pid)).pack(pady=2)

    # ── SWAP ──────────────────────────────────────────────────────────────────

    def _handle_swap(self, pid):
        if self.swap_pending is None:
            self.swap_pending = pid
            self._log(f'Swap: {pid} selected. Click another prisoner to swap.', AMBER)
            self._render_prisoners(self.current_floor)
        elif self.swap_pending == pid:
            self.swap_pending = None
            self._render_prisoners(self.current_floor)
        else:
            t = self.swap_pending
            self.swap_pending = None
            if self.tower.do_swap(t, pid):
                self._log(f'SWAP: {t} ⇄ {pid}', BLUE)
                self._render_tower()
                self._render_prisoners(self.current_floor)
                self._update_stats()

    # ── FLAG ──────────────────────────────────────────────────────────────────

    def _flag(self, pid):
        if pid in self.flagged:
            self.flagged.discard(pid)
        else:
            self.flagged.add(pid)
            p = next(x for x in self.tower.prisoners if x.id==pid)
            if p.instigator:
                self._log(f'🚨 INSTIGATOR CAUGHT: {pid}!', RED)
        self._update_flagged()
        self._render_prisoners(self.current_floor)

    def _update_flagged(self):
        self.flag_box.delete(0, 'end')
        for pid in self.flagged:
            p = next(x for x in self.tower.prisoners if x.id==pid)
            mark = ' ⚠ INSTIGATOR' if p.instigator else ''
            self.flag_box.insert('end', f'{pid}{mark}')

    # ── ANALYZE ───────────────────────────────────────────────────────────────

    def _analyze(self, f):
        fl = [p for p in self.tower.grid[f] if p]
        v_rec = sum(1 for p in fl if p.r_tag=='violent')
        for p in fl:
            if p.r_tag=='non-violent' and v_rec >= 4 and random.random() < 0.35:
                self._set_suggestion(
                    f'⚠ ANOMALY: {p.id} (non-violent record)\n'
                    f'found in high-threat cluster on F{f}.\n'
                    f'Possible falsification — consider flagging.'
                )
                break

    # ── SUGGESTIONS ───────────────────────────────────────────────────────────

    def _suggest_obs(self):
        d = self.tower.density()
        best = max(
            (f for f in range(15) if f != self.tower.last_obs),
            key=lambda f: d[f] + random.random()*0.3
        )
        self._set_suggestion(
            f'📡 OBSERVATION STRATEGY\n'
            f'Recommend: Floor {best}\n'
            f'High threat density detected.'
        )

    def _suggest_swap(self):
        if self.current_floor is None:
            self._set_suggestion('Observe a floor first.')
            return
        fl = [p for p in self.tower.grid[self.current_floor] if p]
        viol = [p for p in fl if p.r_tag=='violent']
        if not viol:
            self._set_suggestion('No violent prisoners on this floor.\nObserve another floor.')
            return
        target = viol[0]
        low_f  = max(0, self.current_floor - 3)
        cands  = [p for p in self.tower.grid[low_f] if p and p.r_tag=='non-violent']
        if cands:
            self._set_suggestion(
                f'⇄ SWAP STRATEGY\n'
                f'Move {target.id} (violent, F{self.current_floor})\n'
                f'↔ Swap with {cands[0].id} (non-violent, F{low_f})'
            )
        else:
            self._set_suggestion(f'Move {target.id} to a lower floor.\nObserve lower floors first.')

    def _set_suggestion(self, txt):
        self.suggestion.config(state='normal')
        self.suggestion.delete('1.0','end')
        self.suggestion.insert('end', txt)
        self.suggestion.config(state='disabled')

    # ── STATS ─────────────────────────────────────────────────────────────────

    def _update_stats(self):
        self.lbl_turn.config(text=f'TURN {self.tower.turn}/50')
        self.lbl_attn.config(text=f'ATTENTION {int(self.tower.attention)}%')
        sc = self.tower.separation_score()
        clr = BLUE if sc>60 else AMBER if sc>30 else RED
        self.lbl_sep.config(text=f'SEPARATION {sc:.0f}%', fg=clr)

    # ── HEATMAP ───────────────────────────────────────────────────────────────

    def _draw_heatmap(self):
        c = self.hm_canvas
        c.update_idletasks()
        W, H = c.winfo_width() or 900, 40
        c.delete('all')
        d = self.tower.density()
        fw = W / 15
        for f in range(15):
            x0 = f*fw; x1 = x0+fw-1
            v  = d[f]
            r  = int(v*255); g = int((1-v)*180)
            clr = f'#{r:02x}{g:02x}1e'
            c.create_rectangle(x0,0,x1,H, fill=clr, outline='')
            if f == self.current_floor:
                c.create_rectangle(x0+1,1,x1-1,H-1, outline=BLUE, width=2)
            c.create_text(x0+fw/2, H-6, text=f'F{f}', fill='white',
                          font=('Courier',6))

    # ── LOG ───────────────────────────────────────────────────────────────────

    def _log(self, msg, color=GREEN):
        self.log_box.config(state='normal')
        self.log_box.insert('1.0', f'> {msg}\n', color)
        self.log_box.tag_config(color, foreground=color)
        self.log_box.config(state='disabled')

    # ── END GAME ──────────────────────────────────────────────────────────────

    def _end_game(self):
        sc   = self.tower.separation_score()
        ins  = self.tower.instigator_id in self.flagged
        falses = sum(1 for pid in self.flagged
                     if next(p for p in self.tower.prisoners if p.id==pid).falsified)
        total  = sum(1 for p in self.tower.prisoners if p.falsified)
        win    = sc > 60 and ins
        result = (
            f"{'🏆 MISSION SUCCESS' if win else '💀 MISSION FAILURE'}\n\n"
            f"Separation Score  : {sc:.1f}%\n"
            f"Instigator Found  : {'✓ YES' if ins else '✗ NO'}\n"
            f"Falsified Records : {falses}/{total}\n"
            f"Swaps Used        : {self.tower.swaps}\n"
            f"Attention Left    : {int(self.tower.attention)}%\n"
        )
        if messagebox.askyesno('MISSION COMPLETE', result + '\nRestart?'):
            self.destroy()
            App().mainloop()
        else:
            self.destroy()

# ── ENTRY ─────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    app = App()
    app.mainloop()
