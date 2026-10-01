const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  SlashCommandBuilder
} = require("discord.js");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

const PREMIUM_ROLE_NAME =
  process.env.PREMIUM_ROLE_NAME || "Premium";

const ADMIN_ROLE_NAME =
  process.env.ADMIN_ROLE_NAME || "Admin";

const API_SECRET =
  process.env.API_SECRET || "";

const SCRIPT_URL =
  process.env.SCRIPT_URL || "";

const DB_FILE =
  path.join(__dirname, "keys.json");


/* =========================================================
   DATABASE
========================================================= */

function loadDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return {
        keys: {}
      };
    }

    const data = JSON.parse(
      fs.readFileSync(DB_FILE, "utf8")
    );

    if (!data || typeof data !== "object") {
      return {
        keys: {}
      };
    }

    if (!data.keys || typeof data.keys !== "object") {
      data.keys = {};
    }

    return data;

  } catch (err) {

    console.error(
      "Database read error:",
      err.message
    );

    return {
      keys: {}
    };
  }
}


function saveDB(db) {
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify(db, null, 2),
    "utf8"
  );
}


/* =========================================================
   HELPERS
========================================================= */

function normalizeKey(value) {
  return String(value || "").trim();
}


function normalizeHWID(value) {
  return String(value || "").trim();
}


function generateKey() {

  const a = crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase();

  const b = crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase();

  const c = crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase();

  return `NKH-${a}-${b}-${c}`;
}


function addDays(days) {

  const date = new Date();

  date.setTime(
    date.getTime() +
    Number(days) * 24 * 60 * 60 * 1000
  );

  return date.toISOString();
}


function adminSecret(req) {

  return (
    req.headers["x-api-secret"] ===
    API_SECRET
  );
}


function isExpired(item) {

  if (!item || !item.expires) {
    return true;
  }

  return (
    new Date(item.expires).getTime() <
    Date.now()
  );
}


/* =========================================================
   HEALTH
========================================================= */

app.get("/health", (req, res) => {

  res.json({
    ok: true,
    service: "NhatKhanh Key API"
  });

});


/* =========================================================
   VERIFY KEY + HWID
========================================================= */

app.post("/api/verify", (req, res) => {

  const key =
    normalizeKey(req.body.key);

  const hwid =
    normalizeHWID(req.body.hwid);


  if (!key || !hwid) {

    return res.status(400).json({
      valid: false,
      message: "Missing key or HWID"
    });

  }


  const db = loadDB();

  const item =
    db.keys[key];


  if (!item) {

    return res.status(404).json({
      valid: false,
      message: "Invalid key"
    });

  }


  if (item.enabled === false) {

    return res.status(403).json({
      valid: false,
      message: "Key disabled"
    });

  }


  if (isExpired(item)) {

    return res.status(403).json({
      valid: false,
      message: "Key expired",
      expires: item.expires || null
    });

  }


  /*
    First device binds the key.
  */

  if (!item.hwid) {

    item.hwid = hwid;

    item.status = "bound";

    item.bound_at =
      new Date().toISOString();

    saveDB(db);

  } else if (item.hwid !== hwid) {

    return res.status(403).json({
      valid: false,
      message: "HWID mismatch"
    });

  }


  return res.json({

    valid: true,

    message: "Key valid",

    key,

    expires: item.expires,

    plan:
      item.plan || "1 month"

  });

});


/* =========================================================
   ADMIN API - CREATE KEY
========================================================= */

app.post("/api/admin/create", (req, res) => {

  if (!adminSecret(req)) {

    return res.status(401).json({
      ok: false,
      message: "Unauthorized"
    });

  }


  const key =
    normalizeKey(req.body.key);

  const expires =
    req.body.expires;

  const plan =
    req.body.plan || "1 month";


  if (!key || !expires) {

    return res.status(400).json({
      ok: false,
      message:
        "key and expires are required"
    });

  }


  const db = loadDB();


  if (db.keys[key]) {

    return res.status(409).json({
      ok: false,
      message:
        "Key already exists"
    });

  }


  db.keys[key] = {

    plan,

    expires,

    hwid: "",

    status: "unbound",

    enabled: true,

    created_at:
      new Date().toISOString()

  };


  saveDB(db);


  return res.json({

    ok: true,

    key,

    data: db.keys[key]

  });

});


