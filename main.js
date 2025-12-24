import { DiscordSDK } from "@discord/embedded-app-sdk";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, update } from "firebase/database";

// 1. Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyBMoaV77NoBNY3oBqQrmOuyPYyzP97N-ko",
    databaseURL: "https://boardgame-59909-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "boardgame-59909",
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let myId, gameId, gameData;

// 2. ฟังก์ชันระบุตัวตน (Identity)
async function initIdentity() {
    const isDiscord = window.location.hostname.includes("discord") || window.location.search.includes("frame_id");
    
    if (isDiscord) {
        try {
            const discordSdk = new DiscordSDK("1318854457788104764");
            await discordSdk.ready();
            const auth = await discordSdk.commands.authenticate();
            myId = auth.user.id;
            gameId = discordSdk.channelId;
        } catch (e) {
            console.warn("Discord SDK Error, switching to Web mode", e);
            fallbackToWeb();
        }
    } else {
        fallbackToWeb();
    }
}

function fallbackToWeb() {
    myId = localStorage.getItem("davinci_uid") || "p_" + Math.random().toString(36).substr(2, 5);
    localStorage.setItem("davinci_uid", myId);
    gameId = window.location.hash.substring(1) || "room-1";
    if (!window.location.hash) window.location.hash = "room-1";
}

// 3. เริ่มการเชื่อมต่อ Database
async function start() {
    await initIdentity();
    console.log("Connected as:", myId, "in room:", gameId);

    const gameRef = ref(db, `games/${gameId}`);
    onValue(gameRef, (snapshot) => {
        gameData = snapshot.val();
        
        const statusText = document.getElementById("game-status");
        if (statusText) statusText.innerText = "เชื่อมต่อสำเร็จ!";

        if (!gameData) {
            setupNewGame();
        } else {
            // ระบบผู้เล่นคนที่ 2
            if (!gameData.players[myId] && Object.keys(gameData.players).length < 2) {
                joinGame();
            } else {
                renderGame();
            }
        }
    });
}

function setupNewGame() {
    const deck = [];
    for (let i = 0; i <= 11; i++) {
        deck.push({ v: i, c: 'black', revealed: false });
        deck.push({ v: i, c: 'white', revealed: false });
    }
    deck.sort(() => Math.random() - 0.5);

    const p1Hand = sortTiles(deck.splice(0, 4));
    const p2Hand = deck.splice(0, 4); 

    set(ref(db, `games/${gameId}`), {
        deck,
        players: {
            [myId]: { hand: p1Hand, clueTile: null }
        },
        waitingHand: p2Hand, 
        turn: myId,
        state: "PLAYING"
    });
}

function joinGame() {
    const hand = sortTiles(gameData.waitingHand);
    gameData.players[myId] = { hand: hand, clueTile: null };
    update(ref(db, `games/${gameId}`), { players: gameData.players });
}

function sortTiles(tiles) {
    return tiles.sort((a, b) => (a.v === b.v) ? (a.c === 'black' ? -1 : 1) : a.v - b.v);
}

function renderGame() {
    if (!gameData || !gameData.players[myId]) return;

    const isMyTurn = gameData.turn === myId;
    document.getElementById("game-status").innerText = isMyTurn ? "ตาของคุณ!" : "รอคู่ต่อสู้...";
    document.getElementById("deck-count").innerText = gameData.deck.length;

    // ไพ่เรา
    const myHandDiv = document.getElementById("my-hand");
    myHandDiv.innerHTML = "";
    gameData.players[myId].hand.forEach(tile => {
        const div = document.createElement("div");
        div.className = `tile ${tile.c} ${tile.revealed ? 'revealed' : ''}`;
        div.innerText = tile.v;
        myHandDiv.appendChild(div);
    });

    // ไพ่คู่ต่อสู้
    const opponentId = Object.keys(gameData.players).find(id => id !== myId);
    const oppHandDiv = document.getElementById("opponent-hand");
    oppHandDiv.innerHTML = "";
    if (opponentId) {
        gameData.players[opponentId].hand.forEach((tile, index) => {
            const div = document.createElement("div");
            div.className = `tile ${tile.c} ${tile.revealed ? 'revealed' : 'hidden'}`;
            div.innerText = tile.revealed ? tile.v : "?";
            if (isMyTurn) div.onclick = () => alert("ทายเลขใบนี้!");
            oppHandDiv.appendChild(div);
        });
    }
}

start();
