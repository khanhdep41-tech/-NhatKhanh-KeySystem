const express = require("express");
const fs = require("fs");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const app = express();
app.use(express.json({ limit: "50kb" }));

const PORT = Number(process.env.PORT || 3000);
const API_SECRET = process.env.API_SECRET || "";
const SCRIPT_URL = process.env.SCRIPT_URL || "";
const DB_FILE = path.join(__dirname, "keys.json");

function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
  catch { return {}; }
}
function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}
function auth(req, res) {
  if (!API_SECRET || req.header("x-api-secret") !== API_SECRET) {
    res.status(401).json({ valid: false, error: "unauthorized" });
    return false;
  }
  return true;
}
function clean(s) {
  return typeof s === "string" ? s.trim() : "";
}
function isExpired(k) {
  return !k.expires || Date.now() > Date.parse(k.expires);
}

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "NhatKhanh Key API" });
});

app.post("/api/verify", (req, res) => {
  if (!auth(req, res)) return;

  const key = clean(req.body?.key);
  const hwid = clean(req.body?.hwid);
  if (!key || !hwid) return res.status(400).json({ valid: false, error: "missing_key_or_hwid" });

  const db = loadDB();
  const item = db[key];
  if (!item) return res.status(404).json({ valid: false, error: "invalid_key" });
  if (!item.enabled) return res.status(403).json({ valid: false, error: "key_disabled" });
  if (isExpired(item)) return res.status(403).json({ valid: false, error: "key_expired" });

  // First successful verification permanently binds this key to the HWID.
  if (!item.hwid) {
    item.hwid = hwid;
    item.bound_at = new Date().toISOString();
    saveDB(db);
  } else if (item.hwid !== hwid) {
    return res.status(403).json({ valid: false, error: "hwid_mismatch" });
  }

  res.json({
    valid: true,
    plan: item.plan,
    expires: item.expires,
    message: "authorized"
  });
});

app.post("/api/admin/create", (req, res) => {
  if (!auth(req, res)) return;
  const db = loadDB();
  const count = Math.min(Math.max(Number(req.body?.count || 1), 1), 500);
  const days = Math.min(Math.max(Number(req.body?.days || 30), 1), 3650);
  const created = [];
  for (let i = 0; i < count; i++) {
    let key;
    do {
      key = "NKH-" + [...Array(3)].map(() =>
        [...Array(5)].map(() => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random()*32)]).join("")
      ).join("-");
    } while (db[key]);
    db[key] = {
      plan: req.body?.plan || `${days} Days`,
      duration_days: days,
      valid_from: new Date().toISOString().slice(0,10),
      expires: new Date(Date.now() + days * 86400000).toISOString(),
      enabled: true,
      hwid: null,
      discord_user_id: null
    };
    created.push(key);
  }
  saveDB(db);
  res.json({ ok: true, keys: created });
});

app.post("/api/admin/reset-hwid", (req, res) => {
  if (!auth(req, res)) return;
  const key = clean(req.body?.key);
  const db = loadDB();
  if (!db[key]) return res.status(404).json({ ok: false, error: "invalid_key" });
  db[key].hwid = null;
  db[key].reset_at = new Date().toISOString();
  saveDB(db);
  res.json({ ok: true });
});

app.post("/api/admin/toggle", (req, res) => {
  if (!auth(req, res)) return;
  const key = clean(req.body?.key);
  const db = loadDB();
  if (!db[key]) return res.status(404).json({ ok: false, error: "invalid_key" });
  db[key].enabled = req.body?.enabled !== false;
  saveDB(db);
  res.json({ ok: true, enabled: db[key].enabled });
});

app.get("/api/admin/stats", (req, res) => {
  if (!auth(req, res)) return;
  const db = loadDB();
  const values = Object.values(db);
  res.json({
    total: values.length,
    enabled: values.filter(x => x.enabled && !isExpired(x)).length,
    disabled: values.filter(x => !x.enabled).length,
    bound: values.filter(x => !!x.hwid).length,
    unbound: values.filter(x => !x.hwid).length,
    expired: values.filter(isExpired).length
  });
});

// This endpoint only returns the configured script URL.
// It does NOT make a public raw GitHub script private.
app.get("/api/script", (req, res) => {
  if (!auth(req, res)) return;
  res.json({ ok: true, script_url: SCRIPT_URL });
});

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

function isAdmin(member) {
  const roleName = process.env.ADMIN_ROLE_NAME || "Admin";
  return member?.roles?.cache?.some(r => r.name === roleName) || member?.permissions?.has("Administrator");
}

async function getPremiumRole(guild) {
  const roleName = process.env.PREMIUM_ROLE_NAME || "Premium";
  const roles = await guild.roles.fetch();
  return roles.find(r => r.name === roleName);
}

