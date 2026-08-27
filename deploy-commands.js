require("dotenv").config();

const {
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits
} = require("discord.js");

const config = require("./config");

function userReasonCommand(name, description) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("המשתמש")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("סיבה")
        .setRequired(false)
    );
}

const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("בודק אם הבוט עובד"),

  new SlashCommandBuilder()
    .setName("ticket-panel")
    .setDescription("שולח פאנל טיקטים")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  userReasonCommand(
    "warn",
    "נותן אזהרה למשתמש"
  ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("נותן Timeout למשתמש")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("המשתמש")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("minutes")
        .setDescription("כמה דקות")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(40320)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("סיבה")
        .setRequired(false)
    ),

  userReasonCommand(
    "kick",
    "מעיף משתמש"
  ),

  userReasonCommand(
    "ban",
    "נותן באן למשתמש"
  ),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("מוחק הודעות")
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("כמות")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    ),

  userReasonCommand(
    "mute",
    "נותן Chat Mute למשתמש"
  ),

  userReasonCommand(
    "unmute",
    "מסיר Chat Mute ממשתמש"
  ),

  userReasonCommand(
    "voice-mute",
    "עושה Server Mute למשתמש ב־Voice"
  ),

  userReasonCommand(
    "voice-unmute",
    "מוריד Server Mute ממשתמש"
  ),

  userReasonCommand(
    "voice-deafen",
    "עושה Server Deafen למשתמש"
  ),

  userReasonCommand(
    "voice-undeafen",
    "מוריד Server Deafen ממשתמש"
  )
].map(command => command.toJSON());

const rest = new REST({
  version: "10"
}).setToken(process.env.TOKEN);

async function deployCommands() {
  try {
    console.log("====================================");
    console.log("🔄 Starting command deployment...");
    console.log("====================================");

    if (!process.env.TOKEN) {
      throw new Error("TOKEN missing in .env / Railway Variables");
    }

    if (!config.clientId) {
      throw new Error("clientId missing in config.js");
    }

    if (!config.guildId) {
      throw new Error("guildId missing in config.js");
    }

    console.log(`📱 Client ID: ${config.clientId}`);
    console.log(`🏠 Guild ID:  ${config.guildId}`);
    console.log(`📦 Commands to register: ${commands.length}`);
    console.log(
      commands.map(command => `/${command.name}`).join("\n")
    );

    const route = Routes.applicationGuildCommands(
      config.clientId,
      config.guildId
    );

    console.log("\n🧹 Removing old guild commands...");
    await rest.put(route, {
      body: []
    });

    console.log("✅ Old guild commands removed.");

    console.log("\n📤 Registering new commands...");
    const registered = await rest.put(route, {
      body: commands
    });

    console.log(
      `✅ Registered ${registered.length} guild commands`
    );

    console.log("\n🔍 Commands Discord returned:");
    for (const command of registered) {
      console.log(`✅ /${command.name}`);
    }

    const currentCommands = await rest.get(route);

    console.log("\n📋 Commands currently in the server:");
    for (const command of currentCommands) {
      console.log(`• /${command.name}`);
    }

    console.log("\n====================================");
    console.log("✅ COMMAND DEPLOY FINISHED");
    console.log("====================================");
  } catch (error) {
    console.error("\n❌ DEPLOY FAILED");
    console.error(error);
  }
}

deployCommands();
