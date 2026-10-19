// bot.js

require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const Database = require("better-sqlite3");
const cron = require("node-cron");


// ===============================
// CONFIG
// ===============================

const bot = new TelegramBot(
    process.env.TELEGRAM_TOKEN,
    {
        polling:true
    }
);


// ===============================
// DATABASE
// ===============================

const db = new Database("coc.db");


db.exec(`

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
// ITEM NAME DATABASE
// ===============================

const ITEMS = {

1000000:"Cannon",
1000001:"Archer Tower",
1000002:"Mortar",
1000003:"Air Defense",
1000004:"Wizard Tower",
1000005:"Hidden Tesla",
1000006:"Bomb Tower",

1000026:"Inferno Tower",
1000027:"Scattershot",
1000067:"Town Hall",

28000000:"Barbarian King",
28000001:"Archer Queen",
28000002:"Grand Warden",
28000006:"Royal Champion",
28000005:"Battle Machine",

26000000:"Lightning Spell",
26000001:"Healing Spell",

4000000:"Barbarian",
4000001:"Archer",
4000002:"Giant",
4000041:"Builder Base Troop"

};


function itemName(id){

return ITEMS[id] || 
`Unknown ID ${id}`;

}




// ===============================
// TIME FORMAT
// ===============================

function formatTime(sec){

if(sec<=0)
return "Finished";


let d=Math.floor(sec/86400);

sec%=86400;


let h=Math.floor(sec/3600);

sec%=3600;


let m=Math.floor(sec/60);


let s="";


if(d) s+=`${d}d `;

if(h) s+=`${h}h `;

if(m) s+=`${m}m`;


return s || "1m";

}




// ===============================
// START
// ===============================

bot.onText(/\/start/,msg=>{


bot.sendMessage(
msg.chat.id,

`
🏰 COC Upgrade Notifier

Commands:

/paste
Paste raw JSON

/upload
Upload JSON file

/status
Show upgrades

/clear
Delete data

/help
`
);


});




// ===============================
// PASTE MODE
// ===============================

let waitingJSON={};


bot.onText(/\/paste/,msg=>{


waitingJSON[msg.chat.id]=true;


bot.sendMessage(
msg.chat.id,
"📋 Send raw JSON now"
);


});



bot.on("message",msg=>{


let id=msg.chat.id;


if(
waitingJSON[id] &&
msg.text &&
msg.text.startsWith("{")
){

try{


let json=JSON.parse(msg.text);


waitingJSON[id]=false;


saveJSON(id,json);


}

catch(e){

bot.sendMessage(
id,
"❌ Invalid JSON"
);

}


}



});
// ===============================
// JSON FILE UPLOAD
// ===============================

bot.on("document", async(msg)=>{

const id = msg.chat.id;

if(!msg.document.file_name.endsWith(".json")){

return bot.sendMessage(
id,
"❌ Send only JSON files"
);

}


try{

const url = await bot.getFileLink(
msg.document.file_id
);


const axios = require("axios");


const res = await axios.get(url);


saveJSON(id,res.data);


}

catch(err){

console.log(err);

bot.sendMessage(
id,
"❌ Failed reading JSON"
);

}


});




// ===============================
// SAVE JSON ENGINE
// ===============================


function saveJSON(chat,json){


if(!json.tag){

return bot.sendMessage(
chat,
"❌ Player tag missing"
);

}



const tag=json.tag;


const baseTime =
json.timestamp ||
Math.floor(Date.now()/1000);




// remove old data

db.prepare(
`
DELETE FROM upgrades
WHERE telegram_id=? AND tag=?
`
).run(
chat,
tag
);




// save player

db.prepare(
`
INSERT INTO players
(
telegram_id,
tag,
updated
)
VALUES(?,?,?)
`
).run(
chat,
tag,
Date.now()
);




let upgrades=[];




function scan(obj){


if(!obj)
return;



if(Array.isArray(obj)){


for(let x of obj)
scan(x);


return;

}



if(typeof obj==="object"){



if(
obj.data &&
obj.timer
){


upgrades.push({

id:obj.data,

name:itemName(obj.data),

level:
obj.lvl || 0,


finish:
baseTime + obj.timer

});


}




for(
let value of Object.values(obj)
){

scan(value);

}



}



}



scan(json);





let insert=db.prepare(
`
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
`
);



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




bot.sendMessage(
chat,

`
✅ JSON Loaded

🏰 Player:
${tag}

🔨 Active upgrades:
${upgrades.length}

Use /status
`

);



}





// ===============================
// STATUS
// ===============================


bot.onText(/\/status/,msg=>{


const id=msg.chat.id;


let now=
Math.floor(Date.now()/1000);



let rows=db.prepare(
`
SELECT *
FROM upgrades
WHERE telegram_id=?
AND finish>?
ORDER BY finish
`
)
.all(
id,
now
);



if(rows.length===0){

return bot.sendMessage(
id,
"✅ No active upgrades"
);

}



let text=
"🏰 Active Upgrades\n\n";



for(let u of rows){


text+=
`
${u.name}

Level: ${u.level}

⏳ ${formatTime(
u.finish-now
)}

`;

}



bot.sendMessage(
id,
text
);



});






// ===============================
// CLEAR
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
"🗑 Data cleared"
);


});






// ===============================
// AUTO NOTIFIER
// ===============================


function checkFinished(){


let now=
Math.floor(Date.now()/1000);



let rows=db.prepare(
`
SELECT *
FROM upgrades
WHERE finish<=?
AND notified=0
`
)
.all(now);



for(let u of rows){



bot.sendMessage(
u.telegram_id,

`
🎉 Upgrade Completed!

🏰 ${u.name}

Level:
${u.level}

Player:
${u.tag}

Builder is free!
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





// every minute

cron.schedule(
"* * * * *",
()=>{

checkFinished();

}
);






// ===============================
// RENDER KEEP ALIVE
// ===============================


const http=require("http");


http.createServer(
(req,res)=>{

res.write(
"COC Bot Running"
);

res.end();

}
)
.listen(
process.env.PORT || 3000
);





console.log(
"🚀 COC Upgrade Notifier Online"
);
