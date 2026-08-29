console.log("🚀 Starting bot...");

require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
  Events,
  AttachmentBuilder,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const config = require("./config");

const DATA_DIR = path.join(__dirname, "data");
const MOD_TIMERS_FILE = path.join(DATA_DIR, "mod-timers.json");
const WARNS_FILE = path.join(DATA_DIR, "warns.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error("❌ JSON load error:", error);
    return fallback;
  }
}

function saveJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("❌ JSON save error:", error);
  }
}

const modTimers = loadJson(MOD_TIMERS_FILE, {});
const warns = loadJson(WARNS_FILE, {});

process.on("unhandledRejection", error => console.error("❌ Unhandled Rejection:", error));
process.on("uncaughtException", error => console.error("❌ Uncaught Exception:", error));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Channel]
});

function parseDuration(input) {
  const match = String(input || "").trim().toLowerCase().match(/^(\d+)(s|m|h|d)$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]];
  const ms = amount * mult;
  return ms >= 10000 && ms <= 30 * 86400000 ? ms : null;
}

function formatDuration(ms) {
  if (ms % 86400000 === 0) return `${ms / 86400000}d`;
  if (ms % 3600000 === 0) return `${ms / 3600000}h`;
  if (ms % 60000 === 0) return `${ms / 60000}m`;
  return `${ms / 1000}s`;
}

function addModTimer(data) {
  const id = `${data.guildId}:${data.userId}:${data.type}`;
  modTimers[id] = { ...data, id };
  saveJson(MOD_TIMERS_FILE, modTimers);
}

function removeModTimer(guildId, userId, type) {
  const id = `${guildId}:${userId}:${type}`;
  delete modTimers[id];
  saveJson(MOD_TIMERS_FILE, modTimers);
}

function isStaff(member) {
  return Boolean(
    member?.roles?.cache?.has(config.staffRoleId) ||
    member?.permissions?.has(PermissionFlagsBits.Administrator)
  );
}

function isTicketStaff(member) {
  return Boolean(
    member?.roles?.cache?.has(config.ticketStaffRoleId) ||
    member?.permissions?.has(PermissionFlagsBits.Administrator)
  );
}

async function modLog(guild, embed) {
  if (!config.modLogsChannelId) return;
  const channel = guild.channels.cache.get(config.modLogsChannelId);
  if (channel?.isTextBased()) await channel.send({ embeds: [embed] }).catch(() => {});
}

async function expireModTimer(timer) {
  const guild = client.guilds.cache.get(timer.guildId);
  if (!guild) return;
  const member = await guild.members.fetch(timer.userId).catch(() => null);
  if (!member) return removeModTimer(timer.guildId, timer.userId, timer.type);

  if (timer.type === "chat-mute" && config.muteRoleId) {
    await member.roles.remove(config.muteRoleId, "Timed Chat Mute expired").catch(() => {});
  }
  if (timer.type === "voice-mute" && member.voice.channel) {
    await member.voice.setMute(false, "Timed Voice Mute expired").catch(() => {});
  }
  if (timer.type === "voice-deafen" && member.voice.channel) {
    await member.voice.setDeaf(false, "Timed Voice Deafen expired").catch(() => {});
  }
  removeModTimer(timer.guildId, timer.userId, timer.type);
}

async function checkModTimers() {
  for (const timer of Object.values(modTimers)) {
    if (timer.expiresAt <= Date.now()) await expireModTimer(timer);
  }
}

function userReasonCommand(name, description, withDuration = false) {
  const command = new SlashCommandBuilder()
    .setName(name).setDescription(description)
    .addUserOption(o => o.setName("user").setDescription("המשתמש").setRequired(true));
  if (withDuration) {
    command.addStringOption(o => o.setName("duration").setDescription("זמן: 30s / 10m / 2h / 3d").setRequired(true));
  }
  command.addStringOption(o => o.setName("reason").setDescription("סיבה").setRequired(false));
  return command;
}