/* =========================================================
   ADMIN API - RESET HWID
========================================================= */

app.post(
  "/api/admin/reset-hwid",
  (req, res) => {

    if (!adminSecret(req)) {

      return res.status(401).json({
        ok: false,
        message: "Unauthorized"
      });

    }


    const key =
      normalizeKey(req.body.key);

    const db =
      loadDB();


    if (!db.keys[key]) {

      return res.status(404).json({
        ok: false,
        message: "Key not found"
      });

    }


    db.keys[key].hwid = "";

    db.keys[key].status =
      "unbound";

    db.keys[key].reset_at =
      new Date().toISOString();


    saveDB(db);


    return res.json({

      ok: true,

      message:
        "HWID reset",

      key

    });

  }
);


/* =========================================================
   ADMIN API - ENABLE / DISABLE
========================================================= */

app.post(
  "/api/admin/toggle",
  (req, res) => {

    if (!adminSecret(req)) {

      return res.status(401).json({
        ok: false,
        message: "Unauthorized"
      });

    }


    const key =
      normalizeKey(req.body.key);

    const enabled =
      Boolean(req.body.enabled);

    const db =
      loadDB();


    if (!db.keys[key]) {

      return res.status(404).json({
        ok: false,
        message: "Key not found"
      });

    }


    db.keys[key].enabled =
      enabled;


    saveDB(db);


    return res.json({

      ok: true,

      key,

      enabled

    });

  }
);


/* =========================================================
   ADMIN API - STATS
========================================================= */

app.get(
  "/api/admin/stats",
  (req, res) => {

    if (!adminSecret(req)) {

      return res.status(401).json({
        ok: false,
        message: "Unauthorized"
      });

    }


    const db =
      loadDB();

    const list =
      Object.values(db.keys);


    return res.json({

      ok: true,

      total:
        list.length,

      enabled:
        list.filter(
          x => x.enabled !== false
        ).length,

      disabled:
        list.filter(
          x => x.enabled === false
        ).length,

      bound:
        list.filter(
          x => !!x.hwid
        ).length,

      unbound:
        list.filter(
          x => !x.hwid
        ).length,

      expired:
        list.filter(
          isExpired
        ).length

    });

  }
);


/* =========================================================
   SCRIPT ENDPOINT
========================================================= */

app.get("/api/script", (req, res) => {

  if (!SCRIPT_URL) {

    return res.status(500).json({

      ok: false,

      message:
        "SCRIPT_URL is not configured"

    });

  }


  return res.redirect(
    SCRIPT_URL
  );

});


/* =========================================================
   DISCORD CLIENT
========================================================= */

const client = new Client({

  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]

});


/* =========================================================
   DISCORD HELPERS
========================================================= */

function getGuild() {

  return client.guilds.cache.get(
    GUILD_ID
  );

}


function getRoleByName(
  guild,
  name
) {

  return guild?.roles.cache.find(
    role =>
      role.name.toLowerCase() ===
      name.toLowerCase()
  );

}


function isAdmin(member) {

  if (!member) {
    return false;
  }


  const role =
    getRoleByName(
      member.guild,
      ADMIN_ROLE_NAME
    );


  if (!role) {
    return false;
  }


  return member.roles.cache.has(
    role.id
  );

}


/* =========================================================
   REGISTER SLASH COMMANDS
========================================================= */

