const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');
const Groq = require("groq-sdk");

console.log('🚀 ULTIMATE STRICT Age Bot Starting...');

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
].filter(key => key && key.trim() !== '');

console.log(`🔑 ${API_KEYS.length} keys loaded`);
let currentKeyIndex = 0;

function getCurrentKey() { return API_KEYS[currentKeyIndex]; }
function rotateKey() { currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length; }

async function askAI(prompt) {
  for (let attempt = 0; attempt < API_KEYS.length * 2; attempt++) {
    try {
      const groq = new Groq({ apiKey: getCurrentKey() });
      const response = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        max_tokens: 150,
        response_format: { type: "json_object" }
      });
      
      const result = JSON.parse(response.choices[0].message.content);
      return result;
      
    } catch (error) {
      console.log(`❌ Key ${currentKeyIndex} failed`);
      rotateKey();
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  return { delete: true, minor: false, confidence: 'low', reason: 'AI failed - deleting for safety' };
}

// ==================== ULTIMATE STRICT CHECK ====================
async function checkMessage(text) {
  const prompt = `Message: "${text}"
  
  ABSOLUTE RULES:
  1. Does this message contain ANY mention of being 18 years old or OLDER?
  2. If YES → KEEP
  3. If NO → DELETE
  4. If mentions age UNDER 18 → DELETE + FLAG (minor)
  
  Examples KEEP (has age 18+):
  - "18m", "f18", "18 top", "M 18 Arab"
  - "23m", "25f", "30yo", "22 years old"
  - "age is 19", "I'm 21", "età 24"
  
  Examples DELETE (no age 18+):
  - "hi", "hello", "hey"
  - "DMs open", "looking for"
  - "anyone?", "message me"
  - "test", "lol", "wassup"
  
  Examples DELETE + FLAG (minor):
  - "15", "16yo", "17 looking"
  - "41 reversed" (means 14)
  - "51 swap" (means 15)
  
  Return JSON:
  {
    "has_age_18_plus": boolean (true if ANY age 18+ mentioned),
    "is_minor": boolean (true if CERTAIN age < 18),
    "confidence": "high/medium/low",
    "reason": "brief explanation"
  }`;
  
  return await askAI(prompt);
}

// ==================== DISCORD ====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

client.once('ready', () => {
  console.log(`✅ ${client.user.tag} ready`);
  console.log(`📋 Log channel: ${LOG_CHANNEL_ID}`);
  console.log(`🚨 RULE: No age 18+ = DELETE PERIOD`);
  client.user.setActivity('18+ ONLY 🔞', { type: 'WATCHING' });
});

// ==================== MESSAGE HANDLER ====================
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  if (!msg.guild || msg.guild.id !== SERVER_ID) return;
  
  // Skip very short
  if (!msg.content || msg.content.trim().length < 1) return;
  
  try {
    const isSpecialChannel = msg.channel.id === SPECIAL_CHANNEL_ID;
    
    // SPECIAL CHANNEL: Needs photo/video
    if (isSpecialChannel) {
      const hasAttachment = msg.attachments?.size > 0 && 
        Array.from(msg.attachments.values()).some(att => 
          att.contentType?.startsWith('image/') || 
          att.contentType?.startsWith('video/')
        );
      
      if (!hasAttachment) {
        await msg.delete();
        return;
      }
    }
    
    const check = await checkMessage(msg.content);
    console.log(`🤖 "${msg.content.substring(0, 40)}..." → Has age 18+: ${check.has_age_18_plus}, Minor: ${check.is_minor}`);
    
    if (!check.has_age_18_plus) {
      // NO AGE 18+ → DELETE
      await msg.delete();
      
      // ONLY LOG IF CERTAIN MINOR
      if (check.is_minor && check.confidence === 'high') {
        console.log(`📋 LOGGING MINOR: ${check.reason}`);
        await logMinor(msg, check);
      } else {
        console.log(`🗑️ Deleted: No age 18+`);
      }
    } else {
      // HAS AGE 18+ → KEEP
      console.log(`✅ Kept: Has age 18+`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
});

// ==================== LOGGING ====================
async function logMinor(msg, check) {
  try {
    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) {
      console.error(`❌ Log channel ${LOG_CHANNEL_ID} not found`);
      return;
    }
    
    console.log(`📨 Sending minor alert...`);
    
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('🚨 MINOR DETECTED')
      .setAuthor({ 
        name: msg.author.tag, 
        iconURL: msg.author.displayAvatarURL({ dynamic: true }) 
      })
      .setDescription(`**Message:**\n\`\`\`${msg.content.substring(0, 1000)}\`\`\``)
      .addFields(
        { name: 'Reason', value: check.reason || 'Underage detected', inline: false },
        { name: 'Confidence', value: '✅ HIGH', inline: true },
        { name: 'User ID', value: `\`${msg.author.id}\``, inline: true },
        { name: 'Channel', value: `<#${msg.channel.id}>`, inline: true }
      )
      .setTimestamp();
    
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ban_${msg.author.id}_${Date.now()}`)
        .setLabel('Ban User')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`ignore_${msg.author.id}_${Date.now()}`)
        .setLabel('Ignore')
        .setStyle(ButtonStyle.Secondary)
    );
    
    await logChannel.send({ embeds: [embed], components: [buttons] });
    console.log(`✅ Logged successfully`);
    
  } catch (error) {
    console.error('❌ Logging failed:', error.message);
  }
}

// ==================== BUTTONS ====================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  const [action, userId] = interaction.customId.split('_');
  
  await interaction.deferReply({ ephemeral: true });
  
  try {
    if (action === 'ban') {
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      if (member) {
        await member.ban({ reason: `Minor - banned by ${interaction.user.tag}` });
        
        const embed = EmbedBuilder.from(interaction.message.embeds[0])
          .setFooter({ text: `Banned by ${interaction.user.tag}` });
        
        await interaction.message.edit({ embeds: [embed], components: [] });
        await interaction.editReply({ content: '✅ Banned' });
      }
    }
    else if (action === 'ignore') {
      const embed = EmbedBuilder.from(interaction.message.embeds[0])
        .setFooter({ text: `Ignored by ${interaction.user.tag}` });
      
      await interaction.message.edit({ embeds: [embed], components: [] });
      await interaction.editReply({ content: '✅ Ignored' });
    }
  } catch (error) {
    await interaction.editReply({ content: '❌ Error' });
  }
});

// ==================== SERVER ====================
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.json({ 
    status: 'online',
    bot: client.user?.tag,
    rule: 'NO AGE 18+ = DELETE PERIOD'
  });
});

app.listen(PORT, () => {
  console.log(`🌐 Health check on port ${PORT}`);
});

// ==================== LOGIN ====================
console.log('🔑 Logging in...');
client.login(process.env.BOT_TOKEN).catch(err => {
  console.error('❌ Login failed:', err.message);
  process.exit(1);
});
