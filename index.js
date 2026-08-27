console.log("🚀 Starting bot...");

require("dotenv").config();

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
  AttachmentBuilder
} = require("discord.js");

const config = require("./config");

process.on("unhandledRejection", error => {
  console.error("❌ Unhandled Rejection:", error);
});

process.on("uncaughtException", error => {
  console.error("❌ Uncaught Exception:", error);
});

console.log("✅ Loaded discord.js");
console.log("✅ Loaded config.js");
console.log("🔑 TOKEN exists:", Boolean(process.env.TOKEN));

if (!config.clientId) {
  console.log("⚠️ clientId חסר ב־config.js");
}

if (!config.guildId) {
  console.log("⚠️ guildId חסר ב־config.js");
}

if (!config.staffRoleId) {
  console.log("⚠️ staffRoleId חסר ב־config.js");
}

if (!config.ticketCategoryId) {
  console.log("⚠️ ticketCategoryId חסר ב־config.js");
}

if (!config.ticketStaffRoleId) {
  console.log("⚠️ ticketStaffRoleId חסר ב־config.js");
}

if (!config.ticketLogsChannelId) {
  console.log("⚠️ ticketLogsChannelId חסר ב־config.js");
}

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
  const ownerId = getTicketOwnerId(channel);
  const type = getTicketType(channel);

  await channel.setTopic(
    `ticketOwner:${ownerId || "unknown"} | ticketType:${type} | claimedBy:${userId || "none"}`
  ).catch(error => {
    console.error("❌ Failed to update ticket topic:", error);
  });
}

function ticketButtons(claimedById = null) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("claim_ticket")
      .setLabel("Claim Ticket")
      .setEmoji("🙋")
      .setStyle(ButtonStyle.Success)
      .setDisabled(Boolean(claimedById)),

    new ButtonBuilder()
      .setCustomId("release_ticket")
      .setLabel("Release Ticket")
      .setEmoji("🔓")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!claimedById),

    new ButtonBuilder()
      .setCustomId("add_user_ticket")
      .setLabel("Add User")
      .setEmoji("➕")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!claimedById),

    new ButtonBuilder()
      .setCustomId("remove_user_ticket")
      .setLabel("Remove User")
      .setEmoji("➖")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!claimedById),

    new ButtonBuilder()
      .setCustomId("close_ticket")
      .setLabel("Close Ticket")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger)
  );
}

async function transcript(channel) {
  const messages = await channel.messages.fetch({ limit: 100 });
  const sorted = [...messages.values()].sort(
    (a, b) => a.createdTimestamp - b.createdTimestamp
  );

  let text = `Transcript for #${channel.name}\n\n`;

  for (const msg of sorted) {
    text += `[${msg.createdAt.toLocaleString("he-IL")}] ${msg.author.tag}: ${msg.content || "[בלי טקסט]"}\n`;

    msg.attachments.forEach(att => {
      text += `Attachment: ${att.url}\n`;
    });
  }

  return new AttachmentBuilder(Buffer.from(text, "utf8"), {
    name: `${channel.name}-transcript.txt`
  });
}

async function modLog(guild, embed) {
  if (!config.modLogsChannelId) return;

  const channel = guild.channels.cache.get(config.modLogsChannelId);

  if (channel?.isTextBased()) {
    await channel.send({ embeds: [embed] }).catch(error => {
      console.error("❌ Mod log error:", error);
    });
  }
}

async function openTicket(interaction, data) {
  if (
    !config.ticketCategoryId ||
    !config.ticketStaffRoleId ||
    !config.ticketLogsChannelId
  ) {
    return interaction.reply({
      content: "❌ חסרים IDs של מערכת הטיקטים ב־config.js.",
      ephemeral: true
    });
  }

  const existing = interaction.guild.channels.cache.find(ch =>
    ch.topic?.includes(`ticketOwner:${interaction.user.id}`)
  );

  if (existing) {
    return interaction.reply({
      content: `❌ כבר יש לך טיקט פתוח: ${existing}`,
      ephemeral: true
    });
  }

  const safe = interaction.user.username
    .toLowerCase()
    .replace(/[^a-z0-9א-ת]/g, "-")
    .slice(0, 20);

  const channel = await interaction.guild.channels.create({
    name: `ticket-${safe}`,
    type: ChannelType.GuildText,
    parent: config.ticketCategoryId,
    topic: `ticketOwner:${interaction.user.id} | ticketType:${data.name} | claimedBy:none`,
    permissionOverwrites: [
      {
        id: interaction.guild.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory
        ]
      },
      {
        id: config.ticketStaffRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages
        ]
      }
    ]
  });

  const embed = new EmbedBuilder()
    .setColor("Blue")
    .setTitle(`${data.emoji} טיקט חדש`)
    .setDescription(
      `👤 משתמש: ${interaction.user}\n` +
      `📌 סוג טיקט: **${data.name}**`
    )
    .setTimestamp();

  await channel.send({
    content: `<@&${config.ticketStaffRoleId}>`,
    embeds: [embed],
    components: [ticketButtons()],
    allowedMentions: {
      roles: [config.ticketStaffRoleId]
    }
  });

  return interaction.reply({
    content: `✅ הטיקט נפתח: ${channel}`,
    ephemeral: true
  });
}