async function registerCommands() {

  const guild =
    getGuild();


  if (!guild) {

    console.error(
      "Guild not found:",
      GUILD_ID
    );

    return;

  }


  const commands = [

    new SlashCommandBuilder()

      .setName("panel")

      .setDescription(
        "Open NhatKhanh Hub Key panel"
      )

      .toJSON(),


    new SlashCommandBuilder()

      .setName("createkey")

      .setDescription(
        "Admin: tạo Key mới"
      )

      .addIntegerOption(
        option =>
          option

            .setName("days")

            .setDescription(
              "Số ngày sử dụng của Key"
            )

            .setRequired(true)

            .setMinValue(1)

            .setMaxValue(3650)
      )

      .toJSON()

  ];


  const existing =
    await guild.commands.fetch();


  for (
    const commandData
    of commands
  ) {

    const old =
      existing.find(
        command =>
          command.name ===
          commandData.name
      );


    if (old) {

      await old.edit(
        commandData
      );

    } else {

      await guild.commands.create(
        commandData
      );

    }

  }

}


/* =========================================================
   PANEL BUTTONS
========================================================= */

function panelRow() {

  return new ActionRowBuilder()

    .addComponents(

      new ButtonBuilder()

        .setCustomId(
          "redeem"
        )

        .setLabel(
          "Redeem Key"
        )

        .setStyle(
          ButtonStyle.Primary
        ),


      new ButtonBuilder()

        .setCustomId(
          "getrole"
        )

        .setLabel(
          "Get Role"
        )

        .setStyle(
          ButtonStyle.Success
        ),


      new ButtonBuilder()

        .setCustomId(
          "getscript"
        )

        .setLabel(
          "Get Script"
        )

        .setStyle(
          ButtonStyle.Secondary
        ),


      new ButtonBuilder()

        .setCustomId(
          "stats"
        )

        .setLabel(
          "Get Stats"
        )

        .setStyle(
          ButtonStyle.Secondary
        ),


      new ButtonBuilder()

        .setCustomId(
          "resethwid"
        )

        .setLabel(
          "Reset HWID"
        )

        .setStyle(
          ButtonStyle.Danger
        )

    );

}


/* =========================================================
   BOT READY
========================================================= */

client.once(
  "ready",
  async () => {

    console.log(
      `Discord bot logged in as ${client.user.tag}`
    );


    try {

      await registerCommands();


      console.log(
        "Registered /panel and /createkey"
      );

    } catch (err) {

      console.error(
        "Command registration error:",
        err.message
      );

    }

  }
);


/* =========================================================
   INTERACTIONS
========================================================= */

