const { Timer } = require("./database");


// Check timers every 60 seconds

function startTracker(bot) {

    console.log("⏱ Timer tracker started");


    setInterval(async () => {

        try {

            const now = new Date();


            const finished = await Timer.find({

                finishTime: {
                    $lte: now
                },

                notified: false

            });



            for (const task of finished) {


                let message = `
🔔 Upgrade Completed!

🏷 Tag:
${task.tag}

📌 Type:
${task.type}

🆔 ID:
${task.itemId}

⭐ Level:
${task.level}

✅ Finished:
${task.finishTime.toLocaleString()}
                `;


                await bot.sendMessage(
                    task.userId,
                    message
                );


                task.notified = true;

                await task.save();

            }


        } catch(error) {

            console.error(
                "Tracker Error:",
                error.message
            );

        }


    }, 60 * 1000);


}



module.exports = {
    startTracker
};
