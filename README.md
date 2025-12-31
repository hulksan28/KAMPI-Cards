# KAMPI - The Royale Card Game 👑

**KAMPI** is a real-time, multiplayer card game (Teen Patti / Flash variant) built with **Node.js** and **Socket.io**. It features a dynamic betting system, heads-up logic, and a mobile-responsive design.

## 🚀 Features

*   **Real-Time Multiplayer**: Instant updates using Socket.io (no page refreshes).
*   **Dynamic Deck**: Card deck adjusts based on player count (Short Deck logic).
*   **Betting System**:
    *   **Blind**: Play without seeing cards.
    *   **Seen**: 2x stake after viewing cards.
    *   **Cross**: Switch from Blind to Seen mid-game.
*   **Heads-Up Mode (2 Players)**:
    *   Automatic "Auto-See" enforcement.
    *   "Display Cards" (Showdown) option.
    *   "Distribute Pot" (Split) proposals.
*   **Responsive UI**: Optimized for Mobile and Desktop with toggleable dashboards and touch-friendly controls.

## 🛠️ Tech Stack

*   **Backend**: Node.js, Express.js
*   **Communication**: Socket.io (WebSockets)
*   **Frontend**: HTML5, CSS3, Vanilla JavaScript

## 📦 Installation & Setup

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/hulksan28/KAMPI-Cards.git
    cd KAMPI-Cards
    ```

2.  **Install Dependencies**:
    ```bash
    npm install
    ```

3.  **Run the Server**:
    ```bash
    node server.js
    ```

4.  **Play**:
    *   Open `http://localhost:3000` in your browser.
    *   Enter a name and join a room.
    *   Share the Room ID or Link with friends.

## 📜 Game Rules

See the full rules in-game by clicking the **"Rules"** button, or view the [rules.md](public/rules.md) file.
