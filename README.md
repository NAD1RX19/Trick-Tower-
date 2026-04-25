# CHALLENGE 03: THE ZOLDYCK ASSASSINATION CONTRACT BOARD

A premium, strategy-driven simulation project inspired by Hunter x Hunter. Manage assassination contracts, navigate the world map, and optimize your path to become the most successful Zoldyck operative.

## 🚀 Key Features

- **Contract Optimization Engine**: Uses a weighted scoring system to decide which contracts are worth the risk/travel.
- **Dijkstra Route Planner**: Computes the shortest travel path between cities to minimize wasted days.
- **Dynamic Simulation**: Day-by-day logs showing travel, execution, complications, and skill gains.
- **Skill Progression**: Level up your Stealth, Combat, Poison, Intelligence, and Speed to unlock higher-tier contracts.
- **Visual Analytics**: Live charts for Gold, Reputation, and Skills using pure Canvas.
- **Uncertainty System**: Traps, complications (1.5x execution time), and reputation penalties.
- **Premium UI**: Luxury dark theme with silver, gold, and red accents, featuring glassmorphism and pulsing effects.

## 📂 Project Structure

```text
zoldyck-contract-board/
├── index.html           # Main entry point & layout
├── style.css            # Luxury Assassin Terminal styles
├── app.js               # Main controller & state management
├── data/
│   ├── contracts.js     # 50 auto-generated mission data
│   ├── mapData.js       # World map graph & connections
│   └── playerProfile.js # Initial stats & history factory
├── engine/
│   ├── optimizer.js     # Weighted scoring & greedy selection
│   ├── routePlanner.js  # Dijkstra shortest path implementation
│   ├── skillSystem.js   # Progression & requirements logic
│   ├── uncertainty.js   # Traps & complication RNG
│   └── simulator.js     # The core simulation loop
└── components/
    ├── Dashboard.js     # HUD & stats cards
    ├── ContractBoard.js # Filterable mission board
    ├── MapView.js       # SVG Interactive map
    ├── Timeline.js      # Scrollable event logs
    └── Charts.js        # Canvas-based data visualization
```

## 🛠 How It Works

### 1. Optimization Decision
The engine scores each available contract based on:
- **Reward**: Higher gold gives higher weight.
- **Distance**: Closer targets are preferred.
- **Urgency**: Contracts nearing deadlines are prioritized.
- **Skills**: Skill rewards contribute to long-term value.
- **Risk**: Traps and complications reduce the score.

### 2. Route Planning
The `routePlanner` uses **Dijkstra's Algorithm** to find the minimal days needed to travel between any two cities on the graph. This allows the simulator to "chain" contracts efficiently.

### 3. Traps & Complications
When a contract is accepted, there is a chance it's a **Trap**. Traps increase difficulty and duration. If your reputation is low, the system might auto-abandon traps (with a penalty) to avoid failure. Complications (20% chance) represent unforeseen battle conditions that make execution take longer.

### 4. Progression
Completing missions grants Skill Points. As skills grow, the "Skill Gap" for Tier 4 and Tier 5 contracts closes, allowing the player to take on high-reward missions that were previously impossible.

## 🖥 How to Run

1. Open `index.html` in any modern web browser.
2. Click **"Run Simulation"** to watch the Zoldyck operative work through 200 days automatically.
3. Use the **Speed slider** to fast-forward or slow down the simulation.
4. Switch between tabs (Map, Analytics, Board) to see the state update in real-time.
5. Click **"Save"** to store your progress in LocalStorage.
6. **Manual Mode**: You can click "Accept" on cards in the Contract Board to manually assign missions before running the sim.

---
*Created by Antigravity — Classified Zoldyck Property*