client.once("ready", () => {
  console.log(`Discord bot online: ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === "panel") {
      const embed = new EmbedBuilder()
        .setTitle("NhatKhanh Hub")
        .setDescription("Key System • 1 Key = 1 HWID")
        .addFields(
          { name: "🔑 Redeem Key", value: "Nhập Key để liên kết với Discord.", inline: true },
          { name: "📜 Get Script", value: "Lấy thông tin script sau khi redeem.", inline: true },
          { name: "👑 Get Role", value: "Nhận role Premium.", inline: true },
          { name: "🔄 Reset HWID", value: "Admin reset HWID của Key.", inline: true },
          { name: "📊 Get Stats", value: "Xem thống kê Key.", inline: true }
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("redeem").setLabel("Redeem Key").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("script").setLabel("Get Script").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("role").setLabel("Get Role").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("reset").setLabel("Reset HWID").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("stats").setLabel("Get Stats").setStyle(ButtonStyle.Secondary)
      );
      return interaction.reply({ embeds: [embed], components: [row] });
    }

    if (interaction.isButton() && interaction.customId === "redeem") {
      const modal = new ModalBuilder().setCustomId("redeem_modal").setTitle("Redeem Key");
      const input = new TextInputBuilder()
        .setCustomId("key")
        .setLabel("Key")
        .setPlaceholder("NKH-XXXXX-XXXXX-XXXXX")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(40);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === "redeem_modal") {
      const key = clean(interaction.fields.getTextInputValue("key"));
      const db = loadDB();
      const item = db[key];
      if (!item) return interaction.reply({ content: "❌ Key không hợp lệ.", ephemeral: true });
      if (!item.enabled) return interaction.reply({ content: "❌ Key đang bị khóa.", ephemeral: true });
      if (isExpired(item)) return interaction.reply({ content: "❌ Key đã hết hạn.", ephemeral: true });

      if (item.discord_user_id && item.discord_user_id !== interaction.user.id) {
        return interaction.reply({ content: "❌ Key đã được liên kết với Discord khác.", ephemeral: true });
      }
      item.discord_user_id = interaction.user.id;
      saveDB(db);
      return interaction.reply({
        content: `✅ Redeem thành công!\nKey: \`${key}\`\nHạn: \`${item.expires}\`\nHWID sẽ được khóa khi Loader xác thực lần đầu.`,
        ephemeral: true
      });
    }

    if (interaction.isButton() && interaction.customId === "role") {
      const db = loadDB();
      const item = Object.values(db).find(x => x.discord_user_id === interaction.user.id && x.enabled && !isExpired(x));
      if (!item) return interaction.reply({ content: "❌ Hãy Redeem Key trước.", ephemeral: true });
      const role = await getPremiumRole(interaction.guild);
      if (!role) return interaction.reply({ content: "❌ Không tìm thấy role Premium.", ephemeral: true });
      await interaction.member.roles.add(role);
      return interaction.reply({ content: "👑 Đã cấp role Premium.", ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId === "script") {
      const db = loadDB();
      const item = Object.values(db).find(x => x.discord_user_id === interaction.user.id && x.enabled && !isExpired(x));
      if (!item) return interaction.reply({ content: "❌ Hãy Redeem Key trước.", ephemeral: true });
      return interaction.reply({ content: `📜 Script Loader:\n\`${SCRIPT_URL}\`\n\n⚠️ URL này là nguồn script được cấu hình trong server.`, ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId === "stats") {
      const db = loadDB();
      const vals = Object.values(db);
      return interaction.reply({
        content: `📊 Total: ${vals.length}\n✅ Active: ${vals.filter(x => x.enabled && !isExpired(x)).length}\n🔒 Bound: ${vals.filter(x => !!x.hwid).length}\n🟢 Unbound: ${vals.filter(x => !x.hwid).length}\n⏰ Expired: ${vals.filter(isExpired).length}`,
        ephemeral: true
      });
    }

    if (interaction.isButton() && interaction.customId === "reset") {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ content: "❌ Chỉ Admin mới được Reset HWID.", ephemeral: true });
      }
      const modal = new ModalBuilder().setCustomId("reset_modal").setTitle("Reset HWID");
      const input = new TextInputBuilder().setCustomId("key").setLabel("Key").setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === "reset_modal") {
      if (!isAdmin(interaction.member)) return interaction.reply({ content: "❌ Chỉ Admin.", ephemeral: true });
      const key = clean(interaction.fields.getTextInputValue("key"));
      const db = loadDB();
      if (!db[key]) return interaction.reply({ content: "❌ Key không tồn tại.", ephemeral: true });
      db[key].hwid = null;
      db[key].reset_at = new Date().toISOString();
      saveDB(db);
      return interaction.reply({ content: `✅ Đã reset HWID cho \`${key}\`.`, ephemeral: true });
    }
  } catch (err) {
    console.error(err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ Có lỗi xảy ra.", ephemeral: true }).catch(() => {});
    }
  }
});

async function registerPanelCommand() {
  if (!client.isReady()) return;
  const guildId = process.env.GUILD_ID;
  if (!guildId) return;
  const guild = await client.guilds.fetch(guildId);
  await guild.commands.set([{ name: "panel", description: "Mở NhatKhanh Hub Key Panel" }]);
  console.log("Registered /panel");
}

if (process.env.BOT_TOKEN) {
  client.login(process.env.BOT_TOKEN)
    .then(() => registerPanelCommand())
    .catch(err => console.error("Discord login failed:", err.message));
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API listening on port ${PORT}`);
});
