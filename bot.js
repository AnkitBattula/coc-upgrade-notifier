require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const Database = require("better-sqlite3");
const cron = require("node-cron");


// ===============================
// CONFIG
// ===============================

const TOKEN = process.env.TELEGRAM_TOKEN;

if (!TOKEN) {
    console.log("❌ TELEGRAM_TOKEN missing in .env");
    process.exit(1);
}


const bot = new TelegramBot(TOKEN, {
    polling: true
});


// ===============================
// DATABASE
// ===============================

const db = new Database("coc.db");


db.exec(`

CREATE TABLE IF NOT EXISTS users(
    telegram_id INTEGER PRIMARY KEY
);


CREATE TABLE IF NOT EXISTS players(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER,
    tag TEXT,
    last_update INTEGER
);


CREATE TABLE IF NOT EXISTS upgrades(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER,
    tag TEXT,
    item_id INTEGER,
    item_name TEXT,
    level INTEGER,
    finish_time INTEGER,
    notified INTEGER DEFAULT 0
);

`);


// ===============================
// ITEM DATABASE
// ===============================

const ITEMS = {

    "1000026":"Inferno Tower",
    "1000027":"Scattershot",
    "1000067":"Town Hall",
    
    "28000000":"Barbarian King",
    "28000001":"Archer Queen",
    "28000002":"Grand Warden",
    "28000006":"Royal Champion",

    "26000000":"Lightning Spell",

    "4000000":"Barbarian",
    "4000001":"Archer",
    "4000002":"Giant"

};


function getItemName(id){

    return ITEMS[id] || `Unknown (${id})`;

}



console.log("🏰 COC Upgrade Notifier Started");
