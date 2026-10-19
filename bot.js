// =======================================
// COC TELEGRAM UPGRADE NOTIFIER
// MongoDB Version
// PART 1/4
// =======================================

require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const mongoose = require("mongoose");
const cron = require("node-cron");
const axios = require("axios");
const http = require("http");


// =======================================
// TELEGRAM BOT
// =======================================

const bot = new TelegramBot(
    process.env.TELEGRAM_TOKEN,
    {
        polling:true
    }
);


// =======================================
// MONGODB CONNECTION
// =======================================

mongoose.connect(
    process.env.MONGODB_URI
)
.then(()=>{
    console.log("🍃 MongoDB Connected");
})
.catch(err=>{
    console.log(
        "MongoDB Error:",
        err.message
    );
});




// =======================================
// DATABASE MODELS
// =======================================


const PlayerSchema = new mongoose.Schema({

    telegram_id:Number,
    tag:String,
    updated:Number

});


const UpgradeSchema = new mongoose.Schema({

    telegram_id:Number,
    tag:String,
    item_id:Number,
    name:String,
    level:Number,
    finish:Number,
    notified:{
        type:Number,
        default:0
    }

});



const Player =
mongoose.model(
    "players",
    PlayerSchema
);


const Upgrade =
mongoose.model(
    "upgrades",
    UpgradeSchema
);





// =======================================
// ITEM DATABASE
// =======================================


const ITEMS={


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

return ITEMS[id] || 
`Unknown ID ${id}`;

}





// =======================================
// TIME FORMAT
// =======================================


function formatTime(seconds){


if(seconds<=0)
return "Finished";


let d=Math.floor(
seconds/86400
);


seconds%=86400;


let h=Math.floor(
seconds/3600
);


seconds%=3600;


let m=Math.floor(
seconds/60
);



let out="";


if(d)
out+=`${d}d `;


if(h)
out+=`${h}h `;


if(m)
out+=`${m}m `;



return out || "1m";

}






// =======================================
// LARGE JSON BUFFER
// =======================================


let jsonBuffer={};

let pasteMode={};





// =======================================
// START COMMAND
// =======================================


bot.onText(
/\/start/,
msg=>{


bot.sendMessage(

msg.chat.id,

`
🏰 COC Upgrade Tracker

Commands:

/paste
Paste large JSON

/done
Finish JSON

/upload
Upload JSON file

/status
Show timers

/clear
Clear data

`

);


});

// =======================================
// LARGE JSON PASTE SYSTEM
// PART 2/4
// =======================================


// Enable paste mode

bot.onText(
/\/paste/,
msg=>{

const id = msg.chat.id;


jsonBuffer[id]=[];

pasteMode[id]=true;


bot.sendMessage(

id,

`
📋 JSON Paste Mode Enabled

Send your JSON.
You can split it into many messages.

After finishing:

/done

`

);


});





// Receive JSON chunks

bot.on(
"message",
msg=>{


const id=msg.chat.id;



if(

pasteMode[id] &&

msg.text &&

!msg.text.startsWith("/")

){



jsonBuffer[id].push(
msg.text
);



bot.sendMessage(

id,

`📦 Received part ${jsonBuffer[id].length}`

);



}



});







// Finish JSON

bot.onText(
/\/done/,
async msg=>{


const id=msg.chat.id;



if(!pasteMode[id]){


return bot.sendMessage(

id,

"❌ No active paste session"

);


}



try{


const fullJSON =

jsonBuffer[id].join("");



const json =

JSON.parse(fullJSON);




pasteMode[id]=false;

jsonBuffer[id]=[];




await saveJSON(
id,
json
);



}

catch(err){


console.log(
err.message
);



bot.sendMessage(

id,

"❌ Invalid JSON after combining parts"

);



}



});








// =======================================
// SAVE JSON TO MONGODB
// =======================================