async function registerSlashCommands() {
  const commands = [
    new SlashCommandBuilder().setName("ping").setDescription("בודק אם הבוט עובד"),
    new SlashCommandBuilder().setName("help").setDescription("מציג את כל פקודות הבוט"),
    new SlashCommandBuilder().setName("ticket-panel").setDescription("שולח פאנל טיקטים").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    userReasonCommand("warn", "נותן אזהרה למשתמש"),
    userReasonCommand("unwarn", "מוריד אזהרה אחת ממשתמש"),
    new SlashCommandBuilder().setName("timeout").setDescription("נותן Timeout למשתמש")
      .addUserOption(o => o.setName("user").setDescription("המשתמש").setRequired(true))
      .addIntegerOption(o => o.setName("minutes").setDescription("כמה דקות").setRequired(true).setMinValue(1).setMaxValue(40320))
      .addStringOption(o => o.setName("reason").setDescription("סיבה").setRequired(false)),
    userReasonCommand("kick", "מעיף משתמש"),
    userReasonCommand("ban", "נותן באן למשתמש"),
    new SlashCommandBuilder().setName("clear").setDescription("מוחק הודעות")
      .addIntegerOption(o => o.setName("amount").setDescription("כמות").setRequired(true).setMinValue(1).setMaxValue(100)),
    userReasonCommand("mute", "נותן Chat Mute למשתמש", true),
    userReasonCommand("unmute", "מסיר Chat Mute ממשתמש"),
    userReasonCommand("voice-mute", "עושה Voice Mute למשתמש", true),
    userReasonCommand("voice-unmute", "מוריד Voice Mute ממשתמש"),
    userReasonCommand("voice-deafen", "עושה Voice Deafen למשתמש", true),
    userReasonCommand("voice-undeafen", "מוריד Voice Deafen ממשתמש")
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
  const registered = await rest.put(
    Routes.applicationGuildCommands(config.clientId, config.guildId),
    { body: commands }
  );
  console.log(`✅ Registered ${registered.length} slash commands`);
  console.log(registered.map(c => `✅ /${c.name}`).join("\n"));
}

function getTicketOwnerId(channel) {
  return channel.topic?.match(/ticketOwner:(\d+)/)?.[1] || null;
}
function getTicketClaimedById(channel) {
  return channel.topic?.match(/claimedBy:(\d+)/)?.[1] || null;
}
function getTicketType(channel) {
  return channel.topic?.match(/ticketType:([^|]+)/)?.[1]?.trim() || "לא ידוע";
}
async function setTicketClaimedBy(channel, userId) {
  await channel.setTopic(
    `ticketOwner:${getTicketOwnerId(channel) || "unknown"} | ticketType:${getTicketType(channel)} | claimedBy:${userId || "none"}`
  ).catch(() => {});
}

function ticketButtons(claimedById = null) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("claim_ticket").setLabel("Claim Ticket").setEmoji("🙋").setStyle(ButtonStyle.Success).setDisabled(Boolean(claimedById)),
    new ButtonBuilder().setCustomId("release_ticket").setLabel("Release Ticket").setEmoji("🔓").setStyle(ButtonStyle.Secondary).setDisabled(!claimedById),
    new ButtonBuilder().setCustomId("add_user_ticket").setLabel("Add User").setEmoji("➕").setStyle(ButtonStyle.Primary).setDisabled(!claimedById),
    new ButtonBuilder().setCustomId("remove_user_ticket").setLabel("Remove User").setEmoji("➖").setStyle(ButtonStyle.Secondary).setDisabled(!claimedById),
    new ButtonBuilder().setCustomId("close_ticket").setLabel("Close Ticket").setEmoji("🔒").setStyle(ButtonStyle.Danger)
  );
}

async function transcript(channel) {
  const messages = await channel.messages.fetch({ limit: 100 });
  const sorted = [...messages.values()].sort((a,b) => a.createdTimestamp-b.createdTimestamp);
  let text = `Transcript for #${channel.name}\n\n`;
  for (const msg of sorted) {
    text += `[${msg.createdAt.toLocaleString("he-IL")}] ${msg.author.tag}: ${msg.content || "[בלי טקסט]"}\n`;
    msg.attachments.forEach(att => text += `Attachment: ${att.url}\n`);
  }
  return new AttachmentBuilder(Buffer.from(text, "utf8"), { name: `${channel.name}-transcript.txt` });
}

