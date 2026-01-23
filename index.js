const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

console.log('🚀 Anti-Minors Bot Starting (REGEX MODE)...');

// ==================== CONFIG ====================
const SERVER_ID = '1447204367089270874';
const LOG_CHANNEL_ID = '1457870506505011331';
const SPECIAL_CHANNEL_ID = '1447208095217619055'; // self channel (REQUIRES ATTACHMENTS)
const DMS_CHANNEL_ID = '1447208038665556053'; // dms channel

// ==================== REGEX-BASED DETECTION (CONSERVATIVE) ====================
function checkMessage(text) {
  const lowerText = text.toLowerCase();
  
  // 0. CONVERT EMOJI NUMBERS TO REGULAR NUMBERS (bypass detection)
  const emojiNumbers = {
    '0️⃣': '0', '1️⃣': '1', '2️⃣': '2', '3️⃣': '3', '4️⃣': '4',
    '5️⃣': '5', '6️⃣': '6', '7️⃣': '7', '8️⃣': '8', '9️⃣': '9'
  };
  
  let normalizedText = text;
  for (const [emoji, num] of Object.entries(emojiNumbers)) {
    normalizedText = normalizedText.replace(new RegExp(emoji, 'g'), num);
  }
  
  // Use normalized text for all checks
  text = normalizedText;
  
  // PRE-CHECK: Look for valid 18+ age FIRST
  const adultAgePatterns = [
    /\b(1[8-9]|[2-6]\d)\s*[mfMF]\b/,
    /\b[mfMF]\s*(1[8-9]|[2-6]\d)\b/,
    /\b(1[8-9]|[2-6]\d)\s*(yo|year|yr|male|female|man|woman)\b/i,
  ];
  
  let hasAdultAge = false;
  for (const pattern of adultAgePatterns) {
    const match = text.match(pattern);
    if (match) {
      const age = parseInt(match[1] || match[2]);
      if (age >= 18 && age <= 70) {
        hasAdultAge = true;
        console.log(`✅ Found valid adult age: ${age}`);
        break;
      }
    }
  }
  
  // 1. CHECK FOR LINKS (instant delete)
  const linkPatterns = [
    /https?:\/\/[^\s]+/i,
    /discord\.gg\/[^\s]+/i,
    /\.com[^\s]*/i,
    /\.gg[^\s]*/i,
    /\.net[^\s]*/i,
    /\.org[^\s]*/i,
    /bit\.ly[^\s]*/i,
    /t\.me[^\s]*/i,
  ];
  
  for (const pattern of linkPatterns) {
    if (pattern.test(text)) {
      return {
        should_delete: true,
        is_minor: false,
        confidence: 'high',
        reason: 'Link detected (spam/seller)'
      };
    }
  }
  
  // 2. CHECK FOR REVERSED AGES
  const reversedPatterns = [
    /(\d{2,3})\s*[🔁🔄↩️🔃⤴️⤵️⬆️⬇️↕️⇅]/i,
    /[🔁🔄↩️🔃⤴️⤵️⬆️⬇️↕️⇅]\s*(\d{2,3})/i,
    /(\d{2,3})\s*reversed?/i,
    /reversed?\s*(\d{2,3})/i,
    /(\d{2,3})\s*swap(ped)?/i,
    /swap(ped)?\s*(\d{2,3})/i,
    /(\d{2,3})\s*flip(ped)?/i,
    /flip(ped)?\s*(\d{2,3})/i,
    /[mfMF]\s*(\d{2,3})\s*[🔁🔄↩️🔃⤴️⤵️⬆️⬇️↕️⇅]/i,
  ];
  
  for (const pattern of reversedPatterns) {
    const reversedMatch = text.match(pattern);
    if (reversedMatch) {
      const ageStr = reversedMatch[1] || reversedMatch[2];
      if (!ageStr) continue;
      
      const originalAge = parseInt(ageStr);
      let reversedAge = parseInt(ageStr.split('').reverse().join(''));
      
      if (ageStr.length === 3 && ageStr.endsWith('0')) {
        reversedAge = parseInt(ageStr.split('').reverse().join('').replace(/^0+/, ''));
      }
      
      console.log(`🔍 Reversed age detected: ${originalAge} → ${reversedAge}`);
      
      if (reversedAge < 18) {
        return {
          should_delete: true,
          is_minor: true,
          confidence: 'high',
          reason: `Reversed age ${reversedAge} (from ${originalAge}) - MINOR`
        };
      }
      return {
        should_delete: true,
        is_minor: false,
        confidence: 'high',
        reason: `Bypass attempt detected (reversed age: ${originalAge} → ${reversedAge})`
      };
    }
  }
  
  // 3. CHECK FOR BANNED KEYWORDS
  const bannedKeywords = [
    /check\s+(my\s+)?bio/i,
    /see\s+(my\s+)?bio/i,
    /read\s+(my\s+)?bio/i,
    /bio\s+for/i,
    /in\s+(my\s+)?bio/i,
    /dm\s+for\s+content/i,
    /selling\s+content/i,
    /buy\s+content/i,
    /\breversed?\b/i,
    /\bswap(ped)?\b/i,
    /\bflip(ped)?\b/i,
  ];
  
  for (const pattern of bannedKeywords) {
    if (pattern.test(lowerText)) {
      const keyword = text.match(pattern)?.[0] || 'banned keyword';
      return {
        should_delete: true,
        is_minor: false,
        confidence: 'high',
        reason: `Banned keyword detected: "${keyword}" (seller/bypass attempt)`
      };
    }
  }
  
  // 4. CHECK FOR DIRECT MINOR AGES (10-17)
  const minorPatterns = [
    /\b(1[0-7])\s*[mfMF]\b/,
    /\b[mfMF]\s*(1[0-7])(?!\s*(cm|inch|in|"|'))\b/,
    /\b(1[0-7])(?!\s*(cm|inch|in|"|'))\s*(yo|year|yr|male|female|boy|girl|enby|nb|top|bottom|vers|bttm|btm|skinny|chubby|twink|bear)\b/i,
    /\baged?\s*(1[0-7])\b/i,
    /\b(1[0-7])\s*aged?\b/i,
    /\bi'?m\s*(1[0-7])\b/i,
    /\b(1[0-7])\s*m(?!\s*cm)\b/i,
    /\b(1[0-7])\s*[mfMF]\s+\w+/i,
    /[mfMF]\s*(1[0-7])\s+\w+/i,
  ];
  
  if (hasAdultAge) {
    const strictMinorPatterns = [
      /\b(1[0-7])\s*[mfMF]\b/,
      /\b[mfMF]\s*(1[0-7])\b/,
      /\bi'?m\s*(1[0-7])\b/i,
    ];
    
    for (const pattern of strictMinorPatterns) {
      const match = text.match(pattern);
      if (match) {
        const age = parseInt(match[1] || match[2]);
        return {
          should_delete: true,
          is_minor: true,
          confidence: 'high',
          reason: `Minor detected: ${age} years old (despite adult age in message)`
        };
      }
    }
  } else {
    const standaloneMinorPatterns = [
      /^\s*(1[0-7])\s*$/,
      /^\s*(1[0-7])\s+/,
      /\s+(1[0-7])\s*$/,
    ];
    
    for (const pattern of standaloneMinorPatterns) {
      const match = text.match(pattern);
      if (match) {
        const age = parseInt(match[1]);
        return {
          should_delete: true,
          is_minor: true,
          confidence: 'high',
          reason: `Minor detected: ${age} years old`
        };
      }
    }
    
    for (const pattern of minorPatterns) {
      const match = text.match(pattern);
      if (match) {
        const age = parseInt(match[1] || match[2]);
        const fullMatch = match[0];
        const afterMatch = text.substring(match.index + fullMatch.length, match.index + fullMatch.length + 10);
        
        if (!/^\s*(cm|inch|in|"|')/.test(afterMatch)) {
          return {
            should_delete: true,
            is_minor: true,
            confidence: 'high',
            reason: `Minor detected: ${age} years old`
          };
        }
      }
    }
  }
  
  // 5. DEFAULT: KEEP MESSAGE
  return {
    should_delete: false,
    is_minor: false,
    confidence: 'low',
    reason: 'No violations detected - keeping message'
  };
}

// ==================== DISCORD ====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

// Channel IDs that the bot monitors
const MONITORED_CHANNELS = [
  DMS_CHANNEL_ID,      // 1447208038665556053 - dms channel
  SPECIAL_CHANNEL_ID   // 1447208095217619055 - self channel (REQUIRES ATTACHMENTS)
];

client.once('ready', () => {
  console.log(`✅ ${client.user.tag} ready (REGEX MODE)`);
  console.log(`📋 Log channel: ${LOG_CHANNEL_ID}`);
  console.log(`🔒 Special channel (REQUIRES MEDIA): ${SPECIAL_CHANNEL_ID}`);
  console.log(`💬 DMs channel: ${DMS_CHANNEL_ID}`);
  console.log(`🚨 DELETE ONLY: Minors | Reversed Minors | Links | Banned Keywords`);
  console.log(`✅ KEEP: Everything else (including messages without age)`);
  client.user.setActivity('Anti-Minor 🔞', { type: 'WATCHING' });
});

// ==================== MESSAGE HANDLER ====================
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  if (!msg.guild || msg.guild.id !== SERVER_ID) return;
  
  if (!MONITORED_CHANNELS.includes(msg.channel.id)) return;
  if (!msg.content || msg.content.trim().length < 1) return;
  
  try {
    const isSpecialChannel = msg.channel.id === SPECIAL_CHANNEL_ID;
    
    if (isSpecialChannel) {
      const hasAttachment = msg.attachments?.size > 0 && 
        Array.from(msg.attachments.values()).some(att => 
          att.contentType?.startsWith('image/') || 
          att.contentType?.startsWith('video/')
        );
      
      if (!hasAttachment) {
        await msg.delete();
        console.log(`🗑️ DELETED (Self channel - NO MEDIA): "${msg.content.substring(0, 40)}..." by ${msg.author.tag}`);
        return;
      }
    }
    
    const check = checkMessage(msg.content);
    console.log(`🔍 "${msg.content.substring(0, 50)}..." → Delete: ${check.should_delete}, Minor: ${check.is_minor}`);
    
    if (check.should_delete) {
      await msg.delete();
      
      if (check.is_minor && check.confidence === 'high') {
        console.log(`🚨 MINOR DETECTED - Logging to channel`);
        await logMinor(msg, check);
      } else {
        console.log(`🗑️ Deleted: ${check.reason}`);
      }
    } else {
      console.log(`✅ Kept: ${check.reason}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
});

// ==================== LOGGING (MINORS ONLY) ====================
async function logMinor(msg, check) {
  try {
    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) {
      console.error(`❌ Log channel ${LOG_CHANNEL_ID} not found`);
      return;
    }
    
    console.log(`📨 Sending minor alert to log channel...`);
    
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
    
    await logChannel.send({ 
      embeds: [embed], 
      components: [buttons],
      allowedMentions: { parse: [] }
    });
    
    console.log(`✅ Minor logged successfully`);
    
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
        await interaction.editReply({ content: '✅ User banned successfully' });
      } else {
        await interaction.editReply({ content: '❌ User not found or already left' });
      }
    }
    else if (action === 'ignore') {
      const embed = EmbedBuilder.from(interaction.message.embeds[0])
        .setFooter({ text: `Ignored by ${interaction.user.tag}` });
      
      await interaction.message.edit({ embeds: [embed], components: [] });
      await interaction.editReply({ content: '✅ Alert ignored' });
    }
  } catch (error) {
    console.error('Button error:', error);
    await interaction.editReply({ content: '❌ An error occurred' });
  }
});

// ==================== START BOT ====================
console.log('🔑 Logging in to Discord...');

if (!process.env.BOT_TOKEN) {
  console.error('❌ ERROR: BOT_TOKEN environment variable is not set!');
  console.error('❌ On Railway: Project → Variables → Add BOT_TOKEN');
  process.exit(1);
}

client.login(process.env.BOT_TOKEN)
  .then(() => console.log('✅ Bot login successful'))
  .catch(err => {
    console.error('❌ Login failed:', err.message);
    if (err.message.includes('401')) {
      console.error('❌ Invalid token! Check Discord Developer Portal');
    } else if (err.message.includes('intents')) {
      console.error('❌ Intents not configured!');
      console.error('❌ Discord Dev Portal → Bot → Privileged Gateway Intents');
      console.error('❌ Enable: PRESENCE INTENT, SERVER MEMBERS INTENT, MESSAGE CONTENT INTENT');
    }
    process.exit(1);
  });

// Connection timeout check
setTimeout(() => {
  if (!client.user) {
    console.error('❌ Bot failed to connect after 30 seconds!');
  }
}, 30000);
