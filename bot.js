require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const Database = require("better-sqlite3");
const cron = require("node-cron");
const fs = require("fs");


// ===============================
// CONFIG
// ===============================

const TOKEN = process.env.TELEGRAM_TOKEN;

if (!TOKEN) {
    console.log("Missing TELEGRAM_TOKEN");
    process.exit(1);
}


const bot = new TelegramBot(TOKEN, {
    polling:true
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
updated INTEGER
);


CREATE TABLE IF NOT EXISTS upgrades(
id INTEGER PRIMARY KEY AUTOINCREMENT,
telegram_id INTEGER,
tag TEXT,
item_id INTEGER,
name TEXT,
level INTEGER,
finish INTEGER,
notified INTEGER DEFAULT 0
);

`);



// ===============================
// ITEM NAMES
// ===============================

const ITEMS = {

1000000:"Cannon",
1000001:"Archer Tower",
1000002:"Mortar",
1000003:"Air Defense",
1000004:"Wizard Tower",
1000005:"Hidden Tesla",
1000006:"Spell Tower",

1000026:"Inferno Tower",
1000027:"Scattershot",

28000000:"Barbarian King",
28000001:"Archer Queen",
28000002:"Grand Warden",
28000006:"Royal Champion",

26000000:"Lightning Spell",
26000001:"Healing Spell",

4000000:"Barbarian",
4000001:"Archer",
4000002:"Giant"

};



function itemName(id){

return ITEMS[id] || 
`Unknown Item ${id}`;

}



// ===============================
// TIME FORMAT
// ===============================


function formatTime(seconds){

if(seconds<=0)
return "Finished";


let d=Math.floor(seconds/86400);

seconds%=86400;

let h=Math.floor(seconds/3600);

seconds%=3600;

let m=Math.floor(seconds/60);


let result="";


if(d)
result+=d+"d ";

if(h)
result+=h+"h ";

if(m)
result+=m+"m";


return result || "less than 1m";

}




// ===============================
// START
// ===============================


bot.onText(/\/start/,msg=>{


let id=msg.chat.id;


db.prepare(
"INSERT OR IGNORE INTO users VALUES(?)"
).run(id);



bot.sendMessage(id,

`
🏰 COC Upgrade Notifier

Commands:

/upload
Upload COC JSON

/status
Current upgrades

/players
Tracked accounts

/clear
Remove data

/help
Help

Upload your exported JSON file.
`

);


});





// ===============================
// HELP
// ===============================


bot.onText(/\/help/,msg=>{


bot.sendMessage(msg.chat.id,

`
Commands:

📤 /upload
Send JSON file

📊 /status
Show running upgrades

👤 /players
Show accounts

🗑 /clear
Delete data

Automatic alerts enabled.
`

);


});





// ===============================
// JSON UPLOAD
// ===============================


bot.on("document",async msg=>{


let id=msg.chat.id;


let file=msg.document;



if(!file.file_name.endsWith(".json")){

return bot.sendMessage(
id,
"❌ Upload JSON file only"
);

}



try{


let url=
await bot.getFileLink(file.file_id);


const axios =
require("axios");


let response =
await axios.get(url);


let json=response.data;


saveJSON(id,json);



}

catch(e){

console.log(e);

bot.sendMessage(
id,
"❌ JSON reading failed"
);

}



});





// ===============================
// SAVE JSON
// ===============================


function saveJSON(chat,json){



if(!json.tag){

return bot.sendMessage(
chat,
"❌ Player tag missing"
);

}



let tag=json.tag;



db.prepare(
`
INSERT INTO players
(telegram_id,tag,updated)
VALUES(?,?,?)
`
).run(
chat,
tag,
Date.now()
);





let upgrades=[];



function scan(array){


if(!array)
return;


for(let x of array){


if(x.timer){


upgrades.push({

id:x.data,

name:itemName(x.data),

level:x.lvl || 0,

finish:
Math.floor(Date.now()/1000)
+x.timer

});


}



}


}





scan(json.buildings);
scan(json.buildings2);
scan(json.heroes);
scan(json.heroes2);
scan(json.spells);
scan(json.units);
scan(json.units2);





let insert =
db.prepare(`
INSERT INTO upgrades
(
telegram_id,
tag,
item_id,
name,
level,
finish
)
VALUES(?,?,?,?,?,?)
`);




for(let u of upgrades){


insert.run(
chat,
tag,
u.id,
u.name,
u.level,
u.finish
);


}




bot.sendMessage(chat,

`
✅ Imported

Player:
${tag}

Active upgrades:
${upgrades.length}

Use /status
`

);



}
// ===============================
// STATUS COMMAND
// ===============================


bot.onText(/\/status/, msg=>{


let chat=msg.chat.id;


let rows =
db.prepare(`
SELECT *
FROM upgrades
WHERE telegram_id=?
AND finish>?
ORDER BY finish
`)
.all(
chat,
Math.floor(Date.now()/1000)
);



if(rows.length===0){

return bot.sendMessage(
chat,
"✅ No active upgrades"
);

}



let text =
"🏰 Active Upgrades\n\n";



for(let u of rows){


let left =
u.finish -
Math.floor(Date.now()/1000);



text +=
`
${u.name}
Level: ${u.level}

⏳ ${formatTime(left)}

`;

}



bot.sendMessage(
chat,
text
);


});






// ===============================
// PLAYERS COMMAND
// ===============================


bot.onText(/\/players/,msg=>{


let rows =
db.prepare(
`
SELECT tag
FROM players
WHERE telegram_id=?
`
)
.all(msg.chat.id);



if(rows.length===0){

return bot.sendMessage(
msg.chat.id,
"No players added"
);

}



let text="👤 Players\n\n";


rows.forEach(p=>{

text+=p.tag+"\n";

});



bot.sendMessage(
msg.chat.id,
text
);



});







// ===============================
// CLEAR DATA
// ===============================


bot.onText(/\/clear/,msg=>{


let id=msg.chat.id;



db.prepare(
"DELETE FROM upgrades WHERE telegram_id=?"
)
.run(id);


db.prepare(
"DELETE FROM players WHERE telegram_id=?"
)
.run(id);



bot.sendMessage(
id,
"🗑 All data cleared"
);



});






// ===============================
// AUTO NOTIFICATION ENGINE
// ===============================


function checkUpgrades(){


let now =
Math.floor(Date.now()/1000);



let finished =
db.prepare(`
SELECT *
FROM upgrades
WHERE finish<=?
AND notified=0
`)
.all(now);





for(let u of finished){



bot.sendMessage(

u.telegram_id,

`
🎉 Upgrade Completed!

🏰 ${u.name}

Level:
${u.level}

Player:
${u.tag}

Your builder is free!
`

);




db.prepare(
`
UPDATE upgrades
SET notified=1
WHERE id=?
`
)
.run(u.id);



}



}




// ===============================
// CRON CHECKER
// ===============================


// every 5 minutes

cron.schedule(
"*/5 * * * *",
()=>{


console.log(
"Checking upgrades..."
);


checkUpgrades();


});





// ===============================
// ERROR HANDLING
// ===============================


bot.on(
"polling_error",
err=>{

console.log(
"Telegram Error:",
err.message
);

}
);



process.on(
"uncaughtException",
err=>{

console.log(
"Crash prevented:",
err.message
);

}
);



console.log(
"🚀 COC Upgrade Bot Online"
);