async function openTicket(interaction, data) {
  const existing = interaction.guild.channels.cache.find(ch => ch.topic?.includes(`ticketOwner:${interaction.user.id}`));
  if (existing) return interaction.reply({ content: `❌ כבר יש לך טיקט פתוח: ${existing}`, ephemeral: true });

  const safe = interaction.user.username.toLowerCase().replace(/[^a-z0-9א-ת]/g, "-").slice(0,20);
  const channel = await interaction.guild.channels.create({
    name: `ticket-${safe}`,
    type: ChannelType.GuildText,
    parent: config.ticketCategoryId,
    topic: `ticketOwner:${interaction.user.id} | ticketType:${data.name} | claimedBy:none`,
    permissionOverwrites: [
      { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: config.ticketStaffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] }
    ]
  });

  await channel.send({
    content: `<@&${config.ticketStaffRoleId}>`,
    embeds: [new EmbedBuilder().setColor("Blue").setTitle(`${data.emoji} טיקט חדש`).setDescription(`👤 משתמש: ${interaction.user}\n📌 סוג טיקט: **${data.name}**`).setTimestamp()],
    components: [ticketButtons()],
    allowedMentions: { roles: [config.ticketStaffRoleId] }
  });
  return interaction.reply({ content: `✅ הטיקט נפתח: ${channel}`, ephemeral: true });
}

function buildHelpEmbed() {
  return new EmbedBuilder().setColor("Blue").setTitle("📚 Help").setDescription([
    "**בדיקת הבוט**", "`/ping` — בודק אם הבוט עובד", "",
    "**טיקטים**", "`/ticket-panel` — שולח פאנל טיקטים", "",
    "**מודרציה**", "`/warn` — מוסיף אזהרה", "`/unwarn` — מוריד אזהרה אחת", "`/timeout` — Timeout", "`/kick` — Kick", "`/ban` — Ban", "`/clear` — מחיקת הודעות", "",
    "**Chat Mute**", "`/mute user duration reason` — Chat Mute זמני", "`/unmute user reason` — מסיר Chat Mute", "",
    "**Voice**", "`/voice-mute user duration reason` — Voice Mute זמני", "`/voice-unmute user reason` — מסיר Voice Mute", "`/voice-deafen user duration reason` — Voice Deafen זמני", "`/voice-undeafen user reason` — מסיר Voice Deafen", "",
    "**זמנים**", "`30s` / `10m` / `2h` / `3d`", "", `גם \`${config.prefix || "!"}h\` מציג את ההודעה הזאת.`
  ].join("\n")).setTimestamp();
}

client.once(Events.ClientReady, async readyClient => {
  console.log(`✅ Logged in as ${readyClient.user.tag}`);
  try {
    await registerSlashCommands();
    await checkModTimers();
    setInterval(() => checkModTimers().catch(console.error), 15000);
  } catch (error) {
    console.error("❌ Startup error:", error);
  }
});

