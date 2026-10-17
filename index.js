
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
} = require("discord.js");
const express = require("express");
const fs = require("node:fs");
const path = require("node:path");

const {
  DISCORD_BOT_TOKEN: TOKEN,
  DISCORD_CLIENT_ID: CLIENT_ID,
  DISCORD_GUILD_ID: GUILD_ID,
  DISCORD_CHANNEL_ID: CHANNEL_ID,
} = process.env;

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || ".";
const DATA_FILE = path.join(DATA_DIR, "upgrades.json");

if (!TOKEN || !CLIENT_ID || !GUILD_ID || !CHANNEL_ID) {
  throw new Error(
    "Missing environment variables: DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID, DISCORD_CHANNEL_ID"
  );
}

fs.mkdirSync(DATA_DIR, { recursive: true });

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return { nextId: 1, upgrades: [] };
  }
}

let data = loadData();

function saveData() {
  const temp = DATA_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(data, null, 2));
  fs.renameSync(temp, DATA_FILE);
}

function parseDuration(input) {
  const regex = /(\d+)\s*(d|h|m|s)/gi;
  let match;
  let total = 0;
  let consumed = "";

  const units = { d: 86400, h: 3600, m: 60, s: 1 };

  while ((match = regex.exec(input)) !== null) {
    total += Number(match[1]) * units[match[2].toLowerCase()];
    consumed += match[0];
  }

  if (
    total <= 0 ||
    consumed.replace(/\s/g, "").toLowerCase() !==
      input.replace(/\s/g, "").toLowerCase()
  ) {
    throw new Error("Use a duration like 2d 5h 30m.");
  }

  if (total > 365 * 86400) {
    throw new Error("Maximum timer duration is 365 days.");
  }

  return total * 1000;
}

function durationText(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);

  return [
    d ? `${d}d` : "",
    h ? `${h}h` : "",
    m ? `${m}m` : "",
  ].filter(Boolean).join(" ") || "less than 1 minute";
}

const categories = [
  { name: "Building", value: "Building" },
  { name: "Hero", value: "Hero" },
  { name: "Troop", value: "Troop" },
  { name: "Spell", value: "Spell" },
  { name: "Pet", value: "Pet" },
  { name: "Siege Machine", value: "Siege Machine" },
  { name: "Other", value: "Other" },
];

