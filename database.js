const mongoose = require("mongoose");
require("dotenv").config();

let connected = false;

async function connectDB() {
    if (connected) return;

    try {
        await mongoose.connect(process.env.MONGODB_URI);

        connected = true;

        console.log("✅ MongoDB Connected");

    } catch (error) {
        console.error("❌ MongoDB Error:", error.message);
        process.exit(1);
    }
}


// Timer Schema

const timerSchema = new mongoose.Schema({

    userId: {
        type: String,
        required: true
    },

    tag: String,

    type: String,

    itemId: Number,

    level: Number,

    finishTime: Date,

    notified: {
        type: Boolean,
        default: false
    }

}, {
    timestamps: true
});


const Timer = mongoose.model(
    "Timer",
    timerSchema
);


module.exports = {
    connectDB,
    Timer
};
