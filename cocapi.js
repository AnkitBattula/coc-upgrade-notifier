const axios = require("axios");
require("dotenv").config();


const COC_API_URL = "https://api.clashofclans.com/v1";


const coc = axios.create({

    baseURL: COC_API_URL,

    headers: {
        Authorization: `Bearer ${process.env.COC_API_KEY}`,
        Accept: "application/json"
    },

    timeout: 10000

});



// Get player information

async function getPlayer(playerTag){

    try {

        const tag = encodeURIComponent(playerTag);

        const response = await coc.get(
            `/players/${tag}`
        );

        return response.data;


    } catch(error){

        console.error(
            "CoC API Error:",
            error.response?.data || error.message
        );

        return null;
    }

}



// Get clan information

async function getClan(clanTag){

    try {

        const tag = encodeURIComponent(clanTag);

        const response = await coc.get(
            `/clans/${tag}`
        );

        return response.data;


    } catch(error){

        console.error(
            "Clan API Error:",
            error.response?.data || error.message
        );

        return null;
    }

}



module.exports = {

    getPlayer,

    getClan

};