async function saveJSON(
chat,
json
){



if(!json.tag){


return bot.sendMessage(

chat,

"❌ Player tag missing"

);


}




const tag=json.tag;



const baseTime =

json.timestamp ||

Math.floor(
Date.now()/1000
);




// Remove old data

await Upgrade.deleteMany({

telegram_id:chat

});



await Player.deleteMany({

telegram_id:chat

});




// Save player

await Player.create({

telegram_id:chat,

tag:tag,

updated:Date.now()

});





let upgrades=[];






// Recursive JSON scanner

function scan(obj){



if(!obj)
return;



if(Array.isArray(obj)){


for(
const x of obj
){

scan(x);

}


return;

}




if(typeof obj==="object"){



// Detect timers

if(

obj.data &&

obj.timer

){



upgrades.push({

item_id:obj.data,

name:itemName(obj.data),

level:obj.lvl || 0,

finish:

baseTime + obj.timer


});


}




Object.values(obj)
.forEach(scan);



}



}





scan(json);






// Insert upgrades

for(
const u of upgrades
){


await Upgrade.create({

telegram_id:chat,

tag:tag,

item_id:u.item_id,

name:u.name,

level:u.level,

finish:u.finish

});


}





bot.sendMessage(

chat,

`
✅ JSON Loaded

🏰 Player:
${tag}

🔨 Active Timers:
${upgrades.length}


Use:
/status

`

);



}

// =======================================
// STATUS + FILE UPLOAD + CLEAR
// PART 3/4
// =======================================





// =======================================
// STATUS COMMAND
// =======================================


bot.onText(
/\/status/,
async msg=>{


const id=msg.chat.id;


const now =
Math.floor(
Date.now()/1000
);



const rows = await Upgrade.find({

telegram_id:id,

finish:{
$gt:now
}

})
.sort({

finish:1

});





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




for(
const u of rows
){


text +=

`
🔨 ${u.name}

Level: ${u.level}

⏳ Remaining:
${formatTime(
u.finish-now
)}

`;



}





bot.sendMessage(

id,

text

);



});







// =======================================
// JSON FILE UPLOAD
// =======================================


bot.on(
"document",
async msg=>{


const id=msg.chat.id;



try{


const link =

await bot.getFileLink(

msg.document.file_id

);




const response =

await axios.get(

link

);





await saveJSON(

id,

response.data

);




}

catch(err){


console.log(
err.message
);



bot.sendMessage(

id,

"❌ Cannot read JSON file"

);



}



});









// =======================================
// CLEAR DATA
// =======================================


bot.onText(
/\/clear/,
async msg=>{


const id=msg.chat.id;



await Upgrade.deleteMany({

telegram_id:id

});



await Player.deleteMany({

telegram_id:id

});





bot.sendMessage(

id,

"🗑 All player data deleted"

);



});






// =======================================
// MANUAL JSON COMMAND
// =======================================


bot.onText(
/\/upload/,
msg=>{


bot.sendMessage(

msg.chat.id,

`
📁 Upload your JSON file here.

The bot will automatically read:
- Player tag
- Active upgrades
- Timers
- Completion times

`

);


});

// =======================================
// AUTOMATIC TIMER CHECKER
// PART 4/4
// =======================================


// Checks completed upgrades every minute

async function checkFinished(){


const now =
Math.floor(
Date.now()/1000
);




const finished = await Upgrade.find({

finish:{
$lte:now
},

notified:0

});





for(
const u of finished
){



await bot.sendMessage(

u.telegram_id,

`
🎉 Upgrade Completed!

🏰 ${u.name}

⭐ Level:
${u.level}

👤 Player:
${u.tag}

✅ Builder is free!

`

);





await Upgrade.updateOne(

{
_id:u._id
},

{
$set:{
notified:1
}
}

);



}



}






// Run every minute

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
// BOT START LOG
// =======================================


console.log(

"🚀 COC MongoDB Upgrade Bot Online"

);