const commands = [
  new SlashCommandBuilder()
    .setName("upgrade")
    .setDescription("Set an upgrade completion timer")
    .addStringOption(o =>
      o.setName("name")
        .setDescription("Upgrade name")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("category")
        .setDescription("Upgrade category")
        .setRequired(true)
        .addChoices(...categories)
    )
    .addStringOption(o =>
      o.setName("duration")
        .setDescription("Example: 2d 5h 30m")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("list")
    .setDescription("List your active upgrade timers"),

  new SlashCommandBuilder()
    .setName("cancel")
    .setDescription("Cancel one of your timers")
    .addIntegerOption(o =>
      o.setName("id")
        .setDescription("Timer ID from /list")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("completed")
    .setDescription("Show your completed upgrades"),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show bot commands"),
].map(c => c.toJSON());

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const rest = new REST({ version: "10" }).setToken(TOKEN);

const app = express();
app.get("/", (_req, res) => res.send("CoC Upgrade Bot is running."));
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Health server listening on ${PORT}`);
});

async function sendCompletion(upgrade) {
  const channel = await client.channels.fetch(CHANNEL_ID);

  if (!channel || !channel.isTextBased()) {
    throw new Error("Notification channel is unavailable.");
  }

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle("✅ Clash of Clans Upgrade Finished!")
    .setDescription(`**${upgrade.name}** is ready!`)
    .addFields(
      { name: "Category", value: upgrade.category, inline: true },
      { name: "Timer ID", value: String(upgrade.id), inline: true }
    )
    .setTimestamp();

  await channel.send({
    content: `<@${upgrade.userId}>`,
    embeds: [embed],
    allowedMentions: { users: [upgrade.userId] },
  });
}

let checking = false;

async function checkTimers() {
  if (checking) return;
  checking = true;

  try {
    const now = Date.now();

    for (const upgrade of data.upgrades) {
      if (upgrade.status !== "active" || upgrade.finishAt > now) {
        continue;
      }

      try {
        await sendCompletion(upgrade);
        upgrade.status = "completed";
        upgrade.completedAt = Date.now();
        saveData();
        console.log(`Notified for upgrade #${upgrade.id}`);
      } catch (error) {
        console.error(
          `Notification failed for #${upgrade.id}; retrying later:`,
          error.message
        );
      }
    }
  } finally {
    checking = false;
  }
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log("Slash commands registered.");
  } catch (error) {
    console.error("Command registration failed:", error);
  }

  await checkTimers();
  setInterval(checkTimers, 15000);
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const userId = interaction.user.id;

  try {
    if (interaction.commandName === "upgrade") {
      const name = interaction.options.getString("name").trim();
      const category = interaction.options.getString("category");
      const duration = interaction.options.getString("duration");

      if (!name || name.length > 100) {
        return interaction.reply({
          content: "Enter an upgrade name (maximum 100 characters).",
          ephemeral: true,
        });
      }

      const ms = parseDuration(duration);
      const finishAt = Date.now() + ms;

      const upgrade = {
        id: data.nextId++,
        name,
        category,
        userId,
        createdAt: Date.now(),
        finishAt,
        status: "active",
      };

      data.upgrades.push(upgrade);
      saveData();

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle("⏳ Upgrade Timer Started")
            .setDescription(`**${name}**`)
            .addFields(
              { name: "Category", value: category, inline: true },
              { name: "Timer ID", value: String(upgrade.id), inline: true },
              { name: "Remaining", value: durationText(ms), inline: true },
              {
                name: "Expected finish",
                value: `<t:${Math.floor(finishAt / 1000)}:F>\n<t:${Math.floor(finishAt / 1000)}:R>`,
              }
            ),
        ],
      });
    }

    if (interaction.commandName === "list") {
      const active = data.upgrades.filter(
        u => u.status === "active" && u.userId === userId
      );

      if (!active.length) {
        return interaction.reply({
          content: "No active timers. Use /upgrade to add one.",
          ephemeral: true,
        });
      }

      const lines = active.map(u =>
        `**#${u.id} — ${u.name}** (${u.category})\n` +
        `Finishes <t:${Math.floor(u.finishAt / 1000)}:R>`
      );

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xf1c40f)
            .setTitle("🏗️ Active Upgrades")
            .setDescription(lines.join("\n\n").slice(0, 4000)),
        ],
        ephemeral: true,
      });
    }

    if (interaction.commandName === "cancel") {
      const id = interaction.options.getInteger("id");
      const upgrade = data.upgrades.find(
        u => u.id === id &&
          u.status === "active" &&
          u.userId === userId
      );

      if (!upgrade) {
        return interaction.reply({
          content: "Timer not found or it belongs to another user.",
          ephemeral: true,
        });
      }

      upgrade.status = "cancelled";
      saveData();

      return interaction.reply({
        content: `❌ Cancelled #${id}: **${upgrade.name}**`,
        ephemeral: true,
      });
    }

    if (interaction.commandName === "completed") {
      const done = data.upgrades
        .filter(u => u.status === "completed" && u.userId === userId)
        .slice(-10)
        .reverse();

      return interaction.reply({
        content: done.length
          ? done.map(u =>
              `✅ **#${u.id} — ${u.name}** (${u.category})`
            ).join("\n")
          : "No completed upgrades yet.",
        ephemeral: true,
      });
    }

    if (interaction.commandName === "help") {
      return interaction.reply({
        content:
          "**CoC Upgrade Bot Commands**\n" +
          "`/upgrade` — add a timer\n" +
          "`/list` — active timers\n" +
          "`/cancel` — cancel a timer\n" +
          "`/completed` — completed timers\n\n" +
          "Duration examples: `8h`, `2d 5h`, `1d 3h 20m`.\n" +
          "Enter the actual time remaining in Clash of Clans.",
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error(error);

    const message = error.message.startsWith("Use a duration") ||
      error.message.startsWith("Maximum timer")
      ? error.message
      : "Something went wrong. Check the Render logs.";

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: message, ephemeral: true });
    } else {
      await interaction.reply({ content: message, ephemeral: true });
    }
  }
});

client.login(TOKEN);