client.on(
  "interactionCreate",
  async interaction => {

    try {


      /* =====================================================
         /CREATEKEY
      ===================================================== */

      if (
        interaction.isChatInputCommand() &&
        interaction.commandName ===
          "createkey"
      ) {

        if (
          !isAdmin(
            interaction.member
          )
        ) {

          return interaction.reply({

            content:
              "❌ Bạn không có quyền Admin.",

            ephemeral: true

          });

        }


        const days =
          interaction.options.getInteger(
            "days",
            true
          );


        const db =
          loadDB();


        let key;


        do {

          key =
            generateKey();

        } while (
          db.keys[key]
        );


        const expires =
          addDays(days);


        db.keys[key] = {

          plan:
            `${days} days`,

          expires,

          hwid: "",

          status:
            "unbound",

          enabled:
            true,

          created_at:
            new Date().toISOString(),

          created_by:
            interaction.user.id

        };


        saveDB(db);


        return interaction.reply({

          content:

            `✅ **Đã tạo Key mới**\n\n` +

            `🔑 Key: \`${key}\`\n` +

            `⏳ Thời hạn: **${days} ngày**\n` +

            `📅 Hết hạn: **${expires}**\n` +

            `🔒 HWID: **Chưa bind**`,

          ephemeral: true

        });

      }


      /* =====================================================
         /PANEL
      ===================================================== */

      if (
        interaction.isChatInputCommand() &&
        interaction.commandName ===
          "panel"
      ) {

        const embed =
          new EmbedBuilder()

            .setTitle(
              "NhatKhanh Hub"
            )

            .setDescription(

              "Quản lý Key / Premium\n\n" +

              "• Redeem Key — nhập Key\n" +

              "• Get Role — nhận role Premium\n" +

              "• Get Script — lấy link Script\n" +

              "• Get Stats — xem thống kê\n" +

              "• Reset HWID — reset HWID của Key"

            );


        return interaction.reply({

          embeds: [
            embed
          ],

          components: [
            panelRow()
          ]

        });

      }


      /* =====================================================
         IGNORE OTHER INTERACTIONS
      ===================================================== */

      if (
        !interaction.isButton() &&
        !interaction.isModalSubmit()
      ) {

        return;

      }


      /* =====================================================
         REDEEM BUTTON
      ===================================================== */

      if (
        interaction.isButton() &&
        interaction.customId ===
          "redeem"
      ) {

        const modal =
          new ModalBuilder()

            .setCustomId(
              "redeem_modal"
            )

            .setTitle(
              "Redeem NhatKhanh Key"
            );


        const input =
          new TextInputBuilder()

            .setCustomId(
              "key"
            )

            .setLabel(
              "Nhập Key"
            )

            .setStyle(
              TextInputStyle.Short
            )

            .setRequired(
              true
            );


        modal.addComponents(

          new ActionRowBuilder()

            .addComponents(
              input
            )

        );


        return interaction.showModal(
          modal
        );

      }


      /* =====================================================
         REDEEM SUBMIT
      ===================================================== */

      if (
        interaction.isModalSubmit() &&
        interaction.customId ===
          "redeem_modal"
      ) {

        const key =
          normalizeKey(
            interaction.fields
              .getTextInputValue(
                "key"
              )
          );


        const db =
          loadDB();


        const item =
          db.keys[key];


        if (!item) {

          return interaction.reply({

            content:
              "❌ Key không tồn tại.",

            ephemeral:
              true

          });

        }


        if (
          item.enabled === false
        ) {

          return interaction.reply({

            content:
              "❌ Key đang bị tắt.",

            ephemeral:
              true

          });

        }


        if (
          isExpired(item)
        ) {

          return interaction.reply({

            content:
              "❌ Key đã hết hạn.",

            ephemeral:
              true

          });

        }


        return interaction.reply({

          content:

            `✅ Key hợp lệ.\n` +

            `Plan: ${
              item.plan ||
              "1 month"
            }\n` +

            `Expires: ${
              item.expires
            }\n` +

            `HWID: ${
              item.hwid
                ? "Đã bind"
                : "Chưa bind"
            }`,

          ephemeral:
            true

        });

      }


      /* =====================================================
         GET ROLE
      ===================================================== */

      if (
        interaction.isButton() &&
        interaction.customId ===
          "getrole"
      ) {

        const guild =
          interaction.guild;


        const role =
          getRoleByName(
            guild,
            PREMIUM_ROLE_NAME
          );


        if (!role) {

          return interaction.reply({

            content:
              `❌ Không tìm thấy role "${PREMIUM_ROLE_NAME}".`,

            ephemeral:
              true

          });

        }


        const member =
          await guild.members.fetch(
            interaction.user.id
          );


        if (
          member.roles.cache.has(
            role.id
          )
        ) {

          return interaction.reply({

            content:
              "ℹ️ Bạn đã có role Premium.",

            ephemeral:
              true

          });

        }


        await member.roles.add(
          role
        );


        return interaction.reply({

          content:
            `✅ Đã cấp role **${role.name}** cho bạn.`,

          ephemeral:
            true

        });

      }


      /* =====================================================
         GET SCRIPT
      ===================================================== */

      if (
        interaction.isButton() &&
        interaction.customId ===
          "getscript"
      ) {

        if (!SCRIPT_URL) {

          return interaction.reply({

            content:
              "❌ SCRIPT_URL chưa được cấu hình trên Render.",

            ephemeral:
              true

          });

        }


        return interaction.reply({

          content:
            `🔗 Script:\n${SCRIPT_URL}`,

          ephemeral:
            true

        });

      }


      /* =====================================================
         STATS
      ===================================================== */

      if (
        interaction.isButton() &&
        interaction.customId ===
          "stats"
      ) {

        const db =
          loadDB();


        const list =
          Object.values(
            db.keys
          );


        return interaction.reply({

          content:

            `📊 **NhatKhanh Stats**\n` +

            `Total: ${list.length}\n` +

            `Enabled: ${
              list.filter(
                x =>
                  x.enabled !== false
              ).length
            }\n` +

            `Disabled: ${
              list.filter(
                x =>
                  x.enabled === false
              ).length
            }\n` +

            `Bound HWID: ${
              list.filter(
                x =>
                  !!x.hwid
              ).length
            }\n` +

            `Unbound: ${
              list.filter(
                x =>
                  !x.hwid
              ).length
            }\n` +

            `Expired: ${
              list.filter(
                isExpired
              ).length
            }`,

          ephemeral:
            true

        });

      }


      /* =====================================================
         RESET HWID BUTTON
      ===================================================== */

      if (
        interaction.isButton() &&
        interaction.customId ===
          "resethwid"
      ) {

        if (
          !isAdmin(
            interaction.member
          )
        ) {

          return interaction.reply({

            content:
              "❌ Bạn không có quyền Admin.",

            ephemeral:
              true

          });

        }


        const modal =
          new ModalBuilder()

            .setCustomId(
              "reset_hwid_modal"
            )

            .setTitle(
              "Reset HWID"
            );


        const input =
          new TextInputBuilder()

            .setCustomId(
              "key"
            )

            .setLabel(
              "Key cần reset HWID"
            )

            .setStyle(
              TextInputStyle.Short
            )

            .setRequired(
              true
            );


        modal.addComponents(

          new ActionRowBuilder()

            .addComponents(
              input
            )

        );


        return interaction.showModal(
          modal
        );

      }


      /* =====================================================
         RESET HWID SUBMIT
      ===================================================== */

      if (
        interaction.isModalSubmit() &&
        interaction.customId ===
          "reset_hwid_modal"
      ) {

        if (
          !isAdmin(
            interaction.member
          )
        ) {

          return interaction.reply({

            content:
              "❌ Bạn không có quyền Admin.",

            ephemeral:
              true

          });

        }


        const key =
          normalizeKey(
            interaction.fields
              .getTextInputValue(
                "key"
              )
          );


        const db =
          loadDB();


        if (
          !db.keys[key]
        ) {

          return interaction.reply({

            content:
              "❌ Không tìm thấy Key.",

            ephemeral:
              true

          });

        }


        db.keys[key].hwid =
          "";

        db.keys[key].status =
          "unbound";

        db.keys[key].reset_at =
          new Date().toISOString();


        saveDB(db);


        return interaction.reply({

          content:
            `✅ Đã reset HWID cho Key **${key}**.`,

          ephemeral:
            true

        });

      }


    } catch (err) {

      console.error(
        "Interaction error:",
        err
      );


      if (
        !interaction.replied &&
        !interaction.deferred
      ) {

        await interaction.reply({

          content:
            "❌ Có lỗi xảy ra. Kiểm tra log Render.",

          ephemeral:
            true

        });

      }

    }

  }
);


/* =========================================================
   START API
========================================================= */

app.listen(
  PORT,
  () => {

    console.log(
      `API listening on port ${PORT}`
    );

  }
);


/* =========================================================
   START DISCORD BOT
========================================================= */

if (BOT_TOKEN) {

  client
    .login(BOT_TOKEN)
    .catch(err => {

      console.error(
        "Discord login failed:",
        err.message
      );

    });

} else {

  console.log(
    "BOT_TOKEN is not configured; Discord bot disabled."
  );

}
