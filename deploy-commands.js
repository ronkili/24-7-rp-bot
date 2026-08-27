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
    .addUserOption(o =>
      o.setName("user")
        .setDescription("המשתמש")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason")
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
    .addUserOption(o =>
      o.setName("user")
        .setDescription("המשתמש")
        .setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("minutes")
        .setDescription("כמה דקות")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(40320)
    )
    .addStringOption(o =>
      o.setName("reason")
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
    .addIntegerOption(o =>
      o.setName("amount")
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
].map(c => c.toJSON());

const rest = new REST({ version: "10" })
  .setToken(process.env.TOKEN);

(async () => {
  try {
    if (!process.env.TOKEN) {
      throw new Error("TOKEN missing in .env");
    }

    if (!config.clientId || !config.guildId) {
      throw new Error(
        "clientId/guildId missing in config.js"
      );
    }

    await rest.put(
      Routes.applicationGuildCommands(
        config.clientId,
        config.guildId
      ),
      { body: commands }
    );

    console.log(
      `✅ Registered ${commands.length} commands`
    );
  } catch (error) {
    console.error("❌ Deploy error:", error);
  }
})();
