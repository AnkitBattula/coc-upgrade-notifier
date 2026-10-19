// =======================================
// COC TELEGRAM UPGRADE NOTIFIER
// PART 1/3
// =======================================

require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const Database = require("better-sqlite3");
const cron = require("node-cron");
const axios = require("axios");
const http = require("http");


// =======================================
// BOT SETUP
// =======================================

const bot = new TelegramBot(
    process.env.TELEGRAM_TOKEN,
    {
        polling:true
    }
);


// =======================================
// DATABASE
// =======================================

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



// =======================================
// ITEM NAMES
// =======================================

const ITEMS = {

1000026:"Inferno Tower",
1000027:"Scattershot",
1000067:"Town Hall",

28000000:"Barbarian King",
28000001:"Archer Queen",
28000002:"Grand Warden",
28000006:"Royal Champion",
28000005:"Battle Machine",

26000000:"Lightning Spell",

1000045:"Builder Base Building",
1000052:"Builder Base Building",

4000041:"Cannon Cart"

};



function itemName(id){

return ITEMS[id] || `ID ${id}`;

}



// =======================================
// TIME FORMAT
// =======================================

function formatTime(seconds){

if(seconds<=0)
return "Finished";


let days=Math.floor(seconds/86400);

seconds%=86400;


let hours=Math.floor(seconds/3600);

seconds%=3600;


let mins=Math.floor(seconds/60);


let out="";


if(days)
out+=days+"d ";

if(hours)
out+=hours+"h ";

if(mins)
out+=mins+"m";


return out || "1m";

}




// =======================================
// START COMMAND
// =======================================

bot.onText(/\/start/,msg=>{


bot.sendMessage(
msg.chat.id,

`
🏰 Clash of Clans Upgrade Bot

Commands:

/paste
Paste large JSON

/done
Finish JSON paste

/upload
Upload JSON file

/status
Show upgrades

/clear
Delete data
`

);


});




// =======================================
// LARGE JSON PASTE SYSTEM
// =======================================


let jsonBuffer={};

let pasteMode={};



bot.onText(/\/paste/,msg=>{


const id=msg.chat.id;


jsonBuffer[id]=[];

pasteMode[id]=true;


bot.sendMessage(
id,
`
📋 JSON paste mode enabled

Send JSON parts.

When finished:

/done
`
);


});





bot.on("message",msg=>{


const id=msg.chat.id;



if(
pasteMode[id] &&
msg.text &&
!msg.text.startsWith("/")
){


jsonBuffer[id].push(msg.text);



bot.sendMessage(
id,
`📦 Part ${jsonBuffer[id].length} received`
);


}



});





bot.onText(/\/done/,msg=>{


const id=msg.chat.id;



if(!pasteMode[id]){


return bot.sendMessage(
id,
"❌ No paste session"
);


}



try{


const full =
jsonBuffer[id].join("");



const json =
JSON.parse(full);



pasteMode[id]=false;

jsonBuffer[id]=[];



saveJSON(
id,
json
);



}


catch(err){


console.log(err.message);


bot.sendMessage(
id,
"❌ Invalid JSON after joining parts"
);


}


});
// =======================================
// SAVE JSON + SMART PARSER
// PART 2/3
// =======================================


function saveJSON(chat,json){


if(!json.tag){

return bot.sendMessage(
chat,
"❌ No player tag found"
);

}



const tag=json.tag;


const baseTime =
json.timestamp ||
Math.floor(Date.now()/1000);



// remove old upgrades

db.prepare(
`
DELETE FROM upgrades
WHERE telegram_id=?
`
).run(chat);



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
)
.run(
chat,
tag,
Date.now()
);




let upgrades=[];



// recursive COC scanner

function scan(obj){


if(!obj)
return;



if(Array.isArray(obj)){


for(
let item of obj
){

scan(item);

}


return;

}



if(typeof obj==="object"){



// Detect active timer

if(
obj.data &&
obj.timer
){


upgrades.push({

id:obj.data,

name:itemName(obj.data),

level:
obj.lvl ?? 0,


finish:
baseTime + obj.timer

});


}




Object.values(obj)
.forEach(scan);


}



}



scan(json);




// insert upgrades

const insert =
db.prepare(
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



for(
const u of upgrades
){


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

Use:
/status
`
);



}




// =======================================
// JSON FILE UPLOAD
// =======================================


bot.on(
"document",
async(msg)=>{


const id=msg.chat.id;



try{


const link =
await bot.getFileLink(
msg.document.file_id
);



const response =
await axios.get(link);



saveJSON(
id,
response.data
);



}

catch(e){


console.log(e);


bot.sendMessage(
id,
"❌ Cannot read JSON file"
);


}



});
// =======================================
// STATUS COMMAND
// PART 3/3
// =======================================


bot.onText(/\/status/,msg=>{


const id=msg.chat.id;


const now =
Math.floor(Date.now()/1000);



const rows =
db.prepare(
`
SELECT *
FROM upgrades
WHERE telegram_id=?
AND finish>?
ORDER BY finish ASC
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



let text =
`
🏰 Upgrade Status

`;



for(const u of rows){


text +=
`
${u.name}

Level: ${u.level}

⏳ ${formatTime(u.finish-now)}

`;

}



bot.sendMessage(
id,
text
);



});




// =======================================
// CLEAR COMMAND
// =======================================


bot.onText(/\/clear/,msg=>{


const id=msg.chat.id;



db.prepare(
`
DELETE FROM upgrades
WHERE telegram_id=?
`
)
.run(id);



db.prepare(
`
DELETE FROM players
WHERE telegram_id=?
`
)
.run(id);



bot.sendMessage(
id,
"🗑 All data cleared"
);


});





// =======================================
// UPGRADE COMPLETION CHECKER
// =======================================


function checkFinished(){


const now =
Math.floor(Date.now()/1000);



const rows =
db.prepare(
`
SELECT *
FROM upgrades
WHERE finish<=?
AND notified=0
`
)
.all(now);



for(const u of rows){



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




// Check every minute

cron.schedule(
"* * * * *",
()=>{

checkFinished();

}

);




// =======================================
// RENDER KEEP ALIVE SERVER
// =======================================


http.createServer(
(req,res)=>{

res.write(
"COC Upgrade Bot Running"
);

res.end();

}
)
.listen(
process.env.PORT || 3000
);




// =======================================
// START LOG
// =======================================

console.log(
"🚀 COC Upgrade Notifier Online"
);