client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot) return;
  if (message.content.trim().toLowerCase() === `${config.prefix || "!"}h`.toLowerCase()) {
    await message.reply({ embeds: [buildHelpEmbed()] }).catch(console.error);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      const name = interaction.commandName;

      if (name === "ping") return interaction.reply({ content: `🏓 Pong! ${client.ws.ping}ms`, ephemeral: true });
      if (name === "help") return interaction.reply({ embeds: [buildHelpEmbed()], ephemeral: true });

      if (name === "ticket-panel") {
        if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ אין לך גישה.", ephemeral: true });
        const menu = new StringSelectMenuBuilder().setCustomId("ticket_type_select").setPlaceholder("בחר סוג טיקט").addOptions(
          new StringSelectMenuOptionBuilder().setLabel("זכייה בהגרלה").setEmoji("🎉").setValue("giveaway"),
          new StringSelectMenuOptionBuilder().setLabel("זכייה במלך אמר").setEmoji("👑").setValue("king_says"),
          new StringSelectMenuOptionBuilder().setLabel("דיווח על שחקנים").setEmoji("❗").setValue("report"),
          new StringSelectMenuOptionBuilder().setLabel("בחינה לשוטר ואבטחה").setEmoji("👮").setValue("police")
        );
        await interaction.channel.send({ embeds: [new EmbedBuilder().setColor("Blue").setTitle("🎫 Tickets").setDescription("בחר סוג טיקט.")], components: [new ActionRowBuilder().addComponents(menu)] });
        return interaction.reply({ content: "✅ נשלח.", ephemeral: true });
      }

      const staffCommands = ["warn","unwarn","timeout","kick","ban","clear","mute","unmute","voice-mute","voice-unmute","voice-deafen","voice-undeafen"];
      if (staffCommands.includes(name) && !isStaff(interaction.member)) {
        return interaction.reply({ content: "❌ אין לך גישה.", ephemeral: true });
      }

      if (name === "warn") {
        const user = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason") || "לא צוינה סיבה";
        if (!Array.isArray(warns[user.id])) warns[user.id] = [];
        warns[user.id].push({ reason, moderatorId: interaction.user.id, createdAt: Date.now() });
        saveJson(WARNS_FILE, warns);
        await user.send(`⚠️ קיבלת אזהרה בשרת **${interaction.guild.name}**.\nסיבה: ${reason}\nסה"כ אזהרות: ${warns[user.id].length}`).catch(() => {});
        await modLog(interaction.guild, new EmbedBuilder().setColor("Yellow").setTitle("⚠️ Warn").addFields(
          {name:"משתמש",value:`${user}`},{name:"צוות",value:`${interaction.user}`},{name:"סיבה",value:reason},{name:"סה״כ אזהרות",value:`${warns[user.id].length}`}
        ).setTimestamp());
        return interaction.reply({ content: `✅ ${user} קיבל אזהרה. סה"כ: **${warns[user.id].length}**`, ephemeral: true });
      }

      if (name === "unwarn") {
        const user = interaction.options.getUser("user");
        const reason = interaction.options.getString("reason") || "לא צוינה סיבה";
        if (!Array.isArray(warns[user.id]) || warns[user.id].length === 0) {
          return interaction.reply({ content: `❌ ל־${user} אין אזהרות שמורות.`, ephemeral: true });
        }
        const removed = warns[user.id].pop();
        if (warns[user.id].length === 0) delete warns[user.id];
        saveJson(WARNS_FILE, warns);
        const remaining = warns[user.id]?.length || 0;
        await modLog(interaction.guild, new EmbedBuilder().setColor("Green").setTitle("✅ Unwarn").addFields(
          {name:"משתמש",value:`${user}`},{name:"צוות",value:`${interaction.user}`},{name:"סיבה להסרה",value:reason},{name:"האזהרה שהוסרה",value:removed.reason || "ללא סיבה"},{name:"נשארו",value:`${remaining}`}
        ).setTimestamp());
        return interaction.reply({ content: `✅ הורדה אזהרה אחת מ־${user}. נשארו: **${remaining}**`, ephemeral: true });
      }

      if (["mute","unmute"].includes(name)) {
        if (!config.muteRoleId) return interaction.reply({content:"❌ חסר muteRoleId ב־config.js.",ephemeral:true});
        const user=interaction.options.getUser("user"), reason=interaction.options.getString("reason")||"לא צוינה סיבה";
        const member=await interaction.guild.members.fetch(user.id).catch(()=>null);
        const role=await interaction.guild.roles.fetch(config.muteRoleId).catch(()=>null);
        if (!member || !role) return interaction.reply({content:"❌ לא מצאתי משתמש או רול Mute.",ephemeral:true});
        if (name==="mute") {
          const duration=parseDuration(interaction.options.getString("duration"));
          if (!duration) return interaction.reply({content:"❌ זמן לא תקין. דוגמה: 10m / 2h / 3d",ephemeral:true});
          await member.roles.add(role, `${reason} | by ${interaction.user.tag}`);
          addModTimer({guildId:interaction.guild.id,userId:user.id,type:"chat-mute",expiresAt:Date.now()+duration,reason,moderatorId:interaction.user.id});
          return interaction.reply({content:`✅ ${user} קיבל Chat Mute ל־${formatDuration(duration)}.`,ephemeral:true});
        }
        await member.roles.remove(role, `${reason} | by ${interaction.user.tag}`);
        removeModTimer(interaction.guild.id,user.id,"chat-mute");
        return interaction.reply({content:`✅ ה־Chat Mute הוסר מ־${user}.`,ephemeral:true});
      }

      if (["voice-mute","voice-unmute","voice-deafen","voice-undeafen"].includes(name)) {
        const user=interaction.options.getUser("user"), reason=interaction.options.getString("reason")||"לא צוינה סיבה";
        const member=await interaction.guild.members.fetch(user.id).catch(()=>null);
        if (!member?.voice.channel) return interaction.reply({content:"❌ המשתמש לא נמצא ב־Voice.",ephemeral:true});
        if (name==="voice-mute" || name==="voice-deafen") {
          const duration=parseDuration(interaction.options.getString("duration"));
          if (!duration) return interaction.reply({content:"❌ זמן לא תקין.",ephemeral:true});
          const type=name;
          if (name==="voice-mute") await member.voice.setMute(true,reason);
          else await member.voice.setDeaf(true,reason);
          addModTimer({guildId:interaction.guild.id,userId:user.id,type,expiresAt:Date.now()+duration,reason,moderatorId:interaction.user.id});
          return interaction.reply({content:`✅ הפעולה בוצעה ל־${formatDuration(duration)}.`,ephemeral:true});
        }
        if (name==="voice-unmute") {
          await member.voice.setMute(false,reason);
          removeModTimer(interaction.guild.id,user.id,"voice-mute");
        } else {
          await member.voice.setDeaf(false,reason);
          removeModTimer(interaction.guild.id,user.id,"voice-deafen");
        }
        return interaction.reply({content:"✅ הפעולה בוצעה.",ephemeral:true});
      }

      if (name === "timeout") {
        const user=interaction.options.getUser("user"), minutes=interaction.options.getInteger("minutes"), reason=interaction.options.getString("reason")||"לא צוינה סיבה";
        const member=await interaction.guild.members.fetch(user.id).catch(()=>null);
        if (!member?.moderatable) return interaction.reply({content:"❌ אי אפשר לעשות Timeout למשתמש הזה.",ephemeral:true});
        await member.timeout(minutes*60000,reason);
        return interaction.reply({content:`✅ ${user} קיבל Timeout ל־${minutes} דקות.`,ephemeral:true});
      }
      if (name === "kick") {
        const user=interaction.options.getUser("user"), member=await interaction.guild.members.fetch(user.id).catch(()=>null);
        if (!member?.kickable) return interaction.reply({content:"❌ אי אפשר להעיף את המשתמש.",ephemeral:true});
        await member.kick(interaction.options.getString("reason")||"לא צוינה סיבה");
        return interaction.reply({content:`✅ ${user.tag} הועף.`,ephemeral:true});
      }
      if (name === "ban") {
        const user=interaction.options.getUser("user");
        await interaction.guild.members.ban(user.id,{reason:interaction.options.getString("reason")||"לא צוינה סיבה"});
        return interaction.reply({content:`✅ ${user.tag} קיבל באן.`,ephemeral:true});
      }
      if (name === "clear") {
        const deleted=await interaction.channel.bulkDelete(interaction.options.getInteger("amount"),true);
        return interaction.reply({content:`✅ נמחקו ${deleted.size} הודעות.`,ephemeral:true});
      }
    }

    if (interaction.isStringSelectMenu() && interaction.customId==="ticket_type_select") {
      const types={giveaway:{name:"זכייה בהגרלה",emoji:"🎉"},king_says:{name:"זכייה במלך אמר",emoji:"👑"},report:{name:"דיווח על שחקנים",emoji:"❗"},police:{name:"בחינה לשוטר ואבטחה",emoji:"👮"}};
      return openTicket(interaction,types[interaction.values[0]]);
    }

    if (interaction.isButton()) {
      const claimed=getTicketClaimedById(interaction.channel);
      if (interaction.customId==="claim_ticket") {
        if (!isTicketStaff(interaction.member)) return interaction.reply({content:"❌ רק צוות יכול לקחת טיקט.",ephemeral:true});
        if (claimed && claimed!=="none") return interaction.reply({content:`❌ הטיקט כבר נלקח על ידי <@${claimed}>.`,ephemeral:true});
        await setTicketClaimedBy(interaction.channel,interaction.user.id);
        return interaction.update({components:[ticketButtons(interaction.user.id)]});
      }
      if (interaction.customId==="release_ticket") {
        if (claimed!==interaction.user.id) return interaction.reply({content:"❌ רק מי שלקח את הטיקט יכול לשחרר אותו.",ephemeral:true});
        await setTicketClaimedBy(interaction.channel,null);
        return interaction.update({components:[ticketButtons()]});
      }
      if (["add_user_ticket","remove_user_ticket"].includes(interaction.customId)) {
        if (claimed!==interaction.user.id) return interaction.reply({content:"❌ רק מי שלקח את הטיקט יכול לעשות זאת.",ephemeral:true});
        const add=interaction.customId==="add_user_ticket";
        const menu=new UserSelectMenuBuilder().setCustomId(add?"ticket_add_user_select":"ticket_remove_user_select").setPlaceholder(add?"בחר משתמש להוספה":"בחר משתמש להסרה");
        return interaction.reply({content:"בחר משתמש:",components:[new ActionRowBuilder().addComponents(menu)],ephemeral:true});
      }
      if (interaction.customId==="close_ticket") {
        if (!isTicketStaff(interaction.member)) return interaction.reply({content:"❌ רק צוות יכול לסגור טיקט.",ephemeral:true});
        const logs=interaction.guild.channels.cache.get(config.ticketLogsChannelId);
        const file=await transcript(interaction.channel).catch(()=>null);
        if (logs?.isTextBased()) await logs.send({content:`🔒 טיקט נסגר\n🎫 ${interaction.channel.name}\n👤 על ידי ${interaction.user}`,files:file?[file]:[]}).catch(()=>{});
        await interaction.reply("🔒 הטיקט ייסגר בעוד 5 שניות...");
        setTimeout(()=>interaction.channel.delete().catch(()=>{}),5000);
        return;
      }
    }

    if (interaction.isUserSelectMenu()) {
      const userId=interaction.values[0];
      if (interaction.customId==="ticket_add_user_select") {
        await interaction.channel.permissionOverwrites.edit(userId,{ViewChannel:true,SendMessages:true,ReadMessageHistory:true});
        return interaction.update({content:`✅ <@${userId}> נוסף לטיקט.`,components:[]});
      }
      if (interaction.customId==="ticket_remove_user_select") {
        const ownerId=getTicketOwnerId(interaction.channel), claimedId=getTicketClaimedById(interaction.channel);
        if (userId===ownerId || userId===claimedId) return interaction.update({content:"❌ אי אפשר להסיר את המשתמש הזה.",components:[]});
        const member=await interaction.guild.members.fetch(userId).catch(()=>null);
        if (member?.roles.cache.has(config.ticketStaffRoleId)) return interaction.update({content:"❌ אי אפשר להסיר Staff.",components:[]});
        await interaction.channel.permissionOverwrites.delete(userId).catch(()=>{});
        return interaction.update({content:`✅ <@${userId}> הוסר מהטיקט.`,components:[]});
      }
    }
  } catch (error) {
    console.error("❌ Interaction error:", error);
    const payload={content:"❌ הייתה שגיאה בביצוע הפעולה.",ephemeral:true};
    if (interaction.replied || interaction.deferred) return interaction.followUp(payload).catch(()=>{});
    return interaction.reply(payload).catch(()=>{});
  }
});

if (!process.env.TOKEN) {
  console.log("❌ TOKEN missing in .env");
  process.exit(1);
}

console.log("🔄 Connecting to Discord...");
client.login(process.env.TOKEN).catch(error => {
  console.error("❌ Login failed:", error);
  process.exit(1);
});
