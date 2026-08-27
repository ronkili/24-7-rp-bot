require("dotenv").config();

const {
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits
} = require("discord.js");

const config = require("./config");

function userReasonCommand(
  name,
  description,
  withDuration = false
) {
  const command = new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("המשתמש")
        .setRequired(true)
    );

  if (withDuration) {
    command.addStringOption(option =>
      option
        .setName("duration")
        .setDescription("זמן: 30s / 10m / 2h / 3d")
        .setRequired(true)
    );
  }

  command.addStringOption(option =>
    option
      .setName("reason")
      .setDescription("סיבה")
      .setRequired(false)
  );

  return command;
}

const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("בודק אם הבוט עובד"),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("מציג את כל פקודות הבוט"),

  new SlashCommandBuilder()
    .setName("ticket-panel")
    .setDescription("שולח פאנל טיקטים")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  userReasonCommand("warn", "נותן אזהרה למשתמש"),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("נותן Timeout למשתמש")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("המשתמש")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName("minutes")
        .setDescription("כמה דקות")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(40320)
    )
    .addStringOption(option =>
      option.setName("reason")
        .setDescription("סיבה")
        .setRequired(false)
    ),

  userReasonCommand("kick", "מעיף משתמש"),
  userReasonCommand("ban", "נותן באן למשתמש"),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("מוחק הודעות")
    .addIntegerOption(option =>
      option.setName("amount")
        .setDescription("כמות")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    ),

  userReasonCommand(
    "mute",
    "נותן Chat Mute למשתמש",
    true
  ),
  userReasonCommand(
    "unmute",
    "מסיר Chat Mute ממשתמש"
  ),
  userReasonCommand(
    "voice-mute",
    "עושה Voice Mute למשתמש",
    true
  ),
  userReasonCommand(
    "voice-unmute",
    "מוריד Voice Mute ממשתמש"
  ),
  userReasonCommand(
    "voice-deafen",
    "עושה Voice Deafen למשתמש",
    true
  ),
  userReasonCommand(
    "voice-undeafen",
    "מוריד Voice Deafen ממשתמש"
  )
].map(command => command.toJSON());

const rest = new REST({ version: "10" })
  .setToken(process.env.TOKEN);

(async () => {
  try {
    if (!process.env.TOKEN) {
      throw new Error("TOKEN missing");
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