client.once(Events.ClientReady, readyClient => {
  console.log(`✅ Logged in as ${readyClient.user.tag}`);
  console.log(`✅ Bot ID: ${readyClient.user.id}`);
  console.log(`✅ Servers: ${readyClient.guilds.cache.size}`);
});

client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot) return;

  const prefix = config.prefix || "!";

  if (message.content.trim().toLowerCase() === `${prefix}h`) {
    const embed = new EmbedBuilder()
      .setColor("Blue")
      .setTitle("📚 Help")
      .setDescription(
        [
          "`/ping` — בדיקת בוט",
          "`/ticket-panel` — פאנל טיקטים",
          "`/warn` — אזהרה",
          "`/timeout` — טיימאאוט",
          "`/kick` — קיק",
          "`/ban` — באן",
          "`/clear` — מחיקת הודעות"
        ].join("\n")
      );

    return message.reply({ embeds: [embed] });
  }
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "ping") {
        return interaction.reply({
          content: `🏓 Pong! ${client.ws.ping}ms`,
          ephemeral: true
        });
      }

      if (interaction.commandName === "ticket-panel") {
        if (!isStaff(interaction.member)) {
          return interaction.reply({
            content: "❌ אין לך גישה.",
            ephemeral: true
          });
        }

        const menu = new StringSelectMenuBuilder()
          .setCustomId("ticket_type_select")
          .setPlaceholder("בחר סוג טיקט")
          .addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel("זכייה בהגרלה")
              .setEmoji("🎉")
              .setValue("giveaway"),

            new StringSelectMenuOptionBuilder()
              .setLabel("זכייה במלך אמר")
              .setEmoji("👑")
              .setValue("king_says"),

            new StringSelectMenuOptionBuilder()
              .setLabel("דיווח על שחקנים")
              .setEmoji("❗")
              .setValue("report"),

            new StringSelectMenuOptionBuilder()
              .setLabel("בחינה לשוטר ואבטחה")
              .setEmoji("👮")
              .setValue("police")
          );

        await interaction.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor("Blue")
              .setTitle("🎫 Tickets")
              .setDescription("בחר סוג טיקט.")
          ],
          components: [
            new ActionRowBuilder().addComponents(menu)
          ]
        });

        return interaction.reply({
          content: "✅ נשלח.",
          ephemeral: true
        });
      }

      if (
        ["warn", "timeout", "kick", "ban", "clear"]
          .includes(interaction.commandName)
      ) {
        if (!isStaff(interaction.member)) {
          return interaction.reply({
            content: "❌ אין לך גישה.",
            ephemeral: true
          });
        }
      }

      if (interaction.commandName === "warn") {
        const user = interaction.options.getUser("user");
        const reason =
          interaction.options.getString("reason") ||
          "לא צוינה סיבה";

        await user.send(
          `⚠️ קיבלת אזהרה בשרת **${interaction.guild.name}**.\n` +
          `סיבה: ${reason}`
        ).catch(() => {});

        await modLog(
          interaction.guild,
          new EmbedBuilder()
            .setColor("Yellow")
            .setTitle("⚠️ Warn")
            .addFields(
              { name: "משתמש", value: `${user}` },
              { name: "צוות", value: `${interaction.user}` },
              { name: "סיבה", value: reason }
            )
            .setTimestamp()
        );

        return interaction.reply({
          content: `✅ ${user} קיבל אזהרה.`,
          ephemeral: true
        });
      }

      if (interaction.commandName === "timeout") {
        const user = interaction.options.getUser("user");
        const minutes =
          interaction.options.getInteger("minutes");
        const reason =
          interaction.options.getString("reason") ||
          "לא צוינה סיבה";

        const member = await interaction.guild.members
          .fetch(user.id)
          .catch(() => null);

        if (!member?.moderatable) {
          return interaction.reply({
            content:
              "❌ אי אפשר לעשות Timeout למשתמש הזה.",
            ephemeral: true
          });
        }

        await member.timeout(
          minutes * 60000,
          `${reason} | by ${interaction.user.tag}`
        );

        await modLog(
          interaction.guild,
          new EmbedBuilder()
            .setColor("Orange")
            .setTitle("⏳ Timeout")
            .addFields(
              { name: "משתמש", value: `${user}` },
              { name: "זמן", value: `${minutes} דקות` },
              { name: "צוות", value: `${interaction.user}` },
              { name: "סיבה", value: reason }
            )
            .setTimestamp()
        );

        return interaction.reply({
          content:
            `✅ ${user} קיבל Timeout ל־${minutes} דקות.`,
          ephemeral: true
        });
      }

      if (interaction.commandName === "kick") {
        const user = interaction.options.getUser("user");
        const reason =
          interaction.options.getString("reason") ||
          "לא צוינה סיבה";

        const member = await interaction.guild.members
          .fetch(user.id)
          .catch(() => null);

        if (!member?.kickable) {
          return interaction.reply({
            content: "❌ אי אפשר להעיף את המשתמש.",
            ephemeral: true
          });
        }

        await member.kick(
          `${reason} | by ${interaction.user.tag}`
        );

        await modLog(
          interaction.guild,
          new EmbedBuilder()
            .setColor("Red")
            .setTitle("👢 Kick")
            .addFields(
              { name: "משתמש", value: `${user.tag}` },
              { name: "צוות", value: `${interaction.user}` },
              { name: "סיבה", value: reason }
            )
            .setTimestamp()
        );

        return interaction.reply({
          content: `✅ ${user.tag} הועף.`,
          ephemeral: true
        });
      }

      if (interaction.commandName === "ban") {
        const user = interaction.options.getUser("user");
        const reason =
          interaction.options.getString("reason") ||
          "לא צוינה סיבה";

        await interaction.guild.members.ban(user.id, {
          reason:
            `${reason} | by ${interaction.user.tag}`
        });

        await modLog(
          interaction.guild,
          new EmbedBuilder()
            .setColor("DarkRed")
            .setTitle("🔨 Ban")
            .addFields(
              { name: "משתמש", value: `${user.tag}` },
              { name: "צוות", value: `${interaction.user}` },
              { name: "סיבה", value: reason }
            )
            .setTimestamp()
        );

        return interaction.reply({
          content: `✅ ${user.tag} קיבל באן.`,
          ephemeral: true
        });
      }

      if (interaction.commandName === "clear") {
        const amount =
          interaction.options.getInteger("amount");

        const deleted =
          await interaction.channel.bulkDelete(amount, true);

        return interaction.reply({
          content:
            `✅ נמחקו ${deleted.size} הודעות.`,
          ephemeral: true
        });
      }
    }

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === "ticket_type_select"
    ) {
      const types = {
        giveaway: {
          name: "זכייה בהגרלה",
          emoji: "🎉"
        },
        king_says: {
          name: "זכייה במלך אמר",
          emoji: "👑"
        },
        report: {
          name: "דיווח על שחקנים",
          emoji: "❗"
        },
        police: {
          name: "בחינה לשוטר ואבטחה",
          emoji: "👮"
        }
      };

      return openTicket(
        interaction,
        types[interaction.values[0]]
      );
    }

    if (interaction.isButton()) {
      if (interaction.customId === "claim_ticket") {
        if (!isTicketStaff(interaction.member)) {
          return interaction.reply({
            content:
              "❌ רק צוות יכול לקחת טיקט.",
            ephemeral: true
          });
        }

        const claimed =
          getTicketClaimedById(interaction.channel);

        if (claimed && claimed !== "none") {
          return interaction.reply({
            content:
              `❌ הטיקט כבר נלקח על ידי <@${claimed}>.`,
            ephemeral: true
          });
        }

        await setTicketClaimedBy(
          interaction.channel,
          interaction.user.id
        );

        return interaction.update({
          components: [
            ticketButtons(interaction.user.id)
          ]
        });
      }

      if (interaction.customId === "release_ticket") {
        const claimed =
          getTicketClaimedById(interaction.channel);

        if (claimed !== interaction.user.id) {
          return interaction.reply({
            content:
              "❌ רק מי שלקח את הטיקט יכול לשחרר אותו.",
            ephemeral: true
          });
        }

        await setTicketClaimedBy(
          interaction.channel,
          null
        );

        return interaction.update({
          components: [ticketButtons()]
        });
      }

      if (interaction.customId === "add_user_ticket") {
        const claimed =
          getTicketClaimedById(interaction.channel);

        if (claimed !== interaction.user.id) {
          return interaction.reply({
            content:
              "❌ רק מי שלקח את הטיקט יכול להוסיף משתמש.",
            ephemeral: true
          });
        }

        const menu = new UserSelectMenuBuilder()
          .setCustomId("ticket_add_user_select")
          .setPlaceholder("בחר משתמש להוספה");

        return interaction.reply({
          content: "בחר משתמש:",
          components: [
            new ActionRowBuilder().addComponents(menu)
          ],
          ephemeral: true
        });
      }

      if (interaction.customId === "remove_user_ticket") {
        const claimed =
          getTicketClaimedById(interaction.channel);

        if (claimed !== interaction.user.id) {
          return interaction.reply({
            content:
              "❌ רק מי שלקח את הטיקט יכול להסיר משתמש.",
            ephemeral: true
          });
        }

        const menu = new UserSelectMenuBuilder()
          .setCustomId("ticket_remove_user_select")
          .setPlaceholder("בחר משתמש להסרה");

        return interaction.reply({
          content: "בחר משתמש:",
          components: [
            new ActionRowBuilder().addComponents(menu)
          ],
          ephemeral: true
        });
      }

      if (interaction.customId === "close_ticket") {
        if (!isTicketStaff(interaction.member)) {
          return interaction.reply({
            content:
              "❌ רק צוות יכול לסגור טיקט.",
            ephemeral: true
          });
        }

        const logs =
          interaction.guild.channels.cache.get(
            config.ticketLogsChannelId
          );

        const file =
          await transcript(interaction.channel)
            .catch(() => null);

        if (logs?.isTextBased()) {
          await logs.send({
            content:
              `🔒 טיקט נסגר\n` +
              `🎫 ${interaction.channel.name}\n` +
              `👤 על ידי ${interaction.user}`,
            files: file ? [file] : []
          }).catch(() => {});
        }

        await interaction.reply(
          "🔒 הטיקט ייסגר בעוד 5 שניות..."
        );

        setTimeout(() => {
          interaction.channel.delete().catch(() => {});
        }, 5000);

        return;
      }
    }

    if (interaction.isUserSelectMenu()) {
      if (
        interaction.customId ===
        "ticket_add_user_select"
      ) {
        const userId = interaction.values[0];

        await interaction.channel.permissionOverwrites.edit(
          userId,
          {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true
          }
        );

        return interaction.update({
          content:
            `✅ <@${userId}> נוסף לטיקט.`,
          components: []
        });
      }

      if (
        interaction.customId ===
        "ticket_remove_user_select"
      ) {
        const userId = interaction.values[0];
        const ownerId =
          getTicketOwnerId(interaction.channel);
        const claimedId =
          getTicketClaimedById(interaction.channel);

        if (
          userId === ownerId ||
          userId === claimedId
        ) {
          return interaction.update({
            content:
              "❌ אי אפשר להסיר את המשתמש הזה.",
            components: []
          });
        }

        const member =
          await interaction.guild.members
            .fetch(userId)
            .catch(() => null);

        if (
          member?.roles.cache.has(
            config.ticketStaffRoleId
          )
        ) {
          return interaction.update({
            content:
              "❌ אי אפשר להסיר Staff.",
            components: []
          });
        }

        await interaction.channel.permissionOverwrites
          .delete(userId)
          .catch(() => {});

        return interaction.update({
          content:
            `✅ <@${userId}> הוסר מהטיקט.`,
          components: []
        });
      }
    }
  } catch (error) {
    console.error("❌ Interaction error:", error);

    if (interaction.replied || interaction.deferred) {
      return interaction.followUp({
        content:
          "❌ הייתה שגיאה בביצוע הפעולה.",
        ephemeral: true
      }).catch(() => {});
    }

    return interaction.reply({
      content:
        "❌ הייתה שגיאה בביצוע הפעולה.",
      ephemeral: true
    }).catch(() => {});
  }
});

if (!process.env.TOKEN) {
  console.log(
    "❌ TOKEN missing in .env — הבוט לא יכול להתחבר."
  );
  process.exit(1);
}

console.log("🔄 Connecting to Discord...");

client.login(process.env.TOKEN)
  .then(() => {
    console.log("✅ Login request sent successfully.");
  })
  .catch(error => {
    console.error("❌ Login failed:", error);
    process.exit(1);
  });
