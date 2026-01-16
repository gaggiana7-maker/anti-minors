const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');
const Groq = require("groq-sdk");

console.log('🚀 Pure AI Bot Starting...');

// ==================== CONFIG ====================
const SERVER_ID = '1447204367089270874';
const LOG_CHANNEL_ID = '1457870506505011331';
const SPECIAL_CHANNEL_ID = '1447208095217619055';

// ==================== API KEYS ====================
const API_KEYS = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_KEY_2,
  process.env.GROQ_KEY_3,
  process.env.GROQ_KEY_4,
  process.env.GROQ_KEY_5
].filter(Boolean);

console.log(`🔑 ${API_KEYS.length} keys loaded`);
let keyIndex = 0;

function getKey() { return API_KEYS[keyIndex]; }
function nextKey() { keyIndex = (keyIndex + 1) % API_KEYS.length; }

async function askAI(question) {
  for (let i = 0; i < API_KEYS.length * 2; i++) {
    try {
      const groq = new Groq({ apiKey: getKey() });
      const response = await groq.chat.completions.create({
        messages: [{ role: "user", content: question }],
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        max_tokens: 200,
        response_format: { type: "json_object" }
      });
      
      const result = JSON.parse(response.choices[0].message.content);
      return result;
      
    } catch (e) {
      console.log(`Key ${keyIndex} failed`);
      nextKey();
      await new Promise(r => setTimeout(r, 300));
    }
  }
  return { delete: true, minor: false, reason: 'AI failed' };
}

// ==================== PURE AI CHECK ====================
async function analyzeMessage(text) {
  const prompt = `Analyze this Discord message in an 18+ NSFW server:

"${text}"

Rules:
1. Message must contain CLEAR mention of being 18 years old or OLDER
2. If NO age 18+ mentioned → DELETE
3. If age UNDER 18 mentioned → DELETE + LOG (minor)
4. Watch for bypass attempts: "41 reversed", "51 swap", coded language
5. Media channel still needs age 18+

Return JSON:
{
  "delete": true/false,
  "minor": true/false (only true if CERTAIN age < 18),
  "confidence": "high/medium/low",
  "reason": "brief explanation"
}`;
  
  return await askAI(prompt);
}

// ==================== DISCORD ====================
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.once('ready', () => {
  console.log(`✅ ${client.user.tag} ready`);
  client.user.setActivity('AI Age Check', { type: 'WATCHING' });
});

// ==================== MESSAGE HANDLER ====================
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  if (!msg.guild || msg.guild.id !== SERVER_ID) return;
  if (!msg.content || msg.content.trim().length < 2) return;
  
  try {
    const isSpecialChannel = msg.channel.id === SPECIAL_CHANNEL_ID;
    
    // Special channel: Check for ANY attachment
    if (isSpecialChannel) {
      const hasFile = msg.attachments?.size > 0;
      if (!hasFile) {
        await msg.delete();
        return;
      }
    }
    
    const analysis = await analyzeMessage(msg.content);
    console.log(`🤖 "${msg.content.substring(0, 30)}..." → Delete: ${analysis.delete}, Minor: ${analysis.minor}, Conf: ${analysis.confidence}`);
    
    if (analysis.delete) {
      await msg.delete();
      
      // ONLY LOG if CERTAIN MINOR with HIGH confidence
      if (analysis.minor && analysis.confidence === 'high') {
        await logMinor(msg, analysis);
      }
    }
    // If delete = false, message stays
    
  } catch (e) {
    console.error('Error:', e.message);
  }
});

// ==================== LOGGING ====================
async function logMinor(msg, analysis) {
  const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
  if (!logChannel) return;
  
  const embed = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('🚨 CERTAIN MINOR DETECTED')
    .setAuthor({ name: msg.author.tag, iconURL: msg.author.displayAvatarURL() })
    .setDescription(`**Message:**\n\`\`\`${msg.content.substring(0, 1000)}\`\`\``)
    .addFields(
      { name: 'Reason', value: analysis.reason, inline: false },
      { name: 'Confidence', value: '✅ HIGH', inline: true },
      { name: 'User ID', value: `\`${msg.author.id}\``, inline: true }
    )
    .setTimestamp();
  
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ban_${msg.author.id}`)
      .setLabel('Ban User')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`ignore_${msg.author.id}`)
      .setLabel('Ignore')
      .setStyle(ButtonStyle.Secondary)
  );
  
  await logChannel.send({ embeds: [embed], components: [buttons] });
}

// ==================== BUTTONS ====================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  const [action, userId] = interaction.customId.split('_');
  
  await interaction.deferReply({ ephemeral: true });
  
  if (action === 'ban') {
    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    if (member) {
      await member.ban({ reason: `Certain minor - by ${interaction.user.tag}` });
      await interaction.editReply({ content: '✅ Banned' });
    }
  } else if (action === 'ignore') {
    await interaction.editReply({ content: '✅ Ignored' });
  }
});

// ==================== SERVER ====================
const app = express();
app.get('/', (req, res) => res.json({ status: 'online', bot: client.user?.tag }));
app.listen(process.env.PORT || 10000, () => console.log('🌐 Server up'));

// ==================== LOGIN ====================
console.log('🔑 Logging in...');
client.login(process.env.BOT_TOKEN).catch(console.error);
